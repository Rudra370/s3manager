import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { adminApi } from '../services/api';

const AppConfigContext = createContext(null);

export const AppConfigProvider = ({ children, initialConfig }) => {
  const [config, setConfig] = useState({
    heading_text: 'S3 Manager',
    logo_url: null,
  });
  const [loading, setLoading] = useState(true);
  const [configVersion, setConfigVersion] = useState(0); // Used to trigger re-fetch
  const isMountedRef = useRef(true);

  // Track mount status for cleanup
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const applyConfig = (configData) => {
    setConfig({
      heading_text: configData.heading_text || 'S3 Manager',
      logo_url: configData.logo_url,
    });
    
    // Update document title
    document.title = configData.heading_text || 'S3 Manager';
    
    // Update favicon if logo_url is provided
    if (configData.logo_url) {
      updateFavicon(configData.logo_url);
    }
  };

  const fetchConfig = useCallback(async () => {
    try {
      const response = await adminApi.getAppConfig();
      
      if (!isMountedRef.current) return;
      
      applyConfig(response.data);
    } catch (error) {
      if (!isMountedRef.current) return;
      
      // Use defaults on error
      setConfig({
        heading_text: 'S3 Manager',
        logo_url: null,
      });
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const refreshConfig = () => {
    setConfigVersion(v => v + 1);
  };

  const updateFavicon = (url) => {
    // Only update if URL has changed
    const existingFavicon = document.querySelector("link[rel='icon']");
    if (existingFavicon && existingFavicon.href === url) {
      return; // No change needed
    }
    
    // Remove existing favicon
    if (existingFavicon) {
      existingFavicon.remove();
    }
    
    // Create new favicon link
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = url;
    document.head.appendChild(link);
  };

  useEffect(() => {
    if (initialConfig && configVersion === 0) {
      // Use initial config from setup-status API on first load
      applyConfig(initialConfig);
      setLoading(false);
    } else {
      fetchConfig();
    }
  }, [initialConfig, configVersion, fetchConfig]);

  const value = {
    headingText: config.heading_text,
    logoUrl: config.logo_url,
    loading,
    refreshConfig,
  };

  return <AppConfigContext.Provider value={value}>{children}</AppConfigContext.Provider>;
};

export const useAppConfig = () => {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error('useAppConfig must be used within an AppConfigProvider');
  }
  return context;
};

export default AppConfigContext;
