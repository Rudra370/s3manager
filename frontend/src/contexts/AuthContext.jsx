import React, { createContext, useState, useContext, useEffect } from 'react';
import api, { authApi } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children, setupComplete }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for valid session on mount
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const response = await authApi.getMe();
      setUser(response.data);
    } catch (error) {
      // Not authenticated or session expired
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchUser = async () => {
    try {
      const response = await authApi.getMe();
      setUser(response.data);
    } catch (error) {
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    const response = await authApi.login(email, password);
    const { access_token } = response.data;
    
    // Cookie is set by backend automatically
    await fetchUser();
    return true;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch (error) {
      // Silent fail - user is already being logged out
    }
    setUser(null);
  };

  const setup = async (setupData) => {
    const response = await api.post('/api/admin/setup', setupData);
    const { user: newUser } = response.data;
    
    // Cookie is set by backend automatically
    setUser(newUser);
    
    return true;
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isAdmin: user?.is_admin || false,
    login,
    logout,
    setup,
    loading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
