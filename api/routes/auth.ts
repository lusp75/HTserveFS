/**
 * Auth Routes
 * Gestisce le route per autenticazione e autorizzazione
 */

import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import authModule from '../modules/auth.js';
import logger from '../modules/logger.js';
import monitorModule from '../modules/monitor.js';


const router = express.Router();

// Apply rate limiting to auth routes
const authRateLimit = monitorModule.createRateLimit(15 * 60 * 1000, 10); // 10 attempts per 15 minutes

/**
 * POST /api/auth/login
 * User login with brute-force protection
 */
router.post('/login', 
  authRateLimit,
  [
    body('username').trim().isLength({ min: 1 }).withMessage('Username is required'),
    body('password').isLength({ min: 1 }).withMessage('Password is required')
  ],
  async (req: Request, res: Response) => {
    try {
      // Validate input
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { username, password } = req.body;
      const ip = req.ip || 'unknown';

      // Check lockout status
      const lockoutStatus = authModule.getLockoutStatus(ip);
      if (lockoutStatus.isLocked) {
        logger.security('Login attempt from locked IP', { ip, username });
        return res.status(429).json({
          success: false,
          message: 'Account temporarily locked due to too many failed attempts',
          lockedUntil: lockoutStatus.lockedUntil
        });
      }

      // Authenticate user
      const result = await authModule.authenticate(username, password, ip);
      
      if (result.success) {
        res.json({
          success: true,
          message: 'Login successful',
          token: result.token,
          user: {
            username: result.user?.username,
            role: result.user?.role
          }
        });
      } else {
        res.status(401).json({
          success: false,
          message: result.message,
          attemptsRemaining: authModule.getLockoutStatus(ip).attemptsRemaining
        });
      }
    } catch (error) {
      logger.error('Login error', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * POST /api/auth/logout
 * User logout (client-side token removal)
 */
router.post('/logout', 
  authModule.verifyTokenMiddleware,
  (req: Request, res: Response) => {
    // Since we're using stateless JWT, logout is handled client-side
    // We just log the event for audit purposes
    const user = (req as any).user;
    logger.audit('User logged out', { username: user?.username, ip: req.ip });
    
    res.json({
      success: true,
      message: 'Logout successful'
    });
  }
);

/**
 * GET /api/auth/profile
 * Get current user profile
 */
router.get('/profile', 
  authModule.verifyTokenMiddleware,
  (req: Request, res: Response) => {
    try {
      const user = (req as any).user;
      const userInfo = authModule.findUser(user.username);
      
      if (!userInfo) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      res.json({
        success: true,
        user: {
          username: userInfo.username,
          role: userInfo.role
        }
      });
    } catch (error) {
      logger.error('Profile fetch error', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * GET /api/auth/status
 * Check authentication status and lockout info
 */
router.get('/status', (req: Request, res: Response) => {
  const ip = req.ip || 'unknown';
  const lockoutStatus = authModule.getLockoutStatus(ip);
  
  res.json({
    success: true,
    lockout: lockoutStatus
  });
});

/**
 * POST /api/auth/verify
 * Verify JWT token
 */
router.post('/verify', (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }
    
    const payload = authModule.verifyToken(token);
    
    if (payload) {
      res.json({
        success: true,
        valid: true,
        user: {
          username: payload.username,
          role: payload.role
        }
      });
    } else {
      res.json({
        success: true,
        valid: false
      });
    }
  } catch (error) {
    logger.error('Token verification error', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;