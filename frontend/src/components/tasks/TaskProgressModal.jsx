import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  LinearProgress,
  Typography,
  Box,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  CircularProgress
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  HourglassEmpty as HourglassEmptyIcon
} from '@mui/icons-material';

const TaskProgressModal = ({ 
  open, 
  onClose, 
  task,
  title = 'Processing',
  description = 'Please wait while we process your request...'
}) => {
  if (!task) return null;
  
  const isCompleted = task.status === 'completed';
  const isFailed = task.status === 'failed';
  const isRunning = task.status === 'running' || task.status === 'pending';
  
  // Generate steps based on task type
  const getSteps = () => {
    if (task.metadata?.action === 'delete_bucket') {
      return [
        { label: 'Listing objects', done: task.progress >= 10 },
        { label: 'Deleting objects', done: task.progress >= 10 && task.progress < 85 },
        { label: 'Deleting bucket', done: task.progress >= 85 && task.progress < 95 },
        { label: 'Cleaning up', done: task.progress >= 95 },
      ];
    }
    if (task.metadata?.action === 'bulk_delete') {
      return [
        { label: 'Deleting objects', done: isRunning },
      ];
    }
    return [];
  };
  
  const steps = getSteps();
  
  return (
    <Dialog open={open} onClose={isCompleted || isFailed ? onClose : undefined} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          {description}
        </Typography>
        
        {isRunning && (
          <Box sx={{ mb: 2 }}>
            <LinearProgress 
              variant="determinate" 
              value={task.progress || 0}
              sx={{ height: 8, borderRadius: 1 }}
            />
            <Typography variant="body2" sx={{ mt: 1 }}>
              {task.progress || 0}% complete
            </Typography>
          </Box>
        )}
        
        {steps.length > 0 && (
          <List dense>
            {steps.map((step, idx) => (
              <ListItem key={idx}>
                <ListItemIcon>
                  {step.done ? (
                    isFailed ? <ErrorIcon color="error" /> : <CheckCircleIcon color="success" />
                  ) : (
                    <HourglassEmptyIcon color="disabled" />
                  )}
                </ListItemIcon>
                <ListItemText 
                  primary={step.label}
                  primaryTypographyProps={{
                    color: step.done ? 'textPrimary' : 'textSecondary'
                  }}
                />
              </ListItem>
            ))}
          </List>
        )}
        
        {task.currentStep && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Current: {task.currentStep}
          </Typography>
        )}
        
        {isFailed && task.error && (
          <Box sx={{ mt: 2, p: 1, bgcolor: 'error.light', borderRadius: 1 }}>
            <Typography variant="body2" color="error.dark">
              Error: {task.error.message}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {(isCompleted || isFailed) && (
          <Button onClick={onClose} variant="contained">
            Close
          </Button>
        )}
        {isRunning && (
          <Button onClick={onClose} color="inherit">
            Run in Background
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default TaskProgressModal;
