import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  CardActions,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  ListItemSecondaryAction,
  CircularProgress,
  Tooltip,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Folder as FolderIcon,
  Refresh as RefreshIcon,
  Storage as StorageIcon,
  CalendarToday as CalendarIcon,
} from '@mui/icons-material';

import api, { bucketApi } from '../services/api';
import { useSnackbar } from '../contexts/SnackbarContext';
import { useStorageConfig } from '../contexts/StorageConfigContext';
import { getErrorMessage } from '../utils/error';
import ConfirmDialog from '../components/ConfirmDialog';
import { useBackgroundTask } from '../hooks/useBackgroundTask';
import { TaskSnackbar } from '../components/tasks';

const DashboardPage = () => {
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const { currentStorageConfig } = useStorageConfig();
  const { startTask } = useBackgroundTask();

  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bucketToDelete, setBucketToDelete] = useState(null);
  const [newBucketName, setNewBucketName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [calculatingSize, setCalculatingSize] = useState({});
  const [bucketSizes, setBucketSizes] = useState({});

  const fetchBuckets = async () => {
    setLoading(true);
    try {
      const storageConfigId = currentStorageConfig?.id;
      const response = await bucketApi.list(storageConfigId);
      setBuckets(response.data.buckets);
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load buckets'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch buckets when component mounts or when storage config is available
    fetchBuckets();
  }, []);

  useEffect(() => {
    // Re-fetch when storage config changes
    if (currentStorageConfig) {
      fetchBuckets();
    }
  }, [currentStorageConfig?.id]);

  const handleCreateBucket = async () => {
    if (!newBucketName.trim()) {
      showSnackbar('Please enter a bucket name', 'error');
      return;
    }

    setCreating(true);
    try {
      await bucketApi.create(newBucketName.trim(), currentStorageConfig?.id);
      showSnackbar('Bucket created successfully', 'success');
      setCreateDialogOpen(false);
      setNewBucketName('');
      fetchBuckets();
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to create bucket'), 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteClick = (bucket) => {
    setBucketToDelete(bucket);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!bucketToDelete) return;

    setDeleting(true);
    setDeleteDialogOpen(false);
    
    // Start background deletion task
    try {
      await startTask(
        `/api/tasks/bucket-delete/${encodeURIComponent(bucketToDelete.name)}`,
        { storage_config_id: currentStorageConfig?.id },
        {
          successMessage: `Bucket '${bucketToDelete.name}' deleted successfully`,
          onComplete: () => {
            // Refresh bucket list after deletion
            fetchBuckets();
            setDeleting(false);
            setBucketToDelete(null);
          },
          onError: (error) => {
            console.error('Failed to delete bucket:', error);
            showSnackbar(getErrorMessage(error, 'Failed to delete bucket'), 'error');
            setDeleting(false);
          }
        }
      );
      
      // Note: bucket will be removed from UI when task completes
      // For now, we don't remove it immediately since deletion is async
      showSnackbar('Bucket deletion started in background', 'info');
      
    } catch (error) {
      console.error('Failed to start delete task:', error);
      showSnackbar('Failed to start bucket deletion', 'error');
      setDeleting(false);
    }
  };

  const handleCalculateSize = async (bucketName) => {
    setCalculatingSize((prev) => ({ ...prev, [bucketName]: true }));
    try {
      // Start background task for size calculation
      const response = await api.post('/api/tasks/calculate-size', {
        bucket_name: bucketName,
        storage_config_id: currentStorageConfig?.id
      });
      
      const { task_id } = response.data;
      
      // Poll for progress
      const pollInterval = setInterval(async () => {
        try {
          const progressResp = await api.get(`/api/tasks/${task_id}/progress`);
          const data = progressResp.data;
          
          if (data.status === 'completed') {
            clearInterval(pollInterval);
            setBucketSizes((prev) => ({
              ...prev,
              [bucketName]: data.result.size_formatted,
            }));
            setCalculatingSize((prev) => ({ ...prev, [bucketName]: false }));
          } else if (data.status === 'failed') {
            clearInterval(pollInterval);
            showSnackbar(data.error?.message || 'Failed to calculate size', 'error');
            setCalculatingSize((prev) => ({ ...prev, [bucketName]: false }));
          }
          // If running, continue polling (loading state remains)
        } catch (pollError) {
          clearInterval(pollInterval);
          showSnackbar('Failed to get progress', 'error');
          setCalculatingSize((prev) => ({ ...prev, [bucketName]: false }));
        }
      }, 2000);
      
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to calculate size'), 'error');
      setCalculatingSize((prev) => ({ ...prev, [bucketName]: false }));
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4">Buckets</Typography>
          {currentStorageConfig && (
            <Typography variant="body2" color="text.secondary">
              Storage: {currentStorageConfig.name}
            </Typography>
          )}
        </Box>
        <Box>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchBuckets}
            sx={{ mr: 1 }}
          >
            Refresh
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Bucket
          </Button>
        </Box>
      </Box>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress />
        </Box>
      ) : buckets.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <StorageIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              No buckets found
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Create your first bucket to get started
            </Typography>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setCreateDialogOpen(true)}
              sx={{ mt: 2 }}
            >
              Create Bucket
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Grid container spacing={2}>
          {buckets.map((bucket) => (
            <Grid item xs={12} sm={6} md={4} key={bucket.name}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <FolderIcon color="primary" sx={{ mr: 1 }} />
                    <Typography
                      variant="h6"
                      noWrap
                      sx={{ cursor: 'pointer' }}
                      onClick={() => navigate(`/bucket/${bucket.name}`)}
                    >
                      {bucket.name}
                    </Typography>
                  </Box>

                  <Box display="flex" alignItems="center" mb={1}>
                    <CalendarIcon sx={{ fontSize: 16, mr: 0.5, color: 'text.secondary' }} />
                    <Typography variant="body2" color="text.secondary">
                      Created: {formatDate(bucket.creation_date)}
                    </Typography>
                  </Box>

                  {bucketSizes[bucket.name] ? (
                    <Chip
                      label={`Size: ${bucketSizes[bucket.name]}`}
                      size="small"
                      sx={{
                        backgroundColor: (theme) => 
                          theme.palette.mode === 'dark' ? '#1F6FEB' : '#0969DA',
                        color: '#FFFFFF',
                        '& .MuiChip-deleteIcon': {
                          color: 'rgba(255,255,255,0.8)',
                          '&:hover': {
                            color: '#FFFFFF',
                          },
                        },
                      }}
                      onDelete={() =>
                        setBucketSizes((prev) => {
                          const next = { ...prev };
                          delete next[bucket.name];
                          return next;
                        })
                      }
                    />
                  ) : (
                    <Button
                      size="small"
                      onClick={() => handleCalculateSize(bucket.name)}
                      disabled={calculatingSize[bucket.name]}
                    >
                      {calculatingSize[bucket.name] ? (
                        <CircularProgress size={16} />
                      ) : (
                        'Calculate Size'
                      )}
                    </Button>
                  )}
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    onClick={() => navigate(`/bucket/${bucket.name}`)}
                  >
                    Open
                  </Button>
                  <Box flexGrow={1} />
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDeleteClick(bucket)}
                    disabled={deleting}
                  >
                    <DeleteIcon />
                  </IconButton>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Create Bucket Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}>
        <DialogTitle>Create New Bucket</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Bucket Name"
            fullWidth
            value={newBucketName}
            onChange={(e) => setNewBucketName(e.target.value)}
            helperText="Bucket names must be unique and DNS-compliant"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleCreateBucket}
            variant="contained"
            disabled={creating}
          >
            {creating ? <CircularProgress size={24} /> : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Bucket"
        message={`Are you sure you want to delete the bucket "${bucketToDelete?.name}"? This action cannot be undone and will delete all objects in the bucket.`}
        confirmText="Delete"
        confirmColor="error"
        disabled={deleting}
      />

      {/* Global Task Progress Snackbar */}
      <TaskSnackbar />
    </Box>
  );
};

export default DashboardPage;
