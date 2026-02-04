import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Checkbox,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  CircularProgress,
  Alert,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { storageConfigsApi } from '../services/api';
import { useSnackbar } from '../contexts/SnackbarContext';
import { useAuth } from '../contexts/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { getErrorMessage } from '../utils/error';

const StorageConfigsPage = () => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const { showSnackbar } = useSnackbar();

  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [testLoading, setTestLoading] = useState(null); // null or configId
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [configToDelete, setConfigToDelete] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    endpoint_url: '',
    access_key: '',
    secret_key: '',
    region: 'us-east-1',
    use_ssl: true,
    verify_ssl: true,
    is_active: true,
  });
  const [formErrors, setFormErrors] = useState({});
  const [urlProtocol, setUrlProtocol] = useState('https://');

  useEffect(() => {
    if (!isAdmin && !loading) {
      navigate('/dashboard');
      return;
    }
    fetchConfigs();
  }, [isAdmin]);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const response = await storageConfigsApi.list();
      setConfigs(response.data.configs || []);
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load storage configurations'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingConfig(null);
    setFormData({
      name: '',
      endpoint_url: '',
      access_key: '',
      secret_key: '',
      region: 'us-east-1',
      use_ssl: true,
      verify_ssl: true,
      is_active: true,
    });
    setUrlProtocol('https://');
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleOpenEdit = (config) => {
    setEditingConfig(config);
    
    // Parse protocol from endpoint URL
    let protocol = 'https://';
    let endpoint = config.endpoint_url || '';
    if (endpoint.match(/^https:\/\//)) {
      protocol = 'https://';
      endpoint = endpoint.replace(/^https:\/\//, '');
    } else if (endpoint.match(/^http:\/\//)) {
      protocol = 'http://';
      endpoint = endpoint.replace(/^http:\/\//, '');
    }
    
    setUrlProtocol(protocol);
    setFormData({
      name: config.name || '',
      endpoint_url: endpoint,
      access_key: '', // Don't pre-fill credentials for security
      secret_key: '',
      region: config.region || 'us-east-1',
      use_ssl: config.use_ssl !== false,
      verify_ssl: config.verify_ssl !== false,
      is_active: config.is_active !== false,
    });
    setFormErrors({});
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingConfig(null);
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }
    if (!formData.region.trim()) {
      errors.region = 'Region is required';
    }
    if (!editingConfig && !formData.access_key.trim()) {
      errors.access_key = 'Access Key is required';
    }
    if (!editingConfig && !formData.secret_key.trim()) {
      errors.secret_key = 'Secret Key is required';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildPayload = () => {
    const fullEndpointUrl = formData.endpoint_url
      ? (formData.endpoint_url.match(/^https?:\/\//) 
          ? formData.endpoint_url 
          : urlProtocol + formData.endpoint_url)
      : null;

    const payload = {
      name: formData.name.trim(),
      endpoint_url: fullEndpointUrl,
      region: formData.region.trim(),
      use_ssl: formData.use_ssl,
      verify_ssl: formData.verify_ssl,
      is_active: formData.is_active,
    };

    if (formData.access_key) {
      payload.access_key = formData.access_key;
    }
    if (formData.secret_key) {
      payload.secret_key = formData.secret_key;
    }

    return payload;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const payload = buildPayload();

      if (!editingConfig) {
        await storageConfigsApi.create(payload);
        showSnackbar('Storage configuration created successfully', 'success');
      } else {
        await storageConfigsApi.update(editingConfig.id, payload);
        showSnackbar('Storage configuration updated successfully', 'success');
      }

      handleCloseDialog();
      fetchConfigs();
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to save configuration'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTestConnection = async (configId) => {
    setTestLoading(configId);
    try {
      const response = await storageConfigsApi.test(configId);
      showSnackbar(response.data.message || 'Connection successful', 'success');
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Connection failed'), 'error');
    } finally {
      setTestLoading(null);
    }
  };

  const handleDeleteClick = (config) => {
    setConfigToDelete(config);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!configToDelete) return;

    try {
      await storageConfigsApi.delete(configToDelete.id);
      showSnackbar('Storage configuration deleted successfully', 'success');
      fetchConfigs();
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to delete configuration'), 'error');
    } finally {
      setDeleteConfirmOpen(false);
      setConfigToDelete(null);
    }
  };

  const getDeleteWarningMessage = () => {
    if (!configToDelete) return '';
    const activeCount = configs.filter(c => c.is_active).length;
    const isLastActive = configToDelete.is_active && activeCount === 1;
    
    if (isLastActive) {
      return `Are you sure you want to delete "${configToDelete.name}"? This is the last active storage configuration.`;
    }
    return `Are you sure you want to delete "${configToDelete.name}"?`;
  };

  if (!isAdmin) {
    return (
      <Box>
        <Alert severity="error">
          You do not have permission to access this page.
        </Alert>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="60vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h5">Storage Configurations</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
        >
          Add Storage Config
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Endpoint URL</TableCell>
              <TableCell>Region</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {configs.map((config) => (
              <TableRow key={config.id} hover>
                <TableCell>
                  <Typography variant="body2" fontWeight={500}>
                    {config.name}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {config.endpoint_url || 'AWS S3 (default)'}
                  </Typography>
                </TableCell>
                <TableCell>{config.region}</TableCell>
                <TableCell>
                  {config.is_active ? (
                    <Chip 
                      icon={<CheckCircleIcon />}
                      label="Active" 
                      color="success" 
                      size="small" 
                    />
                  ) : (
                    <Chip label="Inactive" size="small" />
                  )}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Test Connection">
                    <IconButton
                      size="small"
                      onClick={() => handleTestConnection(config.id)}
                      disabled={testLoading === config.id}
                    >
                      {testLoading === config.id ? (
                        <CircularProgress size={18} />
                      ) : (
                        <RefreshIcon fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenEdit(config)}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteClick(config)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {configs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <Typography color="text.secondary" py={3}>
                    No storage configurations found
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog 
        open={dialogOpen} 
        onClose={handleCloseDialog} 
        maxWidth="sm" 
        fullWidth
        disableRestoreFocus
      >
        <DialogTitle>
          {editingConfig ? 'Edit Storage Configuration' : 'Add Storage Configuration'}
        </DialogTitle>
        <DialogContent dividers>
          <Box component="form" noValidate>
            <TextField
              autoFocus
              fullWidth
              label="Configuration Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={!!formErrors.name}
              helperText={formErrors.name}
              margin="normal"
              required
              placeholder="e.g., AWS S3, MinIO Local"
            />

            <Box sx={{ mt: 2, mb: 1 }}>
              <Grid container spacing={2} alignItems="flex-start">
                <Grid item xs={3}>
                  <FormControl fullWidth>
                    <InputLabel id="protocol-label">Protocol</InputLabel>
                    <Select
                      labelId="protocol-label"
                      value={urlProtocol}
                      label="Protocol"
                      onChange={(e) => setUrlProtocol(e.target.value)}
                      size="small"
                    >
                      <MenuItem value="https://">https://</MenuItem>
                      <MenuItem value="http://">http://</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={9}>
                  <TextField
                    fullWidth
                    label="Endpoint URL"
                    value={formData.endpoint_url}
                    onChange={(e) => {
                      let value = e.target.value;
                      if (value.match(/^https:\/\//)) {
                        setUrlProtocol('https://');
                        value = value.replace(/^https:\/\//, '');
                      } else if (value.match(/^http:\/\//)) {
                        setUrlProtocol('http://');
                        value = value.replace(/^http:\/\//, '');
                      }
                      value = value.replace(/\/$/, '');
                      setFormData({ ...formData, endpoint_url: value });
                    }}
                    placeholder="s3.amazonaws.com or localhost:9000"
                    helperText="Leave empty for AWS S3"
                    size="small"
                  />
                </Grid>
              </Grid>
            </Box>

            <Grid container spacing={2} sx={{ mt: 0 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Access Key"
                  value={formData.access_key}
                  onChange={(e) => setFormData({ ...formData, access_key: e.target.value })}
                  error={!!formErrors.access_key}
                  helperText={formErrors.access_key}
                  margin="normal"
                  required={!editingConfig}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Secret Key"
                  type="password"
                  value={formData.secret_key}
                  onChange={(e) => setFormData({ ...formData, secret_key: e.target.value })}
                  error={!!formErrors.secret_key}
                  helperText={formErrors.secret_key || (editingConfig ? 'Leave empty to keep unchanged' : '')}
                  margin="normal"
                  required={!editingConfig}
                />
              </Grid>
            </Grid>

            <TextField
              fullWidth
              label="Region"
              value={formData.region}
              onChange={(e) => setFormData({ ...formData, region: e.target.value })}
              error={!!formErrors.region}
              helperText={formErrors.region}
              margin="normal"
              required
              placeholder="us-east-1"
            />

            <Divider sx={{ my: 2 }} />

            <Box>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.use_ssl}
                    onChange={(e) => setFormData({ ...formData, use_ssl: e.target.checked })}
                  />
                }
                label="Use SSL"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.verify_ssl}
                    onChange={(e) => setFormData({ ...formData, verify_ssl: e.target.checked })}
                  />
                }
                label="Verify SSL Certificate"
              />
              <FormControlLabel
                control={
                  <Checkbox
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                }
                label="Active"
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={handleCloseDialog} disabled={isSubmitting}>
            Cancel
          </Button>
          <Box sx={{ flex: 1 }} />
          <Button 
            onClick={handleSubmit} 
            variant="contained" 
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <CircularProgress size={20} />
            ) : editingConfig ? (
              'Update'
            ) : (
              'Create'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete Storage Configuration"
        message={getDeleteWarningMessage()}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        confirmText="Delete"
        confirmColor="error"
      />
    </Box>
  );
};

export default StorageConfigsPage;
