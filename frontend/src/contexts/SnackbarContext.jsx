import React, { createContext, useState, useContext, useCallback, forwardRef } from 'react';
import { Snackbar, Alert, Slide, useTheme } from '@mui/material';

const SnackbarContext = createContext(null);

// Slide transition component - defined outside the provider
const SlideTransition = forwardRef(function SlideTransition(props, ref) {
  return <Slide direction="left" ref={ref} {...props} />;
});

// Custom Alert with softer error colors
const SoftAlert = forwardRef(function SoftAlert({ severity, sx, ...props }, ref) {
  const theme = useTheme();
  
  // Softer colors for error
  const getBackgroundColor = () => {
    if (severity === 'error') {
      return theme.palette.mode === 'dark' 
        ? 'rgba(211, 47, 47, 0.85)'  // Softer red for dark mode
        : 'rgba(211, 47, 47, 0.9)';   // Softer red for light mode
    }
    return undefined; // Use default for other severities
  };

  return (
    <Alert
      ref={ref}
      severity={severity}
      variant="filled"
      sx={{
        width: '100%',
        minWidth: '280px',
        maxWidth: '400px',
        boxShadow: (t) => t.shadows[6],
        backgroundColor: getBackgroundColor(),
        '& .MuiAlert-icon': {
          color: severity === 'error' ? 'rgba(255, 255, 255, 0.9)' : undefined,
        },
        ...sx,
      }}
      {...props}
    />
  );
});

export const SnackbarProvider = ({ children }) => {
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'info',
  });

  const showSnackbar = useCallback((message, severity = 'info') => {
    setSnackbar({
      open: true,
      message,
      severity,
    });
  }, []);

  const hideSnackbar = useCallback(() => {
    setSnackbar((prev) => ({
      ...prev,
      open: false,
    }));
  }, []);

  const handleClose = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    hideSnackbar();
  };

  return (
    <SnackbarContext.Provider value={{ showSnackbar, hideSnackbar }}>
      {children}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={5000}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        TransitionComponent={SlideTransition}
        transitionDuration={{ enter: 300, exit: 200 }}
        sx={{
          '&.MuiSnackbar-root': {
            bottom: { xs: 16, sm: 24 },
            right: { xs: 16, sm: 24 },
            left: 'auto !important',
            transform: 'none !important',
          },
        }}
      >
        <SoftAlert onClose={handleClose} severity={snackbar.severity}>
          {snackbar.message}
        </SoftAlert>
      </Snackbar>
    </SnackbarContext.Provider>
  );
};

export const useSnackbar = () => {
  const context = useContext(SnackbarContext);
  if (!context) {
    throw new Error('useSnackbar must be used within a SnackbarProvider');
  }
  return context;
};
