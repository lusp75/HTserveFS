/**
 * Monitoring Page
 * Monitoraggio real-time del sistema con statistiche dettagliate
 */

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  Activity,
  Users,
  HardDrive,
  Wifi,
  Clock,
  Download,
  Upload,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Eye,
  Filter,
  Search
} from 'lucide-react';
import { clsx } from 'clsx';

interface SystemMetrics {
  cpu: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  disk: {
    used: number;
    total: number;
    percentage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
}

interface Connection {
  id: string;
  ip: string;
  userAgent: string;
  connectedAt: string;
  lastActivity: string;
  requestCount: number;
  bytesTransferred: number;
  status: 'active' | 'idle' | 'disconnected';
  username?: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'security';
  message: string;
  details?: any;
  ip?: string;
  username?: string;
}

interface SystemStats {
  uptime: number;
  totalConnections: number;
  activeConnections: number;
  totalRequests: number;
  totalBytesTransferred: number;
  errorRate: number;
  averageResponseTime: number;
}

export default function Monitoring() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);
  const [logFilter, setLogFilter] = useState<string>('all');
  const [logSearch, setLogSearch] = useState('');
  const { token, user } = useAuthStore();

  const isAdmin = user?.role === 'admin';

  const fetchData = async () => {
    if (!token || !isAdmin) return;
    
    try {
      setError(null);
      
      // Fetch system metrics
      const metricsResponse = await fetch('/api/monitor/metrics', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (metricsResponse.ok) {
        const metricsData = await metricsResponse.json();
        if (metricsData.success && metricsData.metrics) {
          setMetrics(metricsData.metrics);
        }
      }
      
      // Fetch connections
      const connectionsResponse = await fetch('/api/monitor/connections', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (connectionsResponse.ok) {
        const connectionsData = await connectionsResponse.json();
        if (connectionsData.success) {
          // L'API restituisce {connections: {active: 1, ...}, details: []}
          setConnections(connectionsData.details || []);
        }
      }
      
      // Fetch logs
      const logsResponse = await fetch('/api/monitor/logs?limit=100', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (logsResponse.ok) {
        const logsData = await logsResponse.json();
        if (logsData.success) {
          setLogs(logsData.logs || []);
        }
      }
      
      // Fetch stats
      const statsResponse = await fetch('/api/monitor/stats', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        if (statsData.success && statsData.stats) {
          setStats(statsData.stats);
        }
      }
    } catch (err) {
      setError('Errore nel caricamento dei dati di monitoraggio');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, isAdmin]);

  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(fetchData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, token, isAdmin]);

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatUptime = (seconds: number): string => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  const formatTime = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString('it-IT');
  };

  const getLogLevelColor = (level: string): string => {
    switch (level) {
      case 'error': return 'text-red-600 bg-red-50';
      case 'warn': return 'text-yellow-600 bg-yellow-50';
      case 'security': return 'text-purple-600 bg-purple-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  const getConnectionStatus = (connection: Connection): string => {
    const lastActivity = new Date(connection.lastActivity).getTime();
    const now = Date.now();
    const timeDiff = now - lastActivity;
    
    if (timeDiff < 30000) return 'active'; // 30 seconds
    if (timeDiff < 300000) return 'idle'; // 5 minutes
    return 'disconnected';
  };

  const filteredLogs = logs.filter(log => {
    const matchesFilter = logFilter === 'all' || log.level === logFilter;
    const matchesSearch = !logSearch || 
      log.message.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.username?.toLowerCase().includes(logSearch.toLowerCase()) ||
      log.ip?.includes(logSearch);
    return matchesFilter && matchesSearch;
  });

  if (!isAdmin) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            Accesso Negato
          </h3>
          <p className="text-gray-500">
            Solo gli amministratori possono accedere al monitoraggio del sistema.
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
          <span className="ml-2 text-lg">Caricamento dati di monitoraggio...</span>
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
            <h1 className="text-2xl font-bold text-gray-900">Monitoraggio Sistema</h1>
            <p className="mt-2 text-gray-600">
              Statistiche real-time e monitoraggio delle attività
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm text-gray-700">Auto-refresh:</label>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                disabled={!autoRefresh}
                className="text-sm border border-gray-300 rounded px-2 py-1"
              >
                <option value={1000}>1s</option>
                <option value={5000}>5s</option>
                <option value={10000}>10s</option>
                <option value={30000}>30s</option>
              </select>
            </div>
            <Button onClick={fetchData} size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Aggiorna
            </Button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* System Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? formatUptime(stats.uptime) : 'N/A'}
            </div>
            <p className="text-xs text-gray-500">
              Sistema attivo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connessioni</CardTitle>
            <Wifi className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.activeConnections || 0}
            </div>
            <p className="text-xs text-gray-500">
              Attive di {stats?.totalConnections || 0} totali
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Richieste</CardTitle>
            <Activity className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.totalRequests || 0}
            </div>
            <p className="text-xs text-gray-500">
              Tempo medio: {stats?.averageResponseTime || 0}ms
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dati Trasferiti</CardTitle>
            <Download className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats ? formatBytes(stats.totalBytesTransferred) : 'N/A'}
            </div>
            <p className="text-xs text-gray-500">
              Errori: {stats?.errorRate || 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* System Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">CPU</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Utilizzo</span>
                <span className="text-sm font-medium">{metrics.cpu.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={clsx(
                    'h-2 rounded-full transition-all duration-300',
                    metrics.cpu > 80 ? 'bg-red-500' :
                    metrics.cpu > 60 ? 'bg-yellow-500' : 'bg-green-500'
                  )}
                  style={{ width: `${metrics.cpu}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Memoria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">
                  {formatBytes(metrics.memory.used * 1024 * 1024)} / {formatBytes(metrics.memory.total * 1024 * 1024)}
                </span>
                <span className="text-sm font-medium">{metrics.memory.percentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={clsx(
                    'h-2 rounded-full transition-all duration-300',
                    metrics.memory.percentage > 80 ? 'bg-red-500' :
                    metrics.memory.percentage > 60 ? 'bg-yellow-500' : 'bg-blue-500'
                  )}
                  style={{ width: `${metrics.memory.percentage}%` }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Disco</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">
                  {formatBytes(metrics.disk.used)} / {formatBytes(metrics.disk.total)}
                </span>
                <span className="text-sm font-medium">{metrics.disk.percentage.toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={clsx(
                    'h-2 rounded-full transition-all duration-300',
                    metrics.disk.percentage > 90 ? 'bg-red-500' :
                    metrics.disk.percentage > 75 ? 'bg-yellow-500' : 'bg-purple-500'
                  )}
                  style={{ width: `${metrics.disk.percentage}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Connections */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Connessioni Attive</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              {connections.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Nessuna connessione attiva
                </div>
              ) : (
                <div className="space-y-2 p-4">
                  {connections.map((connection) => {
                    const status = getConnectionStatus(connection);
                    return (
                      <div
                        key={connection.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center space-x-2">
                            <div className={clsx(
                              'w-2 h-2 rounded-full',
                              status === 'active' ? 'bg-green-500' :
                              status === 'idle' ? 'bg-yellow-500' : 'bg-gray-500'
                            )} />
                            <span className="font-medium text-sm">
                              {connection.username || 'Anonimo'}
                            </span>
                            <span className="text-xs text-gray-500">
                              {connection.ip}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {connection.requestCount} richieste • {formatBytes(connection.bytesTransferred)}
                          </div>
                          <div className="text-xs text-gray-400">
                            Connesso: {formatTime(connection.connectedAt)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* System Logs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Log Sistema</CardTitle>
              <div className="flex items-center space-x-2">
                <select
                  value={logFilter}
                  onChange={(e) => setLogFilter(e.target.value)}
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                >
                  <option value="all">Tutti</option>
                  <option value="info">Info</option>
                  <option value="warn">Warning</option>
                  <option value="error">Errori</option>
                  <option value="security">Sicurezza</option>
                </select>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Cerca..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="pl-7 pr-2 py-1 text-sm border border-gray-300 rounded"
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              {filteredLogs.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  Nessun log trovato
                </div>
              ) : (
                <div className="space-y-1 p-4">
                  {filteredLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-2 border-l-4 border-gray-200 hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className={clsx(
                            'px-2 py-1 rounded text-xs font-medium',
                            getLogLevelColor(log.level)
                          )}>
                            {log.level.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatTime(log.timestamp)}
                          </span>
                        </div>
                        {log.username && (
                          <span className="text-xs text-gray-600">
                            {log.username}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-900 mt-1">
                        {log.message}
                      </div>
                      {log.ip && (
                        <div className="text-xs text-gray-500 mt-1">
                          IP: {log.ip}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}