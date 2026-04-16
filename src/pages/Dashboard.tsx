/**
 * Dashboard Page
 * Panoramica del sistema con statistiche e informazioni
 */

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  HardDrive,
  Users,
  Activity,
  Download,
  Upload,
  Clock,
  Wifi,
  AlertCircle,
  RefreshCw,
  FolderOpen
} from 'lucide-react';
import { clsx } from 'clsx';
import { Link } from 'react-router-dom';

interface SystemStats {
  activeConnections: number;
  totalConnections: number;
  totalBytesTransferred: number;
  totalRequests: number;
  uptime: number;
  memoryUsage: {
    used: number;
    total: number;
    external: number;
  };
}

interface HealthStatus {
  status: string;
  uptime: number;
  memory: {
    used: number;
    total: number;
    external: number;
  };
  connections: number;
  requests: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, token } = useAuthStore();

  const fetchStats = async () => {
    if (!token) return;
    
    try {
      setError(null);
      
      // Fetch system stats (admin only)
      if (user?.role === 'admin') {
        const statsResponse = await fetch('/api/monitor/stats', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        
        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          if (statsData.success) {
            setStats(statsData.stats);
          }
        }
      }
      
      // Fetch health status (available to all)
      const healthResponse = await fetch('/api/monitor/health', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        if (healthData.success) {
          setHealth(healthData.health);
        }
      }
    } catch (err) {
      setError('Errore nel caricamento delle statistiche');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [token, user?.role]);

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

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-lg">Caricamento statistiche...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Benvenuto, {user?.username}! Ecco una panoramica del sistema.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Stato Sistema</CardTitle>
            <Activity className={clsx(
              'h-4 w-4',
              health?.status === 'healthy' ? 'text-green-600' : 'text-red-600'
            )} />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {health?.status === 'healthy' ? 'Online' : 'Offline'}
            </div>
            <p className="text-xs text-gray-500">
              Uptime: {health ? formatUptime(health.uptime) : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Connessioni Attive</CardTitle>
            <Wifi className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.activeConnections ?? health?.connections ?? 0}
            </div>
            <p className="text-xs text-gray-500">
              Totale: {stats?.totalConnections ?? 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memoria</CardTitle>
            <HardDrive className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {health ? formatBytes(health.memory.used * 1024 * 1024) : 'N/A'}
            </div>
            <p className="text-xs text-gray-500">
              di {health ? formatBytes(health.memory.total * 1024 * 1024) : 'N/A'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Richieste</CardTitle>
            <Activity className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.totalRequests ?? health?.requests ?? 0}
            </div>
            <p className="text-xs text-gray-500">
              Totali dal avvio
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Information */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Information */}
        <Card>
          <CardHeader>
            <CardTitle>Informazioni Sistema</CardTitle>
            <CardDescription>
              Dettagli sul funzionamento del server
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Versione:</span>
              <span className="text-sm text-gray-600">HtserveFS v1.0.0</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Uptime:</span>
              <span className="text-sm text-gray-600">
                {health ? formatUptime(health.uptime) : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Memoria Esterna:</span>
              <span className="text-sm text-gray-600">
                {health ? formatBytes(health.memory.external * 1024 * 1024) : 'N/A'}
              </span>
            </div>
            {stats && (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Dati Trasferiti:</span>
                <span className="text-sm text-gray-600">
                  {formatBytes(stats.totalBytesTransferred)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Azioni Rapide</CardTitle>
            <CardDescription>
              Accesso rapido alle funzionalità principali
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link to="/files" className="block">
              <Button className="w-full justify-start" variant="outline">
                <FolderOpen className="mr-2 h-4 w-4" />
                Esplora File
              </Button>
            </Link>
            <Link to="/upload" className="block">
              <Button className="w-full justify-start" variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Carica File
              </Button>
            </Link>
            {user?.role === 'admin' && (
              <>
                <Link to="/users" className="block">
                  <Button className="w-full justify-start" variant="outline">
                    <Users className="mr-2 h-4 w-4" />
                    Gestisci Utenti
                  </Button>
                </Link>
                <Link to="/monitor" className="block">
                  <Button className="w-full justify-start" variant="outline">
                    <Activity className="mr-2 h-4 w-4" />
                    Monitoraggio
                  </Button>
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Refresh Button */}
      <div className="mt-8 flex justify-center">
        <Button onClick={fetchStats} disabled={loading}>
          <RefreshCw className={clsx('mr-2 h-4 w-4', loading && 'animate-spin')} />
          Aggiorna Statistiche
        </Button>
      </div>
    </div>
  );
}