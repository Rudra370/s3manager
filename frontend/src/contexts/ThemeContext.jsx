import React, { createContext, useState, useContext, useEffect, useMemo } from 'react';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { GlobalStyles } from '@mui/material';

const ThemeContext = createContext(null);

// GitHub Dark Theme
const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#0D1117',
      paper: '#161B22',
    },
    primary: {
      main: '#2F81F7',
      light: '#58A6FF',
      dark: '#1F6FEB',
    },
    secondary: {
      main: '#A371F7',
      light: '#BC8FFF',
      dark: '#8957E5',
    },
    success: {
      main: '#238636',
      light: '#2EA043',
      dark: '#196C2E',
    },
    error: {
      main: '#F85149',
      light: '#FF7B72',
      dark: '#DA3633',
    },
    warning: {
      main: '#D29922',
      light: '#E3B341',
      dark: '#BB8009',
    },
    info: {
      main: '#58A6FF',
      light: '#79C0FF',
      dark: '#388BFD',
    },
    text: {
      primary: '#C9D1D9',
      secondary: '#8B949E',
    },
    divider: '#30363D',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
    h1: { fontWeight: 600 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { fontWeight: 500, textTransform: 'none' },
  },
  shape: {
    borderRadius: 6,
  },
  transitions: {
    // Disable MUI transitions to prevent flickering
    create: () => 'none',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: '#30363D #0D1117',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            width: 8,
            height: 8,
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            borderRadius: 4,
            backgroundColor: '#30363D',
          },
          '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
            backgroundColor: '#0D1117',
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#161B22',
          borderBottom: '1px solid #30363D',
          boxShadow: 'none',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          border: '1px solid #30363D',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#161B22',
          border: '1px solid #30363D',
          boxShadow: 'none',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: 'none',
          fontWeight: 500,
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        outlined: {
          borderColor: '#30363D',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #21262D',
          transition: 'background-color 0.2s ease',
        },
        head: {
          fontWeight: 600,
          backgroundColor: '#161B22',
          borderBottom: '1px solid #30363D',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.15s ease',
          '&:hover': {
            backgroundColor: 'rgba(177, 186, 196, 0.08)',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#161B22',
          border: '1px solid #30363D',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 6,
            backgroundColor: '#0D1117',
            border: '1px solid #30363D',
            transition: 'background-color 0.2s ease, border-color 0.2s ease',
            '& fieldset': {
              borderColor: '#30363D',
              transition: 'border-color 0.2s ease',
            },
            '&:hover fieldset': {
              borderColor: '#58A6FF',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#2F81F7',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          fontWeight: 500,
          backgroundColor: '#21262D',
          transition: 'background-color 0.2s ease',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(177, 186, 196, 0.12)',
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 3,
          backgroundColor: '#21262D',
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          backgroundColor: '#2F81F7',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: '#161B22',
          border: '1px solid #30363D',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          transition: 'background-color 0.3s ease',
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          transition: 'color 0.3s ease',
        },
      },
    },
  },
});

// GitHub Light Theme
const lightTheme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#FFFFFF',
      paper: '#FFFFFF',
    },
    primary: {
      main: '#0969DA',
      light: '#4493F8',
      dark: '#0550AE',
    },
    secondary: {
      main: '#8250DF',
      light: '#A475F9',
      dark: '#6639BA',
    },
    success: {
      main: '#1A7F37',
      light: '#2DA44E',
      dark: '#136326',
    },
    error: {
      main: '#CF222E',
      light: '#FA4549',
      dark: '#A40E26',
    },
    warning: {
      main: '#9A6700',
      light: '#BF8700',
      dark: '#7D4E00',
    },
    info: {
      main: '#4493F8',
      light: '#6CB6FF',
      dark: '#0550AE',
    },
    text: {
      primary: '#1F2328',
      secondary: '#656D76',
    },
    divider: '#D8DEE4',
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif',
    h1: { fontWeight: 600 },
    h2: { fontWeight: 600 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { fontWeight: 500, textTransform: 'none' },
  },
  shape: {
    borderRadius: 6,
  },
  transitions: {
    // Disable MUI transitions to prevent flickering
    create: () => 'none',
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          scrollbarColor: '#C1C9D0 #FFFFFF',
          '&::-webkit-scrollbar, & *::-webkit-scrollbar': {
            width: 8,
            height: 8,
          },
          '&::-webkit-scrollbar-thumb, & *::-webkit-scrollbar-thumb': {
            borderRadius: 4,
            backgroundColor: '#C1C9D0',
          },
          '&::-webkit-scrollbar-track, & *::-webkit-scrollbar-track': {
            backgroundColor: '#FFFFFF',
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          borderBottom: '1px solid #D8DEE4',
          boxShadow: 'none',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          border: '1px solid #D8DEE4',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          backgroundColor: '#FFFFFF',
          border: '1px solid #D8DEE4',
          boxShadow: 'none',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          textTransform: 'none',
          fontWeight: 500,
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
        },
        contained: {
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          },
        },
        outlined: {
          borderColor: '#D8DEE4',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #EAEEF2',
          transition: 'background-color 0.2s ease',
        },
        head: {
          fontWeight: 600,
          backgroundColor: '#F6F8FA',
          borderBottom: '1px solid #D8DEE4',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.15s ease',
          '&:hover': {
            backgroundColor: 'rgba(208, 215, 222, 0.32)',
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: '#FFFFFF',
          border: '1px solid #D8DEE4',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: 6,
            backgroundColor: '#FFFFFF',
            border: '1px solid #D8DEE4',
            transition: 'background-color 0.2s ease, border-color 0.2s ease',
            '& fieldset': {
              borderColor: '#D8DEE4',
              transition: 'border-color 0.2s ease',
            },
            '&:hover fieldset': {
              borderColor: '#4493F8',
            },
            '&.Mui-focused fieldset': {
              borderColor: '#0969DA',
            },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          fontWeight: 500,
          backgroundColor: '#EAEEF2',
          transition: 'background-color 0.2s ease',
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'background-color 0.2s ease',
          '&:hover': {
            backgroundColor: 'rgba(208, 215, 222, 0.32)',
          },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: {
          borderRadius: 3,
          backgroundColor: '#EAEEF2',
        },
      },
    },
    MuiAvatar: {
      styleOverrides: {
        root: {
          backgroundColor: '#0969DA',
        },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: {
          backgroundColor: '#FFFFFF',
          border: '1px solid #D8DEE4',
          boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
          transition: 'background-color 0.3s ease',
        },
      },
    },
    MuiTypography: {
      styleOverrides: {
        root: {
          transition: 'color 0.3s ease',
        },
      },
    },
  },
});

export const ThemeProviderWrapper = ({ children }) => {
  const [mode, setMode] = useState(() => {
    // Check localStorage first, then system preference
    const savedMode = localStorage.getItem('theme');
    if (savedMode) {
      return savedMode;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', mode);
  }, [mode]);

  const toggleTheme = () => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  };

  const theme = useMemo(() => (mode === 'dark' ? darkTheme : lightTheme), [mode]);

  const value = {
    mode,
    toggleTheme,
    theme,
  };

  // Global styles for smooth theme transitions
  const globalStyles = (
    <GlobalStyles
      styles={{
        // Apply transitions only to specific elements that need theme switching
        'body, .MuiBox-root, .MuiPaper-root, .MuiAppBar-root, .MuiCard-root, .MuiTableRow-root, .MuiTableCell-root': {
          transition: 'background-color 0.3s ease, border-color 0.3s ease',
        },
        '.MuiTypography-root, .MuiButton-root, .MuiChip-root, .MuiIconButton-root': {
          transition: 'color 0.3s ease, background-color 0.2s ease, border-color 0.2s ease',
        },
        '.MuiOutlinedInput-root, .MuiInputBase-root': {
          transition: 'background-color 0.2s ease, border-color 0.2s ease',
        },
        // Fix overlay glitches: NO transitions on portal-based components
        '.MuiModal-root, .MuiPopover-root, .MuiPopper-root, .MuiDialog-root, .MuiMenu-root, .MuiSnackbar-root, .MuiTooltip-popper': {
          transition: 'none !important',
        },
        '.MuiModal-root *, .MuiPopover-root *, .MuiPopper-root *, .MuiDialog-root *, .MuiMenu-root *, .MuiTooltip-tooltip': {
          transition: 'none !important',
        },
      }}
    />
  );

  return (
    <ThemeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        {globalStyles}
        {children}
      </ThemeProvider>
    </ThemeContext.Provider>
  );
};

export const useThemeMode = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within a ThemeProviderWrapper');
  }
  return context;
};
