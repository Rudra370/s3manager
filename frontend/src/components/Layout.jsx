import React, { useState, useRef } from 'react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import {
  AppBar,
  Box,
  Toolbar,
  Typography,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  Avatar,
  Tooltip,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  Cloud as CloudIcon,
  Logout as LogoutIcon,
  AccountCircle as AccountCircleIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  People as PeopleIcon,
  Link as LinkIcon,
  Storage as StorageIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

import { useAuth } from '../contexts/AuthContext';
import { useThemeMode } from '../contexts/ThemeContext';
import { useAppConfig } from '../contexts/AppConfigContext';
import { useStorageConfig } from '../contexts/StorageConfigContext';
import { storageConfigsApi } from '../services/api';

const Layout = () => {
  const { user, logout } = useAuth();
  const { mode, toggleTheme } = useThemeMode();
  const { headingText, logoUrl } = useAppConfig();
  const { storageConfigs, currentStorageConfig, setStorageConfig, refreshStorageConfigs } = useStorageConfig();
  const navigate = useNavigate();
  const avatarButtonRef = useRef(null);
  const [anchorEl, setAnchorEl] = useState(null);
  const [storageAnchorEl, setStorageAnchorEl] = useState(null);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleStorageMenuOpen = (event) => {
    setStorageAnchorEl(event.currentTarget);
  };

  const handleStorageMenuClose = () => {
    setStorageAnchorEl(null);
  };

  const handleStorageConfigSelect = (config) => {
    handleStorageMenuClose();

    // if id is same then return
    if (currentStorageConfig?.id === config.id) return;

    setStorageConfig(config);
    // Refresh the page to reload data with new storage config
    window.location.reload();
  };

  const handleManageStorageConfigs = () => {
    setStorageAnchorEl(null);
    navigate('/storage-configs');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="fixed" elevation={0}>
        <Toolbar sx={{ px: 3 }}>
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Logo"
              style={{
                height: 24,
                width: 24,
                marginRight: 12,
                objectFit: 'contain',
                borderRadius: 4,
              }}
            />
          ) : (
            <CloudIcon sx={{ mr: 1.5, fontSize: 24, color: 'text.primary' }} />
          )}
          <Link to="/dashboard" style={{ textDecoration: 'none', color: 'inherit' }}>
            <Typography
              variant="h6"
              noWrap
              sx={{
                fontWeight: 600,
                fontSize: '1.125rem',
                color: (theme) => theme.palette.mode === 'dark' ? '#F0F6FC' : '#1F2328',
              }}
            >
              {headingText}
            </Typography>
          </Link>
          <Box sx={{ flexGrow: 1 }} />

          {/* Storage Config Dropdown */}
          <Tooltip title="Select Storage Configuration">
            <IconButton
              onClick={handleStorageMenuOpen}
              sx={{
                mr: 1,
                color: 'text.secondary',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                borderRadius: 1, // Override default 50% to make hover background rectangular
                px: 1,
              }}
            >
              <StorageIcon sx={{ fontSize: 20 }} />
              <Typography
                variant="body2"
                sx={{
                  maxWidth: 120,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  fontSize: '0.875rem',
                }}
              >
                {currentStorageConfig?.name || 'Storage'}
              </Typography>
            </IconButton>
          </Tooltip>
          <Menu
            id="storage-config-menu"
            anchorEl={storageAnchorEl}
            open={storageAnchorEl !== null}
            hidden={storageAnchorEl === null}
            onClose={handleStorageMenuClose}
            MenuListProps={{
              dense: true,
            }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1.5,
                  minWidth: 240,
                },
              },
            }}
          >
            <MenuItem disabled sx={{ opacity: 1 }}>
              <StorageIcon sx={{ mr: 1.5, color: 'text.secondary', fontSize: 20 }} />
              <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500 }}>
                Storage Configurations
              </Typography>
            </MenuItem>
            <Divider />
            {storageConfigs.map((config) => (
              <MenuItem
                key={config.id}
                onClick={() => handleStorageConfigSelect(config)}
                selected={currentStorageConfig?.id === config.id}
              >
                <ListItemIcon>
                  {currentStorageConfig?.id === config.id ? (
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        backgroundColor: 'primary.main',
                        ml: 0.5,
                      }}
                    />
                  ) : (
                    <Box sx={{ width: 8, height: 8, ml: 0.5 }} />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={config.name}
                  primaryTypographyProps={{
                    variant: 'body2',
                    fontWeight: currentStorageConfig?.id === config.id ? 500 : 400,
                  }}
                />
              </MenuItem>
            ))}
            {user?.is_admin && (
              <>
                <Divider />
                <MenuItem
                  onClick={handleManageStorageConfigs}
                >
                  <ListItemIcon>
                    <SettingsIcon sx={{ fontSize: 20 }} />
                  </ListItemIcon>
                  <ListItemText primary="Manage Storage Configs" />
                </MenuItem>
              </>
            )}
          </Menu>

          {/* Theme Toggle Button */}
          <Tooltip title={`Switch to ${mode === 'dark' ? 'light' : 'dark'} mode`}>
            <IconButton
              onClick={toggleTheme}
              sx={{
                mr: 1,
                color: 'text.secondary',
              }}
            >
              {mode === 'dark' ? (
                <LightModeIcon sx={{ fontSize: 20 }} />
              ) : (
                <DarkModeIcon sx={{ fontSize: 20 }} />
              )}
            </IconButton>
          </Tooltip>

          <IconButton
            ref={avatarButtonRef}
            onClick={handleMenuOpen}
            size="small"
            sx={{ p: 0.5 }}
          >
            <Avatar
              sx={{
                width: 32,
                height: 32,
                fontWeight: 500,
                fontSize: '0.875rem',
              }}
            >
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </Avatar>
          </IconButton>
          <Menu
            id='account-menu'
            anchorEl={anchorEl}
            open={anchorEl !== null}
            hidden={anchorEl === null}
            onClose={handleMenuClose}
            MenuListProps={{
              dense: true,
            }}
            slotProps={{
              paper: {
                sx: {
                  mt: 1.5,
                  minWidth: 200,
                },
              },
            }}
          >
            <MenuItem disabled sx={{ opacity: 1, borderRadius: 0 }}>
              <AccountCircleIcon sx={{ mr: 1.5, color: 'text.secondary', fontSize: 20 }} />
              <Typography variant="body2" sx={{ color: 'text.primary' }}>
                {user?.email}
              </Typography>
            </MenuItem>
            <Divider />
            {user?.is_admin && (
              <MenuItem
                onClick={() => {
                  setAnchorEl(null);
                  navigate('/users');
                }}
                sx={{ borderRadius: 0 }}
              >
                <PeopleIcon sx={{ mr: 1.5, fontSize: 20 }} />
                User Management
              </MenuItem>
            )}
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                navigate('/shares');
              }}
              sx={{ borderRadius: 0 }}
            >
              <LinkIcon sx={{ mr: 1.5, fontSize: 20 }} />
              Shared Links
            </MenuItem>
            <MenuItem
              onClick={() => {
                toggleTheme();
                setAnchorEl(null);
              }}
              sx={{ borderRadius: 0 }}
            >
              {mode === 'dark' ? (
                <>
                  <LightModeIcon sx={{ mr: 1.5, fontSize: 20 }} />
                  Light mode
                </>
              ) : (
                <>
                  <DarkModeIcon sx={{ mr: 1.5, fontSize: 20 }} />
                  Dark mode
                </>
              )}
            </MenuItem>
            <Divider />
            <MenuItem
              onClick={() => {
                setAnchorEl(null);
                logout();
                navigate('/login');
              }}
              sx={{ borderRadius: 0 }}
            >
              <LogoutIcon sx={{ mr: 1.5, fontSize: 20 }} />
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          pt: 10,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
