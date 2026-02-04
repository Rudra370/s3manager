import { useCallback } from 'react';
import { useTaskContext } from '../contexts/TaskContext';

/**
 * Hook for starting background tasks with automatic polling.
 * 
 * @returns {Object} { startTask, isTaskActive }
 * 
 * @example
 * const { startTask } = useBackgroundTask();
 * 
 * const handleDelete = () => {
 *   startTask(
 *     '/api/tasks/bucket-delete/my-bucket',
 *     { storage_config_id: 1 },
 *     {
 *       successMessage: 'Bucket deleted successfully',
 *       onComplete: (data) => console.log('Done', data),
 *       onError: (error) => console.error('Failed', error)
 *     }
 *   );
 * };
 */
export const useBackgroundTask = () => {
  const { startBackgroundTask, getTask } = useTaskContext();
  
  /**
   * Start a background task.
   * 
   * @param {string} endpoint - API endpoint to start task
   * @param {Object} params - Request params/body
   * @param {Object} options - Callback and message options
   */
  const startTask = useCallback(async (endpoint, params = {}, options = {}) => {
    return await startBackgroundTask(endpoint, params, options);
  }, [startBackgroundTask]);
  
  /**
   * Check if a specific task is currently active.
   * 
   * @param {string} taskId - The task ID
   * @returns {boolean}
   */
  const isTaskActive = useCallback((taskId) => {
    if (!taskId) return false;
    const task = getTask(taskId);
    return task && ['pending', 'running'].includes(task.status);
  }, [getTask]);
  
  return {
    startTask,
    isTaskActive
  };
};

export default useBackgroundTask;
