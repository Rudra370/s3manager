import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useSnackbar } from './SnackbarContext';
import api from '../services/api';

const POLLING_INTERVAL = {
  BACKGROUND: 2000,  // 2 seconds for background tasks
  INLINE: 2000       // 2 seconds for inline tasks
};

const TaskContext = createContext(null);

export const TaskProvider = ({ children }) => {
  const { showSnackbar } = useSnackbar();
  
  // Store active tasks and their polling info
  const [activeTasks, setActiveTasks] = useState(new Map());
  const pollingRefs = useRef(new Map()); // task_id -> interval_id
  
  // Stop polling for a task
  const stopPolling = useCallback((taskId) => {
    const intervalId = pollingRefs.current.get(taskId);
    if (intervalId) {
      clearInterval(intervalId);
      pollingRefs.current.delete(taskId);
    }
    
    setActiveTasks(prev => {
      const newMap = new Map(prev);
      newMap.delete(taskId);
      return newMap;
    });
  }, []);
  
  // Single poll request
  const pollTask = useCallback(async (taskId, onComplete, onError) => {
    try {
      const response = await api.get(`/api/tasks/${taskId}/progress`);
      const data = response.data;
      
      // Update active task state
      setActiveTasks(prev => {
        const existing = prev.get(taskId);
        if (existing) {
          return new Map(prev.set(taskId, { ...existing, ...data }));
        }
        return prev;
      });
      
      // Check if task is done
      if (data.status === 'completed') {
        stopPolling(taskId);
        if (onComplete) {
          onComplete(data);
        }
      } else if (data.status === 'failed') {
        stopPolling(taskId);
        if (onError) {
          onError(data.error);
        }
      } else if (data.status === 'cancelled') {
        stopPolling(taskId);
      }
      
      return data;
    } catch (error) {
      // Task not found (expired) or network error
      if (error.response?.status === 404) {
        stopPolling(taskId);
        if (onError) {
          onError({ message: 'Task not found or expired' });
        }
      }
      return null;
    }
  }, [stopPolling]);
  
  // Start polling for a task
  const startPolling = useCallback((taskId, taskType, onComplete, onError) => {
    // Stop any existing polling for this task
    stopPolling(taskId);
    
    const interval = POLLING_INTERVAL[taskType] || POLLING_INTERVAL.BACKGROUND;
    
    // Immediately fetch once
    pollTask(taskId, onComplete, onError);
    
    // Set up interval
    const intervalId = setInterval(() => {
      pollTask(taskId, onComplete, onError);
    }, interval);
    
    pollingRefs.current.set(taskId, intervalId);
    
    // Add to active tasks
    setActiveTasks(prev => new Map(prev.set(taskId, { 
      taskId, 
      taskType, 
      status: 'polling',
      progress: 0 
    })));
  }, [pollTask, stopPolling]);
  
  // Start a new background task
  const startBackgroundTask = useCallback(async (endpoint, params, options = {}) => {
    const { 
      onComplete, 
      onError, 
      successMessage,
      errorMessage 
    } = options;
    
    try {
      const response = await api.post(endpoint, params);
      const { task_id } = response.data;
      
      // Start polling
      startPolling(task_id, 'BACKGROUND', 
        (data) => {
          if (successMessage) {
            showSnackbar(successMessage, 'success');
          }
          if (onComplete) {
            onComplete(data);
          }
        },
        (error) => {
          const msg = errorMessage || error?.message || 'Task failed';
          showSnackbar(msg, 'error');
          if (onError) {
            onError(error);
          }
        }
      );
      
      return task_id;
    } catch (error) {
      const msg = error.response?.data?.detail || 'Failed to start task';
      showSnackbar(msg, 'error');
      if (onError) {
        onError({ message: msg });
      }
      throw error;
    }
  }, [startPolling, showSnackbar]);
  
  // Cancel a task
  const cancelTask = useCallback(async (taskId) => {
    try {
      await api.delete(`/api/tasks/${taskId}/cancel`);
      stopPolling(taskId);
      showSnackbar('Task cancelled', 'info');
    } catch (error) {
      showSnackbar('Failed to cancel task', 'error');
    }
  }, [stopPolling, showSnackbar]);
  
  // Get current task info
  const getTask = useCallback((taskId) => {
    return activeTasks.get(taskId);
  }, [activeTasks]);
  
  // Get all background tasks (for global snackbar)
  const getBackgroundTasks = useCallback(() => {
    return Array.from(activeTasks.values()).filter(t => t.taskType === 'BACKGROUND');
  }, [activeTasks]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop all polling
      pollingRefs.current.forEach((intervalId) => {
        clearInterval(intervalId);
      });
      pollingRefs.current.clear();
    };
  }, []);
  
  const value = {
    activeTasks,
    startPolling,
    stopPolling,
    startBackgroundTask,
    cancelTask,
    getTask,
    getBackgroundTasks,
  };
  
  return <TaskContext.Provider value={value}>{children}</TaskContext.Provider>;
};

export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskContext must be used within a TaskProvider');
  }
  return context;
};

export default TaskContext;
