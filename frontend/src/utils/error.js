/**
 * Extract error message from API error response
 * @param {Error} error - Axios error object
 * @param {string} defaultMessage - Default message if extraction fails
 * @returns {string} Human-readable error message
 */

// Map technical backend messages to user-friendly ones
const ERROR_MESSAGE_MAP = {
  // Permission errors
  "Write access denied to bucket": "You do not have permission to modify files in this bucket. Please contact the administrator.",
  "Read access denied to bucket": "You do not have permission to view this bucket. Please contact the administrator.",
  "Access denied to bucket": "You do not have permission to access this bucket. Please contact the administrator.",
  "Admin access required": "You do not have permission to perform this action. Administrator access is required.",
  "You do not have permission to perform this action": "You do not have permission to perform this action. Please contact the administrator.",
  // User account errors
  "User account is deactivated": "Your account has been deactivated. Please contact the administrator.",
  "User account is deactivated. Please contact an administrator.": "Your account has been deactivated. Please contact the administrator.",
  // Authentication errors
  "Invalid email or password": "Invalid email or password. Please try again.",
  "Please log in to continue": "Please log in to continue.",
  // Bucket errors
  "S3 not configured": "S3 storage is not configured. Please check the settings.",
};

/**
 * Transform technical error messages to user-friendly ones
 */
const transformErrorMessage = (message) => {
  // Check for exact match first
  if (ERROR_MESSAGE_MAP[message]) {
    return ERROR_MESSAGE_MAP[message];
  }
  
  // Check for partial matches (for messages with dynamic parts like bucket names)
  for (const [key, value] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (message.includes(key)) {
      return value;
    }
  }
  
  return message;
};

export const getErrorMessage = (error, defaultMessage = 'An error occurred') => {
  let rawMessage = null;
  
  // Check for API error response with detail
  if (error.response?.data?.detail) {
    const detail = error.response.data.detail;
    // Handle both string and object detail
    if (typeof detail === 'string') {
      rawMessage = detail;
    }
    // Handle FastAPI validation errors
    else if (Array.isArray(detail)) {
      rawMessage = detail.map(err => `${err.loc?.join('.')}: ${err.msg}`).join(', ');
    }
    // Handle object with error property
    else if (detail.error) {
      rawMessage = detail.error;
    }
    else {
      rawMessage = JSON.stringify(detail);
    }
  }
  
  // Check for error message
  else if (error.response?.data?.message) {
    rawMessage = error.response.data.message;
  }
  
  // Check for error message in error object
  else if (error.message && error.message !== 'Network Error') {
    rawMessage = error.message;
  }
  
  // Handle network errors
  else if (error.message === 'Network Error') {
    return 'Network error. Please check your connection.';
  }
  
  // Handle specific HTTP status codes if no message extracted
  if (!rawMessage) {
    const status = error.response?.status;
    if (status === 403) {
      return 'You do not have permission to perform this action. Please contact the administrator.';
    }
    if (status === 401) {
      return 'Please log in to continue.';
    }
    if (status === 404) {
      return 'The requested resource was not found.';
    }
    if (status === 500) {
      return 'Server error. Please try again later.';
    }
  }
  
  // Transform technical message to user-friendly one
  if (rawMessage) {
    return transformErrorMessage(rawMessage);
  }
  
  return defaultMessage;
};
