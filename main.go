package main

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"embed"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"io/fs"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

//go:embed dist/*
var staticFiles embed.FS

// Application version for auto-update
const Version = "1.0.1"

// Configuration structures
type TLSConfig struct {
	Enabled     bool   `json:"enabled"`
	Port        int    `json:"port"`
	CertFile    string `json:"cert_file"`
	KeyFile     string `json:"key_file"`
	AutoCert    bool   `json:"auto_cert"`
	DisableHTTP bool   `json:"disable_http"`
}

type ServerConfig struct {
	Port int       `json:"port"`
	Host string    `json:"host"`
	TLS  TLSConfig `json:"tls"`
}

type FileShare struct {
	Path     string `json:"path"`
	Alias    string `json:"alias"`
	Readonly bool   `json:"readonly"`
}

type FilesConfig struct {
	Shares            []FileShare `json:"shares"`
	MaxFileSize       string      `json:"max_file_size"`
	AllowedExtensions []string    `json:"allowed_extensions"`
}

type AuthUser struct {
	Username     string `json:"username"`
	PasswordHash string `json:"password_hash"`
	Role         string `json:"role"`
}

type AuthConfig struct {
	Users            []AuthUser `json:"users"`
	LockoutThreshold int        `json:"lockout_threshold"`
	LockoutDuration  string     `json:"lockout_duration"`
	SessionTimeout   string     `json:"session_timeout"`
	JWTSecret        string     `json:"jwt_secret"`
}

type ThrottlingConfig struct {
	DefaultKbps   int            `json:"default_kbps"`
	PerUserLimits map[string]int `json:"per_user_limits"`
}

type LoggingConfig struct {
	Level   string `json:"level"`
	File    string `json:"file"`
	MaxSize string `json:"max_size"`
	Rotate  bool   `json:"rotate"`
}

type AppConfig struct {
	Server     ServerConfig     `json:"server"`
	Files      FilesConfig      `json:"files"`
	Auth       AuthConfig       `json:"auth"`
	Throttling ThrottlingConfig `json:"throttling"`
	Logging    LoggingConfig    `json:"logging"`
}

// JWT Claims
type Claims struct {
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// Global variables
var config AppConfig
var loginAttempts = make(map[string]LoginAttempt)
var serverCtx context.Context
var serverCancel context.CancelFunc

// Metrics tracking variables
var (
	activeConnections int64
	totalConnections  int64
	totalRequests     int64
	bytesTransferred  int64
	startTime         = time.Now()
)

type LoginAttempt struct {
	Count       int
	LastAttempt time.Time
	LockedUntil *time.Time
}

// Metrics tracking middleware
func metricsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Increment active connections
		atomic.AddInt64(&activeConnections, 1)
		atomic.AddInt64(&totalConnections, 1)
		atomic.AddInt64(&totalRequests, 1)

		// Track response size
		writer := &responseWriter{ResponseWriter: c.Writer, size: 0}
		c.Writer = writer

		// Process request
		c.Next()

		// Decrement active connections and add bytes transferred
		atomic.AddInt64(&activeConnections, -1)
		atomic.AddInt64(&bytesTransferred, int64(writer.size))
	}
}

// Custom response writer to track bytes
type responseWriter struct {
	gin.ResponseWriter
	size int
}

func (w *responseWriter) Write(data []byte) (int, error) {
	n, err := w.ResponseWriter.Write(data)
	w.size += n
	return n, err
}

// hideConsole hides the console window on Windows
func hideConsole() {
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	user32 := syscall.NewLazyDLL("user32.dll")
	getConsoleWindow := kernel32.NewProc("GetConsoleWindow")
	showWindow := user32.NewProc("ShowWindow")

	hwnd, _, _ := getConsoleWindow.Call()
	if hwnd != 0 {
		// SW_HIDE = 0
		showWindow.Call(hwnd, 0)
	}
}

// getLocalIPs retrieves all local network IPs
func getLocalIPs() []net.IP {
	ips := []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback}

	interfaces, err := net.Interfaces()
	if err != nil {
		return ips
	}

	for _, i := range interfaces {
		addrs, err := i.Addrs()
		if err != nil {
			continue
		}
		for _, addr := range addrs {
			switch v := addr.(type) {
			case *net.IPNet:
				if !v.IP.IsLoopback() && !v.IP.IsUnspecified() {
					ips = append(ips, v.IP)
				}
			case *net.IPAddr:
				if !v.IP.IsLoopback() && !v.IP.IsUnspecified() {
					ips = append(ips, v.IP)
				}
			}
		}
	}
	return ips
}

// generateSelfSignedCert generates a self-signed certificate for HTTPS
func generateSelfSignedCert(certFile, keyFile string) error {
	log.Printf("[INFO] Generating self-signed certificate...")

	// Generate private key
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return fmt.Errorf("failed to generate private key: %v", err)
	}

	// Get all local IPs for the certificate
	localIPs := getLocalIPs()
	log.Printf("[INFO] Local IPs for certificate: %v", localIPs)

	// Create certificate template
	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization:  []string{"HtserveFS"},
			Country:       []string{"US"},
			Province:      []string{""},
			Locality:      []string{"Local"},
			StreetAddress: []string{""},
			PostalCode:    []string{""},
		},
		NotBefore:   time.Now(),
		NotAfter:    time.Now().Add(365 * 24 * time.Hour), // Valid for 1 year
		KeyUsage:    x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		IPAddresses: localIPs,
		DNSNames:    []string{"localhost", "*"},
	}

	// Create certificate
	certDER, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return fmt.Errorf("failed to create certificate: %v", err)
	}

	// Save certificate
	certOut, err := os.Create(certFile)
	if err != nil {
		return fmt.Errorf("failed to create cert file: %v", err)
	}
	defer certOut.Close()

	if err := pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: certDER}); err != nil {
		return fmt.Errorf("failed to write certificate: %v", err)
	}

	// Save private key
	keyOut, err := os.Create(keyFile)
	if err != nil {
		return fmt.Errorf("failed to create key file: %v", err)
	}
	defer keyOut.Close()

	privDER, err := x509.MarshalPKCS8PrivateKey(priv)
	if err != nil {
		return fmt.Errorf("failed to marshal private key: %v", err)
	}

	if err := pem.Encode(keyOut, &pem.Block{Type: "PRIVATE KEY", Bytes: privDER}); err != nil {
		return fmt.Errorf("failed to write private key: %v", err)
	}

	log.Printf("[INFO] Self-signed certificate generated successfully")
	log.Printf("[INFO] Certificate: %s", certFile)
	log.Printf("[INFO] Private Key: %s", keyFile)

	return nil
}

func main() {
	// Hide console window on Windows
	hideConsole()

	// Enable logging to file for debugging
	// Log file is created in the same directory as the executable
	exePath, _ := os.Executable()
	exeDir := filepath.Dir(exePath)
	logPath := filepath.Join(exeDir, "htservefs.log")

	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err == nil {
		log.SetOutput(logFile)
		// Log the absolute path where logs are written
		log.Printf("[INFO] HtserveFS started - Logs written to: %s", logPath)
		log.Printf("[INFO] Executable location: %s", exePath)
	} else {
		log.SetOutput(io.Discard)
	}
	gin.SetMode(gin.ReleaseMode)
	gin.DefaultWriter = io.Discard
	gin.DefaultErrorWriter = io.Discard

	// Check for updates (non-blocking)
	go autoUpdateCheck()

	// Load configuration
	loadConfig()

	// Start system tray in a separate goroutine
	go func() {
		defer func() {
			if r := recover(); r != nil {
				// Silent recovery
			}
		}()
		initSystemTray()
	}()

	// Setup Gin router in silent mode
	r := gin.New()
	r.Use(gin.Recovery())

	// Add metrics tracking middleware
	r.Use(metricsMiddleware())

	// Setup CORS
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// API routes
	api := r.Group("/api")
	{
		// Auth routes
		api.POST("/auth/login", loginHandler)
		api.POST("/auth/verify", verifyTokenHandler)
		api.POST("/auth/logout", authMiddleware(), logoutHandler)
		api.GET("/auth/me", authMiddleware(), meHandler)

		// File routes
		api.GET("/files/shares", authMiddleware(), getSharesHandler)
		api.GET("/files/browse/*path", authMiddleware(), browseHandler)
		api.GET("/files/download/*path", authMiddleware(), downloadHandler)
		api.POST("/files/upload/*path", authMiddleware(), uploadHandler)
		api.POST("/files/mkdir/*path", authMiddleware(), mkdirHandler)
		api.POST("/files/create/*path", authMiddleware(), createFileHandler)
		api.DELETE("/files/delete/*path", authMiddleware(), deleteHandler)

		// Config routes
		api.GET("/config", authMiddleware(), requireRole("admin"), getConfigHandler)
		api.PUT("/config", authMiddleware(), requireRole("admin"), updateConfigHandler)

		// User routes
		api.GET("/users", authMiddleware(), requireRole("admin"), getUsersHandler)
		api.POST("/users", authMiddleware(), requireRole("admin"), createUserHandler)
		api.PUT("/users/:username", authMiddleware(), requireRole("admin"), updateUserHandler)
		api.DELETE("/users/:username", authMiddleware(), requireRole("admin"), deleteUserHandler)

		// Monitor routes
		api.GET("/monitor/health", getHealthHandler)
		api.GET("/monitor/stats", authMiddleware(), requireRole("admin"), getStatsHandler)
		api.GET("/monitor/metrics", authMiddleware(), requireRole("admin"), getMetricsHandler)
		api.GET("/monitor/connections", authMiddleware(), requireRole("admin"), getConnectionsHandler)
		api.GET("/monitor/logs", authMiddleware(), requireRole("admin"), getLogsHandler)

		// Security routes
		api.GET("/security/locked-ips", authMiddleware(), requireRole("admin"), getLockedIPsHandler)
		api.POST("/security/unlock-ip/:ip", authMiddleware(), requireRole("admin"), unlockIPHandler)
		api.POST("/security/unlock-all", authMiddleware(), requireRole("admin"), unlockAllIPsHandler)
	}

	// Serve static files from embedded filesystem
	// Serve assets directly (CSS, JS files) - assets are in dist/assets
	assetFS, _ := fs.Sub(staticFiles, "dist/assets")
	r.StaticFS("/assets", http.FS(assetFS))

	// Serve other static files from root
	r.GET("/favicon.svg", func(c *gin.Context) {
		data, err := staticFiles.ReadFile("dist/favicon.svg")
		if err != nil {
			c.String(404, "Not found")
			return
		}
		c.Data(200, "image/svg+xml", data)
	})

	// Serve htservefs-icon files
	r.GET("/htservefs-icon.svg", func(c *gin.Context) {
		data, err := staticFiles.ReadFile("dist/htservefs-icon.svg")
		if err != nil {
			c.String(404, "Not found")
			return
		}
		c.Data(200, "image/svg+xml", data)
	})

	r.GET("/htservefs-icon.ico", func(c *gin.Context) {
		data, err := staticFiles.ReadFile("dist/htservefs-icon.ico")
		if err != nil {
			c.String(404, "Not found")
			return
		}
		c.Data(200, "image/x-icon", data)
	})

	// Serve index.html for all non-API routes (SPA routing)
	r.NoRoute(func(c *gin.Context) {
		if !strings.HasPrefix(c.Request.URL.Path, "/api") {
			// Check if it's an asset file
			if strings.HasPrefix(c.Request.URL.Path, "/assets/") {
				// Let the StaticFS handle it
				c.Next()
				return
			}

			// Serve index.html for all other routes
			data, err := staticFiles.ReadFile("dist/index.html")
			if err != nil {
				c.String(404, "Page not found")
				return
			}
			c.Data(200, "text/html; charset=utf-8", data)
		} else {
			c.JSON(404, gin.H{"error": "API endpoint not found"})
		}
	})

	// Start server with context for graceful shutdown
	httpAddr := fmt.Sprintf("%s:%d", config.Server.Host, config.Server.Port)

	serverCtx, serverCancel = context.WithCancel(context.Background())
	httpServer := &http.Server{
		Addr:    httpAddr,
		Handler: r,
	}

	go func() {
		<-serverCtx.Done()
		httpServer.Shutdown(context.Background())
	}()

	// Start HTTP server (unless disabled when HTTPS is enabled)
	if !config.Server.TLS.Enabled || !config.Server.TLS.DisableHTTP {
		log.Printf("[INFO] Starting HTTP server on %s", httpAddr)
		go func() {
			if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf("[ERROR] HTTP server failed: %v", err)
			}
		}()
	} else {
		log.Printf("[INFO] HTTP server disabled (HTTPS-only mode enabled)")
	}

	// Start HTTPS server if enabled
	if config.Server.TLS.Enabled {
		httpsAddr := fmt.Sprintf("%s:%d", config.Server.Host, config.Server.TLS.Port)
		log.Printf("[INFO] HTTPS enabled - attempting to start server on %s", httpsAddr)
		log.Printf("[INFO] TLS Certificate: %s", config.Server.TLS.CertFile)
		log.Printf("[INFO] TLS Key: %s", config.Server.TLS.KeyFile)
		log.Printf("[INFO] Auto-cert enabled: %v", config.Server.TLS.AutoCert)

		// Check if certificate files exist
		certExists := true
		keyExists := true

		if _, err := os.Stat(config.Server.TLS.CertFile); os.IsNotExist(err) {
			log.Printf("[WARN] Certificate file not found: %s", config.Server.TLS.CertFile)
			certExists = false
		}

		if _, err := os.Stat(config.Server.TLS.KeyFile); os.IsNotExist(err) {
			log.Printf("[WARN] Key file not found: %s", config.Server.TLS.KeyFile)
			keyExists = false
		}

		// Generate certificates if needed and auto-cert is enabled
		if (!certExists || !keyExists) && config.Server.TLS.AutoCert {
			log.Printf("[INFO] Auto-generating self-signed certificate...")
			if err := generateSelfSignedCert(config.Server.TLS.CertFile, config.Server.TLS.KeyFile); err != nil {
				log.Printf("[ERROR] Failed to generate certificate: %v", err)
				log.Printf("[ERROR] HTTPS server startup failed - certificate generation error")
			} else {
				log.Printf("[INFO] Self-signed certificate generated successfully")
				certExists = true
				keyExists = true
			}
		}

		// Start HTTPS server if certificates are available
		if certExists && keyExists {
			// Create HTTPS server
			httpsServer := &http.Server{
				Addr:    httpsAddr,
				Handler: r,
			}

			go func() {
				<-serverCtx.Done()
				log.Printf("[INFO] Shutting down HTTPS server...")
				httpsServer.Shutdown(context.Background())
			}()

			// Start HTTPS server in goroutine (non-blocking)
			go func() {
				log.Printf("[INFO] HTTPS server starting on %s...", httpsAddr)
				if err := httpsServer.ListenAndServeTLS(config.Server.TLS.CertFile, config.Server.TLS.KeyFile); err != nil && err != http.ErrServerClosed {
					log.Printf("[ERROR] HTTPS server failed to start: %v", err)
					log.Printf("[ERROR] HTTPS server error details: %T", err)
				} else if err == nil {
					log.Printf("[INFO] HTTPS server started successfully on %s", httpsAddr)
				}
			}()

			log.Printf("[INFO] HTTPS server initialization completed")
		} else {
			log.Printf("[ERROR] HTTPS server cannot start - missing certificate files")
			log.Printf("[ERROR] Certificate exists: %v, Key exists: %v", certExists, keyExists)
		}
	} else {
		log.Printf("[INFO] HTTPS disabled in configuration")
	}

	// Keep the main goroutine alive
	log.Printf("[INFO] Server initialization complete")
	if config.Server.TLS.Enabled {
		log.Printf("[INFO] Access HTTP: http://%s", httpAddr)
		log.Printf("[INFO] Access HTTPS: https://%s:%d", config.Server.Host, config.Server.TLS.Port)
	} else {
		log.Printf("[INFO] Access HTTP: http://%s", httpAddr)
	}

	select {} // Keep servers running
}

func loadConfig() {
	// Default configuration with embedded hash for admin/admin
	// This hash is generated with bcrypt for password "admin" and works on all systems
	config = AppConfig{
		Server: ServerConfig{
			Port: 8000,
			Host: "0.0.0.0",
			TLS: TLSConfig{
				Enabled:     false,
				Port:        8001,
				CertFile:    "cert.pem",
				KeyFile:     "key.pem",
				AutoCert:    false,
				DisableHTTP: false,
			},
		},
		Files: FilesConfig{
			Shares: []FileShare{
				{Path: "C:\\", Alias: "Shared", Readonly: false},
			},
			MaxFileSize:       "100MB",
			AllowedExtensions: []string{"*"},
		},
		Auth: AuthConfig{
			Users: []AuthUser{
				{
					Username: "admin",
					// Hash for password "admin" - works on all systems
					PasswordHash: "$2b$12$jPo0elbKLe8kS0xWIc3zfOpw.n0QKjqvPlMjaWfuJo8qpsLt7l8qG",
					Role:         "admin",
				},
				{
					Username: "user",
					// Hash for password "password" - works on all systems
					PasswordHash: "$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi",
					Role:         "read-write",
				},
			},
			LockoutThreshold: 5,
			LockoutDuration:  "15m",
			SessionTimeout:   "24h",
			JWTSecret:        "your-super-secret-jwt-key-change-this-in-production",
		},
		Throttling: ThrottlingConfig{
			DefaultKbps:   1024,
			PerUserLimits: map[string]int{"admin": 0, "user": 512},
		},
		Logging: LoggingConfig{
			Level:   "debug",
			File:    "htservefs.log",
			MaxSize: "5MB",
			Rotate:  true,
		},
	}

	// Try to load from config.json if it exists
	// This allows for customization while maintaining embedded defaults
	log.Printf("[DEBUG] loadConfig: attempting to load config.json")
	if data, err := os.ReadFile("config.json"); err == nil {
		log.Printf("[DEBUG] loadConfig: config.json found, parsing...")
		var loadedConfig AppConfig
		if err := json.Unmarshal(data, &loadedConfig); err == nil {
			log.Printf("[DEBUG] loadConfig: config.json parsed successfully")
			log.Printf("[DEBUG] loadConfig: TLS enabled in loaded config: %v", loadedConfig.Server.TLS.Enabled)
			// Decrypt sensitive data from loaded config
			if err := decryptSensitiveConfig(&loadedConfig); err == nil {
				config = loadedConfig
				log.Printf("[DEBUG] loadConfig: config loaded and decrypted successfully")
				log.Printf("[DEBUG] loadConfig: final TLS enabled: %v", config.Server.TLS.Enabled)
			} else {
				log.Printf("[ERROR] loadConfig: decryption failed: %v, using embedded defaults", err)
			}
		} else {
			log.Printf("[ERROR] loadConfig: JSON parsing failed: %v, using embedded defaults", err)
		}
	} else {
		log.Printf("[DEBUG] loadConfig: config.json not found: %v, using embedded defaults", err)
	}
}
