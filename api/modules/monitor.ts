/**
 * Monitor & Throttler Module
 * Gestisce monitoraggio connessioni real-time e bandwidth throttling
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { configLoader } from '../config/config.js';
import logger from './logger.js';
import { AuthenticatedRequest } from './auth.js';

interface ConnectionInfo {
  id: string;
  ip: string;
  userAgent: string;
  username?: string;
  connectedAt: Date;
  lastActivity: Date;
  bytesTransferred: number;
  requestCount: number;
}

interface SystemStats {
  activeConnections: number;
  totalConnections: number;
  totalBytesTransferred: number;
  totalRequests: number;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
}

interface ThrottleInfo {
  ip: string;
  username?: string;
  bytesPerSecond: number;
  lastReset: Date;
  bytesThisSecond: number;
}

class MonitorModule {
  private connections: Map<string, ConnectionInfo> = new Map();
  private throttleMap: Map<string, ThrottleInfo> = new Map();
  private config = configLoader.getConfig();
  private startTime = new Date();
  private totalConnections = 0;
  private totalBytesTransferred = 0;
  private totalRequests = 0;

  constructor() {
    // Clean up inactive connections every minute
    setInterval(() => this.cleanupInactiveConnections(), 60 * 1000);
    
    // Reset throttle counters every second
    setInterval(() => this.resetThrottleCounters(), 1000);
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Track new connection
   */
  public trackConnection(req: Request): string {
    const connectionId = this.generateConnectionId();
    const now = new Date();
    
    const connection: ConnectionInfo = {
      id: connectionId,
      ip: req.ip || 'unknown',
      userAgent: req.get('User-Agent') || 'unknown',
      username: (req as AuthenticatedRequest).user?.username,
      connectedAt: now,
      lastActivity: now,
      bytesTransferred: 0,
      requestCount: 0
    };
    
    this.connections.set(connectionId, connection);
    this.totalConnections++;
    
    logger.info('New connection tracked', {
      connectionId,
      ip: connection.ip,
      userAgent: connection.userAgent,
      username: connection.username
    });
    
    return connectionId;
  }

  /**
   * Update connection activity
   */
  public updateConnectionActivity(connectionId: string, bytesTransferred: number = 0): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastActivity = new Date();
      connection.bytesTransferred += bytesTransferred;
      connection.requestCount++;
      
      this.totalBytesTransferred += bytesTransferred;
      this.totalRequests++;
    }
  }

  /**
   * Remove connection
   */
  public removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      const duration = new Date().getTime() - connection.connectedAt.getTime();
      
      logger.info('Connection closed', {
        connectionId,
        ip: connection.ip,
        username: connection.username,
        duration: Math.round(duration / 1000),
        bytesTransferred: connection.bytesTransferred,
        requestCount: connection.requestCount
      });
      
      this.connections.delete(connectionId);
    }
  }

  /**
   * Get active connections
   */
  public getActiveConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values());
  }

  /**
   * Get system statistics
   */
  public getSystemStats(): SystemStats {
    const uptime = new Date().getTime() - this.startTime.getTime();
    
    return {
      activeConnections: this.connections.size,
      totalConnections: this.totalConnections,
      totalBytesTransferred: this.totalBytesTransferred,
      totalRequests: this.totalRequests,
      uptime: Math.round(uptime / 1000),
      memoryUsage: process.memoryUsage()
    };
  }

  /**
   * Get bandwidth limit for user/IP
   */
  private getBandwidthLimit(username?: string): number {
    if (username && this.config.throttling.per_user_limits[username] !== undefined) {
      return this.config.throttling.per_user_limits[username];
    }
    return this.config.throttling.default_kbps;
  }

  /**
   * Check if request should be throttled
   */
  public shouldThrottle(req: AuthenticatedRequest, bytes: number): boolean {
    const ip = req.ip || 'unknown';
    const username = req.user?.username;
    const key = username || ip;
    
    const limit = this.getBandwidthLimit(username);
    
    // 0 means unlimited
    if (limit === 0) {
      return false;
    }
    
    const limitBytes = limit * 1024; // Convert KB to bytes
    
    let throttleInfo = this.throttleMap.get(key);
    if (!throttleInfo) {
      throttleInfo = {
        ip,
        username,
        bytesPerSecond: limitBytes,
        lastReset: new Date(),
        bytesThisSecond: 0
      };
      this.throttleMap.set(key, throttleInfo);
    }
    
    throttleInfo.bytesThisSecond += bytes;
    
    if (throttleInfo.bytesThisSecond > throttleInfo.bytesPerSecond) {
      logger.debug('Request throttled', {
        key,
        username,
        ip,
        bytesThisSecond: throttleInfo.bytesThisSecond,
        limit: throttleInfo.bytesPerSecond
      });
      return true;
    }
    
    return false;
  }

  /**
   * Throttling middleware
   */
  public throttleMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('Content-Length') || '0');
    
    if (this.shouldThrottle(req, contentLength)) {
      res.status(429).json({
        success: false,
        message: 'Bandwidth limit exceeded. Please try again later.',
        retryAfter: 1
      });
      return;
    }
    
    next();
  };

  /**
   * Rate limiting middleware factory
   */
  public createRateLimit(windowMs: number = 15 * 60 * 1000, max: number = 100) {
    return rateLimit({
      windowMs,
      max,
      message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req, res) => {
        logger.security('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path
        });
        res.status(429).json({
          success: false,
          message: 'Too many requests from this IP, please try again later.'
        });
      }
    });
  }

  /**
   * Connection tracking middleware
   */
  public connectionTrackingMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const connectionId = this.trackConnection(req);
    
    // Store connection ID in request for later use
    (req as any).connectionId = connectionId;
    
    // Track response bytes
    const originalSend = res.send;
    const originalJson = res.json;
    
    res.send = function(body: any) {
      const bytes = Buffer.byteLength(body || '', 'utf8');
      monitorModule.updateConnectionActivity(connectionId, bytes);
      return originalSend.call(this, body);
    };
    
    res.json = function(obj: any) {
      const bytes = Buffer.byteLength(JSON.stringify(obj), 'utf8');
      monitorModule.updateConnectionActivity(connectionId, bytes);
      return originalJson.call(this, obj);
    };
    
    // Clean up on response finish
    res.on('finish', () => {
      this.removeConnection(connectionId);
    });
    
    next();
  };

  /**
   * Performance monitoring middleware
   */
  public performanceMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const connectionId = (req as any).connectionId;
      
      if (connectionId) {
        this.updateConnectionActivity(connectionId);
      }
      
      logger.http(
        req.method,
        req.originalUrl,
        res.statusCode,
        duration,
        req.get('User-Agent'),
        req.ip
      );
      
      // Log slow requests
      if (duration > 1000) {
        logger.performance('Slow request detected', duration, {
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          userAgent: req.get('User-Agent'),
          ip: req.ip
        });
      }
    });
    
    next();
  };

  /**
   * Clean up inactive connections
   */
  private cleanupInactiveConnections(): void {
    const now = new Date();
    const timeout = 30 * 60 * 1000; // 30 minutes
    
    for (const [connectionId, connection] of this.connections.entries()) {
      if (now.getTime() - connection.lastActivity.getTime() > timeout) {
        logger.debug('Cleaning up inactive connection', { connectionId, ip: connection.ip });
        this.connections.delete(connectionId);
      }
    }
  }

  /**
   * Reset throttle counters
   */
  private resetThrottleCounters(): void {
    const now = new Date();
    
    for (const [key, throttleInfo] of this.throttleMap.entries()) {
      if (now.getTime() - throttleInfo.lastReset.getTime() >= 1000) {
        throttleInfo.bytesThisSecond = 0;
        throttleInfo.lastReset = now;
      }
    }
  }

  /**
   * Get throttle status for user/IP
   */
  public getThrottleStatus(username?: string, ip?: string): { limit: number; used: number; remaining: number } {
    const key = username || ip || 'unknown';
    const limit = this.getBandwidthLimit(username);
    const throttleInfo = this.throttleMap.get(key);
    
    if (!throttleInfo || limit === 0) {
      return { limit: limit * 1024, used: 0, remaining: limit * 1024 };
    }
    
    const limitBytes = limit * 1024;
    return {
      limit: limitBytes,
      used: throttleInfo.bytesThisSecond,
      remaining: Math.max(0, limitBytes - throttleInfo.bytesThisSecond)
    };
  }
}

export const monitorModule = new MonitorModule();
export default monitorModule;
export type { ConnectionInfo, SystemStats };