/**
 * User Management Page
 * Gestione utenti e ruoli (solo per amministratori)
 */

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  Users,
  Plus,
  Edit3,
  Trash2,
  Shield,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle,
  X,
  Search,
  Filter
} from 'lucide-react';
import { clsx } from 'clsx';

interface User {
  username: string;
  role: 'admin' | 'read-write' | 'read-only';
  createdAt?: string;
  lastLogin?: string;
  isActive?: boolean;
}

interface CreateUserForm {
  username: string;
  password: string;
  confirmPassword: string;
  role: 'admin' | 'read-write' | 'read-only';
}

interface EditUserForm {
  username: string;
  role: 'admin' | 'read-write' | 'read-only';
  newPassword?: string;
  confirmPassword?: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [createForm, setCreateForm] = useState<CreateUserForm>({
    username: '',
    password: '',
    confirmPassword: '',
    role: 'read-only'
  });
  
  const [editForm, setEditForm] = useState<EditUserForm>({
    username: '',
    role: 'read-only',
    newPassword: '',
    confirmPassword: ''
  });
  
  const { token, user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const fetchUsers = async () => {
    if (!token || !isAdmin) return;
    
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/users', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setUsers(data.users || []);
        } else {
          setError(data.message || 'Errore nel caricamento degli utenti');
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
    fetchUsers();
  }, [token, isAdmin]);

  const handleCreateUser = async () => {
    if (!token || !isAdmin) return;
    
    // Validation
    if (!createForm.username.trim()) {
      setError('Il nome utente è obbligatorio');
      return;
    }
    
    if (createForm.password.length < 6) {
      setError('La password deve essere di almeno 6 caratteri');
      return;
    }
    
    if (createForm.password !== createForm.confirmPassword) {
      setError('Le password non corrispondono');
      return;
    }
    
    try {
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: createForm.username,
          password: createForm.password,
          role: createForm.role
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setShowCreateDialog(false);
          setCreateForm({
            username: '',
            password: '',
            confirmPassword: '',
            role: 'read-only'
          });
          fetchUsers();
        } else {
          setError(data.message || 'Errore nella creazione dell\'utente');
        }
      } else {
        setError('Errore nella richiesta');
      }
    } catch (err) {
      setError('Errore di connessione');
    }
  };

  const handleEditUser = async () => {
    if (!token || !isAdmin || !editingUser) return;
    
    // Validation
    if (editForm.newPassword && editForm.newPassword.length < 6) {
      setError('La nuova password deve essere di almeno 6 caratteri');
      return;
    }
    
    if (editForm.newPassword && editForm.newPassword !== editForm.confirmPassword) {
      setError('Le password non corrispondono');
      return;
    }
    
    try {
      const updateData: any = {
        role: editForm.role
      };
      
      if (editForm.newPassword) {
        updateData.password = editForm.newPassword;
      }
      
      const response = await fetch(`/api/users/${editingUser.username}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setShowEditDialog(false);
          setEditingUser(null);
          setEditForm({
            username: '',
            role: 'read-only',
            newPassword: '',
            confirmPassword: ''
          });
          fetchUsers();
        } else {
          setError(data.message || 'Errore nell\'aggiornamento dell\'utente');
        }
      } else {
        setError('Errore nella richiesta');
      }
    } catch (err) {
      setError('Errore di connessione');
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!token || !isAdmin) return;
    
    if (username === user?.username) {
      setError('Non puoi eliminare il tuo stesso account');
      return;
    }
    
    if (!confirm(`Sei sicuro di voler eliminare l'utente "${username}"?`)) {
      return;
    }
    
    try {
      const response = await fetch(`/api/users/${username}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          fetchUsers();
        } else {
          setError(data.message || 'Errore nell\'eliminazione dell\'utente');
        }
      } else {
        setError('Errore nella richiesta');
      }
    } catch (err) {
      setError('Errore di connessione');
    }
  };

  const openEditDialog = (userToEdit: User) => {
    setEditingUser(userToEdit);
    setEditForm({
      username: userToEdit.username,
      role: userToEdit.role,
      newPassword: '',
      confirmPassword: ''
    });
    setShowEditDialog(true);
  };

  const getRoleColor = (role: string): string => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'read-write': return 'bg-blue-100 text-blue-800';
      case 'read-only': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin': return <Shield className="h-4 w-4" />;
      case 'read-write': return <Edit3 className="h-4 w-4" />;
      case 'read-only': return <Eye className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
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
            Solo gli amministratori possono gestire gli utenti.
          </p>
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
            <h1 className="text-2xl font-bold text-gray-900">Gestione Utenti</h1>
            <p className="mt-2 text-gray-600">
              Crea, modifica ed elimina utenti del sistema
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuovo Utente
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-800">{error}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setError(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Cerca utenti..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Tutti i ruoli</option>
                <option value="admin">Amministratori</option>
                <option value="read-write">Lettura/Scrittura</option>
                <option value="read-only">Solo Lettura</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Users List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            Utenti ({filteredUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-500">Caricamento utenti...</p>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">
                {searchTerm || roleFilter !== 'all' ? 'Nessun utente trovato' : 'Nessun utente presente'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Utente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ruolo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ultimo Accesso
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stato
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Azioni
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredUsers.map((userItem) => (
                    <tr key={userItem.username} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8">
                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-sm font-medium text-blue-600">
                                {userItem.username.charAt(0).toUpperCase()}
                              </span>
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {userItem.username}
                              {userItem.username === user?.username && (
                                <span className="ml-2 text-xs text-blue-600">(Tu)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className={clsx(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                            getRoleColor(userItem.role)
                          )}>
                            {getRoleIcon(userItem.role)}
                            <span className="ml-1">
                              {userItem.role === 'admin' && 'Amministratore'}
                              {userItem.role === 'read-write' && 'Lettura/Scrittura'}
                              {userItem.role === 'read-only' && 'Solo Lettura'}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {userItem.lastLogin ? new Date(userItem.lastLogin).toLocaleString('it-IT') : 'Mai'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={clsx(
                          'inline-flex items-center px-2 py-1 rounded-full text-xs font-medium',
                          userItem.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        )}>
                          {userItem.isActive !== false ? (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Attivo
                            </>
                          ) : (
                            <>
                              <X className="h-3 w-3 mr-1" />
                              Inattivo
                            </>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(userItem)}
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          {userItem.username !== user?.username && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteUser(userItem.username)}
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
          )}
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Crea Nuovo Utente
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nome Utente
                </label>
                <input
                  type="text"
                  value={createForm.username}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Nome utente"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={createForm.password}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, password: e.target.value }))}
                    placeholder="Password (min. 6 caratteri)"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Conferma Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={createForm.confirmPassword}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Conferma password"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ruolo
                </label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm(prev => ({ ...prev, role: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="read-only">Solo Lettura</option>
                  <option value="read-write">Lettura/Scrittura</option>
                  <option value="admin">Amministratore</option>
                </select>
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateDialog(false);
                  setCreateForm({
                    username: '',
                    password: '',
                    confirmPassword: '',
                    role: 'read-only'
                  });
                  setError(null);
                }}
              >
                Annulla
              </Button>
              <Button
                onClick={handleCreateUser}
                disabled={!createForm.username.trim() || !createForm.password || !createForm.confirmPassword}
              >
                Crea Utente
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Dialog */}
      {showEditDialog && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Modifica Utente: {editingUser.username}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ruolo
                </label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm(prev => ({ ...prev, role: e.target.value as any }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="read-only">Solo Lettura</option>
                  <option value="read-write">Lettura/Scrittura</option>
                  <option value="admin">Amministratore</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nuova Password (opzionale)
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={editForm.newPassword}
                    onChange={(e) => setEditForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    placeholder="Lascia vuoto per non modificare"
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                  </button>
                </div>
              </div>
              
              {editForm.newPassword && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Conferma Nuova Password
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={editForm.confirmPassword}
                      onChange={(e) => setEditForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="Conferma nuova password"
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-end space-x-3 mt-6">
              <Button
                variant="outline"
                onClick={() => {
                  setShowEditDialog(false);
                  setEditingUser(null);
                  setEditForm({
                    username: '',
                    role: 'read-only',
                    newPassword: '',
                    confirmPassword: ''
                  });
                  setError(null);
                }}
              >
                Annulla
              </Button>
              <Button onClick={handleEditUser}>
                Salva Modifiche
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}