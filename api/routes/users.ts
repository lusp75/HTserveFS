/**
 * Users Routes
 * API per gestione utenti (solo admin)
 */

import express, { Request, Response } from 'express';
import { configLoader, AuthUser } from '../config/config.js';
import authModule, { AuthenticatedRequest } from '../modules/auth.js';
import logger from '../modules/logger.js';

const router = express.Router();

/**
 * GET /api/users
 * Ottieni lista utenti (solo admin)
 */
router.get('/',
  authModule.verifyTokenMiddleware,
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const config = configLoader.getConfig();
      
      // Remove password hashes from response
      const users = config.auth.users.map(user => ({
        username: user.username,
        role: user.role
      }));
      
      logger.audit('Users list accessed', {
        username: req.user?.username,
        ip: req.ip
      });
      
      res.json({
        success: true,
        users
      });
    } catch (error) {
      logger.error('Error getting users', {
        error: error.message,
        username: req.user?.username,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Error getting users'
      });
    }
  }
);

/**
 * POST /api/users
 * Crea nuovo utente (solo admin)
 */
router.post('/',
  authModule.verifyTokenMiddleware,
  authModule.requireRole(['admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { username, password, role } = req.body;
      
      if (!username || !password || !role) {
        return res.status(400).json({
          success: false,
          message: 'Username, password and role are required'
        });
      }
      
      // Validate role
      const validRoles = ['admin', 'read-write', 'read-only'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role. Must be: admin, read-write, or read-only'
        });
      }
      
      // Check if user already exists
      const existingUser = authModule.findUser(username);
      if (existingUser) {
        return res.status(409).json({
          success: false,
          message: 'User already exists'
        });
      }
      
      // Hash password
      const passwordHash = await authModule.hashPassword(password);
      
      // Add user to config
      const currentConfig = configLoader.getConfig();
      const newUser = {
        username,
        password_hash: passwordHash,
        role
      };
      
      // Add to users array
      currentConfig.auth.users.push(newUser);
      
      // Save config to file
      await configLoader.saveConfigAsync(currentConfig);
      
      logger.audit('User created', {
        username: req.user?.username,
        ip: req.ip,
        newUser: username,
        role
      });
      
      res.status(201).json({
        success: true,
        message: 'User created successfully',
        user: {
          username,
          role,
          created_at: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Error creating user', {
        error: error.message,
        username: req.user?.username,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Error creating user'
      });
    }
  }
);

/**
 * PUT /api/users/:username
 * Aggiorna utente (solo admin)
 */
router.put('/:username',
  authModule.verifyTokenMiddleware,
  authModule.requireRole(['admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { username } = req.params;
      const { password, role } = req.body;
      
      // Check if user exists
      const existingUser = authModule.findUser(username);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Prevent admin from changing their own role
      if (username === req.user?.username && role && role !== existingUser.role) {
        return res.status(403).json({
          success: false,
          message: 'Cannot change your own role'
        });
      }
      
      // Validate role if provided
      if (role) {
        const validRoles = ['admin', 'read-write', 'read-only'];
        if (!validRoles.includes(role)) {
          return res.status(400).json({
            success: false,
            message: 'Invalid role. Must be: admin, read-write, or read-only'
          });
        }
      }
      
      // Hash new password if provided
      let passwordHash;
      if (password) {
        passwordHash = await authModule.hashPassword(password);
      }
      
      // Update user in config
      const currentConfig = configLoader.getConfig();
      const userIndex = currentConfig.auth.users.findIndex(u => u.username === username);
      
      if (userIndex !== -1) {
        if (role) {
          currentConfig.auth.users[userIndex].role = role;
        }
        if (passwordHash) {
          currentConfig.auth.users[userIndex].password_hash = passwordHash;
        }
        
        // Save config to file
        await configLoader.saveConfigAsync(currentConfig);
      }
      
      logger.audit('User updated', {
        username: req.user?.username,
        ip: req.ip,
        targetUser: username,
        changes: { 
          ...(password && { password: 'changed' }),
          ...(role && { role })
        }
      });
      
      res.json({
        success: true,
        message: 'User updated successfully'
      });
    } catch (error) {
      logger.error('Error updating user', {
        error: error.message,
        username: req.user?.username,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Error updating user'
      });
    }
  }
);

/**
 * DELETE /api/users/:username
 * Elimina utente (solo admin)
 */
router.delete('/:username',
  authModule.verifyTokenMiddleware,
  authModule.requireRole(['admin']),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { username } = req.params;
      
      // Check if user exists
      const existingUser = authModule.findUser(username);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Prevent admin from deleting themselves
      if (username === req.user?.username) {
        return res.status(403).json({
          success: false,
          message: 'Cannot delete your own account'
        });
      }
      
      // Remove user from config
      const currentConfig = configLoader.getConfig();
      const userIndex = currentConfig.auth.users.findIndex(u => u.username === username);
      
      if (userIndex !== -1) {
        currentConfig.auth.users.splice(userIndex, 1);
        
        // Save config to file
        await configLoader.saveConfigAsync(currentConfig);
      }
      
      logger.audit('User deleted', {
        username: req.user?.username,
        ip: req.ip,
        deletedUser: username
      });
      
      res.json({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting user', {
        error: error.message,
        username: req.user?.username,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Error deleting user'
      });
    }
  }
);

/**
 * GET /api/users/:username/activity
 * Ottieni attività utente (solo admin)
 */
router.get('/:username/activity',
  authModule.verifyTokenMiddleware,
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { username } = req.params;
      
      // Check if user exists
      const existingUser = authModule.findUser(username);
      if (!existingUser) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // In a real app, this would fetch from activity logs
      const mockActivity = [
        {
          timestamp: new Date().toISOString(),
          action: 'login',
          ip: '192.168.1.100',
          userAgent: 'Mozilla/5.0...'
        },
        {
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          action: 'file_download',
          ip: '192.168.1.100',
          details: { file: '/shared/document.pdf' }
        }
      ];
      
      res.json({
        success: true,
        activity: mockActivity
      });
    } catch (error) {
      logger.error('Error getting user activity', {
        error: error.message,
        username: req.user?.username,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Error getting user activity'
      });
    }
  }
);

export default router;