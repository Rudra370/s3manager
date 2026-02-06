import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import ErrorTracebackModal from '../components/ErrorTracebackModal';
import { setGlobalErrorHandler, clearGlobalErrorHandler } from '../services/api';

/**
 * Context for handling and displaying internal server errors (500)
 * with full traceback information
 */
const ErrorContext = createContext(null);

export const ErrorProvider = ({ children }) => {
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorData, setErrorData] = useState(null);

  /**
   * Show the error modal with traceback details
   * @param {Object} data - Error data containing traceback, error_type, error_message
   */
  const showErrorTraceback = useCallback((data) => {
    setErrorData(data);
    setErrorModalOpen(true);
  }, []);

  /**
   * Close the error modal
   */
  const closeErrorTraceback = useCallback(() => {
    setErrorModalOpen(false);
    // Clear error data after a short delay to prevent flashing old data
    setTimeout(() => setErrorData(null), 300);
  }, []);

  /**
   * Check if an API error response is a 500 with traceback
   * and show the modal if so
   * @param {Object} data - Error data from API response
   * @returns {boolean} - True if error was handled (500 with traceback)
   */
  const handleApiError = useCallback((data) => {
    if (data?.traceback) {
      showErrorTraceback({
        traceback: data.traceback,
        error_type: data.error_type || 'InternalServerError',
        error_message: data.error_message || data.detail || 'An internal server error occurred',
        detail: data.detail,
      });
      return true; // Error was handled
    }
    return false; // Error was not handled (no traceback)
  }, [showErrorTraceback]);

  // Register the error handler with the API interceptor on mount
  useEffect(() => {
    setGlobalErrorHandler(handleApiError);
    
    // Cleanup on unmount
    return () => {
      clearGlobalErrorHandler();
    };
  }, [handleApiError]);

  const value = {
    showErrorTraceback,
    closeErrorTraceback,
    handleApiError,
    errorData,
    isErrorModalOpen: errorModalOpen,
  };

  return (
    <ErrorContext.Provider value={value}>
      {children}
      <ErrorTracebackModal
        open={errorModalOpen}
        onClose={closeErrorTraceback}
        errorData={errorData}
      />
    </ErrorContext.Provider>
  );
};

export const useError = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within an ErrorProvider');
  }
  return context;
};

export default ErrorContext;
