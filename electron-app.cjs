// Wrapper per importare l'app Express TypeScript in Electron
const path = require('path');
const express = require('express');
const fs = require('fs');

// Funzione per creare l'app Express
function createExpressApp() {
  const app = express();
  
  // Configurazione CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.sendStatus(200);
    } else {
      next();
    }
  });
  
  // Middleware per parsing JSON
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  
  // Serve i file statici dalla cartella dist
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.use('/assets', express.static(path.join(distPath, 'assets')));
  
  // Route per servire l'index.html per tutte le route non-API
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'API endpoint not found' });
      return;
    }
    
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Frontend build not found. Run npm run build first.');
    }
  });
  
  // API Routes di base
  app.get('/api/health', (req, res) => {
    res.json({
      success: true,
      message: 'HtserveFS is running',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  });
  
  // Mock API per test
  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    
    // Credenziali di test
    if (username === 'admin' && password === 'admin') {
      res.json({
        success: true,
        token: 'mock-jwt-token',
        user: {
          username: 'admin',
          role: 'admin'
        }
      });
    } else {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
  });
  
  app.get('/api/auth/me', (req, res) => {
    res.json({
      success: true,
      user: {
        username: 'admin',
        role: 'admin'
      }
    });
  });
  
  app.get('/api/files/browse/*', (req, res) => {
    res.json({
      success: true,
      path: req.params[0] || '',
      files: [
        {
          name: 'test-folder',
          type: 'directory',
          size: 0,
          modified: new Date().toISOString()
        },
        {
          name: 'test.txt',
          type: 'file',
          size: 1024,
          modified: new Date().toISOString()
        }
      ]
    });
  });
  
  app.get('/api/monitor/stats', (req, res) => {
    res.json({
      success: true,
      stats: {
        uptime: process.uptime(),
        activeConnections: 1,
        totalRequests: 100,
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      }
    });
  });
  
  return app;
}

module.exports = createExpressApp;