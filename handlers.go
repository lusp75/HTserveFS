package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/mem"
)

// Auth handlers
func loginHandler(c *gin.Context) {
	var loginReq struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}

	if err := c.ShouldBindJSON(&loginReq); err != nil {
		log.Printf("[WARN] Login: Invalid request format from IP %s: %v", c.ClientIP(), err)
		c.JSON(400, gin.H{"success": false, "message": "Invalid request"})
		return
	}

	ip := c.ClientIP()
	userAgent := c.GetHeader("User-Agent")
	protocol := "HTTP"
	if c.Request.TLS != nil {
		protocol = "HTTPS"
	}
	port := c.Request.Host

	log.Printf("[INFO] Login attempt: username=%s, ip=%s, protocol=%s, host=%s, user-agent=%s", 
		loginReq.Username, ip, protocol, port, userAgent)

	// Check if IP is locked out
	if isLockedOut(ip) {
		log.Printf("[WARN] Login blocked: IP %s is locked out (username=%s, protocol=%s)", ip, loginReq.Username, protocol)
		c.JSON(429, gin.H{"success": false, "message": "Too many failed attempts. Please try again later."})
		return
	}

	// Find user
	user := findUser(loginReq.Username)
	if user == nil {
		log.Printf("[WARN] Login failed: User not found - username=%s, ip=%s, protocol=%s", loginReq.Username, ip, protocol)
		recordFailedAttempt(ip)
		log.Printf("[INFO] Failed attempt recorded for IP %s (total attempts: %d)", ip, getFailedAttemptCount(ip))
		c.JSON(401, gin.H{"success": false, "message": "Invalid credentials"})
		return
	}

	// Verify password
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(loginReq.Password)); err != nil {
		log.Printf("[WARN] Login failed: Invalid password - username=%s, ip=%s, protocol=%s", loginReq.Username, ip, protocol)
		recordFailedAttempt(ip)
		log.Printf("[INFO] Failed attempt recorded for IP %s (total attempts: %d)", ip, getFailedAttemptCount(ip))
		c.JSON(401, gin.H{"success": false, "message": "Invalid credentials"})
		return
	}

	// Clear failed attempts
	clearFailedAttempts(ip)
	log.Printf("[INFO] Login successful: username=%s, role=%s, ip=%s, protocol=%s - failed attempts cleared", 
		user.Username, user.Role, ip, protocol)

	// Generate JWT token
	token, err := generateToken(user)
	if err != nil {
		log.Printf("[ERROR] Token generation failed for user %s: %v", user.Username, err)
		c.JSON(500, gin.H{"success": false, "message": "Error generating token"})
		return
	}

	c.JSON(200, gin.H{
		"success": true,
		"message": "Login successful",
		"token":   token,
		"user": gin.H{
			"username": user.Username,
			"role":     user.Role,
		},
	})
}

func verifyTokenHandler(c *gin.Context) {
	var req struct {
		Token string `json:"token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid request"})
		return
	}

	// Verify token
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(req.Token, claims, func(token *jwt.Token) (interface{}, error) {
		return []byte(config.Auth.JWTSecret), nil
	})

	if err != nil || !token.Valid {
		c.JSON(401, gin.H{"success": false, "message": "Invalid or expired token", "valid": false})
		return
	}

	c.JSON(200, gin.H{
		"success": true,
		"message": "Token is valid",
		"valid":   true,
		"user": gin.H{
			"username": claims.Username,
			"role":     claims.Role,
		},
	})
}

func logoutHandler(c *gin.Context) {
	c.JSON(200, gin.H{"success": true, "message": "Logged out successfully"})
}

func meHandler(c *gin.Context) {
	username, _ := c.Get("username")
	role, _ := c.Get("role")

	c.JSON(200, gin.H{
		"success": true,
		"user": gin.H{
			"username": username,
			"role":     role,
		},
	})
}

// File handlers
func getSharesHandler(c *gin.Context) {
	log.Printf("[DEBUG] getSharesHandler: serving shares list")
	
	var shares []gin.H
	for _, share := range config.Files.Shares {
		shares = append(shares, gin.H{
			"alias":    share.Alias,
			"path":     share.Path,
			"readonly": share.Readonly,
		})
	}
	
	c.JSON(200, gin.H{
		"success": true,
		"shares":  shares,
	})
}

func browseHandler(c *gin.Context) {
	path := c.Param("path")
	if path == "" {
		path = "/"
	}
	path = strings.TrimPrefix(path, "/")
	
	// Enhanced debug logging
	log.Printf("[DEBUG] browseHandler: START - requested path='%s'", path)
	log.Printf("[DEBUG] browseHandler: available shares count=%d", len(config.Files.Shares))
	for i, share := range config.Files.Shares {
		log.Printf("[DEBUG] browseHandler: share[%d] alias='%s' path='%s' readonly=%v", i, share.Alias, share.Path, share.Readonly)
	}

	// Find the share
	share := findShare(path)
	if share == nil {
		log.Printf("[ERROR] browseHandler: share not found for path='%s'", path)
		log.Printf("[ERROR] browseHandler: path parts after split: %v", strings.Split(strings.Trim(path, "/"), "/"))
		c.JSON(404, gin.H{"success": false, "message": "Share not found"})
		return
	}
	
	log.Printf("[DEBUG] browseHandler: found share='%s' (path='%s') for requested path='%s'", share.Alias, share.Path, path)

	// Get the actual file path
	filePath := getActualPath(share, path)
	log.Printf("[DEBUG] browseHandler: actual file path='%s'", filePath)
	
	// Check if the share path exists first
	shareInfo, shareErr := os.Stat(share.Path)
	if shareErr != nil {
		log.Printf("[ERROR] browseHandler: share path does not exist='%s', error=%v", share.Path, shareErr)
		if os.IsNotExist(shareErr) {
			c.JSON(404, gin.H{
				"success": false, 
				"message": fmt.Sprintf("Share path '%s' not found on this system. Please check if the drive/folder exists.", share.Path),
				"error_code": "SHARE_PATH_NOT_FOUND",
				"share_alias": share.Alias,
				"share_path": share.Path,
			})
		} else if os.IsPermission(shareErr) {
			c.JSON(403, gin.H{
				"success": false, 
				"message": fmt.Sprintf("Access denied to share path '%s'. Insufficient permissions.", share.Path),
				"error_code": "SHARE_ACCESS_DENIED",
				"share_alias": share.Alias,
				"share_path": share.Path,
			})
		} else {
			c.JSON(500, gin.H{
				"success": false, 
				"message": fmt.Sprintf("Error accessing share path '%s': %v", share.Path, shareErr),
				"error_code": "SHARE_ACCESS_ERROR",
				"share_alias": share.Alias,
				"share_path": share.Path,
			})
		}
		return
	}
	log.Printf("[DEBUG] browseHandler: share path exists='%s', isDir=%v", share.Path, shareInfo.IsDir())
	
	// Verify that the share path is actually a directory
	if !shareInfo.IsDir() {
		log.Printf("[ERROR] browseHandler: share path is not a directory='%s'", share.Path)
		c.JSON(400, gin.H{
			"success": false, 
			"message": fmt.Sprintf("Share path '%s' is not a directory", share.Path),
			"error_code": "SHARE_NOT_DIRECTORY",
			"share_alias": share.Alias,
			"share_path": share.Path,
		})
		return
	}

	// Check if path exists and handle permission errors gracefully
	info, err := os.Stat(filePath)
	if err != nil {
		log.Printf("[ERROR] browseHandler: path access error='%s', error=%v", filePath, err)
		log.Printf("[ERROR] browseHandler: error type - IsNotExist=%v, IsPermission=%v", os.IsNotExist(err), os.IsPermission(err))
		// Check if it's a permission error
		if os.IsPermission(err) {
			c.JSON(403, gin.H{
				"success": false, 
				"message": fmt.Sprintf("Access denied to path '%s'. Insufficient permissions.", filePath),
				"error_code": "PATH_ACCESS_DENIED",
				"requested_path": path,
				"resolved_path": filePath,
			})
		} else if os.IsNotExist(err) {
			c.JSON(404, gin.H{
				"success": false, 
				"message": fmt.Sprintf("Path '%s' not found.", filePath),
				"error_code": "PATH_NOT_FOUND",
				"requested_path": path,
				"resolved_path": filePath,
			})
		} else {
			c.JSON(500, gin.H{
				"success": false, 
				"message": fmt.Sprintf("Error accessing path '%s': %v", filePath, err),
				"error_code": "PATH_ACCESS_ERROR",
				"requested_path": path,
				"resolved_path": filePath,
			})
		}
		return
	}

	if !info.IsDir() {
		log.Printf("[ERROR] browseHandler: path is not a directory='%s'", filePath)
		c.JSON(400, gin.H{"success": false, "message": "Path is not a directory"})
		return
	}

	// Read directory with permission error handling
	log.Printf("[DEBUG] browseHandler: attempting to read directory='%s'", filePath)
	entries, err := os.ReadDir(filePath)
	if err != nil {
		log.Printf("[ERROR] browseHandler: error reading directory='%s', error=%v", filePath, err)
		log.Printf("[ERROR] browseHandler: readdir error type - IsNotExist=%v, IsPermission=%v", os.IsNotExist(err), os.IsPermission(err))
		// Check if it's a permission error
		if os.IsPermission(err) {
			c.JSON(403, gin.H{
				"success": false, 
				"message": fmt.Sprintf("Access denied - insufficient permissions to read directory '%s'.", filePath),
				"error_code": "DIRECTORY_READ_DENIED",
				"requested_path": path,
				"resolved_path": filePath,
			})
		} else if os.IsNotExist(err) {
			c.JSON(404, gin.H{
				"success": false, 
				"message": fmt.Sprintf("Directory '%s' not found.", filePath),
				"error_code": "DIRECTORY_NOT_FOUND",
				"requested_path": path,
				"resolved_path": filePath,
			})
		} else {
			c.JSON(500, gin.H{
				"success": false, 
				"message": fmt.Sprintf("Error reading directory '%s': %v", filePath, err),
				"error_code": "DIRECTORY_READ_ERROR",
				"requested_path": path,
				"resolved_path": filePath,
			})
		}
		return
	}
	
	log.Printf("[DEBUG] browseHandler: successfully found %d entries in directory='%s'", len(entries), filePath)

	var files []gin.H
	log.Printf("[DEBUG] browseHandler: processing %d directory entries", len(entries))
	for i, entry := range entries {
		info, infoErr := entry.Info()
		if infoErr != nil {
			log.Printf("[WARNING] browseHandler: cannot get info for entry[%d] '%s': %v", i, entry.Name(), infoErr)
			continue
		}
		
		// Costruisci il path completo per il file
		var filePath string
		if path == "" || path == "/" {
			filePath = share.Alias + "/" + entry.Name()
		} else {
			filePath = path + "/" + entry.Name()
		}
		
		log.Printf("[DEBUG] browseHandler: entry[%d] name='%s' type='%s' size=%d path='%s'", i, entry.Name(), getFileType(entry), info.Size(), filePath)
		files = append(files, gin.H{
			"name":     entry.Name(),
			"type":     getFileType(entry),
			"size":     info.Size(),
			"modified": info.ModTime().Format(time.RFC3339),
			"path":     filePath,
		})
	}

	log.Printf("[DEBUG] browseHandler: SUCCESS - returning %d files for path='%s'", len(files), path)
	c.JSON(200, gin.H{
		"success": true,
		"path":    path,
		"files":   files,
	})
}

func downloadHandler(c *gin.Context) {
	path := c.Param("path")
	path = strings.TrimPrefix(path, "/")

	// Get user role from context
	role, exists := c.Get("role")
	if !exists {
		c.JSON(401, gin.H{"success": false, "message": "Authentication required"})
		return
	}

	userRole, ok := role.(string)
	if !ok {
		c.JSON(401, gin.H{"success": false, "message": "Invalid authentication"})
		return
	}

	// All authenticated users can download files (including readonly)
	// This is intentional - readonly means no write operations, but download is allowed
	log.Printf("[INFO] downloadHandler: user with role '%s' downloading file '%s'", userRole, path)

	// Find the share
	share := findShare(path)
	if share == nil {
		c.JSON(404, gin.H{"success": false, "message": "Share not found"})
		return
	}

	// Get the actual file path
	filePath := getActualPath(share, path)

	// Check if file exists
	info, err := os.Stat(filePath)
	if err != nil {
		c.JSON(404, gin.H{"success": false, "message": "File not found"})
		return
	}

	if info.IsDir() {
		c.JSON(400, gin.H{"success": false, "message": "Cannot download directory"})
		return
	}

	c.File(filePath)
}

func uploadHandler(c *gin.Context) {
	path := c.Param("path")
	path = strings.TrimPrefix(path, "/")

	// Find the share
	share := findShare(path)
	if share == nil {
		c.JSON(404, gin.H{"success": false, "message": "Share not found"})
		return
	}

	if share.Readonly {
		c.JSON(403, gin.H{"success": false, "message": "Share is read-only"})
		return
	}

	// Get uploaded file
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": "No file uploaded"})
		return
	}
	defer file.Close()

	// Get the actual directory path
	dirPath := getActualPath(share, path)
	filePath := filepath.Join(dirPath, header.Filename)

	// Create the file
	dst, err := os.Create(filePath)
	if err != nil {
		c.JSON(500, gin.H{"success": false, "message": "Error creating file"})
		return
	}
	defer dst.Close()

	// Copy file content
	if _, err := io.Copy(dst, file); err != nil {
		c.JSON(500, gin.H{"success": false, "message": "Error saving file"})
		return
	}

	c.JSON(200, gin.H{
		"success": true,
		"message": "File uploaded successfully",
		"filename": header.Filename,
	})
}

func mkdirHandler(c *gin.Context) {
	path := c.Param("path")
	path = strings.TrimPrefix(path, "/")

	var req struct {
		Name string `json:"name" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid request"})
		return
	}

	// Find the share
	share := findShare(path)
	if share == nil {
		c.JSON(404, gin.H{"success": false, "message": "Share not found"})
		return
	}

	if share.Readonly {
		c.JSON(403, gin.H{"success": false, "message": "Share is read-only"})
		return
	}

	// Get the actual path
	basePath := getActualPath(share, path)
	newDirPath := filepath.Join(basePath, req.Name)

	// Create directory
	if err := os.MkdirAll(newDirPath, 0755); err != nil {
		c.JSON(500, gin.H{"success": false, "message": "Error creating directory"})
		return
	}

	c.JSON(200, gin.H{
		"success": true,
		"message": "Directory created successfully",
	})
}

func createFileHandler(c *gin.Context) {
	path := c.Param("path")
	path = strings.TrimPrefix(path, "/")

	var req struct {
		Name    string `json:"name" binding:"required"`
		Content string `json:"content"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid request"})
		return
	}

	// Find the share
	share := findShare(path)
	if share == nil {
		c.JSON(404, gin.H{"success": false, "message": "Share not found"})
		return
	}

	if share.Readonly {
		c.JSON(403, gin.H{"success": false, "message": "Share is read-only"})
		return
	}

	// Get the actual path
	basePath := getActualPath(share, path)
	filePath := filepath.Join(basePath, req.Name)

	// Create file
	if err := os.WriteFile(filePath, []byte(req.Content), 0644); err != nil {
		c.JSON(500, gin.H{"success": false, "message": "Error creating file"})
		return
	}

	c.JSON(200, gin.H{
		"success": true,
		"message": "File created successfully",
	})
}

func deleteHandler(c *gin.Context) {
	path := c.Param("path")
	path = strings.TrimPrefix(path, "/")

	// Find the share
	share := findShare(path)
	if share == nil {
		c.JSON(404, gin.H{"success": false, "message": "Share not found"})
		return
	}

	if share.Readonly {
		c.JSON(403, gin.H{"success": false, "message": "Share is read-only"})
		return
	}

	// Get the actual file path
	filePath := getActualPath(share, path)

	// Delete file or directory
	if err := os.RemoveAll(filePath); err != nil {
		c.JSON(500, gin.H{"success": false, "message": "Error deleting item"})
		return
	}

	c.JSON(200, gin.H{
		"success": true,
		"message": "Item deleted successfully",
	})
}

// Config handlers
func getConfigHandler(c *gin.Context) {
	log.Printf("[DEBUG] getConfigHandler: serving config")
	c.JSON(200, gin.H{
		"success": true,
		"config":  config,
	})
}

func updateConfigHandler(c *gin.Context) {
	var req struct {
		Config AppConfig `json:"config" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid request"})
		return
	}

	// Update config
	config = req.Config

	// Create a copy for encryption (don't modify the runtime config)
	configToSave := config
	
	// Encrypt sensitive data before saving
	if err := encryptSensitiveConfig(&configToSave); err != nil {
		log.Printf("[ERROR] updateConfigHandler: encryption failed: %v", err)
		c.JSON(500, gin.H{"success": false, "message": "Error encrypting sensitive data"})
		return
	}

	// Save encrypted config to file
	data, _ := json.MarshalIndent(configToSave, "", "  ")
	if err := os.WriteFile("config.json", data, 0644); err != nil {
		log.Printf("[ERROR] updateConfigHandler: save failed: %v", err)
		c.JSON(500, gin.H{"success": false, "message": "Error saving config"})
		return
	}

	log.Printf("[DEBUG] updateConfigHandler: config saved successfully with encrypted sensitive data")
	c.JSON(200, gin.H{
		"success": true,
		"message": "Configuration updated successfully",
	})
}

// User handlers
func getUsersHandler(c *gin.Context) {
	var users []gin.H
	for _, user := range config.Auth.Users {
		users = append(users, gin.H{
			"username": user.Username,
			"role":     user.Role,
		})
	}

	c.JSON(200, gin.H{
		"success": true,
		"users":   users,
	})
}

func createUserHandler(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
		Role     string `json:"role" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid request"})
		return
	}

	// Validate role
	validRoles := []string{"admin", "read-write", "read-only"}
	validRole := false
	for _, role := range validRoles {
		if req.Role == role {
			validRole = true
			break
		}
	}
	if !validRole {
		c.JSON(400, gin.H{"success": false, "message": "Invalid role"})
		return
	}

	// Check if user already exists
	for _, user := range config.Auth.Users {
		if user.Username == req.Username {
			c.JSON(400, gin.H{"success": false, "message": "User already exists"})
			return
		}
	}

	// Hash password
	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("[ERROR] createUserHandler: password hashing failed: %v", err)
		c.JSON(500, gin.H{"success": false, "message": "Error creating user"})
		return
	}

	// Add user to config
	newUser := AuthUser{
		Username:     req.Username,
		PasswordHash: string(hashedPassword),
		Role:         req.Role,
	}
	config.Auth.Users = append(config.Auth.Users, newUser)

	// Save config to file - DO NOT encrypt bcrypt hashes
	configToSave := config
	
	// Only encrypt JWT secret, not password hashes (they are already bcrypt)
	if configToSave.Auth.JWTSecret != "" && !isEncrypted(configToSave.Auth.JWTSecret) {
		encrypted, err := encrypt(configToSave.Auth.JWTSecret)
		if err != nil {
			log.Printf("[ERROR] createUserHandler: JWT encryption failed: %v", err)
			c.JSON(500, gin.H{"success": false, "message": "Error saving user"})
			return
		}
		configToSave.Auth.JWTSecret = encrypted
	}

	data, _ := json.MarshalIndent(configToSave, "", "  ")
	if err := os.WriteFile("config.json", data, 0644); err != nil {
		log.Printf("[ERROR] createUserHandler: save failed: %v", err)
		c.JSON(500, gin.H{"success": false, "message": "Error saving user"})
		return
	}

	log.Printf("[INFO] createUserHandler: user '%s' created successfully with role '%s'", req.Username, req.Role)
	c.JSON(200, gin.H{
		"success": true,
		"message": "User created successfully",
		"user": gin.H{
			"username": req.Username,
			"role":     req.Role,
		},
	})
}

func updateUserHandler(c *gin.Context) {
	username := c.Param("username")
	var req struct {
		Password string `json:"password"`
		Role     string `json:"role"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"success": false, "message": "Invalid request"})
		return
	}

	// Find user
	userIndex := -1
	for i, user := range config.Auth.Users {
		if user.Username == username {
			userIndex = i
			break
		}
	}
	if userIndex == -1 {
		c.JSON(404, gin.H{"success": false, "message": "User not found"})
		return
	}

	// Update user
	if req.Role != "" {
		validRoles := []string{"admin", "read-write", "read-only"}
		validRole := false
		for _, role := range validRoles {
			if req.Role == role {
				validRole = true
				break
			}
		}
		if !validRole {
			c.JSON(400, gin.H{"success": false, "message": "Invalid role"})
			return
		}
		config.Auth.Users[userIndex].Role = req.Role
	}

	if req.Password != "" {
		hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("[ERROR] updateUserHandler: password hashing failed: %v", err)
			c.JSON(500, gin.H{"success": false, "message": "Error updating user"})
			return
		}
		config.Auth.Users[userIndex].PasswordHash = string(hashedPassword)
	}

	// Save config to file - DO NOT encrypt bcrypt hashes
	configToSave := config
	
	// Only encrypt JWT secret, not password hashes (they are already bcrypt)
	if configToSave.Auth.JWTSecret != "" && !isEncrypted(configToSave.Auth.JWTSecret) {
		encrypted, err := encrypt(configToSave.Auth.JWTSecret)
		if err != nil {
			log.Printf("[ERROR] updateUserHandler: JWT encryption failed: %v", err)
			c.JSON(500, gin.H{"success": false, "message": "Error saving user"})
			return
		}
		configToSave.Auth.JWTSecret = encrypted
	}

	data, _ := json.MarshalIndent(configToSave, "", "  ")
	if err := os.WriteFile("config.json", data, 0644); err != nil {
		log.Printf("[ERROR] updateUserHandler: save failed: %v", err)
		c.JSON(500, gin.H{"success": false, "message": "Error saving user"})
		return
	}

	log.Printf("[INFO] updateUserHandler: user '%s' updated successfully", username)
	c.JSON(200, gin.H{
		"success": true,
		"message": "User updated successfully",
		"user": gin.H{
			"username": config.Auth.Users[userIndex].Username,
			"role":     config.Auth.Users[userIndex].Role,
		},
	})
}

func deleteUserHandler(c *gin.Context) {
	username := c.Param("username")

	// Find user
	userIndex := -1
	for i, user := range config.Auth.Users {
		if user.Username == username {
			userIndex = i
			break
		}
	}
	if userIndex == -1 {
		c.JSON(404, gin.H{"success": false, "message": "User not found"})
		return
	}

	// Don't allow deleting the last admin
	adminCount := 0
	for _, user := range config.Auth.Users {
		if user.Role == "admin" {
			adminCount++
		}
	}
	if config.Auth.Users[userIndex].Role == "admin" && adminCount <= 1 {
		c.JSON(400, gin.H{"success": false, "message": "Cannot delete the last admin user"})
		return
	}

	// Remove user
	config.Auth.Users = append(config.Auth.Users[:userIndex], config.Auth.Users[userIndex+1:]...)

	// Save config to file
	configToSave := config
	if err := encryptSensitiveConfig(&configToSave); err != nil {
		log.Printf("[ERROR] deleteUserHandler: encryption failed: %v", err)
		c.JSON(500, gin.H{"success": false, "message": "Error saving changes"})
		return
	}

	data, _ := json.MarshalIndent(configToSave, "", "  ")
	if err := os.WriteFile("config.json", data, 0644); err != nil {
		log.Printf("[ERROR] deleteUserHandler: save failed: %v", err)
		c.JSON(500, gin.H{"success": false, "message": "Error saving changes"})
		return
	}

	log.Printf("[INFO] deleteUserHandler: user '%s' deleted successfully", username)
	c.JSON(200, gin.H{
		"success": true,
		"message": "User deleted successfully",
	})
}

// Monitor handlers
func getHealthHandler(c *gin.Context) {
	// Get memory info
	memInfo, _ := mem.VirtualMemory()
	memUsed := memInfo.Used / 1024 / 1024 // Convert to MB
	memTotal := memInfo.Total / 1024 / 1024 // Convert to MB
	
	// Get disk info
	diskInfo, _ := disk.Usage(".")
	diskUsed := diskInfo.Used / 1024 / 1024 // Convert to MB
	
	c.JSON(200, gin.H{
		"success": true,
		"health": gin.H{
			"status": "healthy",
			"uptime": int(time.Since(startTime).Seconds()),
			"timestamp": time.Now().Format(time.RFC3339),
			"memory": gin.H{
				"used": memUsed,
				"total": memTotal,
				"external": diskUsed,
			},
			"connections": atomic.LoadInt64(&activeConnections),
			"requests": atomic.LoadInt64(&totalRequests),
		},
	})
}

func getStatsHandler(c *gin.Context) {
	uptime := time.Since(startTime)
	
	c.JSON(200, gin.H{
		"success": true,
		"stats": gin.H{
			"uptime":                int(uptime.Seconds()),
			"activeConnections":     atomic.LoadInt64(&activeConnections),
			"totalConnections":      atomic.LoadInt64(&totalConnections),
			"totalRequests":         atomic.LoadInt64(&totalRequests),
			"totalBytesTransferred": atomic.LoadInt64(&bytesTransferred),
			"errorRate":             0,
			"averageResponseTime":   0,
			"server_port":           config.Server.Port,
			"shares_count":          len(config.Files.Shares),
		},
	})
}

func getMetricsHandler(c *gin.Context) {
	// Get CPU usage
	cpuPercent, err := cpu.Percent(time.Second, false)
	var cpuUsage float64 = 0
	if err == nil && len(cpuPercent) > 0 {
		cpuUsage = cpuPercent[0]
	}

	// Get memory usage
	memInfo, err := mem.VirtualMemory()
	var memUsed, memTotal, memPercentage uint64 = 0, 0, 0
	if err == nil {
		memUsed = memInfo.Used / 1024 / 1024 // Convert to MB
		memTotal = memInfo.Total / 1024 / 1024 // Convert to MB
		memPercentage = uint64(memInfo.UsedPercent)
	}

	// Get disk usage for the current directory
	diskInfo, err := disk.Usage(".")
	var diskUsed, diskTotal, diskPercentage uint64 = 0, 0, 0
	if err == nil {
		diskUsed = diskInfo.Used / 1024 / 1024 // Convert to MB
		diskTotal = diskInfo.Total / 1024 / 1024 // Convert to MB
		diskPercentage = uint64(diskInfo.UsedPercent)
	}

	// Get network metrics from our tracking
	bytesOut := atomic.LoadInt64(&bytesTransferred)
	totalReqs := atomic.LoadInt64(&totalRequests)
	activeConns := atomic.LoadInt64(&activeConnections)

	c.JSON(200, gin.H{
		"success": true,
		"metrics": gin.H{
			"cpu": cpuUsage,
			"memory": gin.H{
				"used": memUsed,
				"total": memTotal,
				"percentage": memPercentage,
			},
			"disk": gin.H{
				"used": diskUsed,
				"total": diskTotal,
				"percentage": diskPercentage,
			},
			"network": gin.H{
				"bytesIn": 0,
				"bytesOut": bytesOut,
				"packetsIn": 0,
				"packetsOut": totalReqs,
				"activeConnections": activeConns,
			},
		},
	})
}

func getConnectionsHandler(c *gin.Context) {
	activeConns := atomic.LoadInt64(&activeConnections)
	totalConns := atomic.LoadInt64(&totalConnections)
	totalReqs := atomic.LoadInt64(&totalRequests)
	bytesTransf := atomic.LoadInt64(&bytesTransferred)
	
	c.JSON(200, gin.H{
		"success": true,
		"connections": gin.H{
			"active": activeConns,
			"total": totalConns,
			"requests": totalReqs,
			"bytesTransferred": bytesTransf,
		},
		"details": []gin.H{},
	})
}

func getLogsHandler(c *gin.Context) {
	limit := c.DefaultQuery("limit", "100")
	
	c.JSON(200, gin.H{
		"success": true,
		"logs": []gin.H{
			{
				"timestamp": time.Now().Format(time.RFC3339),
				"level":     "info",
				"message":   "Server started successfully",
			},
		},
		"limit": limit,
	})
}

// Security handlers
func getLockedIPsHandler(c *gin.Context) {
	var lockedIPs []gin.H
	now := time.Now()
	
	for ip, attempt := range loginAttempts {
		if attempt.LockedUntil != nil && attempt.LockedUntil.After(now) {
			lockedIPs = append(lockedIPs, gin.H{
				"ip":           ip,
				"attempts":     attempt.Count,
				"lastAttempt":  attempt.LastAttempt.Format(time.RFC3339),
				"lockedUntil":  attempt.LockedUntil.Format(time.RFC3339),
				"remainingTime": int(attempt.LockedUntil.Sub(now).Seconds()),
			})
		}
	}
	
	c.JSON(200, gin.H{
		"success":   true,
		"lockedIPs": lockedIPs,
		"count":     len(lockedIPs),
	})
}

func unlockIPHandler(c *gin.Context) {
	ip := c.Param("ip")
	if ip == "" {
		c.JSON(400, gin.H{"success": false, "message": "IP address required"})
		return
	}
	
	// Check if IP is actually locked
	attempt, exists := loginAttempts[ip]
	if !exists {
		c.JSON(404, gin.H{"success": false, "message": "IP not found in lockout list"})
		return
	}
	
	if attempt.LockedUntil == nil || attempt.LockedUntil.Before(time.Now()) {
		c.JSON(400, gin.H{"success": false, "message": "IP is not currently locked"})
		return
	}
	
	// Clear the lockout
	clearFailedAttempts(ip)
	
	admin, _ := c.Get("username")
	log.Printf("[INFO] Security: IP %s unlocked by admin %s (was locked until %v)", ip, admin, attempt.LockedUntil.Format("2006-01-02 15:04:05"))
	c.JSON(200, gin.H{
		"success": true,
		"message": fmt.Sprintf("IP %s has been unlocked successfully", ip),
		"ip":      ip,
	})
}

func unlockAllIPsHandler(c *gin.Context) {
	count := 0
	now := time.Now()
	
	for ip, attempt := range loginAttempts {
		if attempt.LockedUntil != nil && attempt.LockedUntil.After(now) {
			clearFailedAttempts(ip)
			count++
		}
	}
	
	admin, _ := c.Get("username")
	log.Printf("[INFO] Security: %d locked IPs unlocked by admin %s", count, admin)
	c.JSON(200, gin.H{
		"success": true,
		"message": fmt.Sprintf("%d locked IPs have been unlocked successfully", count),
		"count":   count,
	})
}