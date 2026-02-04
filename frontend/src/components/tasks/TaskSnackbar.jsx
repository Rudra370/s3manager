import React, { useEffect, useState } from 'react';
import { 
  Snackbar, 
  Box, 
  LinearProgress, 
  Typography, 
  IconButton,
  Fade
} from '@mui/material';
import { 
  Close as CloseIcon,
  Stop as StopIcon,
  CheckCircle as SuccessIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { useTaskContext } from '../../contexts/TaskContext';

const TaskSnackbar = () => {
  const { getBackgroundTasks, cancelTask, activeTasks } = useTaskContext();
  const [visibleTasks, setVisibleTasks] = useState([]);
  const [dismissedTasks, setDismissedTasks] = useState(new Set());
  
  const tasks = getBackgroundTasks().filter(t => !dismissedTasks.has(t.taskId));
  
  // Auto-dismiss completed tasks after 2 seconds
  useEffect(() => {
    tasks.forEach(task => {
      if (task.status === 'completed' && !task._dismissTimer) {
        task._dismissTimer = setTimeout(() => {
          setDismissedTasks(prev => new Set(prev).add(task.taskId));
        }, 2000);
      }
    });
    
    return () => {
      tasks.forEach(task => {
        if (task._dismissTimer) {
          clearTimeout(task._dismissTimer);
        }
      });
    };
  }, [tasks]);
  
  const handleDismiss = (taskId) => {
    setDismissedTasks(prev => new Set(prev).add(taskId));
  };
  
  const handleCancel = (taskId) => {
    cancelTask(taskId);
  };
  
  if (tasks.length === 0) return null;
  
  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        zIndex: 1400,
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        maxWidth: 400,
      }}
    >
      {tasks.map(task => (
        <TaskProgressCard
          key={task.taskId}
          task={task}
          onDismiss={() => handleDismiss(task.taskId)}
          onCancel={() => handleCancel(task.taskId)}
        />
      ))}
    </Box>
  );
};

const TaskProgressCard = ({ task, onDismiss, onCancel }) => {
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed';
  const isRunning = task.status === 'running' || task.status === 'pending';
  
  const getIcon = () => {
    if (isCompleted) return <SuccessIcon color="success" />;
    if (isFailed) return <ErrorIcon color="error" />;
    return null;
  };
  
  const getMessage = () => {
    if (task.metadata?.action === 'delete_bucket') {
      return `Deleting bucket '${task.metadata?.bucket_name}'`;
    }
    if (task.metadata?.action === 'bulk_delete') {
      return `Deleting ${task.metadata?.object_count} objects`;
    }
    return task.currentStep || 'Processing...';
  };
  
  return (
    <Fade in>
      <Box
        sx={{
          backgroundColor: 'background.paper',
          borderRadius: 1,
          boxShadow: 3,
          p: 2,
          minWidth: 300,
        }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
          <Box display="flex" alignItems="center" gap={1}>
            {getIcon()}
            <Typography variant="body2" fontWeight="medium">
              {getMessage()}
            </Typography>
          </Box>
          <Box>
            {isRunning && (
              <IconButton size="small" onClick={onCancel} title="Cancel task">
                <StopIcon fontSize="small" color="error" />
              </IconButton>
            )}
            <IconButton size="small" onClick={onDismiss}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>
        
        {isRunning && (
          <Box>
            <LinearProgress 
              variant="determinate" 
              value={task.progress || 0}
              sx={{ height: 6, borderRadius: 1 }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
              {task.progress || 0}% - {task.currentStep || 'Starting...'}
            </Typography>
          </Box>
        )}
        
        {isFailed && task.error && (
          <Typography variant="caption" color="error">
            {task.error.message}
          </Typography>
        )}
      </Box>
    </Fade>
  );
};

export default TaskSnackbar;
