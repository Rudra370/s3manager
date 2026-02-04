import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
} from '@mui/material';
import {
  Cloud as CloudIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Visibility as VisibilityIcon,
  VisibilityOff as VisibilityOffIcon,
} from '@mui/icons-material';

import { useAuth } from '../contexts/AuthContext';
import { useSnackbar } from '../contexts/SnackbarContext';
import { useThemeMode } from '../contexts/ThemeContext';

const LoginPage = () => {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const { showSnackbar } = useSnackbar();
  const { mode, toggleTheme } = useThemeMode();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email || !password) {
      showSnackbar('Please enter email and password', 'error');
      return;
    }

    setLoading(true);

    try {
      await login(email, password);
      showSnackbar('Login successful!', 'success');
      navigate('/dashboard');
    } catch (error) {
      showSnackbar(
        error.response?.data?.detail || 'Login failed. Please try again.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default',
        p: 2,
        position: 'relative',
      }}
    >
      {/* Theme Toggle - Fixed position */}
      <IconButton
        onClick={toggleTheme}
        sx={{
          position: 'fixed',
          top: 16,
          right: 16,
          color: 'text.secondary',
          zIndex: 9999,
        }}
        aria-label="toggle theme"
      >
        {mode === 'dark' ? (
          <LightModeIcon />
        ) : (
          <DarkModeIcon />
        )}
      </IconButton>

      <Card sx={{ maxWidth: 400, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Box display="flex" alignItems="center" justifyContent="center" mb={3}>
            <CloudIcon sx={{ fontSize: 48, color: 'primary.main', mr: 1 }} />
            <Typography variant="h4" component="h1">
              S3 Manager
            </Typography>
          </Box>

          <Typography variant="h5" align="center" gutterBottom>
            Sign In
          </Typography>

          <Typography variant="body2" color="text.secondary" align="center" mb={3}>
            Enter your credentials to access your storage
          </Typography>

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              margin="normal"
              required
              autoFocus
              sx={{
                '& .MuiOutlinedInput-root': {
                  transition: 'none',
                  '& fieldset': {
                    transition: 'border-color 0.15s ease',
                  },
                },
              }}
            />
            <TextField
              fullWidth
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              required
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={handleTogglePasswordVisibility}
                      edge="end"
                      size="small"
                    >
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  transition: 'none',
                  '& fieldset': {
                    transition: 'border-color 0.15s ease',
                  },
                },
              }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? <CircularProgress size={24} /> : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};

export default LoginPage;
