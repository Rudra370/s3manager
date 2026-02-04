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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Alert,
  CircularProgress,
  Tooltip,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  LockReset as LockResetIcon,
  ExpandMore as ExpandMoreIcon,
  Storage as StorageIcon,
  Folder as FolderIcon,
} from '@mui/icons-material';
import { usersApi, storageConfigsApi } from '../services/api';
import { useSnackbar } from '../contexts/SnackbarContext';
import { useAuth } from '../contexts/AuthContext';
import { getErrorMessage } from '../utils/error';
import ConfirmDialog from '../components/ConfirmDialog';

const PERMISSION_OPTIONS = [
  { value: 'none', label: 'No Access', color: 'default', sx: {} },
  { value: 'read', label: 'Read Only', color: 'primary', sx: { color: 'white' } },
  { value: 'read-write', label: 'Read & Write', color: 'success', sx: { color: 'white' } },
];

const getPermissionOption = (value) => PERMISSION_OPTIONS.find(p => p.value === value) || PERMISSION_OPTIONS[0];

// Get allowed permission options based on storage permission
const getAllowedPermissionOptions = (storagePermission) => {
  // If storage is 'none', no bucket permissions allowed
  if (storagePermission === 'none') {
    return [];
  }
  // If storage is 'read', only 'read' allowed for buckets
  if (storagePermission === 'read') {
    return PERMISSION_OPTIONS.filter(p => p.value === 'read');
  }
  // If storage is 'read-write', both 'read' and 'read-write' allowed
  if (storagePermission === 'read-write') {
    return PERMISSION_OPTIONS.filter(p => p.value !== 'none');
  }
  return [];
};

const UsersPage = () => {
  const { user: currentUser } = useAuth();
  const { showSnackbar } = useSnackbar();
  
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [storageConfigs, setStorageConfigs] = useState([]);
  
  // Dialog states
  const [openDialog, setOpenDialog] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const [userToResetPassword, setUserToResetPassword] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    is_admin: false,
    is_active: true,
    storage_permissions: [],
    bucket_permissions: [],
  });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    fetchUsers();
    fetchStorageConfigs();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const response = await usersApi.list();
      setUsers(response.data.users);
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load users'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchStorageConfigs = async () => {
    try {
      const response = await storageConfigsApi.list();
      setStorageConfigs(response.data.configs || []);
    } catch (error) {
      // Silent fail - storage configs are optional for display
    }
  };

  const getStorageConfigName = (id) => {
    const config = storageConfigs.find(c => c.id === id);
    return config?.name || 'Unknown';
  };

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      is_admin: false,
      is_active: true,
      storage_permissions: [],
      bucket_permissions: [],
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleOpenEdit = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      password: '',
      is_admin: user.is_admin,
      is_active: user.is_active,
      storage_permissions: user.storage_permissions || [],
      bucket_permissions: user.bucket_permissions || [],
    });
    setFormErrors({});
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingUser(null);
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.email.trim()) errors.email = 'Email is required';
    if (!editingUser && !formData.password) errors.password = 'Password is required';
    if (formData.password && formData.password.length < 6) {
      errors.password = 'Password must be at least 6 characters';
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      const payload = {
        name: formData.name,
        email: formData.email,
        is_admin: formData.is_admin,
        is_active: formData.is_active,
        storage_permissions: formData.is_admin ? [] : formData.storage_permissions,
        bucket_permissions: formData.is_admin ? [] : formData.bucket_permissions,
      };

      if (!editingUser) {
        payload.password = formData.password;
        await usersApi.create(payload);
        showSnackbar('User created successfully', 'success');
      } else {
        if (formData.password) {
          payload.password = formData.password;
        }
        await usersApi.update(editingUser.id, payload);
        showSnackbar('User updated successfully', 'success');
      }

      handleCloseDialog();
      fetchUsers();
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to save user'), 'error');
    }
  };

  const handleDeleteClick = (user) => {
    setUserToDelete(user);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      await usersApi.delete(userToDelete.id);
      showSnackbar('User deleted successfully', 'success');
      fetchUsers();
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to delete user'), 'error');
    } finally {
      setDeleteConfirmOpen(false);
      setUserToDelete(null);
    }
  };

  const handleResetPasswordClick = (user) => {
    setUserToResetPassword(user);
    setNewPassword('');
    setResetPasswordOpen(true);
  };

  const handleConfirmResetPassword = async () => {
    if (newPassword.length < 6) {
      showSnackbar('Password must be at least 6 characters', 'error');
      return;
    }

    try {
      await usersApi.resetPassword(userToResetPassword.id, newPassword);
      showSnackbar('Password reset successfully', 'success');
      setResetPasswordOpen(false);
      setUserToResetPassword(null);
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to reset password'), 'error');
    }
  };

  // Storage Permission Handlers
  const handleStoragePermissionChange = (storageConfigId, permission) => {
    const existingIndex = formData.storage_permissions.findIndex(
      p => p.storage_config_id === storageConfigId
    );

    let newPermissions;
    if (existingIndex >= 0) {
      // Update existing
      newPermissions = formData.storage_permissions.map((p, i) =>
        i === existingIndex ? { ...p, permission } : p
      );
    } else {
      // Add new
      newPermissions = [
        ...formData.storage_permissions,
        { storage_config_id: storageConfigId, permission }
      ];
    }

    // If storage permission is downgraded, remove or adjust bucket permissions that exceed it
    let newBucketPermissions = formData.bucket_permissions;
    if (permission === 'none') {
      // Remove all bucket permissions for this storage
      newBucketPermissions = formData.bucket_permissions.filter(
        p => p.storage_config_id !== storageConfigId
      );
    } else if (permission === 'read') {
      // Downgrade any read-write bucket permissions to read
      newBucketPermissions = formData.bucket_permissions.map(p => {
        if (p.storage_config_id === storageConfigId && p.permission === 'read-write') {
          return { ...p, permission: 'read' };
        }
        return p;
      });
    }

    setFormData({ 
      ...formData, 
      storage_permissions: newPermissions,
      bucket_permissions: newBucketPermissions
    });
  };

  const getStoragePermission = (storageConfigId) => {
    const perm = formData.storage_permissions.find(
      p => p.storage_config_id === storageConfigId
    );
    return perm?.permission || 'none';
  };

  // Bucket Permission Handlers
  const handleBucketPermissionChange = (storageConfigId, bucketName, permission) => {
    const existingIndex = formData.bucket_permissions.findIndex(
      p => p.storage_config_id === storageConfigId && p.bucket_name === bucketName
    );

    let newPermissions;
    if (existingIndex >= 0) {
      if (permission === 'none') {
        // Remove if set to none (will use storage default)
        newPermissions = formData.bucket_permissions.filter((_, i) => i !== existingIndex);
      } else {
        // Update existing
        newPermissions = formData.bucket_permissions.map((p, i) =>
          i === existingIndex ? { ...p, permission } : p
        );
      }
    } else if (permission !== 'none') {
      // Add new
      newPermissions = [
        ...formData.bucket_permissions,
        { storage_config_id: storageConfigId, bucket_name: bucketName, permission }
      ];
    } else {
      newPermissions = formData.bucket_permissions;
    }

    setFormData({ ...formData, bucket_permissions: newPermissions });
  };

  const getBucketPermission = (storageConfigId, bucketName) => {
    const perm = formData.bucket_permissions.find(
      p => p.storage_config_id === storageConfigId && p.bucket_name === bucketName
    );
    return perm?.permission || null; // null means inherit from storage
  };

  const getPermissionChip = (permission) => {
    const option = getPermissionOption(permission || 'none');
    return (
      <Chip
        label={option.label}
        color={option.color}
        size="small"
        variant={permission ? "filled" : "outlined"}
        sx={option.sx}
      />
    );
  };

  // Summary display for user list
  const getUserPermissionsSummary = (user) => {
    if (user.is_admin) {
      return <Chip label="Admin - Full Access" color="error" size="small" />;
    }

    const storageCount = user.storage_permissions?.filter(p => p.permission !== 'none').length || 0;
    const bucketCount = user.bucket_permissions?.length || 0;

    if (storageCount === 0) {
      return <Typography variant="body2" color="text.secondary">No access</Typography>;
    }

    return (
      <Box>
        <Chip
          label={`${storageCount} Storage${storageCount > 1 ? 's' : ''}`}
          size="small"
          color="primary"
          sx={{ mr: 0.5 }}
        />
        {bucketCount > 0 && (
          <Chip
            label={`${bucketCount} Bucket Override${bucketCount > 1 ? 's' : ''}`}
            size="small"
            variant="outlined"
          />
        )}
      </Box>
    );
  };

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
        <Typography variant="h5">User Management</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
        >
          Add User
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Access</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>
                  <Chip
                    label={user.is_admin ? 'Admin' : 'User'}
                    color={user.is_admin ? 'error' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <Chip
                    label={user.is_active ? 'Active' : 'Inactive'}
                    color={user.is_active ? 'success' : 'default'}
                    size="small"
                  />
                </TableCell>
                <TableCell>{getUserPermissionsSummary(user)}</TableCell>
                <TableCell align="right">
                  <Tooltip title="Reset Password">
                    <IconButton
                      size="small"
                      onClick={() => handleResetPasswordClick(user)}
                    >
                      <LockResetIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Edit">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenEdit(user)}
                      disabled={user.id === currentUser?.id && user.is_admin}
                    >
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteClick(user)}
                      disabled={user.id === currentUser?.id}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography color="text.secondary" py={3}>
                    No users found
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingUser ? 'Edit User' : 'Create User'}
        </DialogTitle>
        <DialogContent>
          <Box py={1}>
            {/* Basic Info */}
            <TextField
              fullWidth
              label="Full Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              error={!!formErrors.name}
              helperText={formErrors.name}
              margin="normal"
            />
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              error={!!formErrors.email}
              helperText={formErrors.email}
              margin="normal"
            />
            <TextField
              fullWidth
              label={editingUser ? 'New Password (leave empty to keep current)' : 'Password'}
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              error={!!formErrors.password}
              helperText={formErrors.password}
              margin="normal"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.is_admin}
                  onChange={(e) => setFormData({ ...formData, is_admin: e.target.checked })}
                />
              }
              label="Admin (full access to all storages and buckets)"
              sx={{ mt: 1 }}
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

            {/* Permissions Section (hidden for admins) */}
            {!formData.is_admin && (
              <>
                <Divider sx={{ my: 3 }} />
                <Typography variant="h6" gutterBottom>
                  Storage & Bucket Permissions
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Set access level for each storage configuration. Bucket permissions cannot exceed storage permissions.
                </Typography>

                {storageConfigs.length === 0 ? (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    No storage configurations available. Add a storage config first.
                  </Alert>
                ) : (
                  storageConfigs.map((config) => {
                    const storagePerm = getStoragePermission(config.id);
                    const bucketPerms = formData.bucket_permissions.filter(
                      p => p.storage_config_id === config.id
                    );
                    const allowedOptions = getAllowedPermissionOptions(storagePerm);

                    return (
                      <Accordion 
                        key={config.id} 
                        defaultExpanded={storagePerm !== 'none'}
                        sx={{ mb: 1 }}
                      >
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                          <Box display="flex" alignItems="center" gap={2} flex={1}>
                            <StorageIcon fontSize="small" />
                            <Typography fontWeight="medium" sx={{ flex: 1 }}>
                              {config.name}
                            </Typography>
                            <Box onClick={(e) => e.stopPropagation()}>
                              <FormControl size="small" sx={{ minWidth: 150 }}>
                                <InputLabel>Storage Access</InputLabel>
                                <Select
                                  value={storagePerm}
                                  label="Storage Access"
                                  onChange={(e) => handleStoragePermissionChange(config.id, e.target.value)}
                                >
                                  {PERMISSION_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>
                                      {option.label}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            </Box>
                          </Box>
                        </AccordionSummary>
                        <AccordionDetails>
                          {storagePerm === 'none' ? (
                            <Alert severity="info" size="small">
                              No storage access. Grant storage access to configure bucket permissions.
                            </Alert>
                          ) : (
                            <BucketPermissionEditor
                              storageConfig={config}
                              bucketPermissions={bucketPerms}
                              storagePermission={storagePerm}
                              allowedOptions={allowedOptions}
                              onPermissionChange={handleBucketPermissionChange}
                            />
                          )}
                        </AccordionDetails>
                      </Accordion>
                    );
                  })
                )}
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button variant="contained" onClick={handleSubmit}>
            {editingUser ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete User"
        message={`Are you sure you want to delete user "${userToDelete?.name}"? This action cannot be undone.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        confirmText="Delete"
        confirmColor="error"
      />

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordOpen} onClose={() => setResetPasswordOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset Password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Enter a new password for {userToResetPassword?.name}
          </Typography>
          <TextField
            fullWidth
            label="New Password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            margin="normal"
            helperText="Minimum 6 characters"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResetPasswordOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleConfirmResetPassword}>
            Reset Password
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// Sub-component for bucket permission editing
const BucketPermissionEditor = ({ storageConfig, bucketPermissions, storagePermission, allowedOptions, onPermissionChange }) => {
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newBucketName, setNewBucketName] = useState('');
  const [newPermission, setNewPermission] = useState(allowedOptions[0]?.value || 'read');

  useEffect(() => {
    fetchBuckets();
  }, [storageConfig.id]);

  // Update default permission when allowed options change
  useEffect(() => {
    if (allowedOptions.length > 0 && !allowedOptions.find(o => o.value === newPermission)) {
      setNewPermission(allowedOptions[0].value);
    }
  }, [allowedOptions, newPermission]);

  const fetchBuckets = async () => {
    try {
      const response = await storageConfigsApi.listBuckets(storageConfig.id);
      setBuckets(response.data.buckets || []);
    } catch (error) {
      // Silent fail - bucket list is optional
    } finally {
      setLoading(false);
    }
  };

  const handleAddOverride = () => {
    if (newBucketName) {
      onPermissionChange(storageConfig.id, newBucketName, newPermission);
      setNewBucketName('');
    }
  };

  const existingOverrides = new Set(bucketPermissions.map(p => p.bucket_name));

  return (
    <Box>
      {/* Add new override */}
      <Box display="flex" gap={1} alignItems="center" mb={2}>
        <FormControl size="small" sx={{ flex: 1 }}>
          <InputLabel>Bucket</InputLabel>
          <Select
            value={newBucketName}
            label="Bucket"
            onChange={(e) => setNewBucketName(e.target.value)}
          >
            {buckets.map((bucket) => (
              <MenuItem 
                key={bucket.name} 
                value={bucket.name}
                disabled={existingOverrides.has(bucket.name)}
              >
                <Box display="flex" alignItems="center" gap={1}>
                  <FolderIcon fontSize="small" />
                  {bucket.name}
                  {existingOverrides.has(bucket.name) && (
                    <Chip label="Override set" size="small" sx={{ ml: 1 }} />
                  )}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Permission</InputLabel>
          <Select
            value={newPermission}
            label="Permission"
            onChange={(e) => setNewPermission(e.target.value)}
          >
            {allowedOptions.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="outlined"
          size="small"
          onClick={handleAddOverride}
          disabled={!newBucketName}
        >
          Add
        </Button>
      </Box>

      {/* Existing overrides */}
      {bucketPermissions.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No bucket overrides. All buckets inherit "{getPermissionOption(storagePermission).label}" from storage.
        </Typography>
      ) : (
        <List dense>
          {bucketPermissions.map((perm) => (
            <ListItem
              key={perm.bucket_name}
              secondaryAction={
                <Button
                  size="small"
                  color="error"
                  onClick={() => onPermissionChange(storageConfig.id, perm.bucket_name, 'none')}
                >
                  Remove
                </Button>
              }
            >
              <ListItemText
                primary={
                  <Box display="flex" alignItems="center" gap={1}>
                    <FolderIcon fontSize="small" />
                    {perm.bucket_name}
                    <Chip
                      label={getPermissionOption(perm.permission).label}
                      size="small"
                      color={getPermissionOption(perm.permission).color}
                      sx={{ ml: 1, ...getPermissionOption(perm.permission).sx }}
                    />
                  </Box>
                }
                secondary={
                  perm.permission === storagePermission ? (
                    <Typography variant="caption" color="text.secondary">
                      Same as storage default
                    </Typography>
                  ) : perm.permission !== 'none' && (
                    <Typography variant="caption" color="text.secondary">
                      {perm.permission === 'read' ? 'Restricted to read-only' : 'Full access granted'}
                    </Typography>
                  )
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Box>
  );
};

export default UsersPage;
