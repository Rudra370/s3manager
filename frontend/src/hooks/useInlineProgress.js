import { useState, useCallback, useEffect } from 'react';
import { useTaskContext } from '../contexts/TaskContext';
import api from '../services/api';

/**
 * Hook for managing inline progress for UI-dependent tasks.
 * This handles the polling and state management for tasks that
 * show progress in the same UI component where they were initiated.
 * 
 * @param {Object} options - Hook options
 * @param {Function} options.onComplete - Called when task completes
 * @param {Function} options.onError - Called when task fails
 * @returns {Object} Task control and state
 * 
 * @example
 * const { 
 *   startTask, 
 *   isLoading, 
 *   progress, 
 *   status 
 * } = useInlineProgress({
 *   onComplete: (data) => setSize(data.result.size_formatted)
 * });
 * 
 * // In component
 * <Button 
 *   onClick={() => startTask('/api/tasks/calculate-size', { bucket_name: 'my-bucket' })}
 *   disabled={isLoading}
 * >
 *   {isLoading ? <CircularProgress size={16} /> : 'Calculate Size'}
 * </Button>
 */
export const useInlineProgress = (options = {}) => {
  const { onComplete, onError } = options;
  const { startPolling, stopPolling } = useTaskContext();
  
  const [taskId, setTaskId] = useState(null);
  const [taskState, setTaskState] = useState({
    status: 'idle',
    progress: 0,
    currentStep: null,
    result: null,
    error: null
  });
  
  /**
   * Start an inline task.
   * 
   * @param {string} endpoint - API endpoint
   * @param {Object} params - Request params
   */
  const startTask = useCallback(async (endpoint, params = {}) => {
    try {
      // Reset state
      setTaskState({
        status: 'pending',
        progress: 0,
        currentStep: 'Starting...',
        result: null,
        error: null
      });
      
      // Start task via API using the api service
      const response = await api.post(endpoint, params);
      const { task_id } = response.data;
      setTaskId(task_id);
      
      // Start polling
      startPolling(
        task_id,
        'INLINE',
        (data) => {
          setTaskState({
            status: 'completed',
            progress: 100,
            currentStep: null,
            result: data.result,
            error: null
          });
          if (onComplete) {
            onComplete(data);
          }
        },
        (error) => {
          setTaskState({
            status: 'failed',
            progress: 0,
            currentStep: null,
            result: null,
            error
          });
          if (onError) {
            onError(error);
          }
        }
      );
      
      return task_id;
    } catch (error) {
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to start task';
      setTaskState({
        status: 'failed',
        progress: 0,
        currentStep: null,
        result: null,
        error: { message: errorMessage }
      });
      if (onError) {
        onError(error);
      }
      throw error;
    }
  }, [startPolling, onComplete, onError]);
  
  /**
   * Reset the hook state.
   */
  const reset = useCallback(() => {
    if (taskId) {
      stopPolling(taskId);
    }
    setTaskId(null);
    setTaskState({
      status: 'idle',
      progress: 0,
      currentStep: null,
      result: null,
      error: null
    });
  }, [taskId, stopPolling]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (taskId) {
        stopPolling(taskId);
      }
    };
  }, [taskId, stopPolling]);
  
  const isLoading = taskState.status === 'pending' || taskState.status === 'running';
  
  return {
    // Actions
    startTask,
    reset,
    
    // State
    isLoading,
    status: taskState.status,
    progress: taskState.progress,
    currentStep: taskState.currentStep,
    result: taskState.result,
    error: taskState.error,
    taskId
  };
};

export default useInlineProgress;
