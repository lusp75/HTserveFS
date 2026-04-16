/**
 * Auth Module
 * Gestisce autenticazione JWT, bcrypt e brute-force protection
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { configLoader, AuthUser } from '../config/config.js';
import logger from './logger.js';

interface LoginAttempt {
  count: number;
  lastAttempt: Date;
  lockedUntil?: Date;
}

interface JWTPayload {
  userId: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

interface AuthenticatedRequest extends Request {
  user?: JWTPayload;
}

class AuthModule {
  private loginAttempts: Map<string, LoginAttempt> = new Map();
  private config = configLoader.getConfig().auth;

  constructor() {
    // Clean up expired lockouts every 5 minutes
    setInterval(() => this.cleanupExpiredLockouts(), 5 * 60 * 1000);
  }

  /**
   * Hash password using bcrypt
   */
  public async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  public async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  public generateToken(user: AuthUser): string {
    const payload: JWTPayload = {
      userId: user.username, // Using username as userId for simplicity
      username: user.username,
      role: user.role
    };

    const expiresIn = this.parseTimeString(this.config.session_timeout);
    
    return jwt.sign(payload, this.config.jwt_secret, {
      expiresIn: expiresIn // Already in seconds
    });
  }

  /**
   * Verify JWT token
   */
  public verifyToken(token: string): JWTPayload | null {
    try {
      return jwt.verify(token, this.config.jwt_secret) as JWTPayload;
    } catch (error) {
      logger.security('Invalid JWT token', { error: error.message });
      return null;
    }
  }

  /**
   * Check if IP is locked out due to brute force attempts
   */
  public isLockedOut(ip: string): boolean {
    const attempt = this.loginAttempts.get(ip);
    if (!attempt) return false;

    if (attempt.lockedUntil && attempt.lockedUntil > new Date()) {
      return true;
    }

    // Clear expired lockout
    if (attempt.lockedUntil && attempt.lockedUntil <= new Date()) {
      this.loginAttempts.delete(ip);
      return false;
    }

    return false;
  }

  /**
   * Record failed login attempt
   */
  public recordFailedAttempt(ip: string): void {
    const now = new Date();
    const attempt = this.loginAttempts.get(ip) || { count: 0, lastAttempt: now };

    // Reset count if last attempt was more than 1 hour ago
    if (now.getTime() - attempt.lastAttempt.getTime() > 60 * 60 * 1000) {
      attempt.count = 0;
    }

    attempt.count++;
    attempt.lastAttempt = now;

    // Lock out if threshold exceeded
    if (attempt.count >= this.config.lockout_threshold) {
      const lockoutDuration = this.parseTimeString(this.config.lockout_duration);
      attempt.lockedUntil = new Date(now.getTime() + lockoutDuration * 1000);
      
      logger.security('IP locked out due to brute force attempts', {
        ip,
        attempts: attempt.count,
        lockedUntil: attempt.lockedUntil
      });
    }

    this.loginAttempts.set(ip, attempt);
  }

  /**
   * Clear failed attempts for IP (on successful login)
   */
  public clearFailedAttempts(ip: string): void {
    this.loginAttempts.delete(ip);
  }

  /**
   * Find user by username
   */
  public findUser(username: string): AuthUser | null {
    return this.config.users.find(user => user.username === username) || null;
  }

  /**
   * Authenticate user with username and password
   */
  public async authenticate(username: string, password: string, ip: string): Promise<{ success: boolean; token?: string; user?: AuthUser; message?: string }> {
    // Check if IP is locked out
    if (this.isLockedOut(ip)) {
      logger.security('Login attempt from locked out IP', { ip, username });
      return { success: false, message: 'Too many failed attempts. Please try again later.' };
    }

    // Find user
    const user = this.findUser(username);
    if (!user) {
      this.recordFailedAttempt(ip);
      logger.security('Login attempt with invalid username', { username, ip });
      return { success: false, message: 'Invalid credentials' };
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.password_hash);
    if (!isValidPassword) {
      this.recordFailedAttempt(ip);
      logger.security('Login attempt with invalid password', { username, ip });
      return { success: false, message: 'Invalid credentials' };
    }

    // Clear failed attempts on successful login
    this.clearFailedAttempts(ip);

    // Generate token
    const token = this.generateToken(user);

    logger.audit('User logged in successfully', { username, ip, role: user.role });
    
    return {
      success: true,
      token,
      user: { ...user, password_hash: undefined } // Don't return password hash
    };
  }

  /**
   * Middleware to verify JWT token
   */
  public verifyTokenMiddleware = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({ success: false, message: 'Access token required' });
      return;
    }

    const payload = this.verifyToken(token);
    if (!payload) {
      res.status(403).json({ success: false, message: 'Invalid or expired token' });
      return;
    }

    req.user = payload;
    next();
  };

  /**
   * Middleware to check user role
   */
  public requireRole = (roles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
      if (!req.user) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
      }

      if (!roles.includes(req.user.role)) {
        logger.security('Unauthorized access attempt', {
          username: req.user.username,
          role: req.user.role,
          requiredRoles: roles,
          ip: req.ip
        });
        res.status(403).json({ success: false, message: 'Insufficient permissions' });
        return;
      }

      next();
    };
  };

  /**
   * Parse time string (e.g., "15m", "24h") to seconds
   */
  private parseTimeString(timeStr: string): number {
    const units: Record<string, number> = {
      's': 1,
      'm': 60,
      'h': 60 * 60,
      'd': 60 * 60 * 24
    };

    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) return 3600; // Default 1 hour

    const [, value, unit] = match;
    return parseInt(value) * (units[unit] || 1);
  }

  /**
   * Clean up expired lockouts
   */
  private cleanupExpiredLockouts(): void {
    const now = new Date();
    for (const [ip, attempt] of this.loginAttempts.entries()) {
      if (attempt.lockedUntil && attempt.lockedUntil <= now) {
        this.loginAttempts.delete(ip);
      }
    }
  }

  /**
   * Get lockout status for IP
   */
  public getLockoutStatus(ip: string): { isLocked: boolean; attemptsRemaining?: number; lockedUntil?: Date } {
    const attempt = this.loginAttempts.get(ip);
    if (!attempt) {
      return { isLocked: false, attemptsRemaining: this.config.lockout_threshold };
    }

    if (attempt.lockedUntil && attempt.lockedUntil > new Date()) {
      return { isLocked: true, lockedUntil: attempt.lockedUntil };
    }

    return {
      isLocked: false,
      attemptsRemaining: Math.max(0, this.config.lockout_threshold - attempt.count)
    };
  }

  /**
   * Get all locked IPs
   */
  public getLockedIPs(): Array<{
    ip: string;
    attempts: number;
    lastAttempt: string;
    lockedUntil: string;
    remainingTime: number;
  }> {
    const now = new Date();
    const lockedIPs: Array<{
      ip: string;
      attempts: number;
      lastAttempt: string;
      lockedUntil: string;
      remainingTime: number;
    }> = [];

    for (const [ip, attempt] of this.loginAttempts.entries()) {
      if (attempt.lockedUntil && attempt.lockedUntil > now) {
        const remainingTime = Math.max(0, Math.floor((attempt.lockedUntil.getTime() - now.getTime()) / 1000));
        lockedIPs.push({
          ip,
          attempts: attempt.count,
          lastAttempt: attempt.lastAttempt.toISOString(),
          lockedUntil: attempt.lockedUntil.toISOString(),
          remainingTime
        });
      }
    }

    return lockedIPs;
  }

  /**
   * Unlock specific IP
   */
  public unlockIP(ip: string): { success: boolean; message?: string } {
    const attempt = this.loginAttempts.get(ip);
    
    if (!attempt) {
      return { success: false, message: 'IP not found in lockout list' };
    }

    if (!attempt.lockedUntil || attempt.lockedUntil <= new Date()) {
      return { success: false, message: 'IP is not currently locked' };
    }

    this.loginAttempts.delete(ip);
    logger.audit('IP manually unlocked', { ip });
    
    return { success: true };
  }

  /**
   * Unlock all IPs
   */
  public unlockAllIPs(): { success: boolean; count: number } {
    const now = new Date();
    let count = 0;

    for (const [ip, attempt] of this.loginAttempts.entries()) {
      if (attempt.lockedUntil && attempt.lockedUntil > now) {
        this.loginAttempts.delete(ip);
        count++;
      }
    }

    logger.audit('All IPs manually unlocked', { count });
    
    return { success: true, count };
  }
}

export const authModule = new AuthModule();
export default authModule;
export type { AuthenticatedRequest };