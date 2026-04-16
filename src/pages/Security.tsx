import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';

interface LockedIP {
  ip: string;
  attempts: number;
  lastAttempt: string;
  lockedUntil: string;
  remainingTime: number;
}

interface LockedIPsResponse {
  success: boolean;
  lockedIPs: LockedIP[];
  count: number;
}

const Security: React.FC = () => {
  const [lockedIPs, setLockedIPs] = useState<LockedIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [unlockingAll, setUnlockingAll] = useState(false);

  const fetchLockedIPs = async () => {
    try {
      setError(null);
      const authState = useAuthStore.getState();
      const token = authState?.token || localStorage.getItem('token');
      
      if (!token) {
        setError('Token di autenticazione mancante');
        setLoading(false);
        return;
      }

      const response = await fetch('/api/security/locked-ips', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data: LockedIPsResponse = await response.json();
        const ips = Array.isArray(data?.lockedIPs) ? data.lockedIPs : [];
        setLockedIPs(ips);
      } else {
        setError(`Errore nel caricamento: ${response.status}`);
      }
    } catch (err) {
      setError('Errore di connessione');
    } finally {
      setLoading(false);
    }
  };

  const unlockIP = async (ip: string) => {
    if (!ip) return;
    
    setUnlocking(ip);
    try {
      const authState = useAuthStore.getState();
      const token = authState?.token || localStorage.getItem('token');
      
      if (!token) {
        setError('Token di autenticazione mancante');
        return;
      }

      const response = await fetch(`/api/security/unlock-ip/${encodeURIComponent(ip)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        await fetchLockedIPs();
      } else {
        setError('Errore nello sblocco dell\'IP');
      }
    } catch (err) {
      setError('Errore di connessione');
    } finally {
      setUnlocking(null);
    }
  };

  const unlockAllIPs = async () => {
    setUnlockingAll(true);
    try {
      const authState = useAuthStore.getState();
      const token = authState?.token || localStorage.getItem('token');
      
      if (!token) {
        setError('Token di autenticazione mancante');
        return;
      }

      const response = await fetch('/api/security/unlock-all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        await fetchLockedIPs();
      } else {
        setError('Errore nello sblocco degli IP');
      }
    } catch (err) {
      setError('Errore di connessione');
    } finally {
      setUnlockingAll(false);
    }
  };

  const formatTime = (seconds: number): string => {
    if (!seconds || seconds <= 0) return 'Scaduto';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  const formatDateTime = (dateString: string): string => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleString('it-IT');
    } catch {
      return 'Data non valida';
    }
  };

  useEffect(() => {
    let mounted = true;
    
    const loadData = async () => {
      if (mounted) {
        await fetchLockedIPs();
      }
    };
    
    loadData();
    
    const interval = setInterval(() => {
      if (mounted) {
        fetchLockedIPs();
      }
    }, 30000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    
    const interval = setInterval(() => {
      if (!mounted) return;
      
      setLockedIPs(prev => {
        if (!Array.isArray(prev)) return [];
        return prev.map(ip => {
          if (!ip || typeof ip !== 'object') return ip;
          return {
            ...ip,
            remainingTime: Math.max(0, (ip.remainingTime || 0) - 1)
          };
        });
      });
    }, 1000);
    
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div>Caricamento...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🛡️ Sicurezza
        </h1>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Gestione degli IP bloccati e sicurezza del sistema
        </p>
      </div>

      <div style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => fetchLockedIPs()}
          disabled={loading}
          style={{
            padding: '8px 16px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '14px'
          }}
        >
          🔄 Aggiorna
        </button>
        {Array.isArray(lockedIPs) && lockedIPs.length > 0 && (
          <button
            onClick={() => unlockAllIPs()}
            disabled={unlockingAll}
            style={{
              padding: '8px 16px',
              border: '1px solid #dc2626',
              borderRadius: '4px',
              backgroundColor: '#dc2626',
              color: 'white',
              cursor: unlockingAll ? 'not-allowed' : 'pointer',
              fontSize: '14px'
            }}
          >
            🔓 {unlockingAll ? 'Sbloccando...' : 'Sblocca Tutti'}
          </button>
        )}
      </div>

      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '4px',
          color: '#dc2626',
          marginBottom: '20px'
        }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        backgroundColor: '#fff',
        padding: '20px'
      }}>
        <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ⚠️ IP Bloccati
        </h2>
        <p style={{ color: '#666', fontSize: '14px', marginBottom: '16px' }}>
          Lista degli indirizzi IP attualmente bloccati per troppi tentativi di login falliti
        </p>

        {!Array.isArray(lockedIPs) || lockedIPs.length === 0 ? (
          <div style={{
            padding: '16px',
            backgroundColor: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            🛡️ Nessun IP attualmente bloccato. Il sistema è sicuro.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {lockedIPs.map((lockedIP, index) => {
              if (!lockedIP || typeof lockedIP !== 'object') return null;
              
              return (
                <div
                  key={lockedIP.ip || index}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                      <code style={{
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        backgroundColor: '#f3f4f6',
                        padding: '4px 8px',
                        borderRadius: '4px'
                      }}>
                        {lockedIP.ip || 'N/A'}
                      </code>
                      <span style={{
                        backgroundColor: '#dc2626',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px'
                      }}>
                        {lockedIP.attempts || 0} tentativi
                      </span>
                      <span style={{
                        border: '1px solid #d1d5db',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        🕐 {formatTime(lockedIP.remainingTime || 0)}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      <span>Ultimo tentativo: {formatDateTime(lockedIP.lastAttempt)}</span>
                      <span style={{ margin: '0 8px' }}>•</span>
                      <span>Bloccato fino: {formatDateTime(lockedIP.lockedUntil)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => unlockIP(lockedIP.ip)}
                    disabled={unlocking === lockedIP.ip}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #d1d5db',
                      borderRadius: '4px',
                      backgroundColor: '#fff',
                      cursor: unlocking === lockedIP.ip ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    🔓 {unlocking === lockedIP.ip ? 'Sbloccando...' : 'Sblocca'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Security;