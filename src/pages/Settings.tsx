/**
 * Settings Page
 * Configurazione del sistema e impostazioni
 */

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  Settings as SettingsIcon,
  Server,
  Shield,
  HardDrive,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Eye,
  EyeOff,
  Lock,
  Globe,
  Database,
  Plus,
  Trash2
} from 'lucide-react';
import { clsx } from 'clsx';

interface ServerConfig {
  port: number;
  host: string;
  tls: {
    enabled: boolean;
    port: number;
    cert_file: string;
    key_file: string;
    auto_cert: boolean;
    disable_http: boolean;
  };
}

interface FilesConfig {
  shares: Array<{
    path: string;
    alias: string;
    readonly: boolean;
  }>;
  max_file_size: string;
  allowed_extensions: string[];
}

interface AuthConfig {
  lockout_threshold: number;
  lockout_duration: string;
  session_timeout: string;
  jwt_secret: string;
}

interface LoggingConfig {
  level: string;
  file: string;
  max_size: string;
  rotate: boolean;
}

interface SystemConfig {
  server: ServerConfig;
  files: FilesConfig;
  auth: AuthConfig;
  logging: LoggingConfig;
}

export default function Settings() {
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('server');
  const [showJwtSecret, setShowJwtSecret] = useState(false);
  const [newShare, setNewShare] = useState({ path: '', alias: '', readonly: false });
  const [showAddShare, setShowAddShare] = useState(false);
  const { token, user } = useAuthStore();

  const isAdmin = user?.role === 'admin';

  const fetchConfig = async () => {
    if (!token || !isAdmin) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/config', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setConfig(data.config);
        } else {
          setError(data.message || 'Errore nel caricamento della configurazione');
        }
      } else {
        setError('Errore nella richiesta');
      }
    } catch (err) {
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, [token, isAdmin]);

  const saveConfig = async () => {
    if (!token || !isAdmin || !config) return;
    
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ config }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSuccess('Configurazione salvata con successo');
          setTimeout(() => setSuccess(null), 3000);
        } else {
          setError(data.message || 'Errore nel salvataggio della configurazione');
        }
      } else {
        setError('Errore nella richiesta');
      }
    } catch (err) {
      setError('Errore di connessione');
    } finally {
      setSaving(false);
    }
  };

  const updateConfig = (section: keyof SystemConfig, field: string, value: any) => {
    if (!config) return;
    
    setConfig(prev => ({
      ...prev!,
      [section]: {
        ...prev![section],
        [field]: value
      }
    }));
  };

  const updateNestedConfig = (section: keyof SystemConfig, nestedField: string, field: string, value: any) => {
    if (!config) return;
    
    setConfig(prev => ({
      ...prev!,
      [section]: {
        ...prev![section],
        [nestedField]: {
          ...(prev![section] as any)[nestedField],
          [field]: value
        }
      }
    }));
  };

  const addShare = () => {
    if (!config || !newShare.path.trim() || !newShare.alias.trim()) return;
    
    const updatedShares = [...config.files.shares, { ...newShare }];
    updateConfig('files', 'shares', updatedShares);
    setNewShare({ path: '', alias: '', readonly: false });
    setShowAddShare(false);
  };

  const removeShare = (index: number) => {
    if (!config) return;
    
    const updatedShares = config.files.shares.filter((_, i) => i !== index);
    updateConfig('files', 'shares', updatedShares);
  };

  const tabs = [
    { id: 'server', name: 'Server', icon: Server },
    { id: 'files', name: 'File System', icon: HardDrive },
    { id: 'auth', name: 'Autenticazione', icon: Shield },
    { id: 'logging', name: 'Logging', icon: Database },
  ];

  if (!isAdmin) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Accesso Negato
          </h3>
          <p className="text-gray-500">
            Solo gli amministratori possono accedere alle impostazioni del sistema.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-lg">Caricamento configurazione...</span>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Errore di Configurazione
          </h3>
          <p className="text-gray-500 mb-4">
            Impossibile caricare la configurazione del sistema.
          </p>
          <Button onClick={fetchConfig}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Riprova
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Impostazioni Sistema</h1>
            <p className="mt-2 text-gray-600">
              Configura il server, sicurezza e funzionalità del sistema
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={fetchConfig}
              disabled={loading}
            >
              <RefreshCw className={clsx('h-4 w-4 mr-2', loading && 'animate-spin')} />
              Ricarica
            </Button>
            <Button
              onClick={saveConfig}
              disabled={saving}
            >
              {saving ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salva Configurazione
            </Button>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-400 mr-2" />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-md">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 text-green-400 mr-2" />
            <p className="text-sm text-green-800">{success}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <Card>
            <CardContent className="p-0">
              <nav className="space-y-1">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={clsx(
                        'w-full flex items-center px-4 py-3 text-sm font-medium text-left transition-colors',
                        activeTab === tab.id
                          ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-500'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      )}
                    >
                      <Icon className="h-5 w-5 mr-3" />
                      {tab.name}
                    </button>
                  );
                })}
              </nav>
            </CardContent>
          </Card>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {/* Server Settings */}
          {activeTab === 'server' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Server className="h-5 w-5 mr-2" />
                  Configurazione Server
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Porta
                    </label>
                    <input
                      type="number"
                      value={config.server.port}
                      onChange={(e) => updateConfig('server', 'port', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Host
                    </label>
                    <input
                      type="text"
                      value={config.server.host}
                      onChange={(e) => updateConfig('server', 'host', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-medium text-gray-900 mb-4">Configurazione TLS</h4>
                  <div className="space-y-4">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={config.server.tls.enabled}
                        onChange={(e) => updateNestedConfig('server', 'tls', 'enabled', e.target.checked)}
                        className="mr-2"
                      />
                      <label className="text-sm text-gray-700">Abilita TLS/HTTPS</label>
                    </div>
                    
                    {config.server.tls.enabled && (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Porta HTTPS
                            </label>
                            <input
                              type="number"
                              value={config.server.tls.port}
                              onChange={(e) => updateNestedConfig('server', 'tls', 'port', parseInt(e.target.value))}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                          </div>
                        </div>
                        
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={config.server.tls.auto_cert}
                            onChange={(e) => updateNestedConfig('server', 'tls', 'auto_cert', e.target.checked)}
                            className="mr-2"
                          />
                          <label className="text-sm text-gray-700">Certificato automatico (self-signed)</label>
                        </div>
                        
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={config.server.tls.disable_http}
                            onChange={(e) => updateNestedConfig('server', 'tls', 'disable_http', e.target.checked)}
                            className="mr-2"
                          />
                          <label className="text-sm text-gray-700">Modalità HTTPS-Only (disabilita HTTP)</label>
                        </div>
                        <div className="text-xs text-gray-500 ml-6">
                          Quando abilitato, solo HTTPS sarà disponibile per maggiore sicurezza
                        </div>
                        
                        {!config.server.tls.auto_cert && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                File Certificato
                              </label>
                              <input
                                type="text"
                                value={config.server.tls.cert_file}
                                onChange={(e) => updateNestedConfig('server', 'tls', 'cert_file', e.target.value)}
                                placeholder="cert.pem"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-2">
                                File Chiave Privata
                              </label>
                              <input
                                type="text"
                                value={config.server.tls.key_file}
                                onChange={(e) => updateNestedConfig('server', 'tls', 'key_file', e.target.value)}
                                placeholder="key.pem"
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Files Settings */}
          {activeTab === 'files' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <HardDrive className="h-5 w-5 mr-2" />
                  Configurazione File System
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Dimensione Massima File
                    </label>
                    <input
                      type="text"
                      value={config.files.max_file_size}
                      onChange={(e) => updateConfig('files', 'max_file_size', e.target.value)}
                      placeholder="100MB"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Estensioni Consentite
                    </label>
                    <input
                      type="text"
                      value={config.files.allowed_extensions.join(', ')}
                      onChange={(e) => updateConfig('files', 'allowed_extensions', e.target.value.split(',').map(ext => ext.trim()))}
                      placeholder="*, .jpg, .pdf, .txt"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-lg font-medium text-gray-900">Cartelle Condivise</h4>
                    <Button
                      size="sm"
                      onClick={() => setShowAddShare(true)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Aggiungi
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {config.files.shares.map((share, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{share.alias}</div>
                          <div className="text-sm text-gray-500">{share.path}</div>
                          <div className="text-xs text-gray-400">
                            {share.readonly ? 'Solo lettura' : 'Lettura/Scrittura'}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeShare(index)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>

                  {showAddShare && (
                    <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                      <h5 className="font-medium text-gray-900 mb-3">Aggiungi Cartella Condivisa</h5>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Percorso
                          </label>
                          <input
                            type="text"
                            value={newShare.path}
                            onChange={(e) => setNewShare(prev => ({ ...prev, path: e.target.value }))}
                            placeholder="Inserisci il percorso della cartella"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            Esempi: <span className="font-mono">C:\cartella</span> o <span className="font-mono">C:\</span>
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Alias
                          </label>
                          <input
                            type="text"
                            value={newShare.alias}
                            onChange={(e) => setNewShare(prev => ({ ...prev, alias: e.target.value }))}
                            placeholder="Nome visualizzato"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                          />
                        </div>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={newShare.readonly}
                            onChange={(e) => setNewShare(prev => ({ ...prev, readonly: e.target.checked }))}
                            className="mr-2"
                          />
                          <label className="text-sm text-gray-700">Solo lettura</label>
                        </div>
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowAddShare(false);
                              setNewShare({ path: '', alias: '', readonly: false });
                            }}
                          >
                            Annulla
                          </Button>
                          <Button
                            size="sm"
                            onClick={addShare}
                            disabled={!newShare.path.trim() || !newShare.alias.trim()}
                          >
                            Aggiungi
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Auth Settings */}
          {activeTab === 'auth' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="h-5 w-5 mr-2" />
                  Configurazione Autenticazione
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Soglia Lockout (tentativi)
                    </label>
                    <input
                      type="number"
                      value={config.auth.lockout_threshold}
                      onChange={(e) => updateConfig('auth', 'lockout_threshold', parseInt(e.target.value))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Durata Lockout
                    </label>
                    <input
                      type="text"
                      value={config.auth.lockout_duration}
                      onChange={(e) => updateConfig('auth', 'lockout_duration', e.target.value)}
                      placeholder="15m"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Timeout Sessione
                    </label>
                    <input
                      type="text"
                      value={config.auth.session_timeout}
                      onChange={(e) => updateConfig('auth', 'session_timeout', e.target.value)}
                      placeholder="24h"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      JWT Secret
                    </label>
                    <div className="relative">
                      <input
                        type={showJwtSecret ? 'text' : 'password'}
                        value={config.auth.jwt_secret}
                        onChange={(e) => updateConfig('auth', 'jwt_secret', e.target.value)}
                        className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowJwtSecret(!showJwtSecret)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2"
                      >
                        {showJwtSecret ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}



          {/* Logging Settings */}
          {activeTab === 'logging' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="h-5 w-5 mr-2" />
                  Configurazione Logging
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Livello Log
                    </label>
                    <select
                      value={config.logging.level}
                      onChange={(e) => updateConfig('logging', 'level', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="error">Error</option>
                      <option value="warn">Warning</option>
                      <option value="info">Info</option>
                      <option value="debug">Debug</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      File Log
                    </label>
                    <input
                      type="text"
                      value={config.logging.file}
                      onChange={(e) => updateConfig('logging', 'file', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Dimensione Massima
                    </label>
                    <input
                      type="text"
                      value={config.logging.max_size}
                      onChange={(e) => updateConfig('logging', 'max_size', e.target.value)}
                      placeholder="10MB"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div className="flex items-center pt-8">
                    <input
                      type="checkbox"
                      checked={config.logging.rotate}
                      onChange={(e) => updateConfig('logging', 'rotate', e.target.checked)}
                      className="mr-2"
                    />
                    <label className="text-sm text-gray-700">Rotazione automatica</label>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}