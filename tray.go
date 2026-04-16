//go:build windows
// +build windows

package main

import (
	"encoding/json"
	"log"
	"os"
	"os/exec"
	"syscall"
	"time"

	"fyne.io/systray"
)

// System tray functionality
func initSystemTray() {
	log.Println("Initializing system tray...")
	defer func() {
		if r := recover(); r != nil {
			log.Printf("System tray initialization failed: %v", r)
		}
	}()
	systray.Run(onReady, onExit)
}

// Global menu items for dynamic updates
var (
	mOpenWeb     *systray.MenuItem
	mOpenWebHTTPS *systray.MenuItem
	mStatus      *systray.MenuItem
	mToggleHTTPS *systray.MenuItem
	mHTTPSOnly   *systray.MenuItem
)

func onReady() {
	log.Println("System tray ready, setting up menu...")
	// Set icon (you can embed an icon here)
	systray.SetIcon(getIcon())
	log.Println("Icon set successfully")
	systray.SetTitle("HtserveFS")
	systray.SetTooltip("HtserveFS - File Server")
	log.Println("System tray setup complete")

	// Create menu items
	mOpenWeb = systray.AddMenuItem("Apri Interfaccia Web", "Apri l'interfaccia web nel browser")
	mOpenWebHTTPS = systray.AddMenuItem("Apri Interfaccia HTTPS", "Apri l'interfaccia web HTTPS nel browser")
	
	// Server status
	mStatus = systray.AddMenuItem("", "Stato del server")
	mStatus.Disable()
	
	systray.AddSeparator()
	
	// HTTPS controls
	mToggleHTTPS = systray.AddMenuItem("", "Abilita/Disabilita HTTPS")
	mHTTPSOnly = systray.AddMenuItem("Modalità HTTPS-Only", "Disabilita HTTP quando HTTPS è attivo")
	
	// Update menu with current config
	updateMenuItems()
	
	systray.AddSeparator()
	mRestart := systray.AddMenuItem("Riavvia Server", "Riavvia il server")
	mStop := systray.AddMenuItem("Ferma Server", "Ferma il server")
	systray.AddSeparator()
	mExit := systray.AddMenuItem("Esci", "Chiudi HtserveFS")

	// Handle menu clicks
	go func() {
		for {
			select {
			case <-mOpenWeb.ClickedCh:
				openBrowser("http://localhost:8000")
			case <-mOpenWebHTTPS.ClickedCh:
				if config.Server.TLS.Enabled {
					openBrowser("https://localhost:8001")
				}
			case <-mToggleHTTPS.ClickedCh:
				toggleHTTPS()
			case <-mHTTPSOnly.ClickedCh:
				toggleHTTPSOnly()
			case <-mRestart.ClickedCh:
				restartServer()
			case <-mStop.ClickedCh:
				stopServer()
			case <-mExit.ClickedCh:
				stopServer()
				systray.Quit()
				return
			}
		}
	}()
}

func onExit() {
	// Cleanup when exiting
	log.Println("System tray exiting...")
}

func getIcon() []byte {
	// Return embedded icon data
	return iconData
}

func openBrowser(url string) {
	cmd := exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	err := cmd.Start()
	if err != nil {
		log.Printf("Error opening browser: %v", err)
	}
}

func restartServer() {
	log.Println("Restarting server...")
	// Stop current server
	if serverCancel != nil {
		log.Println("Stopping current server...")
		serverCancel()
	}
	
	// Wait a moment for graceful shutdown
	time.Sleep(1 * time.Second)
	
	// Restart the application
	log.Println("Restarting application...")
	executable, err := os.Executable()
	if err != nil {
		log.Printf("Error getting executable path: %v", err)
		return
	}
	
	cmd := exec.Command(executable)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	err = cmd.Start()
	if err != nil {
		log.Printf("Error restarting application: %v", err)
		return
	}
	
	log.Println("Application restart initiated, exiting current instance...")
	// Exit current instance
	os.Exit(0)
}

func stopServer() {
	log.Println("Stopping server...")
	if serverCancel != nil {
		serverCancel()
	}
}

func updateMenuItems() {
	log.Println("[DEBUG] Updating tray menu items...")
	
	// Update HTTPS menu item based on current state
	if mOpenWebHTTPS != nil {
		if config.Server.TLS.Enabled {
			mOpenWebHTTPS.Enable()
		} else {
			mOpenWebHTTPS.Disable()
		}
	}
	
	// Update server status
	if mStatus != nil {
		var statusText string
		if config.Server.TLS.Enabled && config.Server.TLS.DisableHTTP {
			statusText = "Server: HTTPS-Only"
		} else if config.Server.TLS.Enabled {
			statusText = "Server: HTTP + HTTPS"
		} else {
			statusText = "Server: HTTP-Only"
		}
		mStatus.SetTitle(statusText)
		log.Printf("[DEBUG] Status updated to: %s", statusText)
	}
	
	// Update HTTPS toggle button
	if mToggleHTTPS != nil {
		if config.Server.TLS.Enabled {
			mToggleHTTPS.SetTitle("Disabilita HTTPS")
		} else {
			mToggleHTTPS.SetTitle("Abilita HTTPS")
		}
		log.Printf("[DEBUG] HTTPS toggle updated: %s", 
			map[bool]string{true: "Disabilita HTTPS", false: "Abilita HTTPS"}[config.Server.TLS.Enabled])
	}
	
	// Update HTTPS-Only mode
	if mHTTPSOnly != nil {
		if config.Server.TLS.Enabled {
			mHTTPSOnly.Enable()
			if config.Server.TLS.DisableHTTP {
				mHTTPSOnly.Check()
			} else {
				mHTTPSOnly.Uncheck()
			}
		} else {
			mHTTPSOnly.Disable()
			mHTTPSOnly.Uncheck()
		}
		log.Printf("[DEBUG] HTTPS-Only updated: enabled=%v, checked=%v", 
			config.Server.TLS.Enabled, config.Server.TLS.DisableHTTP)
	}
	
	log.Println("[DEBUG] Menu items update completed")
}

func toggleHTTPS() {
	log.Println("Toggling HTTPS...")
	// Toggle HTTPS enabled state
	config.Server.TLS.Enabled = !config.Server.TLS.Enabled
	
	// If disabling HTTPS, also disable HTTPS-Only mode
	if !config.Server.TLS.Enabled {
		config.Server.TLS.DisableHTTP = false
	}
	
	// Save config
	saveConfigToFile()
	
	// Update menu items to reflect new state
	updateMenuItems()
	
	log.Printf("HTTPS %s. Riavviando il server per applicare le modifiche...", 
		map[bool]string{true: "abilitato", false: "disabilitato"}[config.Server.TLS.Enabled])
	
	// Automatically restart server to apply changes
	go func() {
		time.Sleep(500 * time.Millisecond) // Small delay to let the user see the menu update
		restartServer()
	}()
}

func toggleHTTPSOnly() {
	log.Println("Toggling HTTPS-Only mode...")
	if !config.Server.TLS.Enabled {
		log.Println("HTTPS deve essere abilitato per usare la modalità HTTPS-Only")
		return
	}
	
	// Toggle DisableHTTP state
	config.Server.TLS.DisableHTTP = !config.Server.TLS.DisableHTTP
	
	// Save config
	saveConfigToFile()
	
	// Update menu items to reflect new state
	updateMenuItems()
	
	log.Printf("Modalità HTTPS-Only %s. Riavviando il server per applicare le modifiche...", 
		map[bool]string{true: "abilitata", false: "disabilitata"}[config.Server.TLS.DisableHTTP])
	
	// Automatically restart server to apply changes
	go func() {
		time.Sleep(500 * time.Millisecond) // Small delay to let the user see the menu update
		restartServer()
	}()
}

func saveConfigToFile() {
	// Create a copy for encryption (don't modify the runtime config)
	configToSave := config
	
	// Encrypt sensitive data before saving
	if err := encryptSensitiveConfig(&configToSave); err != nil {
		log.Printf("[ERROR] saveConfigToFile: encryption failed: %v", err)
		return
	}
	
	// Save encrypted config to file
	data, _ := json.MarshalIndent(configToSave, "", "  ")
	if err := os.WriteFile("config.json", data, 0644); err != nil {
		log.Printf("[ERROR] saveConfigToFile: save failed: %v", err)
		return
	}
	
	log.Printf("[INFO] saveConfigToFile: config saved successfully")
}