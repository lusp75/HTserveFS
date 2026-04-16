/**
 * Logger Module
 * Sistema di logging strutturato con Winston
 */

import winston from 'winston';
import path from 'path';
import { configLoader } from '../config/config.js';

class Logger {
  private logger: winston.Logger;
  private config = configLoader.getConfig().logging;

  constructor() {
    this.logger = this.createLogger();
  }

  private createLogger(): winston.Logger {
    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
      })
    );

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: consoleFormat,
        level: this.config.level
      })
    ];

    // Add file transport if configured
    if (this.config.file) {
      const maxSize = this.parseSize(this.config.max_size);
      transports.push(
        new winston.transports.File({
          filename: path.resolve(this.config.file),
          format: logFormat,
          level: this.config.level,
          maxsize: maxSize,
          maxFiles: this.config.rotate ? 5 : 1,
          tailable: this.config.rotate
        })
      );
    }

    return winston.createLogger({
      level: this.config.level,
      format: logFormat,
      transports,
      exitOnError: false
    });
  }

  private parseSize(sizeStr: string): number {
    const units: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^(\d+)\s*(B|KB|MB|GB)$/i);
    if (!match) return 10 * 1024 * 1024; // Default 10MB

    const [, size, unit] = match;
    return parseInt(size) * (units[unit.toUpperCase()] || 1);
  }

  // Public logging methods
  public info(message: string, meta?: any): void {
    this.logger.info(message, meta);
  }

  public error(message: string, error?: Error | any): void {
    this.logger.error(message, { error: error?.stack || error });
  }

  public warn(message: string, meta?: any): void {
    this.logger.warn(message, meta);
  }

  public debug(message: string, meta?: any): void {
    this.logger.debug(message, meta);
  }

  // Audit logging for security events
  public audit(event: string, details: any): void {
    this.logger.info(`AUDIT: ${event}`, {
      audit: true,
      event,
      details,
      timestamp: new Date().toISOString()
    });
  }

  // Security logging
  public security(event: string, details: any): void {
    this.logger.warn(`SECURITY: ${event}`, {
      security: true,
      event,
      details,
      timestamp: new Date().toISOString()
    });
  }

  // Performance logging
  public performance(operation: string, duration: number, details?: any): void {
    this.logger.info(`PERFORMANCE: ${operation}`, {
      performance: true,
      operation,
      duration,
      details
    });
  }

  // HTTP request logging
  public http(method: string, url: string, statusCode: number, duration: number, userAgent?: string, ip?: string): void {
    this.logger.info(`HTTP ${method} ${url}`, {
      http: true,
      method,
      url,
      statusCode,
      duration,
      userAgent,
      ip
    });
  }
}

export const logger = new Logger();
export default logger;