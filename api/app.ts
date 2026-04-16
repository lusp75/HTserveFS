/**
 * HtserveFS API Server
 * File server HTTP con interfaccia web di amministrazione
 */

import express, { type Request, type Response, type NextFunction }  from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import helmet from 'helmet';
import multer from 'multer';
import { fileURLToPath } from 'url';

// Import modules
import { configLoader } from './config/config.js';
import logger from './modules/logger.js';
import monitorModule from './modules/monitor.js';

// Import routes
import authRoutes from './routes/auth.js';
import filesRoutes from './routes/files.js';
import monitorRoutes from './routes/monitor.js';
import configRoutes from './routes/config.js';
import usersRoutes from './routes/users.js';
import securityRoutes from './routes/security.js';

// for esm mode
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// load env
dotenv.config();

// Load configuration
const config = configLoader.getConfig();

const app: express.Application = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration - Allow remote connections on LAN
app.use(cors({
  origin: (origin, callback) => {
    // Allow localhost and LAN IPs
    if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1') || origin.match(/^https?:\/\/192\.168\./) || origin.match(/^https?:\/\/10\./) || origin.match(/^https?:\/\/172\./)) {
      callback(null, true);
    } else if (process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy for correct IP detection
app.set('trust proxy', 1);

// Monitoring middleware
app.use(monitorModule.connectionTrackingMiddleware);
app.use(monitorModule.performanceMiddleware);

/**
 * API Routes
 */
app.use('/api/auth', authRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/config', configRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/security', securityRoutes);

/**
 * Health check endpoint
 */
app.get('/api/health', (req: Request, res: Response): void => {
  const stats = monitorModule.getSystemStats();
  res.status(200).json({
    success: true,
    message: 'HtserveFS is running',
    version: '1.0.0',
    uptime: stats.uptime,
    activeConnections: stats.activeConnections
  });
});

/**
 * API Info endpoint
 */
app.get('/api/info', (req: Request, res: Response): void => {
  res.json({
    success: true,
    name: 'HtserveFS',
    version: '1.0.0',
    description: 'File server HTTP con interfaccia web di amministrazione',
    features: [
      'HTTP/HTTPS file server',
      'Web-based administration',
      'User authentication and authorization',
      'File upload/download with resume support',
      'On-the-fly compression',
      'Bandwidth throttling',
      'Real-time monitoring',
      'Brute-force protection'
    ]
  });
});

/**
 * Multer error handler
 */
app.use((error: any, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      logger.warn('File size limit exceeded', { 
        ip: req.ip, 
        userAgent: req.get('User-Agent'),
        limit: config.files.max_file_size 
      });
      return res.status(413).json({
        success: false,
        message: `File size exceeds limit of ${config.files.max_file_size}`
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(413).json({
        success: false,
        message: 'Too many files uploaded at once'
      });
    }
  }
  
  if (error.message === 'File type not allowed') {
    return res.status(415).json({
      success: false,
      message: 'File type not allowed',
      allowedExtensions: config.files.allowed_extensions
    });
  }
  
  next(error);
});

/**
 * General error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: error.message })
  });
});

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  logger.warn('API endpoint not found', {
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    path: req.path
  });
});

export default app;