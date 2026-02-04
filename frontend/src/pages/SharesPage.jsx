import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  Tooltip,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import {
  ContentCopy as CopyIcon,
  Delete as DeleteIcon,
  OpenInNew as OpenIcon,
  Lock as LockIcon,
  AccessTime as TimeIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import { sharesApi, bucketApi } from '../services/api';
import { useSnackbar } from '../contexts/SnackbarContext';
import { useAuth } from '../contexts/AuthContext';
import ConfirmDialog from '../components/ConfirmDialog';

const SharesPage = () => {
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const [searchParams, setSearchParams] = useSearchParams();
  const [shares, setShares] = useState([]);
  const [filteredShares, setFilteredShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState([]);
  const [selectedBucket, setSelectedBucket] = useState(searchParams.get('bucket') || '');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [shareToDelete, setShareToDelete] = useState(null);

  useEffect(() => {
    fetchShares();
    fetchBuckets();
  }, []);

  useEffect(() => {
    // Filter shares when selectedBucket changes
    if (selectedBucket) {
      setFilteredShares(shares.filter(s => s.bucket_name === selectedBucket));
    } else {
      setFilteredShares(shares);
    }
  }, [selectedBucket, shares]);

  const fetchShares = async () => {
    setLoading(true);
    try {
      const response = await sharesApi.list();
      setShares(response.data.shares);
      setFilteredShares(response.data.shares);
    } catch (error) {
      showSnackbar('Failed to load share links', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchBuckets = async () => {
    try {
      const response = await bucketApi.list();
      setBuckets(response.data.buckets);
    } catch (error) {
      // Silent fail - bucket list is optional for filtering
    }
  };

  const handleCopyLink = (shareUrl) => {
    const fullUrl = window.location.origin + shareUrl;
    navigator.clipboard.writeText(fullUrl);
    showSnackbar('Link copied to clipboard', 'success');
  };

  const handleDeleteClick = (share) => {
    setShareToDelete(share);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      await sharesApi.delete(shareToDelete.id);
      showSnackbar('Share link revoked', 'success');
      fetchShares();
    } catch (error) {
      showSnackbar('Failed to revoke share', 'error');
    } finally {
      setDeleteConfirmOpen(false);
      setShareToDelete(null);
    }
  };

  const handleOpenLink = (shareUrl) => {
    window.open(shareUrl, '_blank');
  };

  const handleBucketFilterChange = (bucketName) => {
    setSelectedBucket(bucketName);
    if (bucketName) {
      setSearchParams({ bucket: bucketName });
    } else {
      setSearchParams({});
    }
  };

  const getStatusChip = (share) => {
    if (!share.is_active || share.is_expired) {
      return <Chip size="small" color="default" label="Expired/Revoked" />;
    }
    if (share.max_downloads && share.download_count >= share.max_downloads) {
      return <Chip size="small" color="warning" label="Limit Reached" />;
    }
    return <Chip size="small" color="success" label="Active" />;
  };

  const getShareChips = (share) => {
    const chips = [];
    
    if (share.is_password_protected) {
      chips.push(
        <Tooltip key="pwd" title="Password protected">
          <LockIcon fontSize="small" color="action" />
        </Tooltip>
      );
    }
    
    if (share.expires_at) {
      const expiry = new Date(share.expires_at);
      const isExpired = expiry < new Date();
      chips.push(
        <Tooltip key="exp" title={`Expires: ${expiry.toLocaleString()}`}>
          <TimeIcon fontSize="small" color={isExpired ? 'error' : 'action'} />
        </Tooltip>
      );
    }
    
    if (share.max_downloads) {
      chips.push(
        <Tooltip key="dl" title={`Downloads: ${share.download_count}/${share.max_downloads}`}>
          <DownloadIcon fontSize="small" color="action" />
        </Tooltip>
      );
    }
    
    return chips;
  };

  const truncateMiddle = (str, maxLength = 40) => {
    if (str.length <= maxLength) return str;
    const start = Math.ceil((maxLength - 3) / 2);
    const end = Math.floor((maxLength - 3) / 2);
    return str.slice(0, start) + '...' + str.slice(-end);
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
        <Typography variant="h5">Shared Links</Typography>
        <Box display="flex" gap={1}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="bucket-filter-label">
              <Box display="flex" alignItems="center" gap={0.5}>
                <FilterIcon fontSize="small" />
                Filter by Bucket
              </Box>
            </InputLabel>
            <Select
              labelId="bucket-filter-label"
              value={selectedBucket}
              label="Filter by Bucket"
              onChange={(e) => handleBucketFilterChange(e.target.value)}
              MenuProps={{
                disablePortal: true,
                disableScrollLock: true,
              }}
            >
              <MenuItem value="">
                <em>All Buckets ({shares.length} shares)</em>
              </MenuItem>
              {buckets.map((bucket) => {
                const count = shares.filter(s => s.bucket_name === bucket.name).length;
                return (
                  <MenuItem key={bucket.name} value={bucket.name}>
                    {bucket.name} ({count} shares)
                  </MenuItem>
                );
              })}
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchShares}
          >
            Refresh
          </Button>
        </Box>
      </Box>

      {selectedBucket && (
        <Box mb={2}>
          <Chip 
            label={`Showing shares for: ${selectedBucket}`}
            onDelete={() => handleBucketFilterChange('')}
            color="primary"
          />
        </Box>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>File</TableCell>
              <TableCell>Bucket</TableCell>
              {user?.is_admin && <TableCell>Created By</TableCell>}
              <TableCell>Created</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Security</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredShares.map((share) => (
              <TableRow key={share.id}>
                <TableCell>
                  <Typography variant="body2" title={share.object_key}>
                    {truncateMiddle(share.object_key.split('/').pop())}
                  </Typography>
                </TableCell>
                <TableCell>{share.bucket_name}</TableCell>
                {user?.is_admin && (
                  <TableCell>{share.creator_name}</TableCell>
                )}
                <TableCell>
                  {new Date(share.created_at).toLocaleDateString()}
                </TableCell>
                <TableCell>{getStatusChip(share)}</TableCell>
                <TableCell>
                  <Box display="flex" gap={1}>
                    {getShareChips(share)}
                  </Box>
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="Copy Link">
                    <IconButton
                      size="small"
                      onClick={() => handleCopyLink(share.share_url)}
                      disabled={!share.is_active || share.is_expired}
                    >
                      <CopyIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Open Link">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenLink(share.share_url)}
                      disabled={!share.is_active || share.is_expired}
                    >
                      <OpenIcon />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Revoke">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteClick(share)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {filteredShares.length === 0 && (
              <TableRow>
                <TableCell colSpan={user?.is_admin ? 7 : 6} align="center">
                  <Typography color="text.secondary" py={3}>
                    {selectedBucket 
                      ? `No share links for bucket "${selectedBucket}"`
                      : 'No share links created yet'}
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Revoke Share Link"
        message="Are you sure you want to revoke this share link? Anyone with the link will no longer be able to access the file."
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
        confirmText="Revoke"
        confirmColor="error"
      />
    </Box>
  );
};

export default SharesPage;
