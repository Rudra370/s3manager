import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Close as CloseIcon,
  Error as ErrorIcon,
} from '@mui/icons-material';
import { useSnackbar } from '../contexts/SnackbarContext';

/**
 * Modal to display internal server error (500) traceback
 * Shows full error details in a scrollable text area with copy functionality
 */
const ErrorTracebackModal = ({ open, onClose, errorData }) => {
  const theme = useTheme();
  const { showSnackbar } = useSnackbar();

  const handleCopyTraceback = () => {
    if (errorData?.traceback) {
      navigator.clipboard.writeText(errorData.traceback);
      showSnackbar('Traceback copied to clipboard', 'success');
    }
  };

  const handleCopyAll = () => {
    const fullError = `Error Type: ${errorData?.error_type || 'Unknown'}
Error Message: ${errorData?.error_message || 'No message'}

Traceback:
${errorData?.traceback || 'No traceback available'}`;
    
    navigator.clipboard.writeText(fullError);
    showSnackbar('Full error details copied to clipboard', 'success');
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      sx={{
        '& .MuiDialog-root': {
          zIndex: theme.zIndex.modal + 1000, // Ensure error modal appears above all other modals
        },
      }}
      PaperProps={{
        sx: {
          minHeight: '400px',
          maxHeight: '80vh',
          zIndex: theme.zIndex.modal + 1000,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          bgcolor: theme.palette.error.main + '15',
          color: theme.palette.error.main,
          pr: 6,
        }}
      >
        <ErrorIcon color="error" />
        <Typography variant="h6" component="span" sx={{ flexGrow: 1 }}>
          An internal server error occurred
        </Typography>
        <IconButton
          onClick={onClose}
          sx={{
            position: 'absolute',
            right: 8,
            top: 8,
            color: theme.palette.error.main,
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        <Typography variant="subtitle1" color="text.secondary" gutterBottom>
          Please see details below:
        </Typography>

        {/* Error Summary */}
        <Box
          sx={{
            mb: 2,
            p: 2,
            bgcolor: theme.palette.error.main + '08',
            borderRadius: 1,
            border: `1px solid ${theme.palette.error.main}30`,
          }}
        >
          <Typography variant="body2" component="div">
            <strong>Error Type:</strong>{' '}
            <code>{errorData?.error_type || 'Unknown'}</code>
          </Typography>
          <Typography variant="body2" component="div" sx={{ mt: 0.5 }}>
            <strong>Message:</strong>{' '}
            {errorData?.error_message || 'No message available'}
          </Typography>
        </Box>

        {/* Traceback Section */}
        <Typography variant="subtitle2" gutterBottom sx={{ mt: 2 }}>
          Full Traceback:
        </Typography>

        <Box
          sx={{
            position: 'relative',
            bgcolor: theme.palette.mode === 'dark' ? '#1e1e1e' : '#f5f5f5',
            borderRadius: 1,
            border: `1px solid ${theme.palette.divider}`,
          }}
        >
          {/* Copy button for traceback */}
          <Tooltip title="Copy traceback">
            <IconButton
              onClick={handleCopyTraceback}
              size="small"
              sx={{
                position: 'absolute',
                top: 8,
                right: 8,
                bgcolor: theme.palette.background.paper,
                '&:hover': {
                  bgcolor: theme.palette.action.hover,
                },
                zIndex: 1,
              }}
            >
              <CopyIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          {/* Scrollable traceback area */}
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              pt: 4,
              maxHeight: '300px',
              overflow: 'auto',
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              lineHeight: 1.5,
              color: theme.palette.mode === 'dark' ? '#d4d4d4' : '#333',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {errorData?.traceback || 'No traceback available'}
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button
          onClick={handleCopyAll}
          startIcon={<CopyIcon />}
          variant="outlined"
          color="primary"
        >
          Copy All Details
        </Button>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={onClose} variant="contained" color="primary">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ErrorTracebackModal;
