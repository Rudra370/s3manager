import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';

import { AuthProvider, useAuth } from './contexts/AuthContext';
import { SnackbarProvider } from './contexts/SnackbarContext';
import { AppConfigProvider } from './contexts/AppConfigContext';
import { StorageConfigProvider } from './contexts/StorageConfigContext';
import { ErrorProvider } from './contexts/ErrorContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';

import api from './services/api';

// Lazy load page components
const SetupPage = lazy(() => import('./pages/SetupPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const BucketPage = lazy(() => import('./pages/BucketPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const SharesPage = lazy(() => import('./pages/SharesPage'));
const ShareAccessPage = lazy(() => import('./pages/ShareAccessPage'));
const StorageConfigsPage = lazy(() => import('./pages/StorageConfigsPage'));

// Loading fallback component
const PageLoader = () => (
  <Box
    display="flex"
    justifyContent="center"
    alignItems="center"
    minHeight="100vh"
  >
    <CircularProgress />
  </Box>
);

// Inner component that has access to auth context
const AppRoutes = ({ setupComplete, onSetupComplete, initialAppConfig }) => {
  const { isAuthenticated } = useAuth();

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Root route - smart redirect based on auth and setup status */}
        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : setupComplete ? (
              <Navigate to="/login" replace />
            ) : (
              <Navigate to="/setup" replace />
            )
          }
        />

        {/* Setup Route - only accessible if setup not complete */}
        <Route
          path="/setup"
          element={
            setupComplete ? <Navigate to="/login" replace /> : <SetupPage onSetupComplete={onSetupComplete} />
          }
        />

        {/* Login Route - redirect to setup if not complete, or dashboard if authenticated */}
        <Route 
          path="/login" 
          element={
            !setupComplete ? (
              <Navigate to="/setup" replace />
            ) : isAuthenticated ? (
              <Navigate to="/dashboard" replace />
            ) : (
              <LoginPage />
            )
          } 
        />

        {/* Protected Routes */}
        <Route element={<ProtectedRoute setupComplete={setupComplete} />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/bucket/:bucketName" element={<BucketPage />} />
            <Route path="/bucket/:bucketName/*" element={<BucketPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/shares" element={<SharesPage />} />
            <Route path="/storage-configs" element={<StorageConfigsPage />} />
          </Route>
        </Route>

        {/* Public Routes (no auth required) */}
        <Route path="/s/:token" element={<ShareAccessPage />} />

        {/* Catch all - redirect to root */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(false);
  const [initialAppConfig, setInitialAppConfig] = useState(null);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const response = await api.get('/api/admin/setup-status');
      setSetupComplete(response.data.setup_complete);
      if (response.data.app_config) {
        setInitialAppConfig(response.data.app_config);
      }
    } catch (error) {
      setSetupComplete(false);
    } finally {
      setLoading(false);
    }
  };

  const handleSetupComplete = () => {
    setSetupComplete(true);
  };

  if (loading) {
    return <PageLoader />;
  }

  return (
    <SnackbarProvider>
      <ErrorProvider>
        <AuthProvider setupComplete={setupComplete}>
          <StorageConfigProvider>
            <AppConfigProvider initialConfig={initialAppConfig}>
              <AppRoutes 
                setupComplete={setupComplete} 
                onSetupComplete={handleSetupComplete} 
                initialAppConfig={initialAppConfig}
              />
            </AppConfigProvider>
          </StorageConfigProvider>
        </AuthProvider>
      </ErrorProvider>
    </SnackbarProvider>
  );
}

export default App;
