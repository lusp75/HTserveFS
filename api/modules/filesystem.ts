/**
 * File System Abstraction Module
 * Gestisce operazioni CRUD sui file con supporto Range requests
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { Request, Response } from 'express';
import archiver from 'archiver';
import { configLoader, FileShare } from '../config/config.js';
import logger from './logger.js';
import { AuthenticatedRequest } from './auth.js';

const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const rmdir = promisify(fs.rmdir);
const rename = promisify(fs.rename);

interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: Date;
  permissions: {
    read: boolean;
    write: boolean;
  };
}

interface DirectoryListing {
  path: string;
  files: FileInfo[];
  parent?: string;
}

class FileSystemModule {
  private config = configLoader.getConfig().files;

  /**
   * Get all configured shares
   */
  public getShares(): FileShare[] {
    return this.config.shares;
  }

  /**
   * Find share by alias
   */
  public findShare(alias: string): FileShare | null {
    return this.config.shares.find(share => share.alias === alias) || null;
  }

  /**
   * Validate if path is within allowed shares
   */
  public validatePath(requestedPath: string): { isValid: boolean; share?: FileShare; resolvedPath?: string } {
    // Extract share alias from path
    const pathParts = requestedPath.split('/').filter(p => p);
    if (pathParts.length === 0) {
      return { isValid: false };
    }

    const shareAlias = pathParts[0];
    const share = this.findShare(shareAlias);
    
    if (!share) {
      return { isValid: false };
    }

    // Build resolved path
    const relativePath = pathParts.slice(1).join(path.sep);
    const resolvedPath = path.resolve(share.path, relativePath);
    
    // Ensure path is within share bounds (prevent directory traversal)
    const sharePath = path.resolve(share.path);
    if (!resolvedPath.startsWith(sharePath)) {
      logger.security('Directory traversal attempt detected', {
        requestedPath,
        resolvedPath,
        sharePath
      });
      return { isValid: false };
    }

    return { isValid: true, share, resolvedPath };
  }

  /**
   * Check if file extension is allowed
   */
  public isExtensionAllowed(filename: string): boolean {
    if (this.config.allowed_extensions.includes('*')) {
      return true;
    }

    const ext = path.extname(filename).toLowerCase();
    return this.config.allowed_extensions.includes(ext);
  }

  /**
   * Parse file size string to bytes
   */
  public parseFileSize(sizeStr: string): number {
    const units: Record<string, number> = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024
    };

    const match = sizeStr.match(/^(\d+)\s*(B|KB|MB|GB)$/i);
    if (!match) return 100 * 1024 * 1024; // Default 100MB

    const [, size, unit] = match;
    return parseInt(size) * (units[unit.toUpperCase()] || 1);
  }

  /**
   * Get directory listing
   */
  public async getDirectoryListing(requestedPath: string): Promise<DirectoryListing | null> {
    const validation = this.validatePath(requestedPath);
    if (!validation.isValid || !validation.resolvedPath) {
      return null;
    }

    try {
      const stats = await stat(validation.resolvedPath);
      if (!stats.isDirectory()) {
        return null;
      }

      const entries = await readdir(validation.resolvedPath);
      const files: FileInfo[] = [];

      for (const entry of entries) {
        try {
          const entryPath = path.join(validation.resolvedPath, entry);
          const entryStats = await stat(entryPath);
          
          files.push({
            name: entry,
            path: `${requestedPath}/${entry}`.replace(/\/+/g, '/'),
            type: entryStats.isDirectory() ? 'directory' : 'file',
            size: entryStats.size,
            modified: entryStats.mtime,
            permissions: {
              read: true,
              write: !validation.share?.readonly
            }
          });
        } catch (error) {
          // Skip files that can't be accessed
          logger.warn(`Cannot access file: ${entry}`, { error: error.message });
        }
      }

      // Sort: directories first, then files, both alphabetically
      files.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      // Calculate parent path
      const pathParts = requestedPath.split('/').filter(p => p);
      const parent = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : undefined;

      return {
        path: requestedPath,
        files,
        parent
      };
    } catch (error) {
      logger.error('Error reading directory', { path: requestedPath, error: error.message });
      return null;
    }
  }

  /**
   * Get file info
   */
  public async getFileInfo(requestedPath: string): Promise<FileInfo | null> {
    const validation = this.validatePath(requestedPath);
    if (!validation.isValid || !validation.resolvedPath) {
      return null;
    }

    try {
      const stats = await stat(validation.resolvedPath);
      const filename = path.basename(validation.resolvedPath);
      
      return {
        name: filename,
        path: requestedPath,
        type: stats.isDirectory() ? 'directory' : 'file',
        size: stats.size,
        modified: stats.mtime,
        permissions: {
          read: true,
          write: !validation.share?.readonly
        }
      };
    } catch (error) {
      logger.error('Error getting file info', { path: requestedPath, error: error.message });
      return null;
    }
  }

  /**
   * Stream file with Range support for resume
   */
  public async streamFile(requestedPath: string, req: Request, res: Response): Promise<boolean> {
    const validation = this.validatePath(requestedPath);
    if (!validation.isValid || !validation.resolvedPath) {
      return false;
    }

    try {
      const stats = await stat(validation.resolvedPath);
      if (stats.isDirectory()) {
        return false;
      }

      const filename = path.basename(validation.resolvedPath);
      const fileSize = stats.size;
      
      // Parse Range header
      const range = req.headers.range;
      let start = 0;
      let end = fileSize - 1;
      
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        start = parseInt(parts[0], 10);
        end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        
        if (start >= fileSize || end >= fileSize) {
          res.status(416).json({ success: false, message: 'Range not satisfiable' });
          return false;
        }
        
        res.status(206); // Partial Content
        res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      }
      
      const contentLength = end - start + 1;
      
      // Set headers
      res.setHeader('Content-Length', contentLength);
      res.setHeader('Content-Type', this.getMimeType(filename));
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Accept-Ranges', 'bytes');
      
      // Create read stream
      const stream = fs.createReadStream(validation.resolvedPath, { start, end });
      
      stream.on('error', (error) => {
        logger.error('Error streaming file', { path: requestedPath, error: error.message });
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Error reading file' });
        }
      });
      
      stream.pipe(res);
      
      logger.audit('File downloaded', {
        path: requestedPath,
        size: contentLength,
        range: range || 'full',
        user: (req as AuthenticatedRequest).user?.username
      });
      
      return true;
    } catch (error) {
      logger.error('Error streaming file', { path: requestedPath, error: error.message });
      return false;
    }
  }

  /**
   * Create directory
   */
  public async createDirectory(requestedPath: string, name: string): Promise<boolean> {
    const validation = this.validatePath(requestedPath);
    if (!validation.isValid || !validation.resolvedPath || validation.share?.readonly) {
      return false;
    }

    try {
      const newDirPath = path.join(validation.resolvedPath, name);
      
      // Check if directory already exists
      try {
        await stat(newDirPath);
        return false; // Directory already exists
      } catch {
        // Directory doesn't exist, we can create it
      }
      
      await mkdir(newDirPath, { recursive: false });
      
      logger.audit('Directory created', {
        path: newDirPath,
        name
      });
      
      return true;
    } catch (error) {
      logger.error('Error creating directory', { path: requestedPath, name, error: error.message });
      return false;
    }
  }

  /**
   * Create file
   */
  public async createFile(requestedPath: string, name: string, content: string = ''): Promise<boolean> {
    const validation = this.validatePath(requestedPath);
    if (!validation.isValid || !validation.resolvedPath || validation.share?.readonly) {
      return false;
    }

    try {
      const newFilePath = path.join(validation.resolvedPath, name);
      
      // Check if file already exists
      try {
        await stat(newFilePath);
        return false; // File already exists
      } catch {
        // File doesn't exist, we can create it
      }
      
      await fs.promises.writeFile(newFilePath, content, 'utf8');
      
      logger.audit('File created', {
        path: newFilePath,
        name,
        size: content.length
      });
      
      return true;
    } catch (error) {
      logger.error('Error creating file', { path: requestedPath, name, error: error.message });
      return false;
    }
  }

  /**
   * Delete file or directory
   */
  public async deleteItem(requestedPath: string): Promise<boolean> {
    const validation = this.validatePath(requestedPath);
    if (!validation.isValid || !validation.resolvedPath || validation.share?.readonly) {
      return false;
    }

    try {
      const stats = await stat(validation.resolvedPath);
      
      if (stats.isDirectory()) {
        await rmdir(validation.resolvedPath, { recursive: true });
      } else {
        await unlink(validation.resolvedPath);
      }
      
      logger.audit('Item deleted', { path: requestedPath, type: stats.isDirectory() ? 'directory' : 'file' });
      return true;
    } catch (error) {
      logger.error('Error deleting item', { path: requestedPath, error: error.message });
      return false;
    }
  }

  /**
   * Rename file or directory
   */
  public async renameItem(requestedPath: string, newName: string): Promise<boolean> {
    const validation = this.validatePath(requestedPath);
    if (!validation.isValid || !validation.resolvedPath || validation.share?.readonly) {
      return false;
    }

    try {
      const parentDir = path.dirname(validation.resolvedPath);
      const newPath = path.join(parentDir, newName);
      
      await rename(validation.resolvedPath, newPath);
      
      logger.audit('Item renamed', { oldPath: requestedPath, newName });
      return true;
    } catch (error) {
      logger.error('Error renaming item', { path: requestedPath, newName, error: error.message });
      return false;
    }
  }

  /**
   * Create zip archive of directory or files
   */
  public async createZipStream(requestedPath: string, res: Response): Promise<boolean> {
    const validation = this.validatePath(requestedPath);
    if (!validation.isValid || !validation.resolvedPath) {
      return false;
    }

    try {
      const stats = await stat(validation.resolvedPath);
      const archive = archiver('zip', { zlib: { level: 6 } });
      
      const filename = `${path.basename(validation.resolvedPath)}.zip`;
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      archive.pipe(res);
      
      if (stats.isDirectory()) {
        archive.directory(validation.resolvedPath, false);
      } else {
        archive.file(validation.resolvedPath, { name: path.basename(validation.resolvedPath) });
      }
      
      await archive.finalize();
      
      logger.audit('Zip archive created', { path: requestedPath, filename });
      return true;
    } catch (error) {
      logger.error('Error creating zip archive', { path: requestedPath, error: error.message });
      return false;
    }
  }

  /**
   * Get MIME type for file
   */
  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.pdf': 'application/pdf',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.mp3': 'audio/mpeg',
      '.zip': 'application/zip',
      '.rar': 'application/x-rar-compressed'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

export const fileSystemModule = new FileSystemModule();
export default fileSystemModule;
export type { FileInfo, DirectoryListing };