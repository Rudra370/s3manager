import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  CircularProgress,
  Alert,
  Divider,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  InsertDriveFile as FileIcon,
  Lock as LockIcon,
  Download as DownloadIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { sharesApi } from '../services/api';

const ShareAccessPage = () => {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [shareInfo, setShareInfo] = useState(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [accessGranted, setAccessGranted] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchShareInfo();
  }, [token]);

  const fetchShareInfo = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await sharesApi.getPublicInfo(token);
      setShareInfo(response.data);
      setRequiresPassword(response.data.requires_password);
      
      // If no password required, mark as granted
      if (!response.data.requires_password) {
        setAccessGranted(true);
      }
    } catch (err) {
      const errorDetail = err.response?.data?.detail || 'Failed to load share';
      setError(errorDetail);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitPassword = async () => {
    if (!password) return;
    
    setLoading(true);
    try {
      await sharesApi.accessWithPassword(token, password);
      setAccessGranted(true);
      setError(null);
    } catch (err) {
      setError('Invalid password');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const response = await sharesApi.download(token, requiresPassword ? password : undefined);
      
      // Create download
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', shareInfo.filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      // Increment download count locally for UI
      setShareInfo(prev => ({
        ...prev,
        download_count: (prev.download_count || 0) + 1,
      }));
    } catch (err) {
      const errorDetail = err.response?.data?.detail || 'Download failed. Please try again.';
      setError(errorDetail);
    } finally {
      setDownloading(false);
    }
  };

  if (loading && !shareInfo) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (error && !shareInfo) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="100vh" p={3}>
        <Paper sx={{ p: 4, maxWidth: 500, width: '100%' }}>
          <Alert severity="error" icon={<ErrorIcon />}>
            {error}
          </Alert>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
            This share link may have expired or been revoked.
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box 
      display="flex" 
      justifyContent="center" 
      alignItems="center" 
      minHeight="100vh" 
      p={3}
      sx={{ backgroundColor: 'background.default' }}
    >
      <Paper sx={{ p: 4, maxWidth: 500, width: '100%' }}>
        <Box display="flex" alignItems="center" mb={2}>
          <FileIcon sx={{ fontSize: 40, color: 'primary.main', mr: 2 }} />
          <Box>
            <Typography variant="h6">Shared File</Typography>
            <Typography variant="body2" color="text.secondary">
              {shareInfo?.filename}
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ my: 2 }} />

        {requiresPassword && !accessGranted ? (
          // Password form
          <Box>
            <Box display="flex" alignItems="center" mb={2}>
              <LockIcon color="action" sx={{ mr: 1 }} />
              <Typography variant="body1">This file is password protected</Typography>
            </Box>
            
            <TextField
              fullWidth
              type="password"
              label="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              error={!!error}
              helperText={error}
            />
            
            <Button
              fullWidth
              variant="contained"
              onClick={handleSubmitPassword}
              disabled={!password || loading}
              sx={{ mt: 2 }}
            >
              {loading ? <CircularProgress size={24} /> : 'Access File'}
            </Button>
          </Box>
        ) : (
          // File details and download
          <Box>
            <List dense>
              {shareInfo?.size_formatted && (
                <ListItem>
                  <ListItemText primary="Size" secondary={shareInfo.size_formatted} />
                </ListItem>
              )}
              {shareInfo?.content_type && (
                <ListItem>
                  <ListItemText primary="Type" secondary={shareInfo.content_type} />
                </ListItem>
              )}
              {shareInfo?.expires_at && (
                <ListItem>
                  <ListItemText 
                    primary="Expires" 
                    secondary={new Date(shareInfo.expires_at).toLocaleString()} 
                  />
                </ListItem>
              )}
            </List>

            {error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Button
              fullWidth
              variant="contained"
              size="large"
              startIcon={<DownloadIcon />}
              onClick={handleDownload}
              disabled={downloading}
            >
              {downloading ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                'Download File'
              )}
            </Button>

            {shareInfo?.max_downloads && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', textAlign: 'center' }}>
                Downloads remaining: {shareInfo.max_downloads - (shareInfo.download_count || 0)}
              </Typography>
            )}
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default ShareAccessPage;
