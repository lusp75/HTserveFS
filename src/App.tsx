import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import LoginForm from '@/components/auth/LoginForm';
import Layout from '@/components/layout/Layout';
import Dashboard from '@/pages/Dashboard';
import FileExplorer from '@/pages/FileExplorer';
import Monitoring from '@/pages/Monitoring';
import UserManagement from '@/pages/UserManagement';
import Settings from '@/pages/Settings';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, verifyToken } = useAuthStore();

  useEffect(() => {
    verifyToken();
  }, [verifyToken]);

  if (!isAuthenticated) {
    return <LoginForm />;
  }

  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<LoginForm />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/files" element={
          <ProtectedRoute>
            <FileExplorer />
          </ProtectedRoute>
        } />

        <Route path="/monitor" element={
          <ProtectedRoute>
            <Monitoring />
          </ProtectedRoute>
        } />
        <Route path="/users" element={
          <ProtectedRoute>
            <UserManagement />
          </ProtectedRoute>
        } />

        <Route path="/settings" element={
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
