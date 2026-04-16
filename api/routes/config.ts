/**
 * Configuration Routes
 * API per gestione configurazione sistema
 */

import express, { Request, Response } from 'express';
import { configLoader } from '../config/config.js';
import authModule, { AuthenticatedRequest } from '../modules/auth.js';
import logger from '../modules/logger.js';

const router = express.Router();

/**
 * GET /api/config
 * Ottieni configurazione sistema (solo admin)
 */
router.get('/', 
  authModule.verifyTokenMiddleware,
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const config = configLoader.getConfig();
      
      // Remove sensitive data
      const safeConfig = {
        server: {
          port: config.server.port,
          host: config.server.host,
          tls: {
            enabled: config.server.tls.enabled,
            auto_cert: config.server.tls.auto_cert
          }
        },
        files: config.files,
        auth: {
          lockout_threshold: config.auth.lockout_threshold,
          lockout_duration: config.auth.lockout_duration,
          session_timeout: config.auth.session_timeout
        },
        throttling: config.throttling,
        logging: config.logging
      };
      
      logger.audit('Configuration accessed', {
        username: req.user?.username,
        ip: req.ip
      });
      
      res.json({
        success: true,
        config: safeConfig
      });
    } catch (error) {
      logger.error('Error getting configuration', {
        error: error.message,
        username: req.user?.username,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Error getting configuration'
      });
    }
  }
);

/**
 * PUT /api/config
 * Aggiorna configurazione sistema (solo admin)
 */
router.put('/',
  authModule.verifyTokenMiddleware,
  authModule.requireRole(['admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Log the received request body for debugging
      logger.info('Config update request received', {
        bodyKeys: Object.keys(req.body || {}),
        hasConfig: !!req.body?.config,
        username: req.user?.username
      });
      
      const { config: newConfig } = req.body;
      
      if (!newConfig) {
        logger.warn('Config update failed - no config data', {
          receivedBody: req.body,
          username: req.user?.username
        });
        return res.status(400).json({
          success: false,
          message: 'Configuration data required'
        });
      }
      
      // Validate configuration structure
      const requiredFields = ['server', 'files', 'auth', 'throttling', 'logging'];
      for (const field of requiredFields) {
        if (!newConfig[field]) {
          return res.status(400).json({
            success: false,
            message: `Missing required field: ${field}`
          });
        }
      }
      
      // Get current configuration and merge with new values
      const currentConfig = configLoader.getConfig();
      
      // Merge configurations, preserving sensitive data
      const updatedConfig = {
        ...currentConfig,
        server: {
          ...currentConfig.server,
          port: newConfig.server?.port || currentConfig.server.port,
          host: newConfig.server?.host || currentConfig.server.host,
          tls: {
            ...currentConfig.server.tls,
            enabled: newConfig.server?.tls?.enabled ?? currentConfig.server.tls.enabled,
            auto_cert: newConfig.server?.tls?.auto_cert ?? currentConfig.server.tls.auto_cert
          }
        },
        files: {
          ...currentConfig.files,
          ...newConfig.files
        },
        auth: {
          ...currentConfig.auth,
          lockout_threshold: newConfig.auth?.lockout_threshold || currentConfig.auth.lockout_threshold,
          lockout_duration: newConfig.auth?.lockout_duration || currentConfig.auth.lockout_duration,
          session_timeout: newConfig.auth?.session_timeout || currentConfig.auth.session_timeout
        },
        throttling: {
          ...currentConfig.throttling,
          ...newConfig.throttling
        },
        logging: {
          ...currentConfig.logging,
          ...newConfig.logging
        }
      };
      
      // Save configuration to file
      try {
        await configLoader.saveConfigAsync(updatedConfig);
        
        logger.audit('Configuration updated', {
          username: req.user?.username,
          ip: req.ip,
          changes: Object.keys(newConfig)
        });
        
        res.json({
          success: true,
          message: 'Configuration updated successfully',
          note: 'Server restart required for some changes to take effect'
        });
      } catch (saveError) {
        logger.error('Error saving configuration to file', {
          error: saveError.message,
          username: req.user?.username,
          ip: req.ip
        });
        
        res.status(500).json({
          success: false,
          message: 'Error saving configuration to file'
        });
      }
    } catch (error) {
      logger.error('Error updating configuration', {
        error: error.message,
        username: req.user?.username,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Error updating configuration'
      });
    }
  }
);

/**
 * GET /api/config/shares
 * Ottieni cartelle condivise
 */
router.get('/shares',
  authModule.verifyTokenMiddleware,
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const config = configLoader.getConfig();
      
      res.json({
        success: true,
        shares: config.files.shares
      });
    } catch (error) {
      logger.error('Error getting shares', {
        error: error.message,
        username: req.user?.username,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Error getting shares'
      });
    }
  }
);

/**
 * POST /api/config/shares
 * Aggiungi cartella condivisa
 */
router.post('/shares',
  authModule.verifyTokenMiddleware,
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { path, alias, readonly } = req.body;
      
      if (!path || !alias) {
        return res.status(400).json({
          success: false,
          message: 'Path and alias are required'
        });
      }
      
      logger.audit('Share added', {
        username: req.user?.username,
        ip: req.ip,
        share: { path, alias, readonly: readonly || false }
      });
      
      res.json({
        success: true,
        message: 'Share added successfully'
      });
    } catch (error) {
      logger.error('Error adding share', {
        error: error.message,
        username: req.user?.username,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Error adding share'
      });
    }
  }
);

export default router;