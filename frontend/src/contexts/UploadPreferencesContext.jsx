import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 's3manager_upload_preferences';

// Default values matching the current implementation
const DEFAULT_PREFERENCES = {
  // Multipart threshold in MB (when to start using multipart)
  multipartThresholdMb: 100,
  
  // Chunk size in MB (size of each part)
  chunkSizeMb: 10,
  
  // Number of parallel uploads
  parallelChunks: 3,
  
  // Enable/disable gzip compression
  gzipCompression: true,
};

// Validation limits
const LIMITS = {
  multipartThresholdMb: { min: 5, max: 1000 },
  chunkSizeMb: { min: 5, max: 100 },
  parallelChunks: { min: 1, max: 10 },
};

const UploadPreferencesContext = createContext(null);

export const UploadPreferencesProvider = ({ children }) => {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Merge with defaults to ensure all keys exist
        setPreferences(prev => ({
          ...prev,
          ...parsed,
        }));
      }
    } catch (error) {
      console.error('Failed to load upload preferences:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever preferences change
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
      } catch (error) {
        console.error('Failed to save upload preferences:', error);
      }
    }
  }, [preferences, isLoaded]);

  const updatePreference = useCallback((key, value) => {
    setPreferences(prev => {
      // Validate value against limits
      if (LIMITS[key]) {
        const { min, max } = LIMITS[key];
        value = Math.max(min, Math.min(max, value));
      }
      return { ...prev, [key]: value };
    });
  }, []);

  const updatePreferences = useCallback((updates) => {
    setPreferences(prev => {
      const newPrefs = { ...prev };
      Object.entries(updates).forEach(([key, value]) => {
        if (LIMITS[key]) {
          const { min, max } = LIMITS[key];
          newPrefs[key] = Math.max(min, Math.min(max, value));
        } else {
          newPrefs[key] = value;
        }
      });
      return newPrefs;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
  }, []);

  // Helper to get values in bytes for API calls
  const getBytes = useCallback((key) => {
    return preferences[key] * 1024 * 1024;
  }, [preferences]);

  const value = {
    preferences,
    isLoaded,
    updatePreference,
    updatePreferences,
    resetPreferences,
    getBytes,
    limits: LIMITS,
    defaults: DEFAULT_PREFERENCES,
  };

  return (
    <UploadPreferencesContext.Provider value={value}>
      {children}
    </UploadPreferencesContext.Provider>
  );
};

export const useUploadPreferences = () => {
  const context = useContext(UploadPreferencesContext);
  if (!context) {
    throw new Error('useUploadPreferences must be used within UploadPreferencesProvider');
  }
  return context;
};

export default UploadPreferencesContext;
