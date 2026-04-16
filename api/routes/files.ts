/**
 * Files Routes
 * Gestisce le route per operazioni sui file system
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import { body, param, validationResult } from 'express-validator';
import authModule, { AuthenticatedRequest } from '../modules/auth.js';
import fileSystemModule from '../modules/filesystem.js';
import monitorModule from '../modules/monitor.js';
import logger from '../modules/logger.js';
import { configLoader } from '../config/config.js';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: fileSystemModule.parseFileSize(configLoader.getConfig().files.max_file_size)
  },
  fileFilter: (req, file, cb) => {
    if (fileSystemModule.isExtensionAllowed(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

// Apply authentication to all file routes
router.use(authModule.verifyTokenMiddleware);

// Apply throttling to file operations
router.use(monitorModule.throttleMiddleware);

/**
 * GET /api/files/shares
 * Get all configured file shares
 */
router.get('/shares', (req: AuthenticatedRequest, res: Response) => {
  try {
    const shares = fileSystemModule.getShares();
    
    res.json({
      success: true,
      shares: shares.map(share => ({
        alias: share.alias,
        readonly: share.readonly,
        path: share.path // Only show to admin users
      }))
    });
  } catch (error) {
    logger.error('Error getting shares', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/files/browse/*
 * Browse directory contents
 */
router.get('/browse/*', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestedPath = req.params[0] || '';
    
    const listing = await fileSystemModule.getDirectoryListing(requestedPath);
    
    if (!listing) {
      return res.status(404).json({
        success: false,
        message: 'Directory not found or access denied'
      });
    }
    
    logger.audit('Directory browsed', {
      path: requestedPath,
      username: req.user?.username,
      fileCount: listing.files.length
    });
    
    res.json({
      success: true,
      listing
    });
  } catch (error) {
    logger.error('Error browsing directory', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/files/info/*
 * Get file/directory information
 */
router.get('/info/*', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestedPath = req.params[0] || '';
    
    const fileInfo = await fileSystemModule.getFileInfo(requestedPath);
    
    if (!fileInfo) {
      return res.status(404).json({
        success: false,
        message: 'File not found or access denied'
      });
    }
    
    res.json({
      success: true,
      file: fileInfo
    });
  } catch (error) {
    logger.error('Error getting file info', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/files/download/*
 * Download file with Range support for resume
 */
router.get('/download/*', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestedPath = req.params[0] || '';
    
    const success = await fileSystemModule.streamFile(requestedPath, req, res);
    
    if (!success && !res.headersSent) {
      res.status(404).json({
        success: false,
        message: 'File not found or access denied'
      });
    }
  } catch (error) {
    logger.error('Error downloading file', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
});

/**
 * GET /api/files/zip/*
 * Download directory or file as zip
 */
router.get('/zip/*', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const requestedPath = req.params[0] || '';
    
    const success = await fileSystemModule.createZipStream(requestedPath, res);
    
    if (!success && !res.headersSent) {
      res.status(404).json({
        success: false,
        message: 'File not found or access denied'
      });
    }
  } catch (error) {
    logger.error('Error creating zip', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
});

/**
 * POST /api/files/upload/*
 * Upload files to directory
 */
router.post('/upload/*', 
  upload.array('files', 10), // Max 10 files at once
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requestedPath = req.params[0] || '';
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No files provided'
        });
      }
      
      const validation = fileSystemModule.validatePath(requestedPath);
      if (!validation.isValid || !validation.resolvedPath || validation.share?.readonly) {
        return res.status(403).json({
          success: false,
          message: 'Upload not allowed to this location'
        });
      }
      
      const results = [];
      
      for (const file of files) {
        try {
          const filePath = path.join(validation.resolvedPath, file.originalname);
          
          // Check if file already exists
          if (fs.existsSync(filePath)) {
            results.push({
              filename: file.originalname,
              success: false,
              message: 'File already exists'
            });
            continue;
          }
          
          // Write file
          fs.writeFileSync(filePath, file.buffer);
          
          results.push({
            filename: file.originalname,
            success: true,
            size: file.size
          });
          
          logger.audit('File uploaded', {
            filename: file.originalname,
            path: requestedPath,
            size: file.size,
            username: req.user?.username
          });
        } catch (error) {
          results.push({
            filename: file.originalname,
            success: false,
            message: 'Upload failed'
          });
          logger.error('File upload error', { filename: file.originalname, error: error.message });
        }
      }
      
      res.json({
        success: true,
        results
      });
    } catch (error) {
      logger.error('Upload error', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * POST /api/files/mkdir/*
 * Create new directory
 */
router.post('/mkdir/*', 
  body('name').isString().isLength({ min: 1, max: 255 }).trim(),
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: errors.array()
      });
    }

    try {
      const requestedPath = req.params[0] || '';
      const { name } = req.body;
      
      const success = await fileSystemModule.createDirectory(requestedPath, name);
      
      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'Cannot create directory'
        });
      }
      
      logger.audit('Directory created', {
        path: `${requestedPath}/${name}`,
        username: req.user?.username
      });
      
      res.json({
        success: true,
        message: 'Directory created successfully'
      });
    } catch (error) {
      logger.error('Error creating directory', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * POST /api/files/create/*
 * Create new file
 */
router.post('/create/*', 
  body('name').isString().isLength({ min: 1, max: 255 }).trim(),
  body('content').optional().isString(),
  async (req: AuthenticatedRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Invalid input',
        errors: errors.array()
      });
    }

    try {
      const requestedPath = req.params[0] || '';
      const { name, content = '' } = req.body;
      
      // Check if file extension is allowed
      if (!fileSystemModule.isExtensionAllowed(name)) {
        return res.status(400).json({
          success: false,
          message: 'File type not allowed',
          allowedExtensions: configLoader.getConfig().files.allowed_extensions
        });
      }
      
      const success = await fileSystemModule.createFile(requestedPath, name, content);
      
      if (!success) {
        return res.status(400).json({
          success: false,
          message: 'Cannot create file'
        });
      }
      
      logger.audit('File created', {
        path: `${requestedPath}/${name}`,
        username: req.user?.username,
        size: content.length
      });
      
      res.json({
        success: true,
        message: 'File created successfully'
      });
    } catch (error) {
      logger.error('Error creating file', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * DELETE /api/files/delete/*
 * Delete file or directory
 */
router.delete('/delete/*', 
  authModule.requireRole(['admin', 'read-write']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const requestedPath = req.params[0] || '';
      
      const success = await fileSystemModule.deleteItem(requestedPath);
      
      if (success) {
        logger.audit('Item deleted', {
          path: requestedPath,
          username: req.user?.username
        });
        
        res.json({
          success: true,
          message: 'Item deleted successfully'
        });
      } else {
        res.status(403).json({
          success: false,
          message: 'Cannot delete item'
        });
      }
    } catch (error) {
      logger.error('Delete error', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * PUT /api/files/rename/*
 * Rename file or directory
 */
router.put('/rename/*', 
  [
    body('newName').trim().isLength({ min: 1 }).withMessage('New name is required')
  ],
  authModule.requireRole(['admin', 'read-write']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      
      const requestedPath = req.params[0] || '';
      const { newName } = req.body;
      
      const success = await fileSystemModule.renameItem(requestedPath, newName);
      
      if (success) {
        logger.audit('Item renamed', {
          oldPath: requestedPath,
          newName,
          username: req.user?.username
        });
        
        res.json({
          success: true,
          message: 'Item renamed successfully'
        });
      } else {
        res.status(403).json({
          success: false,
          message: 'Cannot rename item'
        });
      }
    } catch (error) {
      logger.error('Rename error', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

export default router;