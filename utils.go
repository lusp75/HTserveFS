package main

import (
	"log"
	"path/filepath"
	"strings"
	"time"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// Auth utilities
func generateToken(user *AuthUser) (string, error) {
	claims := &Claims{
		Username: user.Username,
		Role:     user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.Auth.JWTSecret))
}

func findUser(username string) *AuthUser {
	for _, user := range config.Auth.Users {
		if user.Username == username {
			return &user
		}
	}
	return nil
}

func isLockedOut(ip string) bool {
	attempt, exists := loginAttempts[ip]
	if !exists {
		return false
	}

	if attempt.LockedUntil != nil && attempt.LockedUntil.After(time.Now()) {
		return true
	}

	// Clear expired lockout
	if attempt.LockedUntil != nil && attempt.LockedUntil.Before(time.Now()) {
		delete(loginAttempts, ip)
		return false
	}

	return false
}

func recordFailedAttempt(ip string) {
	now := time.Now()
	attempt, exists := loginAttempts[ip]
	if !exists {
		attempt = LoginAttempt{Count: 0, LastAttempt: now}
	}

	// Reset count if last attempt was more than 1 hour ago
	if now.Sub(attempt.LastAttempt) > time.Hour {
		log.Printf("[INFO] Lockout: Resetting failed attempt count for IP %s (last attempt was %v ago)", ip, now.Sub(attempt.LastAttempt))
		attempt.Count = 0
	}

	attempt.Count++
	attempt.LastAttempt = now

	// Lock out if threshold exceeded (skip if threshold is 0 - lockout disabled)
	if config.Auth.LockoutThreshold > 0 && attempt.Count >= config.Auth.LockoutThreshold {
		lockoutDuration := parseDuration(config.Auth.LockoutDuration)
		lockedUntil := now.Add(lockoutDuration)
		attempt.LockedUntil = &lockedUntil
		log.Printf("[WARN] Lockout: IP %s locked out until %v (threshold %d exceeded with %d attempts)", 
			ip, lockedUntil.Format("2006-01-02 15:04:05"), config.Auth.LockoutThreshold, attempt.Count)
	} else {
		if config.Auth.LockoutThreshold == 0 {
			log.Printf("[INFO] Lockout: Failed attempt %d recorded for IP %s (lockout disabled)", attempt.Count, ip)
		} else {
			log.Printf("[INFO] Lockout: Failed attempt %d/%d recorded for IP %s", attempt.Count, config.Auth.LockoutThreshold, ip)
		}
	}

	loginAttempts[ip] = attempt
}

func clearFailedAttempts(ip string) {
	_, exists := loginAttempts[ip]
	if exists {
		log.Printf("[INFO] Lockout: Clearing failed attempts for IP %s", ip)
	}
	delete(loginAttempts, ip)
}

func getFailedAttemptCount(ip string) int {
	attempt, exists := loginAttempts[ip]
	if !exists {
		return 0
	}
	return attempt.Count
}

func parseDuration(timeStr string) time.Duration {
	if duration, err := time.ParseDuration(timeStr); err == nil {
		return duration
	}
	return 15 * time.Minute // Default 15 minutes
}

// File utilities
func findShare(path string) *FileShare {
	if path == "" || path == "/" {
		// Return first share as default
		if len(config.Files.Shares) > 0 {
			return &config.Files.Shares[0]
		}
		return nil
	}

	// Extract share name from path
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 {
		return nil
	}

	shareName := parts[0]
	for _, share := range config.Files.Shares {
		if share.Alias == shareName {
			return &share
		}
	}

	return nil
}

func getActualPath(share *FileShare, requestPath string) string {
	if requestPath == "" || requestPath == "/" || requestPath == share.Alias {
		return share.Path
	}

	// Remove share alias from path
	relativePath := strings.TrimPrefix(requestPath, share.Alias)
	relativePath = strings.TrimPrefix(relativePath, "/")

	if relativePath == "" {
		return share.Path
	}

	// Clean the path to prevent directory traversal attacks
	cleanPath := filepath.Clean(filepath.Join(share.Path, relativePath))
	
	// Ensure the path is still within the share directory
	sharePathAbs, _ := filepath.Abs(share.Path)
	cleanPathAbs, _ := filepath.Abs(cleanPath)
	
	if !strings.HasPrefix(cleanPathAbs, sharePathAbs) {
		return share.Path // Return to share root if path traversal detected
	}
	
	return cleanPath
}

func getFileType(entry os.DirEntry) string {
	if entry.IsDir() {
		return "directory"
	}
	return "file"
}

// Middleware
func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(401, gin.H{"success": false, "message": "Authorization header required"})
			c.Abort()
			return
		}

		tokenString := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenString == authHeader {
			c.JSON(401, gin.H{"success": false, "message": "Invalid authorization format"})
			c.Abort()
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenString, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(config.Auth.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			c.JSON(403, gin.H{"success": false, "message": "Invalid or expired token"})
			c.Abort()
			return
		}

		c.Set("username", claims.Username)
		c.Set("role", claims.Role)
		c.Next()
	}
}

func requireRole(requiredRole string) gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists {
			c.JSON(401, gin.H{"success": false, "message": "Authentication required"})
			c.Abort()
			return
		}

		userRole, ok := role.(string)
		if !ok || userRole != requiredRole {
			c.JSON(403, gin.H{"success": false, "message": "Insufficient permissions"})
			c.Abort()
			return
		}

		c.Next()
	}
}