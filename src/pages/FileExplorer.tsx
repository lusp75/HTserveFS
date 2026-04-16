/**
 * File Explorer Page
 * Navigazione completa del file system con operazioni CRUD
 */

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  FolderOpen,
  File,
  Download,
  Trash2,
  RefreshCw,
  Search,
  Grid,
  List,
  ChevronRight,
  Home,
  AlertTriangle,
  FolderPlus,
  Plus
} from 'lucide-react';
import { clsx } from 'clsx';

interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified: string;
  path: string;
}

interface BreadcrumbItem {
  name: string;
  path: string;
}

export default function FileExplorer() {
  const [currentPath, setCurrentPath] = useState('/');
  const [availableShares, setAvailableShares] = useState<Array<{alias: string, path: string, readonly: boolean}>>([]);
  const [selectedShare, setSelectedShare] = useState('');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createType, setCreateType] = useState<'folder' | 'file'>('folder');
  const [newItemName, setNewItemName] = useState('');
  const { token, user } = useAuthStore();

  const fetchShares = async () => {
    if (!token) return;
    
    try {
      const response = await fetch('/api/files/shares', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setAvailableShares(data.shares || []);
        }
      }
    } catch (err) {
      console.error('Error fetching shares:', err);
    }
  };

  const fetchFiles = async (path: string = currentPath, share: string = selectedShare) => {
    if (!token) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const browsePath = path === '/' ? share : `${share}${path}`;
      const response = await fetch(`/api/files/browse/${browsePath}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.files) {
          setFiles(data.files || []);
          setCurrentPath(path);
        } else {
          setError('Errore nel caricamento dei file');
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
    fetchShares();
  }, [token]);

  useEffect(() => {
    if (availableShares.length > 0 && !selectedShare) {
      setSelectedShare(availableShares[0].alias);
    }
  }, [availableShares]);

  useEffect(() => {
    if (selectedShare) {
      setCurrentPath('/');
      fetchFiles('/', selectedShare);
    }
  }, [selectedShare]);

  const getBreadcrumbs = (): BreadcrumbItem[] => {
    const parts = currentPath.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [{ name: 'Home', path: '/' }];
    
    let currentBreadcrumbPath = '';
    parts.forEach(part => {
      currentBreadcrumbPath += '/' + part;
      breadcrumbs.push({ name: part, path: currentBreadcrumbPath });
    });
    
    return breadcrumbs;
  };

  const handleNavigate = (path: string) => {
    fetchFiles(path);
  };

  const handleFileClick = (file: FileItem) => {
    if (file.type === 'directory') {
      const newPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
      handleNavigate(newPath);
    } else {
      // Preview file or download
      handleDownload(file);
    }
  };

  const handleDownload = async (file: FileItem) => {
    if (!token) {
      setError('Token di autenticazione mancante');
      return;
    }
    
    // Controllo di sicurezza per file.path undefined
    if (!file.path) {
      console.error('File path is undefined:', file);
      setError('Errore: percorso file non definito');
      return;
    }
    
    try {
      const downloadPath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
      console.log('Attempting download:', downloadPath, 'User role:', user?.role);
      
      const response = await fetch(`/api/files/download/${downloadPath}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      console.log('Download response status:', response.status, response.statusText);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        console.log('Download completed successfully for:', file.name);
      } else {
        const errorText = await response.text();
        console.error('Download failed:', response.status, errorText);
        setError(`Errore nel download: ${response.status} - ${errorText}`);
      }
    } catch (err) {
      console.error('Download error:', err);
      setError(`Errore nel download del file: ${err}`);
    }
  };



  const handleCreateItem = async () => {
    if (!token || !newItemName.trim()) return;
    
    try {
      // Costruisci il path correttamente evitando doppi slash
      let createPath = currentPath;
      if (createPath === selectedShare) {
        // Se siamo nella root della share, usa solo il nome della share
        createPath = selectedShare;
      }
      // Normalizza il path rimuovendo slash multipli e slash iniziali/finali
      createPath = createPath.replace(/\/+/g, '/').replace(/^\/|\/$/, '');
      
      // Se il path è vuoto o uguale alla share, usa solo la share
      if (!createPath || createPath === selectedShare) {
        createPath = selectedShare;
      }
      
      console.log('Creating item with path:', createPath, 'endpoint:', createType === 'folder' ? 'mkdir' : 'create');
      
      const endpoint = createType === 'folder' ? 'mkdir' : 'create';
      const response = await fetch(`/api/files/${endpoint}/${createPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ 
          name: newItemName.trim(),
          ...(createType === 'file' && { content: '' })
        }),
      });
      
      if (response.ok) {
        setShowCreateDialog(false);
        setNewItemName('');
        fetchFiles();
      } else {
        const data = await response.json();
        setError(data.message || 'Errore nella creazione');
      }
    } catch (err) {
      setError('Errore di connessione');
    }
  };

  const handleDelete = async (file: FileItem) => {
    if (!token || !confirm(`Sei sicuro di voler eliminare "${file.name}"?`)) return;
    
    // Controllo di sicurezza per file.path undefined
    if (!file.path) {
      console.error('File path is undefined for delete:', file);
      setError('Errore: percorso file non definito per eliminazione');
      return;
    }
    
    try {
      const deletePath = file.path.startsWith('/') ? file.path.substring(1) : file.path;
      const response = await fetch(`/api/files/delete/${deletePath}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        fetchFiles();
      } else {
        const data = await response.json();
        setError(data.message || 'Errore nell\'eliminazione');
      }
    } catch (err) {
      setError('Errore di connessione');
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString('it-IT');
  };

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const canWrite = user?.role === 'admin' || user?.role === 'read-write';

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-lg">Caricamento file...</span>
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
            <h1 className="text-2xl font-bold text-gray-900">File Explorer</h1>
            <p className="mt-2 text-gray-600">
              Naviga e gestisci i file del sistema
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              onClick={() => fetchFiles()}
              disabled={loading}
            >
              <RefreshCw className={clsx('h-4 w-4 mr-2', loading && 'animate-spin')} />
              Aggiorna
            </Button>
            {user?.role !== 'read-only' && (
              <div className="relative">
                <Button 
                  onClick={() => {
                    setCreateType('folder');
                    setShowCreateDialog(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nuovo
                </Button>
              </div>
            )}
          </div>
        </div>
        
        {/* Share Selector */}
        {availableShares.length > 1 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cartella Condivisa:
            </label>
            <select
              value={selectedShare}
              onChange={(e) => setSelectedShare(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {availableShares.map((share) => (
                <option key={share.alias} value={share.alias}>
                  {share.alias} ({share.path}) {share.readonly ? '- Solo lettura' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setError(null)}
          >
            Chiudi
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            {/* Breadcrumbs */}
            <nav className="flex items-center space-x-1 text-sm">
              {getBreadcrumbs().map((crumb, index) => (
                <div key={crumb.path} className="flex items-center">
                  {index > 0 && <ChevronRight className="h-4 w-4 text-gray-400 mx-1" />}
                  <button
                    onClick={() => handleNavigate(crumb.path)}
                    className={clsx(
                      'px-2 py-1 rounded hover:bg-gray-100',
                      index === getBreadcrumbs().length - 1
                        ? 'text-blue-600 font-medium'
                        : 'text-gray-600'
                    )}
                  >
                    {index === 0 ? <Home className="h-4 w-4" /> : crumb.name}
                  </button>
                </div>
              ))}
            </nav>

            {/* Actions */}
            <div className="flex items-center space-x-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cerca file..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* View Mode */}
              <div className="flex border border-gray-300 rounded-md">
                <Button
                  variant={viewMode === 'list' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('list')}
                  className="rounded-r-none"
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className="rounded-l-none"
                >
                  <Grid className="h-4 w-4" />
                </Button>
              </div>

              {/* Create Button */}
              {canWrite && (
                <Button
                  onClick={() => setShowCreateDialog(true)}
                  size="sm"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nuovo
                </Button>
              )}

              {/* Refresh */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchFiles()}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* File List */}
      <Card>
        <CardContent className="p-0">
          {filteredFiles.length === 0 ? (
            <div className="text-center py-12">
              <FolderOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                {searchTerm ? 'Nessun file trovato' : 'Cartella vuota'}
              </p>
            </div>
          ) : viewMode === 'list' ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Nome
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Dimensione
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Modificato
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Azioni
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredFiles.map((file) => (
                    <tr
                      key={file.path}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => handleFileClick(file)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {file.type === 'directory' ? (
                            <FolderOpen className="h-5 w-5 text-blue-500 mr-3" />
                          ) : (
                            <File className="h-5 w-5 text-gray-400 mr-3" />
                          )}
                          <span className="text-sm font-medium text-gray-900">
                            {file.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatFileSize(file.size)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(file.modified)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center space-x-2">
                          {file.type === 'file' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(file);
                              }}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          )}
                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(file);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 p-6">
              {filteredFiles.map((file) => (
                <div
                  key={file.path}
                  className="group relative p-4 border border-gray-200 rounded-lg hover:shadow-md cursor-pointer transition-shadow"
                  onClick={() => handleFileClick(file)}
                >
                  <div className="flex flex-col items-center text-center">
                    {file.type === 'directory' ? (
                      <FolderOpen className="h-12 w-12 text-blue-500 mb-2" />
                    ) : (
                      <File className="h-12 w-12 text-gray-400 mb-2" />
                    )}
                    <span className="text-sm font-medium text-gray-900 truncate w-full">
                      {file.name}
                    </span>
                    <span className="text-xs text-gray-500 mt-1">
                      {formatFileSize(file.size)}
                    </span>
                  </div>
                  
                  {/* Actions overlay */}
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="flex space-x-1">
                      {file.type === 'file' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(file);
                          }}
                          className="h-6 w-6 p-0 bg-white shadow-sm"
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      )}
                      {canWrite && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(file);
                          }}
                          className="h-6 w-6 p-0 bg-white shadow-sm"
                        >
                          <Trash2 className="h-3 w-3 text-red-500" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">
              {createType === 'folder' ? 'Nuova Cartella' : 'Nuovo File'}
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tipo:
              </label>
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="folder"
                    checked={createType === 'folder'}
                    onChange={(e) => setCreateType(e.target.value as 'folder' | 'file')}
                    className="mr-2"
                  />
                  Cartella
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="file"
                    checked={createType === 'file'}
                    onChange={(e) => setCreateType(e.target.value as 'folder' | 'file')}
                    className="mr-2"
                  />
                  File
                </label>
              </div>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Nome:
              </label>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder={createType === 'folder' ? 'Nome cartella' : 'Nome file (es. documento.txt)'}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                onKeyPress={(e) => e.key === 'Enter' && handleCreateItem()}
              />
            </div>
            
            {createType === 'file' && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <p className="text-sm text-blue-800">
                  💡 Suggerimento: Includi l'estensione nel nome (es. .txt, .md, .json)
                </p>
              </div>
            )}
            
            <div className="flex justify-end space-x-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setNewItemName('');
                }}
              >
                Annulla
              </Button>
              <Button
                onClick={handleCreateItem}
                disabled={!newItemName.trim()}
              >
                Crea {createType === 'folder' ? 'Cartella' : 'File'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}