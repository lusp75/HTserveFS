/**
 * Config Loader Module
 * Gestisce il caricamento e la validazione della configurazione JSON esterna
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ServerConfig {
  port: number;
  host: string;
  tls: {
    enabled: boolean;
    cert_file: string;
    key_file: string;
    auto_cert: boolean;
  };
}

export interface FileShare {
  path: string;
  alias: string;
  readonly: boolean;
}

export interface FilesConfig {
  shares: FileShare[];
  max_file_size: string;
  allowed_extensions: string[];
}

export interface AuthUser {
  username: string;
  password_hash: string;
  role: 'admin' | 'read-only' | 'read-write';
}

export interface AuthConfig {
  users: AuthUser[];
  lockout_threshold: number;
  lockout_duration: string;
  session_timeout: string;
  jwt_secret: string;
}

export interface ThrottlingConfig {
  default_kbps: number;
  per_user_limits: Record<string, number>;
}

export interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
  file: string;
  max_size: string;
  rotate: boolean;
}

export interface AppConfig {
  server: ServerConfig;
  files: FilesConfig;
  auth: AuthConfig;
  throttling: ThrottlingConfig;
  logging: LoggingConfig;
}

// Default configuration
const defaultConfig: AppConfig = {
  server: {
    port: 3001,
    host: '0.0.0.0',
    tls: {
      enabled: true,
      cert_file: 'cert.pem',
      key_file: 'key.pem',
      auto_cert: true
    }
  },
  files: {
    shares: [
      { path: 'C:\\', alias: 'C', readonly: false }
    ],
    max_file_size: '100MB',
    allowed_extensions: ['*']
  },
  auth: {
    users: [
      {
        username: 'admin',
        password_hash: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO9G', // password: admin
        role: 'admin'
      },
      {
        username: 'user',
        password_hash: '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password: password
        role: 'read-write'
      }
    ],
    lockout_threshold: 5,
    lockout_duration: '15m',
    session_timeout: '24h',
    jwt_secret: 'your-super-secret-jwt-key-change-this-in-production'
  },
  throttling: {
    default_kbps: 1024,
    per_user_limits: {
      admin: 0,
      user: 512
    }
  },
  logging: {
    level: 'debug',
    file: 'htservefs.log',
    max_size: '5MB',
    rotate: true
  }
};

class ConfigLoader {
  private config: AppConfig;
  private configPath: string;

  constructor() {
    this.configPath = path.join(process.cwd(), 'config.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): AppConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const userConfig = JSON.parse(configData);
        return this.mergeConfig(defaultConfig, userConfig);
      } else {
        // Create default config file if it doesn't exist
        this.saveConfig(defaultConfig);
        return defaultConfig;
      }
    } catch (error) {
      console.error('Error loading config:', error);
      return defaultConfig;
    }
  }

  private mergeConfig(defaultConf: AppConfig, userConf: any): AppConfig {
    return {
      server: { ...defaultConf.server, ...userConf.server },
      files: { ...defaultConf.files, ...userConf.files },
      auth: { ...defaultConf.auth, ...userConf.auth },
      throttling: { ...defaultConf.throttling, ...userConf.throttling },
      logging: { ...defaultConf.logging, ...userConf.logging }
    };
  }

  private saveConfig(config: AppConfig): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Error saving config:', error);
    }
  }

  public async saveConfigAsync(config: AppConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
        this.config = config;
        resolve();
      } catch (error) {
        console.error('Error saving config:', error);
        reject(error);
      }
    });
  }

  public getConfig(): AppConfig {
    return this.config;
  }

  public reloadConfig(): AppConfig {
    this.config = this.loadConfig();
    return this.config;
  }

  public updateConfig(newConfig: Partial<AppConfig>): void {
    this.config = this.mergeConfig(this.config, newConfig);
    this.saveConfig(this.config);
  }
}

export const configLoader = new ConfigLoader();
export default configLoader;