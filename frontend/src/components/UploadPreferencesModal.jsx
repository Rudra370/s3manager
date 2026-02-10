import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Slider,
  Switch,
  FormControlLabel,
  Divider,
  IconButton,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Close as CloseIcon,
  Speed as SpeedIcon,
  Storage as StorageIcon,
  Compress as CompressIcon,
  RestartAlt as ResetIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useUploadPreferences } from '../contexts/UploadPreferencesContext';

const UploadPreferencesModal = ({ open, onClose }) => {
  const { 
    preferences, 
    updatePreference, 
    resetPreferences, 
    getBytes,
    limits 
  } = useUploadPreferences();

  // Local state for smooth slider updates
  const [localValues, setLocalValues] = useState(preferences);

  // Sync local values when preferences change or modal opens
  useEffect(() => {
    if (open) {
      setLocalValues(preferences);
    }
  }, [open, preferences]);

  const handleSliderChange = (key) => (event, value) => {
    setLocalValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSliderCommit = (key) => (event, value) => {
    updatePreference(key, value);
  };

  const handleSwitchChange = (key) => (event) => {
    updatePreference(key, event.target.checked);
    setLocalValues(prev => ({ ...prev, [key]: event.target.checked }));
  };

  const handleReset = () => {
    resetPreferences();
    setLocalValues(preferences);
  };

  const formatSize = (mb) => {
    if (mb >= 1000) {
      return `${(mb / 1024).toFixed(1)} GB`;
    }
    return `${mb} MB`;
  };

  const getPerformanceEstimate = () => {
    const { chunkSizeMb, parallelChunks } = localValues;
    const throughput = chunkSizeMb * parallelChunks;
    return `~${throughput} MB/s theoretical`;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
        }
      }}
    >
      {/* Header */}
      <DialogTitle sx={{ 
        pb: 1, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between' 
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <SpeedIcon color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={600} fontSize="1.1rem">
              Upload Preferences
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Configure large file upload behavior
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <Tooltip title="Reset to defaults">
            <IconButton onClick={handleReset} size="small" color="default">
              <ResetIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton onClick={onClose} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {/* Performance Preview */}
        <Box sx={{ 
          mb: 3, 
          p: 2, 
          bgcolor: 'primary.main', 
          color: 'primary.contrastText',
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Box>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              Estimated Upload Speed
            </Typography>
            <Typography variant="h6" fontWeight={600}>
              {getPerformanceEstimate()}
            </Typography>
          </Box>
          <SpeedIcon sx={{ opacity: 0.3, fontSize: 40 }} />
        </Box>

        {/* Section: Multipart Upload Settings */}
        <Box sx={{ mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <StorageIcon color="primary" fontSize="small" />
            <Typography variant="subtitle2" fontWeight={600} color="text.primary">
              Multipart Upload Settings
            </Typography>
            <Tooltip title="Files larger than this threshold will be uploaded in chunks using multipart upload">
              <InfoIcon fontSize="small" sx={{ color: 'text.secondary', cursor: 'help' }} />
            </Tooltip>
          </Box>

          {/* Multipart Threshold */}
          <Box sx={{ mb: 3, px: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Start multipart when file size exceeds
              </Typography>
              <Chip 
                label={formatSize(localValues.multipartThresholdMb)} 
                size="small" 
                color="primary" 
                variant="outlined"
                sx={{ fontWeight: 500 }}
              />
            </Box>
            <Slider
              value={localValues.multipartThresholdMb}
              onChange={handleSliderChange('multipartThresholdMb')}
              onChangeCommitted={handleSliderCommit('multipartThresholdMb')}
              min={limits.multipartThresholdMb.min}
              max={limits.multipartThresholdMb.max}
              step={5}
              marks={[
                { value: 5, label: '5 MB' },
                { value: 100, label: '100 MB' },
                { value: 500, label: '500 MB' },
                { value: 1000, label: '1 GB' },
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => formatSize(v)}
              sx={{
                '& .MuiSlider-markLabel': { fontSize: '0.75rem' }
              }}
            />
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Chunk Size */}
          <Box sx={{ mb: 3, px: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Chunk size (each part)
              </Typography>
              <Chip 
                label={formatSize(localValues.chunkSizeMb)} 
                size="small" 
                color="primary"
                sx={{ fontWeight: 500 }}
              />
            </Box>
            <Slider
              value={localValues.chunkSizeMb}
              onChange={handleSliderChange('chunkSizeMb')}
              onChangeCommitted={handleSliderCommit('chunkSizeMb')}
              min={limits.chunkSizeMb.min}
              max={limits.chunkSizeMb.max}
              step={5}
              marks={[
                { value: 5, label: '5 MB' },
                { value: 25, label: '25 MB' },
                { value: 50, label: '50 MB' },
                { value: 100, label: '100 MB' },
              ]}
              valueLabelDisplay="auto"
              valueLabelFormat={(v) => formatSize(v)}
              sx={{
                '& .MuiSlider-markLabel': { fontSize: '0.75rem' }
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              Larger chunks = fewer API calls, but less granular progress
            </Typography>
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* Parallel Chunks */}
          <Box sx={{ mb: 2, px: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
              <Typography variant="body2" color="text.secondary">
                Parallel uploads (concurrent chunks)
              </Typography>
              <Chip 
                label={`${localValues.parallelChunks} chunks`} 
                size="small" 
                color="primary"
                sx={{ fontWeight: 500 }}
              />
            </Box>
            <Slider
              value={localValues.parallelChunks}
              onChange={handleSliderChange('parallelChunks')}
              onChangeCommitted={handleSliderCommit('parallelChunks')}
              min={limits.parallelChunks.min}
              max={limits.parallelChunks.max}
              step={1}
              marks={[
                { value: 1, label: '1' },
                { value: 3, label: '3' },
                { value: 5, label: '5' },
                { value: 10, label: '10' },
              ]}
              valueLabelDisplay="auto"
              sx={{
                '& .MuiSlider-markLabel': { fontSize: '0.75rem' }
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              More parallel chunks = faster uploads (if your connection supports it)
            </Typography>
          </Box>
        </Box>

        {/* Section: Compression */}
        <Box sx={{ 
          p: 2, 
          bgcolor: 'background.default', 
          borderRadius: 2,
          border: '1px solid',
          borderColor: 'divider'
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <CompressIcon color="primary" fontSize="small" />
              <Box>
                <Typography variant="body2" fontWeight={500}>
                  Gzip Compression
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Compress text files before upload (70-90% size reduction)
                </Typography>
              </Box>
            </Box>
            <Switch
              checked={localValues.gzipCompression}
              onChange={handleSwitchChange('gzipCompression')}
              color="primary"
            />
          </Box>
          {localValues.gzipCompression && (
            <Box sx={{ mt: 1.5, ml: 4 }}>
              <Typography variant="caption" color="success.main">
                ✓ Text files (.txt, .csv, .json, etc.) will be compressed
              </Typography>
            </Box>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, pt: 1 }}>
        <Button 
          onClick={handleReset} 
          color="inherit"
          startIcon={<ResetIcon />}
          size="small"
        >
          Reset
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} color="inherit" size="small">
          Cancel
        </Button>
        <Button 
          onClick={onClose} 
          variant="contained" 
          disableElevation
          size="small"
          sx={{ borderRadius: 2, px: 3 }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default UploadPreferencesModal;
