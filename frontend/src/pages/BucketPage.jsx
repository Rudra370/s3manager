import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getErrorMessage } from '../utils/error';
import {
  Box,
  Typography,
  Button,
  Breadcrumbs,
  Link,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Checkbox,
  IconButton,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Chip,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Refresh as RefreshIcon,
  CreateNewFolder as CreateFolderIcon,
  Upload as UploadIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  OpenInNew as OpenInNewIcon,
  ContentCopy as ContentCopyIcon,
  Search as SearchIcon,
  MoreVert as MoreVertIcon,
  Folder as FolderIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  Article as TextIcon,
  ArrowUpward as ArrowUpIcon,
  Calculate as CalculateIcon,
  Share as ShareIcon,
} from '@mui/icons-material';

import { objectApi, bucketApi } from '../services/api';
import api from '../services/api';
import { useSnackbar } from '../contexts/SnackbarContext';
import { useAuth } from '../contexts/AuthContext';
import { useStorageConfig } from '../contexts/StorageConfigContext';
import { useTaskContext } from '../contexts/TaskContext';
import { useInlineProgress } from '../hooks/useInlineProgress';
import { useBackgroundTask } from '../hooks/useBackgroundTask';
import ConfirmDialog from '../components/ConfirmDialog';
import ObjectPreview from '../components/ObjectPreview';
import ShareDialog from '../components/ShareDialog';
import { InlineProgress, TaskSnackbar } from '../components/tasks';

const BucketPage = () => {
  const { bucketName } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { showSnackbar } = useSnackbar();
  const { user } = useAuth();
  const { currentStorageConfig } = useStorageConfig();

  // Parse prefix from URL
  const getPrefixFromUrl = () => {
    const searchParams = new URLSearchParams(location.search);
    return searchParams.get('prefix') || '';
  };

  const [prefix, setPrefix] = useState(getPrefixFromUrl);
  const [objects, setObjects] = useState([]);
  const [directories, setDirectories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [hasMore, setHasMore] = useState(false);
  const [nextToken, setNextToken] = useState(null);

  // Dialog states
  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [calculatingSize, setCalculatingSize] = useState({});
  const [itemSizes, setItemSizes] = useState({});
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareItem, setShareItem] = useState(null);

  // Menu state
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuItem, setMenuItem] = useState(null);

  // Task context for bulk delete
  const { startPolling } = useTaskContext();
  const { startTask } = useBackgroundTask();

  // Inline progress for size calculation
  const { 
    startTask: startSizeCalc, 
    isLoading: isCalculatingSize, 
    result: sizeResult 
  } = useInlineProgress({
    onComplete: (data) => {
      showSnackbar(`Size: ${data.result.size_formatted}`, 'success');
    },
    onError: (error) => {
      showSnackbar(error.message || 'Failed to calculate size', 'error');
    }
  });

  // Load objects when bucket, prefix changes or when storage config becomes available
  useEffect(() => {
    if (bucketName) {
      loadObjects();
    }
  }, [bucketName, prefix]);

  // Also reload when storage config ID changes
  useEffect(() => {
    if (bucketName && currentStorageConfig?.id) {
      loadObjects();
    }
  }, [currentStorageConfig?.id]);

  const loadObjects = async () => {
    setLoading(true);
    setSelected([]);
    try {
      const response = await objectApi.list(bucketName, {
        prefix,
        delimiter: '/',
        max_keys: rowsPerPage,
      }, currentStorageConfig?.id);

      setDirectories(response.data.directories);
      setObjects(response.data.objects);
      setHasMore(response.data.is_truncated);
      setNextToken(response.data.next_continuation_token);
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to load objects'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadObjects();
      return;
    }

    setLoading(true);
    try {
      const response = await objectApi.search(bucketName, searchQuery, prefix, currentStorageConfig?.id);
      setObjects(response.data.objects);
      setDirectories([]);
      setHasMore(false);
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Search failed'), 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleNavigateToFolder = (folderPrefix) => {
    setPrefix(folderPrefix);
    navigate(`/bucket/${bucketName}?prefix=${encodeURIComponent(folderPrefix)}`);
  };

  const handleNavigateUp = () => {
    if (!prefix) return;
    const parts = prefix.split('/').filter(Boolean);
    parts.pop();
    const newPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
    setPrefix(newPrefix);
    navigate(`/bucket/${bucketName}?prefix=${encodeURIComponent(newPrefix)}`);
  };

  const getBreadcrumbs = () => {
    const parts = prefix.split('/').filter(Boolean);
    const breadcrumbs = [{ name: bucketName, prefix: '' }];
    let currentPrefix = '';
    for (const part of parts) {
      currentPrefix += part + '/';
      breadcrumbs.push({ name: part, prefix: currentPrefix });
    }
    return breadcrumbs;
  };

  const handleFileUpload = async (event) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      for (let i = 0; i < files.length; i++) {
        await objectApi.upload(bucketName, files[i], prefix, currentStorageConfig?.id);
        setUploadProgress(((i + 1) / files.length) * 100);
      }
      showSnackbar('Files uploaded successfully', 'success');
      loadObjects();
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Upload failed'), 'error');
    } finally {
      setUploading(false);
      setUploadProgress(0);
      event.target.value = '';
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      showSnackbar('Please enter a folder name', 'error');
      return;
    }

    try {
      const folderPrefix = prefix + newFolderName.trim() + '/';
      await objectApi.createPrefix(bucketName, folderPrefix, currentStorageConfig?.id);
      showSnackbar('Folder created successfully', 'success');
      setCreateFolderOpen(false);
      setNewFolderName('');
      loadObjects();
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Failed to create folder'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;

    try {
      if (deleteItem.type === 'directory') {
        // Use background task with snackbar for folder deletion
        setDeleteDialogOpen(false);
        const folderName = deleteItem.name;
        setDeleteItem(null);
        
        startTask(
          `/api/tasks/prefix-delete/${encodeURIComponent(bucketName)}`,
          {
            prefix: deleteItem.prefix,
            storage_config_id: currentStorageConfig?.id
          },
          {
            successMessage: `Folder '${folderName}' deleted successfully`,
            onComplete: () => {
              loadObjects();
            },
            onError: (error) => {
              showSnackbar(getErrorMessage(error, 'Failed to delete folder'), 'error');
            }
          }
        );
      } else {
        // Single file delete remains synchronous
        await objectApi.delete(bucketName, deleteItem.key, currentStorageConfig?.id);
        showSnackbar('Deleted successfully', 'success');
        setDeleteDialogOpen(false);
        setDeleteItem(null);
        loadObjects();
      }
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Delete failed'), 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selected.length === 0) return;
    
    try {
      setDeleteDialogOpen(false);
      
      const response = await api.post('/api/tasks/bulk-delete', {
        bucket_name: bucketName,
        keys: selected,
        storage_config_id: currentStorageConfig?.id
      });
      
      const { task_id } = response.data;
      
      // Start polling via context - TaskSnackbar will show progress
      startPolling(task_id, 'BACKGROUND',
        () => {
          // On complete
          showSnackbar(`${selected.length} items deleted successfully`, 'success');
          setSelected([]);
          loadObjects();
        },
        (error) => {
          // On error
          showSnackbar(error.message || 'Bulk delete failed', 'error');
        }
      );
    } catch (error) {
      showSnackbar('Failed to start bulk delete', 'error');
    }
  };

  const handleDownload = async (item) => {
    try {
      const response = await objectApi.download(bucketName, item.key, currentStorageConfig?.id);
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', item.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      showSnackbar(getErrorMessage(error, 'Download failed'), 'error');
    }
  };

  const handleCopyUrl = (item) => {
    const url = objectApi.getDownloadUrl(bucketName, item.key, currentStorageConfig?.id);
    navigator.clipboard.writeText(window.location.origin + url);
    showSnackbar('URL copied to clipboard', 'success');
  };

  const handleCalculateSize = async () => {
    try {
      await startSizeCalc('/api/tasks/calculate-size', {
        bucket_name: bucketName,
        prefix: prefix || '',
        storage_config_id: currentStorageConfig?.id
      });
    } catch (error) {
      // Error handled by hook
    }
  };

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      const allKeys = [
        ...directories.map((d) => d.prefix),
        ...objects.map((o) => o.key),
      ];
      setSelected(allKeys);
    } else {
      setSelected([]);
    }
  };

  const handleSelectItem = (key) => {
    if (selected.includes(key)) {
      setSelected(selected.filter((k) => k !== key));
    } else {
      setSelected([...selected, key]);
    }
  };

  const openMenu = (event, item) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuItem(item);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuItem(null);
  };

  const getFileIcon = (contentType) => {
    if (contentType?.startsWith('image/')) return <ImageIcon color="primary" />;
    if (contentType?.startsWith('text/')) return <TextIcon color="info" />;
    return <FileIcon />;
  };

  const allItems = [...directories, ...objects];

  return (
    <Box>
      {/* Header */}
      <Box display="flex" alignItems="center" mb={2}>
        <IconButton onClick={() => navigate('/')} sx={{ mr: 1 }}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4">{bucketName}</Typography>
        {currentStorageConfig && (
          <Chip 
            label={`Storage: ${currentStorageConfig.name}`} 
            size="small" 
            color="primary" 
            variant="outlined"
            sx={{ ml: 1 }}
          />
        )}
      </Box>

      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 2 }}>
        {getBreadcrumbs().map((crumb, index, arr) => (
          <Link
            key={crumb.prefix}
            component="button"
            variant="body1"
            onClick={() => handleNavigateToFolder(crumb.prefix)}
            underline={index === arr.length - 1 ? 'none' : 'hover'}
            color={index === arr.length - 1 ? 'text.primary' : 'inherit'}
            fontWeight={index === arr.length - 1 ? 'bold' : 'normal'}
          >
            {crumb.name}
          </Link>
        ))}
      </Breadcrumbs>

      {/* Toolbar */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Box display="flex" gap={1} flexWrap="wrap">
          {prefix && (
            <Button
              variant="outlined"
              startIcon={<ArrowUpIcon />}
              onClick={handleNavigateUp}
            >
              Up
            </Button>
          )}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={loadObjects}
          >
            Refresh
          </Button>
          <Button
            variant="outlined"
            startIcon={<ShareIcon />}
            onClick={() => navigate(`/shares?bucket=${encodeURIComponent(bucketName)}`)}
          >
            View Shares
          </Button>
          <Button
            variant="outlined"
            startIcon={<CreateFolderIcon />}
            onClick={() => setCreateFolderOpen(true)}
          >
            New Folder
          </Button>
          <Button
            variant="contained"
            component="label"
            startIcon={<UploadIcon />}
            disabled={uploading}
          >
            Upload
            <input
              type="file"
              hidden
              multiple
              onChange={handleFileUpload}
            />
          </Button>
          {selected.length > 0 && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={() => {
                setDeleteItem({ type: 'bulk', count: selected.length });
                setDeleteDialogOpen(true);
              }}
            >
              Delete ({selected.length})
            </Button>
          )}
        </Box>

        <TextField
          size="small"
          placeholder="Search files..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Upload Progress */}
      {uploading && (
        <Box mb={2}>
          <Typography variant="body2" color="text.secondary">
            Uploading... {Math.round(uploadProgress)}%
          </Typography>
          <LinearProgress variant="determinate" value={uploadProgress} />
        </Box>
      )}

      {/* Objects Table */}
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selected.length > 0 && selected.length < allItems.length}
                  checked={allItems.length > 0 && selected.length === allItems.length}
                  onChange={handleSelectAll}
                />
              </TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Last Modified</TableCell>
              <TableCell>Type</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : allItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <Typography color="text.secondary">
                    This folder is empty
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              allItems.map((item) => {
                const key = item.key || item.prefix;
                const isSelected = selected.includes(key);

                return (
                  <TableRow
                    key={key}
                    hover
                    selected={isSelected}
                    onDoubleClick={() => {
                      if (item.type === 'directory') {
                        handleNavigateToFolder(item.prefix);
                      } else {
                        setPreviewItem(item);
                        setPreviewOpen(true);
                      }
                    }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={isSelected}
                        onChange={() => handleSelectItem(key)}
                      />
                    </TableCell>
                    <TableCell>
                      <Box display="flex" alignItems="center">
                        {item.type === 'directory' ? (
                          <FolderIcon color="warning" sx={{ mr: 1 }} />
                        ) : (
                          <Box sx={{ mr: 1 }}>{getFileIcon(item.content_type)}</Box>
                        )}
                        <Link
                          component="button"
                          onClick={() => {
                            if (item.type === 'directory') {
                              handleNavigateToFolder(item.prefix);
                            } else {
                              setPreviewItem(item);
                              setPreviewOpen(true);
                            }
                          }}
                          underline="hover"
                        >
                          {item.name}
                        </Link>
                      </Box>
                    </TableCell>
                    <TableCell>
                      {itemSizes[key] ? (
                        <Chip label={itemSizes[key]} size="small" />
                      ) : item.size !== undefined ? (
                        item.size_formatted
                      ) : (
                        <Button
                          size="small"
                          onClick={() => {
                            // For individual items, store the result in itemSizes
                            const calcItem = item;
                            const itemKey = calcItem.key || calcItem.prefix;
                            setCalculatingSize((prev) => ({ ...prev, [itemKey]: true }));
                            objectApi.getPrefixSize(bucketName, calcItem.prefix, currentStorageConfig?.id)
                              .then((response) => {
                                setItemSizes((prev) => ({ ...prev, [itemKey]: response.data.size_formatted }));
                              })
                              .catch((error) => {
                                showSnackbar(getErrorMessage(error, 'Failed to calculate size'), 'error');
                              })
                              .finally(() => {
                                setCalculatingSize((prev) => ({ ...prev, [itemKey]: false }));
                              });
                          }}
                          disabled={calculatingSize[key]}
                        >
                          {calculatingSize[key] ? (
                            <CircularProgress size={16} />
                          ) : (
                            <CalculateIcon fontSize="small" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.last_modified
                        ? new Date(item.last_modified).toLocaleString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {item.type === 'directory'
                        ? 'Folder'
                        : item.content_type || 'Unknown'}
                    </TableCell>
                    <TableCell align="right">
                      <IconButton
                        size="small"
                        onClick={(e) => openMenu(e, item)}
                      >
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
      >
        {menuItem?.type === 'file' && (
          <MenuItem
            onClick={() => {
              handleDownload(menuItem);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <DownloadIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Download</ListItemText>
          </MenuItem>
        )}
        {menuItem?.type === 'file' && (
          <MenuItem
            onClick={() => {
              const url = objectApi.getDownloadUrl(bucketName, menuItem.key, currentStorageConfig?.id);
              window.open(url, '_blank');
              closeMenu();
            }}
          >
            <ListItemIcon>
              <OpenInNewIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Open</ListItemText>
          </MenuItem>
        )}
        {menuItem?.type === 'file' && (
          <MenuItem
            onClick={() => {
              handleCopyUrl(menuItem);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <ContentCopyIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Copy URL</ListItemText>
          </MenuItem>
        )}
        {menuItem?.type === 'file' && (
          <MenuItem
            onClick={() => {
              setShareItem(menuItem);
              setShareDialogOpen(true);
              closeMenu();
            }}
          >
            <ListItemIcon>
              <ShareIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText>Share</ListItemText>
          </MenuItem>
        )}
        <MenuItem
          onClick={() => {
            setDeleteItem(menuItem);
            setDeleteDialogOpen(true);
            closeMenu();
          }}
        >
          <ListItemIcon>
            <DeleteIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText sx={{ color: 'error.main' }}>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Create Folder Dialog */}
      <Dialog open={createFolderOpen} onClose={() => setCreateFolderOpen(false)}>
        <DialogTitle>Create New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Folder Name"
            fullWidth
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateFolderOpen(false)}>Cancel</Button>
          <Button onClick={handleCreateFolder} variant="contained">
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={deleteItem?.type === 'bulk' ? handleBulkDelete : handleDelete}
        title="Confirm Delete"
        message={
          deleteItem?.type === 'bulk'
            ? `Are you sure you want to delete ${deleteItem.count} items?`
            : `Are you sure you want to delete "${deleteItem?.name || deleteItem?.prefix}"?`
        }
        confirmText="Delete"
        confirmColor="error"
      />

      {/* Object Preview */}
      {previewItem && (
        <ObjectPreview
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          bucketName={bucketName}
          objectKey={previewItem.key}
          onDownload={() => handleDownload(previewItem)}
        />
      )}

      {/* Share Dialog */}
      {shareItem && (
        <ShareDialog
          open={shareDialogOpen}
          onClose={() => {
            setShareDialogOpen(false);
            setShareItem(null);
          }}
          bucketName={bucketName}
          objectKey={shareItem.key}
          objectName={shareItem.name}
        />
      )}

      {/* Global Task Progress Snackbar (for folder and bulk deletion) */}
      <TaskSnackbar />
    </Box>
  );
};

export default BucketPage;
