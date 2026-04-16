const { app, BrowserWindow, Tray, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const http = require('http');

// Importa il server Express wrapper
const createExpressApp = require('./electron-app.cjs');

let tray = null;
let mainWindow = null;
let serverProcess = null;
let expressServer = null;
const SERVER_PORT = 8000;

// Previeni l'uscita quando tutte le finestre sono chiuse
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// Nascondi l'app dal dock/taskbar
app.on('ready', () => {
  if (process.platform === 'darwin') {
    app.dock.hide();
  }
  
  createTray();
  startExpressServer();
});

// Gestisci l'uscita dell'app
app.on('before-quit', () => {
  stopExpressServer();
});

function createTray() {
  // Crea un'icona semplice usando nativeImage
  const { nativeImage } = require('electron');
  
  try {
    // Prova prima con l'icona ICO
    const iconPath = path.join(__dirname, 'dist', 'htservefs-icon.ico');
    const icon = nativeImage.createFromPath(iconPath);
    
    if (!icon.isEmpty()) {
      tray = new Tray(icon);
      console.log('Icona tray ICO caricata correttamente:', iconPath);
    } else {
      throw new Error('Icona ICO vuota');
    }
  } catch (error) {
    console.error('Errore caricamento icona ICO:', error);
    try {
      // Fallback a icona SVG
      const svgPath = path.join(__dirname, 'dist', 'htservefs-icon.svg');
      const svgIcon = nativeImage.createFromPath(svgPath);
      
      if (!svgIcon.isEmpty()) {
        tray = new Tray(svgIcon);
        console.log('Icona SVG caricata come fallback');
      } else {
        throw new Error('Icona SVG vuota');
      }
    } catch (fallbackError) {
      console.error('Errore caricamento icona SVG:', fallbackError);
      // Crea un'icona semplice programmaticamente
      const simpleIcon = nativeImage.createFromBuffer(Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0xF3, 0xFF, 0x61, 0x00, 0x00, 0x00,
        0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
        0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]));
      tray = new Tray(simpleIcon);
      console.log('Usando icona semplice generata programmaticamente');
    }
  }
  
  tray.setToolTip('HtserveFS - File Server');
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Apri Interfaccia Web',
      click: () => {
        shell.openExternal(`http://localhost:${SERVER_PORT}`);
      }
    },
    {
      label: 'Server: In Esecuzione',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Riavvia Server',
      click: () => {
        restartServer();
      }
    },
    {
      label: 'Ferma Server',
      click: () => {
        stopExpressServer();
        updateTrayMenu('Server: Fermato');
      }
    },
    { type: 'separator' },
    {
      label: 'Mostra Finestra Debug',
      click: () => {
        createDebugWindow();
      }
    },
    {
      label: 'Esci',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Click sinistro per aprire l'interfaccia web
  tray.on('click', () => {
    shell.openExternal(`http://localhost:${SERVER_PORT}`);
  });
}

function updateTrayMenu(serverStatus) {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Apri Interfaccia Web',
      click: () => {
        shell.openExternal(`http://localhost:${SERVER_PORT}`);
      }
    },
    {
      label: serverStatus,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Riavvia Server',
      click: () => {
        restartServer();
      }
    },
    {
      label: 'Ferma Server',
      click: () => {
        stopExpressServer();
        updateTrayMenu('Server: Fermato');
      }
    },
    { type: 'separator' },
    {
      label: 'Mostra Finestra Debug',
      click: () => {
        createDebugWindow();
      }
    },
    {
      label: 'Esci',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

function createDebugWindow() {
  if (mainWindow) {
    mainWindow.focus();
    return;
  }
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'dist', 'htservefs-icon.ico')
  });
  
  mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
  
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  
  // Nascondi invece di chiudere
  mainWindow.on('close', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
}

function startExpressServer() {
  try {
    console.log('Avvio server Express...');
    
    // Crea l'app Express usando il modulo esistente
    const app = createExpressApp();
    
    // Avvia il server
    expressServer = http.createServer(app);
    
    expressServer.listen(SERVER_PORT, '0.0.0.0', () => {
      console.log(`HtserveFS server avviato su http://localhost:${SERVER_PORT}`);
      updateTrayMenu('Server: In Esecuzione');
    });
    
    expressServer.on('error', (error) => {
      console.error('Errore server Express:', error);
      updateTrayMenu('Server: Errore');
    });
    
  } catch (error) {
    console.error('Errore avvio server:', error);
    updateTrayMenu('Server: Errore');
  }
}

function stopExpressServer() {
  if (expressServer) {
    console.log('Fermando server Express...');
    expressServer.close(() => {
      console.log('Server Express fermato');
      expressServer = null;
    });
  }
}

function restartServer() {
  console.log('Riavvio server...');
  updateTrayMenu('Server: Riavvio...');
  
  stopExpressServer();
  
  setTimeout(() => {
    startExpressServer();
  }, 2000);
}

// Gestisci l'attivazione dell'app (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createDebugWindow();
  }
});

// Previeni l'apertura di finestre multiple
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    createDebugWindow();
  }
});

// Assicurati che sia una sola istanza
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
}