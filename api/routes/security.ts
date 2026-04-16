/**
 * Security Routes
 * API per gestione sicurezza e IP bloccati
 */

import express, { Request, Response } from 'express';
import authModule, { AuthenticatedRequest } from '../modules/auth.js';
import logger from '../modules/logger.js';

const router = express.Router();

/**
 * GET /api/security/locked-ips
 * Ottieni lista IP bloccati (solo admin)
 */
router.get('/locked-ips',
  authModule.verifyTokenMiddleware,
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const lockedIPs = authModule.getLockedIPs();
      
      res.json({
        success: true,
        lockedIPs,
        count: lockedIPs.length
      });
    } catch (error) {
      logger.error('Error getting locked IPs', {
        error: error.message,
        username: req.user?.username,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Error getting locked IPs'
      });
    }
  }
);

/**
 * POST /api/security/unlock-ip/:ip
 * Sblocca IP specifico (solo admin)
 */
router.post('/unlock-ip/:ip',
  authModule.verifyTokenMiddleware,
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { ip } = req.params;
      
      if (!ip) {
        return res.status(400).json({
          success: false,
          message: 'IP address required'
        });
      }
      
      const result = authModule.unlockIP(ip);
      
      if (result.success) {
        logger.audit('IP unlocked', {
          username: req.user?.username,
          ip: req.ip,
          unlockedIP: ip
        });
        
        res.json({
          success: true,
          message: `IP ${ip} unlocked successfully`
        });
      } else {
        res.status(404).json({
          success: false,
          message: result.message || 'IP not found in lockout list'
        });
      }
    } catch (error) {
      logger.error('Error unlocking IP', {
        error: error.message,
        username: req.user?.username,
        ip: req.ip,
        targetIP: req.params.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Error unlocking IP'
      });
    }
  }
);

/**
 * POST /api/security/unlock-all
 * Sblocca tutti gli IP (solo admin)
 */
router.post('/unlock-all',
  authModule.verifyTokenMiddleware,
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const result = authModule.unlockAllIPs();
      
      logger.audit('All IPs unlocked', {
        username: req.user?.username,
        ip: req.ip,
        count: result.count
      });
      
      res.json({
        success: true,
        message: `${result.count} IP(s) unlocked successfully`,
        count: result.count
      });
    } catch (error) {
      logger.error('Error unlocking all IPs', {
        error: error.message,
        username: req.user?.username,
        ip: req.ip
      });
      
      res.status(500).json({
        success: false,
        message: 'Error unlocking all IPs'
      });
    }
  }
);

export default router;