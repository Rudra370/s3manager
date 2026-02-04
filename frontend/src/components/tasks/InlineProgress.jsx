import React from 'react';
import { Box, CircularProgress, Typography, LinearProgress } from '@mui/material';

const InlineProgress = ({ 
  progress, 
  message,
  variant = 'circular', // 'circular' | 'linear'
  size = 'small' // 'small' | 'medium'
}) => {
  if (variant === 'linear') {
    return (
      <Box sx={{ width: '100%', minWidth: 120 }}>
        <LinearProgress 
          variant="determinate" 
          value={progress || 0}
          size={size}
        />
        {message && (
          <Typography variant="caption" color="text.secondary">
            {message}
          </Typography>
        )}
      </Box>
    );
  }
  
  return (
    <Box display="flex" alignItems="center" gap={1}>
      <CircularProgress size={size === 'small' ? 16 : 24} />
      {message && (
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      )}
    </Box>
  );
};

export default InlineProgress;
