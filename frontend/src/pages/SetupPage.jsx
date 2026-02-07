import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Stepper,
  Step,
  StepLabel,
  Grid,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  IconButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
} from '@mui/material';
import {
  Cloud as CloudIcon,
  DarkMode as DarkModeIcon,
  LightMode as LightModeIcon,
  Settings as SettingsIcon,
} from '@mui/icons-material';

import { useAuth } from '../contexts/AuthContext';
import { useSnackbar } from '../contexts/SnackbarContext';
import { useThemeMode } from '../contexts/ThemeContext';
import { useAppConfig } from '../contexts/AppConfigContext';

const steps = ['Admin Account', 'S3 Configuration', 'Customization'];

// Example key-value pairs for quick setup
const quickSetupExample = `# Paste your configuration in KEY=VALUE format
# Required fields:
ADMIN_NAME=Admin User
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=securepassword123

STORAGE_NAME=My S3 Storage
ENDPOINT_URL=https://s3.amazonaws.com
ACCESS_KEY=AKIAIOSFODNN7EXAMPLE
SECRET_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
REGION=us-east-1
USE_SSL=true
VERIFY_SSL=true

# Optional:
HEADING_TEXT=My S3 Manager
LOGO_URL=https://example.com/logo.png`;

const SetupPage = ({ onSetupComplete }) => {
  const navigate = useNavigate();
  const { setup } = useAuth();
  const { showSnackbar } = useSnackbar();
  const { mode, toggleTheme } = useThemeMode();
  const { refreshConfig } = useAppConfig();

  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Quick setup mode
  const [quickSetupOpen, setQuickSetupOpen] = useState(false);
  const [quickSetupText, setQuickSetupText] = useState(quickSetupExample);
  const [quickSetupError, setQuickSetupError] = useState('');

  // Admin account fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // S3 config fields
  const [storageConfigName, setStorageConfigName] = useState('Default Storage');
  const [endpointUrl, setEndpointUrl] = useState('');
  const [urlProtocol, setUrlProtocol] = useState('https://');
  const [accessKey, setAccessKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [useSsl, setUseSsl] = useState(true);
  const [verifySsl, setVerifySsl] = useState(true);

  // Customization fields
  const [headingText, setHeadingText] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  // Parse key-value pairs from quick setup text
  const parseKeyValuePairs = (text) => {
    const result = {};
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      // Try KEY=VALUE format
      let match = trimmed.match(/^([A-Z_]+)\s*=\s*(.*)$/);
      if (match) {
        result[match[1]] = match[2].trim();
        continue;
      }
      
      // Try KEY: VALUE format
      match = trimmed.match(/^([A-Z_]+)\s*:\s*(.*)$/);
      if (match) {
        result[match[1]] = match[2].trim();
      }
    }
    
    return result;
  };

  // Validate parsed configuration
  const validateQuickSetup = (config) => {
    const required = [
      'ADMIN_NAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD',
      'STORAGE_NAME', 'ENDPOINT_URL', 'ACCESS_KEY', 'SECRET_KEY', 'REGION'
    ];
    
    const missing = required.filter(key => !config[key]);
    
    if (missing.length > 0) {
      return {
        valid: false,
        error: `Missing required fields: ${missing.join(', ')}`
      };
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(config.ADMIN_EMAIL)) {
      return {
        valid: false,
        error: 'Invalid email format for ADMIN_EMAIL'
      };
    }
    
    // Validate password length
    if (config.ADMIN_PASSWORD.length < 6) {
      return {
        valid: false,
        error: 'ADMIN_PASSWORD must be at least 6 characters'
      };
    }
    
    // Validate boolean fields
    const boolFields = ['USE_SSL', 'VERIFY_SSL'];
    for (const field of boolFields) {
      if (config[field]) {
        const value = config[field].toLowerCase();
        if (value !== 'true' && value !== 'false') {
          return {
            valid: false,
            error: `${field} must be 'true' or 'false'`
          };
        }
      }
    }
    
    return { valid: true };
  };

  // Apply parsed configuration and complete setup directly
  const applyQuickSetup = async () => {
    setQuickSetupError('');
    
    const config = parseKeyValuePairs(quickSetupText);
    const validation = validateQuickSetup(config);
    
    if (!validation.valid) {
      setQuickSetupError(validation.error);
      showSnackbar(validation.error, 'error');
      return;
    }
    
    // Apply admin account fields
    setName(config.ADMIN_NAME || '');
    setEmail(config.ADMIN_EMAIL || '');
    setPassword(config.ADMIN_PASSWORD || '');
    setConfirmPassword(config.ADMIN_PASSWORD || '');
    
    // Apply S3 config fields
    setStorageConfigName(config.STORAGE_NAME || 'Default Storage');
    setAccessKey(config.ACCESS_KEY || '');
    setSecretKey(config.SECRET_KEY || '');
    setRegion(config.REGION || 'us-east-1');
    
    // Handle endpoint URL with protocol
    let endpoint = config.ENDPOINT_URL || '';
    let protocol = 'https://';
    if (endpoint.startsWith('https://')) {
      protocol = 'https://';
      endpoint = endpoint.substring(8);
    } else if (endpoint.startsWith('http://')) {
      protocol = 'http://';
      endpoint = endpoint.substring(7);
    }
    setUrlProtocol(protocol);
    setEndpointUrl(endpoint);
    
    // Apply boolean fields
    const useSslValue = config.USE_SSL?.toLowerCase() !== 'false';
    const verifySslValue = config.VERIFY_SSL?.toLowerCase() !== 'false';
    setUseSsl(useSslValue);
    setVerifySsl(verifySslValue);
    
    // Apply optional customization fields
    const headingTextValue = config.HEADING_TEXT || '';
    const logoUrlValue = config.LOGO_URL || '';
    setHeadingText(headingTextValue);
    setLogoUrl(logoUrlValue);
    
    // Combine protocol and endpoint URL for submission
    const fullEndpointUrl = endpoint 
      ? (endpoint.match(/^https?:\/\//) ? endpoint : protocol + endpoint)
      : null;
    
    // Complete setup directly
    setLoading(true);
    
    try {
      const result = await setup({
        name: config.ADMIN_NAME,
        email: config.ADMIN_EMAIL,
        password: config.ADMIN_PASSWORD,
        storage_config_name: (config.STORAGE_NAME || 'Default Storage').trim(),
        endpoint_url: fullEndpointUrl,
        access_key: config.ACCESS_KEY || null,
        secret_key: config.SECRET_KEY || null,
        region: config.REGION || 'us-east-1',
        use_ssl: useSslValue,
        verify_ssl: verifySslValue,
        heading_text: headingTextValue || null,
        logo_url: logoUrlValue || null,
      });

      showSnackbar('Setup completed successfully!', 'success');
      
      // Refresh app config to get new heading/logo
      refreshConfig();
      
      // Notify parent that setup is complete
      if (onSetupComplete) {
        onSetupComplete();
      }
      
      // Navigate to dashboard after successful setup
      navigate('/dashboard', { replace: true });
    } catch (error) {
      showSnackbar(
        error.response?.data?.detail || 'Setup failed. Please check your configuration and try again.',
        'error'
      );
    } finally {
      setLoading(false);
    }
  };

  const validateStep1 = () => {
    if (!name || !email || !password) {
      showSnackbar('Please fill in all fields', 'error');
      return false;
    }
    if (password !== confirmPassword) {
      showSnackbar('Passwords do not match', 'error');
      return false;
    }
    if (password.length < 6) {
      showSnackbar('Password must be at least 6 characters', 'error');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!storageConfigName.trim()) {
      showSnackbar('Please enter a storage configuration name', 'error');
      return false;
    }
    return true;
  };

  const handleNext = () => {
    if (activeStep === 0 && !validateStep1()) {
      return;
    }
    if (activeStep === 1 && !validateStep2()) {
      return;
    }
    setActiveStep((prev) => prev + 1);
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleSubmit = async () => {
    setLoading(true);

    try {
      // Combine protocol and endpoint URL
      const fullEndpointUrl = endpointUrl 
        ? (endpointUrl.match(/^https?:\/\//) ? endpointUrl : urlProtocol + endpointUrl)
        : null;
      
      const result = await setup({
        name,
        email,
        password,
        storage_config_name: storageConfigName.trim(),
        endpoint_url: fullEndpointUrl,
        access_key: accessKey || null,
        secret_key: secretKey || null,
        region,
        use_ssl: useSsl,
        verify_ssl: verifySsl,
        heading_text: headingText || null,
        logo_url: logoUrl || null,
      });

      showSnackbar('Setup completed successfully!', 'success');
      
      // Refresh app config to get new heading/logo
      refreshConfig();
      
      // Notify parent that setup is complete
      if (onSetupComplete) {
        onSetupComplete();
      }
      
      // Navigate to dashboard after successful setup
      navigate('/dashboard', { replace: true });
    } catch (error) {
      showSnackbar(
        error.response?.data?.detail || 'Setup failed. Please try again.',
        'error'
      );
    } finally {
      setLoading(false);
    }
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

      <Card sx={{ maxWidth: 600, width: '100%' }}>
        <CardContent sx={{ p: 4 }}>
          <Box display="flex" alignItems="center" justifyContent="center" mb={3}>
            <CloudIcon sx={{ fontSize: 48, color: 'primary.main', mr: 1 }} />
            <Typography variant="h4" component="h1">
              S3 Manager Setup
            </Typography>
          </Box>

          <Typography variant="body1" color="text.secondary" align="center" mb={4}>
            Welcome! Let's set up your S3 Manager instance.
          </Typography>

          {/* Mode Toggle */}
          <Box mb={3} display="flex" justifyContent="center">
            <Button
              variant="outlined"
              size="small"
              onClick={() => setQuickSetupOpen(!quickSetupOpen)}
              startIcon={<SettingsIcon />}
            >
              {quickSetupOpen ? 'Manual Setup' : 'Quick Setup'}
            </Button>
          </Box>

          {/* Show stepper only in manual mode */}
          {!quickSetupOpen && (
            <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          )}

          {/* Manual Setup Form */}
          {!quickSetupOpen && activeStep === 0 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Create Admin Account
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    id='name' // this tells browser to suggest name autofill
                    fullWidth
                    label="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Confirm Password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </Grid>
              </Grid>
              <Box mt={3} display="flex" justifyContent="flex-end">
                <Button
                  variant="contained"
                  onClick={handleNext}
                  size="large"
                >
                  Next
                </Button>
              </Box>
            </Box>
          )}

          {!quickSetupOpen && activeStep === 1 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Configure S3 Storage
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Enter your S3-compatible storage credentials.
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Storage Configuration Name"
                    value={storageConfigName}
                    onChange={(e) => setStorageConfigName(e.target.value)}
                    placeholder="e.g., AWS S3, MinIO Local, Hetzner"
                    helperText="You can add more storage configurations later in Settings."
                    required
                  />
                </Grid>
                <Grid item xs={12}>
                  <Box display="flex" gap={1}>
                    <FormControl sx={{ minWidth: 120 }}>
                      <InputLabel id="protocol-label">Protocol</InputLabel>
                      <Select
                        labelId="protocol-label"
                        value={urlProtocol}
                        label="Protocol"
                        onChange={(e) => setUrlProtocol(e.target.value)}
                      >
                        <MenuItem value="https://">https://</MenuItem>
                        <MenuItem value="http://">http://</MenuItem>
                      </Select>
                    </FormControl>
                    <TextField
                      fullWidth
                      label="Endpoint URL (optional)"
                      value={endpointUrl}
                      onChange={(e) => {
                        let value = e.target.value;
                        // Check if user pasted a full URL with protocol
                        if (value.match(/^https:\/\//)) {
                          setUrlProtocol('https://');
                          value = value.replace(/^https:\/\//, '');
                        } else if (value.match(/^http:\/\//)) {
                          setUrlProtocol('http://');
                          value = value.replace(/^http:\/\//, '');
                        }
                        // Strip trailing slash if present
                        value = value.replace(/\/$/, '');
                        setEndpointUrl(value);
                      }}
                      placeholder="s3.amazonaws.com or localhost:9000"
                      helperText="Leave empty for AWS S3"
                    />
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Access Key"
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    placeholder="AKIAIOSFODNN7EXAMPLE"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Secret Key"
                    type="password"
                    value={secretKey}
                    onChange={(e) => setSecretKey(e.target.value)}
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Region"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    placeholder="us-east-1"
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={useSsl}
                        onChange={(e) => setUseSsl(e.target.checked)}
                      />
                    }
                    label="Use SSL"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={verifySsl}
                        onChange={(e) => setVerifySsl(e.target.checked)}
                      />
                    }
                    label="Verify SSL Certificate"
                  />
                </Grid>
              </Grid>
              <Box mt={3} display="flex" justifyContent="space-between">
                <Button onClick={handleBack} disabled={loading}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  onClick={handleNext}
                  size="large"
                >
                  Next
                </Button>
              </Box>
            </Box>
          )}

          {!quickSetupOpen && activeStep === 2 && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Customize Appearance
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Optionally customize the application branding. Leave empty for defaults.
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Heading Text"
                    value={headingText}
                    onChange={(e) => setHeadingText(e.target.value)}
                    placeholder="S3 Manager"
                    helperText="Text displayed in the navigation bar"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    fullWidth
                    label="Logo URL"
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://example.com/logo.png"
                    helperText="URL to your custom logo image (used for navbar and favicon)"
                  />
                </Grid>
                {logoUrl && (
                  <Grid item xs={12}>
                    <Box display="flex" alignItems="center" mt={1}>
                      <Typography variant="body2" color="text.secondary" mr={2}>
                        Logo Preview:
                      </Typography>
                      <img
                        src={logoUrl}
                        alt="Logo preview"
                        style={{ height: 32, width: 32, objectFit: 'contain' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                        onLoad={(e) => { e.target.style.display = 'inline-block'; }}
                      />
                    </Box>
                  </Grid>
                )}
              </Grid>
              <Box mt={3} display="flex" justifyContent="space-between">
                <Button onClick={handleBack} disabled={loading}>
                  Back
                </Button>
                <Button
                  variant="contained"
                  onClick={handleSubmit}
                  disabled={loading}
                  size="large"
                >
                  {loading ? (
                    <CircularProgress size={24} />
                  ) : (
                    'Complete Setup'
                  )}
                </Button>
              </Box>
            </Box>
          )}

          {/* Quick Setup Mode - Replaces the form when active */}
          {quickSetupOpen && (
            <Box>
              <Typography variant="h6" gutterBottom>
                Quick Setup
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Paste your configuration in KEY=VALUE format. All fields will be filled for your review before proceeding.
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                Supported formats: KEY=VALUE or KEY: VALUE
              </Typography>
              <TextField
                fullWidth
                multiline
                rows={14}
                value={quickSetupText}
                onChange={(e) => setQuickSetupText(e.target.value)}
                error={!!quickSetupError}
                helperText={quickSetupError}
                sx={{
                  mt: 1,
                  fontFamily: 'monospace',
                  '& .MuiInputBase-input': {
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                  },
                }}
                inputProps={{
                  'aria-label': 'Quick setup configuration',
                }}
              />
              <Box mt={3} display="flex" justifyContent="space-between">
                <Button
                  onClick={() => setQuickSetupOpen(false)}
                  disabled={loading}
                >
                  Back to Manual
                </Button>
                <Button
                  variant="contained"
                  onClick={applyQuickSetup}
                  disabled={!quickSetupText.trim() || loading}
                  size="large"
                >
                  {loading ? (
                    <CircularProgress size={24} />
                  ) : (
                    'Complete Setup'
                  )}
                </Button>
              </Box>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default SetupPage;
