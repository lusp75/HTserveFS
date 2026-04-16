/**
 * Monitor Routes
 * Gestisce le route per monitoraggio e statistiche del sistema
 */

import express, { Request, Response } from 'express';
import authModule, { AuthenticatedRequest } from '../modules/auth.js';
import monitorModule from '../modules/monitor.js';
import logger from '../modules/logger.js';
import { configLoader } from '../config/config.js';

const router = express.Router();

// Apply authentication to all monitor routes
router.use(authModule.verifyTokenMiddleware);

/**
 * GET /api/monitor/stats
 * Get system statistics
 */
router.get('/stats', 
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = monitorModule.getSystemStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Error getting system stats', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * GET /api/monitor/connections
 * Get active connections
 */
router.get('/connections', 
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const connections = monitorModule.getActiveConnections();
      
      res.json({
        success: true,
        connections: connections.map(conn => ({
          id: conn.id,
          ip: conn.ip,
          username: conn.username,
          connectedAt: conn.connectedAt,
          lastActivity: conn.lastActivity,
          bytesTransferred: conn.bytesTransferred,
          requestCount: conn.requestCount,
          duration: Math.round((new Date().getTime() - conn.connectedAt.getTime()) / 1000)
        }))
      });
    } catch (error) {
      logger.error('Error getting connections', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * GET /api/monitor/throttle
 * Get current user's throttle status
 */
router.get('/throttle', (req: AuthenticatedRequest, res: Response) => {
  try {
    const username = req.user?.username;
    const ip = req.ip;
    
    const throttleStatus = monitorModule.getThrottleStatus(username, ip);
    
    res.json({
      success: true,
      throttle: {
        limitKbps: Math.round(throttleStatus.limit / 1024),
        usedBytes: throttleStatus.used,
        remainingBytes: throttleStatus.remaining,
        usedKbps: Math.round(throttleStatus.used / 1024),
        remainingKbps: Math.round(throttleStatus.remaining / 1024)
      }
    });
  } catch (error) {
    logger.error('Error getting throttle status', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * GET /api/monitor/config
 * Get current configuration (admin only)
 */
router.get('/config', 
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const config = configLoader.getConfig();
      
      // Remove sensitive information
      const safeConfig = {
        server: {
          port: config.server.port,
          host: config.server.host,
          tls: {
            enabled: config.server.tls.enabled,
            auto_cert: config.server.tls.auto_cert
          }
        },
        files: {
          shares: config.files.shares.map(share => ({
            alias: share.alias,
            readonly: share.readonly,
            path: share.path
          })),
          max_file_size: config.files.max_file_size,
          allowed_extensions: config.files.allowed_extensions
        },
        auth: {
          lockout_threshold: config.auth.lockout_threshold,
          lockout_duration: config.auth.lockout_duration,
          session_timeout: config.auth.session_timeout,
          users: config.auth.users.map(user => ({
            username: user.username,
            role: user.role
          }))
        },
        throttling: config.throttling,
        logging: config.logging
      };
      
      res.json({
        success: true,
        config: safeConfig
      });
    } catch (error) {
      logger.error('Error getting config', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * POST /api/monitor/config/reload
 * Reload configuration from file (admin only)
 */
router.post('/config/reload', 
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const newConfig = configLoader.reloadConfig();
      
      logger.audit('Configuration reloaded', {
        username: req.user?.username,
        ip: req.ip
      });
      
      res.json({
        success: true,
        message: 'Configuration reloaded successfully'
      });
    } catch (error) {
      logger.error('Error reloading config', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * GET /api/monitor/health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  try {
    const stats = monitorModule.getSystemStats();
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: Math.round(uptime),
      memory: {
        used: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024) // MB
      },
      connections: stats.activeConnections,
      requests: stats.totalRequests
    };
    
    res.json({
      success: true,
      health
    });
  } catch (error) {
    logger.error('Health check error', error);
    res.status(500).json({
      success: false,
      message: 'Health check failed',
      status: 'unhealthy'
    });
  }
});

/**
 * GET /api/monitor/logs
 * Get recent log entries (admin only)
 */
router.get('/logs', 
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const { level = 'all', limit = 100 } = req.query;
      
      // Generate sample log entries for demo
      const sampleLogs = [
        {
          id: '1',
          timestamp: new Date(Date.now() - 60000).toISOString(),
          level: 'info',
          message: 'User logged in successfully',
          ip: '::1',
          username: 'admin'
        },
        {
          id: '2',
          timestamp: new Date(Date.now() - 120000).toISOString(),
          level: 'info',
          message: 'File downloaded',
          ip: '::1',
          username: 'user',
          details: { file: 'test.txt', size: 1024 }
        },
        {
          id: '3',
          timestamp: new Date(Date.now() - 180000).toISOString(),
          level: 'warn',
          message: 'Failed login attempt',
          ip: '192.168.1.100',
          details: { username: 'guest', attempts: 3 }
        },
        {
          id: '4',
          timestamp: new Date(Date.now() - 240000).toISOString(),
          level: 'info',
          message: 'New connection tracked',
          ip: '::1'
        },
        {
          id: '5',
          timestamp: new Date(Date.now() - 300000).toISOString(),
          level: 'security',
          message: 'Configuration accessed',
          ip: '::1',
          username: 'admin'
        }
      ];
      
      // Filter by level if specified
      let filteredLogs = sampleLogs;
      if (level !== 'all') {
        filteredLogs = sampleLogs.filter(log => log.level === level);
      }
      
      // Apply limit
      const limitNum = parseInt(limit as string) || 100;
      filteredLogs = filteredLogs.slice(0, limitNum);
      
      res.json({
        success: true,
        logs: filteredLogs,
        total: filteredLogs.length
      });
    } catch (error) {
      logger.error('Error getting logs', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * GET /api/monitor/metrics
 * Get system metrics in JSON format (admin only)
 */
router.get('/metrics', 
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = monitorModule.getSystemStats();
      const memoryUsage = process.memoryUsage();
      
      const metrics = {
        cpu: {
          usage: Math.random() * 100, // Simulated CPU usage
          cores: require('os').cpus().length
        },
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          percentage: Math.round((memoryUsage.heapUsed / memoryUsage.heapTotal) * 100)
        },
        disk: {
          used: Math.round(Math.random() * 1000000), // Simulated disk usage in MB
          total: 1000000, // Simulated total disk space in MB
          percentage: Math.round(Math.random() * 100)
        },
        network: {
          bytesIn: stats.totalBytesTransferred,
          bytesOut: stats.totalBytesTransferred,
          packetsIn: stats.totalRequests,
          packetsOut: stats.totalRequests
        },
        connections: {
          active: stats.activeConnections,
          total: stats.totalConnections
        },
        uptime: stats.uptime
      };
      
      res.json({
        success: true,
        metrics
      });
    } catch (error) {
      logger.error('Error generating metrics', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

/**
 * GET /api/monitor/prometheus
 * Get metrics in Prometheus format (admin only)
 */
router.get('/prometheus', 
  authModule.requireRole(['admin']),
  (req: AuthenticatedRequest, res: Response) => {
    try {
      const stats = monitorModule.getSystemStats();
      const memoryUsage = process.memoryUsage();
      
      // Generate Prometheus-style metrics
      const metrics = [
        `# HELP htservefs_active_connections Number of active connections`,
        `# TYPE htservefs_active_connections gauge`,
        `htservefs_active_connections ${stats.activeConnections}`,
        '',
        `# HELP htservefs_total_connections Total number of connections since start`,
        `# TYPE htservefs_total_connections counter`,
        `htservefs_total_connections ${stats.totalConnections}`,
        '',
        `# HELP htservefs_total_requests Total number of requests since start`,
        `# TYPE htservefs_total_requests counter`,
        `htservefs_total_requests ${stats.totalRequests}`,
        '',
        `# HELP htservefs_bytes_transferred_total Total bytes transferred since start`,
        `# TYPE htservefs_bytes_transferred_total counter`,
        `htservefs_bytes_transferred_total ${stats.totalBytesTransferred}`,
        '',
        `# HELP htservefs_memory_usage_bytes Memory usage in bytes`,
        `# TYPE htservefs_memory_usage_bytes gauge`,
        `htservefs_memory_usage_bytes{type="heap_used"} ${memoryUsage.heapUsed}`,
        `htservefs_memory_usage_bytes{type="heap_total"} ${memoryUsage.heapTotal}`,
        `htservefs_memory_usage_bytes{type="external"} ${memoryUsage.external}`,
        '',
        `# HELP htservefs_uptime_seconds Uptime in seconds`,
        `# TYPE htservefs_uptime_seconds counter`,
        `htservefs_uptime_seconds ${stats.uptime}`,
        ''
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(metrics);
    } catch (error) {
      logger.error('Error generating metrics', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
);

export default router;