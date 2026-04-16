package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// VersionInfo represents the structure of latest.json
type VersionInfo struct {
	Version string `json:"version"`
	URL     string `json:"url"`
	Notes   string `json:"notes"`
}

// checkForUpdates checks if a new version is available on GitHub
func checkForUpdates() (*VersionInfo, bool, error) {
	log.Printf("[INFO] Checking for updates...")
	
	// Download latest.json from GitHub
	client := &http.Client{
		Timeout: 30 * time.Second,
	}
	
	resp, err := client.Get("https://raw.githubusercontent.com/lusp75/HTserveFS/main/latest.json")
	if err != nil {
		return nil, false, fmt.Errorf("failed to fetch version info: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return nil, false, fmt.Errorf("failed to fetch version info: HTTP %d", resp.StatusCode)
	}
	
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, false, fmt.Errorf("failed to read response body: %v", err)
	}
	
	var versionInfo VersionInfo
	if err := json.Unmarshal(body, &versionInfo); err != nil {
		return nil, false, fmt.Errorf("failed to parse version info: %v", err)
	}
	
	log.Printf("[INFO] Current version: %s, Latest version: %s", Version, versionInfo.Version)
	
	// Compare versions
	isNewer := compareVersions(versionInfo.Version, Version)
	return &versionInfo, isNewer, nil
}

// compareVersions compares two version strings
// Returns true if newVersion is newer than currentVersion
func compareVersions(newVersion, currentVersion string) bool {
	// Simple version comparison for now
	// This handles basic cases like "1.0.1-beta" vs "1.0.0-beta"
	
	// Remove common suffixes for comparison
	newClean := strings.ReplaceAll(newVersion, "-beta", "")
	currentClean := strings.ReplaceAll(currentVersion, "-beta", "")
	
	// Split by dots
	newParts := strings.Split(newClean, ".")
	currentParts := strings.Split(currentClean, ".")
	
	// Pad shorter version with zeros
	maxLen := len(newParts)
	if len(currentParts) > maxLen {
		maxLen = len(currentParts)
	}
	
	for len(newParts) < maxLen {
		newParts = append(newParts, "0")
	}
	for len(currentParts) < maxLen {
		currentParts = append(currentParts, "0")
	}
	
	// Compare each part
	for i := 0; i < maxLen; i++ {
		if newParts[i] > currentParts[i] {
			return true
		} else if newParts[i] < currentParts[i] {
			return false
		}
	}
	
	// If we reach here, versions are equal
	return false
}

// downloadUpdate downloads the new version from the given URL
func downloadUpdate(url string) (string, error) {
	log.Printf("[INFO] Downloading update from: %s", url)
	
	client := &http.Client{
		Timeout: 5 * time.Minute, // Longer timeout for download
	}
	
	resp, err := client.Get(url)
	if err != nil {
		return "", fmt.Errorf("failed to download update: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to download update: HTTP %d", resp.StatusCode)
	}
	
	// Create temporary file
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("failed to get executable path: %v", err)
	}
	
	exeDir := filepath.Dir(exePath)
	tempFile := filepath.Join(exeDir, "htservefs_update.exe")
	
	out, err := os.Create(tempFile)
	if err != nil {
		return "", fmt.Errorf("failed to create temp file: %v", err)
	}
	defer out.Close()
	
	// Copy the downloaded content
	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to write update file: %v", err)
	}
	
	log.Printf("[INFO] Update downloaded to: %s", tempFile)
	return tempFile, nil
}

// performUpdate replaces the current executable with the new one and restarts
func performUpdate(newExePath string) error {
	log.Printf("[INFO] Performing update...")
	
	currentExePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to get current executable path: %v", err)
	}
	
	// Create backup of current executable
	backupPath := currentExePath + ".backup"
	if err := os.Rename(currentExePath, backupPath); err != nil {
		return fmt.Errorf("failed to backup current executable: %v", err)
	}
	
	// Move new executable to current location
	if err := os.Rename(newExePath, currentExePath); err != nil {
		// Restore backup if move fails
		os.Rename(backupPath, currentExePath)
		return fmt.Errorf("failed to replace executable: %v", err)
	}
	
	// Remove backup
	os.Remove(backupPath)
	
	log.Printf("[INFO] Update completed successfully. Restarting...")
	
	// Restart the application
	return restartApplication(currentExePath)
}

// restartApplication restarts the application
func restartApplication(exePath string) error {
	// Start new instance using Windows start command
	cmd := exec.Command("cmd", "/c", "start", "", exePath)
	err := cmd.Start()
	if err != nil {
		return fmt.Errorf("failed to restart application: %v", err)
	}
	
	// Exit current instance
	os.Exit(0)
	return nil
}

// autoUpdateCheck performs the complete auto-update check and update process
func autoUpdateCheck() {
	log.Printf("[INFO] Starting auto-update check...")
	
	versionInfo, hasUpdate, err := checkForUpdates()
	if err != nil {
		log.Printf("[WARNING] Auto-update check failed: %v", err)
		return
	}
	
	if !hasUpdate {
		log.Printf("[INFO] No updates available. Current version %s is up to date.", Version)
		return
	}
	
	log.Printf("[INFO] New version available: %s", versionInfo.Version)
	log.Printf("[INFO] Update notes: %s", versionInfo.Notes)
	
	// Download the update
	newExePath, err := downloadUpdate(versionInfo.URL)
	if err != nil {
		log.Printf("[ERROR] Failed to download update: %v", err)
		return
	}
	
	// Perform the update
	if err := performUpdate(newExePath); err != nil {
		log.Printf("[ERROR] Failed to perform update: %v", err)
		// Clean up downloaded file
		os.Remove(newExePath)
		return
	}
}