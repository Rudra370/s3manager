import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import App from './App'
import { ThemeProviderWrapper, useThemeMode } from './contexts/ThemeContext'
import { AppConfigProvider } from './contexts/AppConfigContext'
import { SnackbarProvider } from './contexts/SnackbarContext'
import { TaskProvider } from './contexts/TaskContext'

// Inner component that has access to theme
const ThemedApp = () => {
  const { theme } = useThemeMode();
  
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider>
        <TaskProvider>
          <AppConfigProvider>
            <App />
          </AppConfigProvider>
        </TaskProvider>
      </SnackbarProvider>
    </ThemeProvider>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProviderWrapper>
        <ThemedApp />
      </ThemeProviderWrapper>
    </BrowserRouter>
  </React.StrictMode>,
)
