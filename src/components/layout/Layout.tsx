/**
 * Main Layout Component
 * Layout principale dell'applicazione con sidebar e header
 */

import { useState, ReactNode, useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/Button';
import { APP_VERSION } from '@/constants/version';
import {
  Home,
  FolderOpen,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Monitor
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { clsx } from 'clsx';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  readWriteAllowed?: boolean;
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'File Explorer', href: '/files', icon: FolderOpen },
  { name: 'Monitoraggio', href: '/monitor', icon: Monitor, readWriteAllowed: true },
  { name: 'Utenti', href: '/users', icon: Users, adminOnly: true },
  { name: 'Impostazioni', href: '/settings', icon: Settings, readWriteAllowed: true },
];

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const location = useLocation();

  // Update page title dynamically
  useEffect(() => {
    document.title = `HTServeFS ${APP_VERSION}`;
  }, []);

  const handleLogout = () => {
    logout();
  };

  const filteredNavigation = navigation.filter(item => {
    // Ensure user exists to prevent null conversion errors
    if (!user) return false;
    
    // Admin può vedere tutto
    if (user.role === 'admin') return true;
    
    // Read-write può vedere pagine base + quelle con readWriteAllowed
    if (user.role === 'read-write') {
      return !item.adminOnly && (item.readWriteAllowed || (!item.adminOnly && !item.readWriteAllowed));
    }
    
    // Read-only può vedere solo Dashboard e File Explorer
    return !item.adminOnly && !item.readWriteAllowed;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={clsx(
        'fixed inset-0 z-50 lg:hidden',
        sidebarOpen ? 'block' : 'hidden'
      )}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white">
          <div className="flex h-16 items-center justify-between px-4">
            <div className="flex items-center">
              <div className="flex flex-col">
                <div className="flex items-center">
                  <img src="/htservefs-icon.svg" alt="HtserveFS" className="h-8 w-8" />
                  <span className="ml-2 text-xl font-bold text-gray-900">HtserveFS</span>
                </div>
                <div className="ml-10 -mt-1">
                  <span className="text-xs font-medium text-red-500">{APP_VERSION}</span>
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {filteredNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'group flex items-center px-2 py-2 text-sm font-medium rounded-md',
                    isActive
                      ? 'bg-blue-100 text-blue-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon
                    className={clsx(
                      'mr-3 h-5 w-5',
                      isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
                    )}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-blue-600">
                    {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
                  </span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">{user?.username || 'Unknown'}</p>
                <p className="text-xs text-gray-500">{user?.role || 'guest'}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="mt-3 w-full justify-start"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          <div className="flex h-16 items-center px-4">
            <div className="flex flex-col">
              <div className="flex items-center">
                <img src="/htservefs-icon.svg" alt="HtserveFS" className="h-8 w-8" />
                <span className="ml-2 text-xl font-bold text-gray-900">HtserveFS</span>
              </div>
              <div className="ml-10 -mt-1">
                <span className="text-xs font-medium text-red-500">{APP_VERSION}</span>
              </div>
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {filteredNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={clsx(
                    'group flex items-center px-2 py-2 text-sm font-medium rounded-md',
                    isActive
                      ? 'bg-blue-100 text-blue-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <item.icon
                    className={clsx(
                      'mr-3 h-5 w-5',
                      isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
                    )}
                  />
                  {item.name}
                </Link>
              );
            })}
          </nav>
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-blue-600">
                    {user?.username ? user.username.charAt(0).toUpperCase() : 'U'}
                  </span>
                </div>
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">{user?.username || 'Unknown'}</p>
                <p className="text-xs text-gray-500">{user?.role || 'guest'}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              className="mt-3 w-full justify-start"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 flex h-16 bg-white shadow-sm border-b border-gray-200">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden ml-4"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-6 w-6" />
          </Button>
          <div className="flex flex-1 justify-between px-4 lg:px-6">
            <div className="flex flex-1 items-center">
              <h1 className="text-lg font-semibold text-gray-900">
                {(() => {
                  const currentPage = filteredNavigation.find(item => item.href === location.pathname);
                  return currentPage?.name || 'HtserveFS';
                })()}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-2">
                <div className="h-2 w-2 bg-green-400 rounded-full"></div>
                <span className="text-sm text-gray-500">Online</span>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          <div className="py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}