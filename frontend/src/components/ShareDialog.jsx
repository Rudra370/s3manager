import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Box,
  Typography,
  Divider,
  IconButton,
  InputAdornment,
  Link,
  Chip,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Lock as LockIcon,
  Link as LinkIcon,
  AccessTime as TimeIcon,
  Download as DownloadIcon,
} from '@mui/icons-material';
import { sharesApi } from '../services/api';
import { useSnackbar } from '../contexts/SnackbarContext';
import { useStorageConfig } from '../contexts/StorageConfigContext';

const EXPIRY_OPTIONS = [
  { value: 0.0167, label: '1 minute (for testing)' },
  { value: 0.0833, label: '5 minutes' },
  { value: 1, label: '1 hour' },
  { value: 24, label: '1 day' },
  { value: 168, label: '7 days' },
  { value: 720, label: '30 days' },
  { value: null, label: 'Never' },
];

const ShareDialog = ({ open, onClose, bucketName, objectKey, objectName }) => {
  const { showSnackbar } = useSnackbar();
  const { currentStorageConfig } = useStorageConfig();
  const [loading, setLoading] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [createdShare, setCreatedShare] = useState(null);
  
  // Form state
  const [expiryHours, setExpiryHours] = useState(24);
  const [requirePassword, setRequirePassword] = useState(false);
  const [password, setPassword] = useState('');
  const [maxDownloads, setMaxDownloads] = useState('');
  
  const resetForm = () => {
    setShareUrl('');
    setCreatedShare(null);
    setExpiryHours(24);
    setRequirePassword(false);
    setPassword('');
    setMaxDownloads('');
  };
  
  const handleClose = () => {
    resetForm();
    onClose();
  };
  
  const handleCreateShare = async () => {
    if (requirePassword && password.length < 4) {
      showSnackbar('Password must be at least 4 characters', 'error');
      return;
    }
    
    setLoading(true);
    try {
      const response = await sharesApi.create({
        storage_config_id: currentStorageConfig?.id,
        bucket_name: bucketName,
        object_key: objectKey,
        expires_in_hours: expiryHours,
        password: requirePassword ? password : null,
        max_downloads: maxDownloads ? parseInt(maxDownloads) : null,
      });
      
      setShareUrl(response.data.share_url);
      setCreatedShare(response.data);
      showSnackbar('Share link created successfully', 'success');
    } catch (error) {
      // Check if this is a 500 error with traceback - global handler will show modal
      if (error.response?.status === 500 && error.response?.data?.traceback) {
        // Don't show snackbar - the global error modal will be shown
        // Just stop loading and let the error bubble up
        setLoading(false);
        return;
      }
      showSnackbar(error.response?.data?.detail || 'Failed to create share link', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    showSnackbar('Link copied to clipboard', 'success');
  };
  
  const getShareDetails = () => {
    if (!createdShare) return null;
    
    const details = [];
    if (createdShare.is_password_protected) {
      details.push(<Chip key="pwd" size="small" icon={<LockIcon />} label="Password protected" />);
    }
    if (createdShare.expires_at) {
      const expiry = new Date(createdShare.expires_at);
      details.push(
        <Chip 
          key="exp" 
          size="small" 
          icon={<TimeIcon />} 
          label={`Expires ${expiry.toLocaleDateString()}`} 
        />
      );
    }
    if (createdShare.max_downloads) {
      details.push(
        <Chip 
          key="dl" 
          size="small" 
          icon={<DownloadIcon />} 
          label={`Max ${createdShare.max_downloads} downloads`} 
        />
      );
    }
    return details;
  };
  
  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        Share File
      </DialogTitle>
      
      <DialogContent>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {objectName}
        </Typography>
        
        <Divider sx={{ my: 2 }} />
        
        {!shareUrl ? (
          // Creation form
          <Box>
            <FormControl fullWidth margin="normal">
              <InputLabel>Link Expiration</InputLabel>
              <Select
                value={expiryHours}
                label="Link Expiration"
                onChange={(e) => setExpiryHours(e.target.value)}
                MenuProps={{
                  disablePortal: true,
                  disableScrollLock: true,
                }}
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <MenuItem key={option.label} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <TextField
              fullWidth
              margin="normal"
              label="Max Downloads (optional)"
              type="number"
              value={maxDownloads}
              onChange={(e) => setMaxDownloads(e.target.value)}
              helperText="Leave empty for unlimited downloads"
              inputProps={{ min: 1 }}
            />
            
            <FormControlLabel
              control={
                <Checkbox
                  checked={requirePassword}
                  onChange={(e) => setRequirePassword(e.target.checked)}
                />
              }
              label="Require password"
            />
            
            {requirePassword && (
              <TextField
                fullWidth
                margin="normal"
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                helperText="Minimum 4 characters"
              />
            )}
          </Box>
        ) : (
          // Share created - show link
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Share Link Created
            </Typography>
            
            <Box sx={{ mt: 1, mb: 2 }}>
              {getShareDetails()}
            </Box>
            
            <TextField
              fullWidth
              value={shareUrl}
              InputProps={{
                readOnly: true,
                startAdornment: (
                  <InputAdornment position="start">
                    <LinkIcon />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton onClick={handleCopyLink} edge="end">
                      <CopyIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Anyone with this link can access the file{createdShare?.is_password_protected ? ' with the password' : ''}.
            </Typography>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClose}>
          {shareUrl ? 'Close' : 'Cancel'}
        </Button>
        {!shareUrl && (
          <Button 
            variant="contained" 
            onClick={handleCreateShare}
            disabled={loading || (requirePassword && password.length < 4)}
          >
            {loading ? 'Creating...' : 'Create Link'}
          </Button>
        )}
        {shareUrl && (
          <Button variant="contained" onClick={handleCopyLink} startIcon={<CopyIcon />}>
            Copy Link
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default ShareDialog;
