import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { storageConfigsApi } from '../services/api';
import { useAuth } from './AuthContext';

const StorageConfigContext = createContext(null);

const STORAGE_CONFIG_KEY = 'selectedStorageConfigId';

export const StorageConfigProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [storageConfigs, setStorageConfigs] = useState([]);
  const [currentStorageConfig, setCurrentStorageConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const isMountedRef = useRef(true);

  // Track mount status for cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load storage configs from API
  const fetchStorageConfigs = useCallback(async () => {
    try {
      setError(null);
      const response = await storageConfigsApi.list();
      
      if (!isMountedRef.current) return [];
      
      const configs = response.data.configs || [];
      setStorageConfigs(configs);
      return configs;
    } catch (err) {
      if (!isMountedRef.current) return [];
      
      setError('Failed to load storage configurations');
      return [];
    }
  }, []);

  // Set current storage config
  const setStorageConfig = useCallback((config) => {
    if (config) {
      setCurrentStorageConfig(config);
      localStorage.setItem(STORAGE_CONFIG_KEY, config.id.toString());
    } else {
      setCurrentStorageConfig(null);
      localStorage.removeItem(STORAGE_CONFIG_KEY);
    }
  }, []);

  // Refresh storage configs and restore selection
  const refreshStorageConfigs = useCallback(async () => {
    setLoading(true);
    const configs = await fetchStorageConfigs();
    
    if (!isMountedRef.current) return;
    
    if (configs.length === 0) {
      setCurrentStorageConfig(null);
      setLoading(false);
      return;
    }

    // Try to restore from localStorage
    const savedId = localStorage.getItem(STORAGE_CONFIG_KEY);
    if (savedId) {
      const savedConfig = configs.find(c => c.id.toString() === savedId);
      if (savedConfig) {
        setCurrentStorageConfig(savedConfig);
      } else {
        // Saved config no longer exists, default to first
        setCurrentStorageConfig(configs[0]);
        localStorage.setItem(STORAGE_CONFIG_KEY, configs[0].id.toString());
      }
    } else {
      // No saved config, default to first
      setCurrentStorageConfig(configs[0]);
      localStorage.setItem(STORAGE_CONFIG_KEY, configs[0].id.toString());
    }
    
    if (isMountedRef.current) {
      setLoading(false);
    }
  }, [fetchStorageConfigs]);

  // Load when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      refreshStorageConfigs();
    } else {
      // Clear storage configs when logged out
      setStorageConfigs([]);
      setCurrentStorageConfig(null);
      setLoading(false);
    }
  }, [isAuthenticated, refreshStorageConfigs]);

  const value = {
    storageConfigs,
    currentStorageConfig,
    loading,
    error,
    setStorageConfig,
    refreshStorageConfigs,
  };

  return (
    <StorageConfigContext.Provider value={value}>
      {children}
    </StorageConfigContext.Provider>
  );
};

export const useStorageConfig = () => {
  const context = useContext(StorageConfigContext);
  if (!context) {
    throw new Error('useStorageConfig must be used within a StorageConfigProvider');
  }
  return context;
};

export default StorageConfigContext;
