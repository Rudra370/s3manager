import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';
import { Download as DownloadIcon } from '@mui/icons-material';
import { objectApi } from '../services/api';

const ObjectPreview = ({ open, onClose, bucketName, objectKey, onDownload }) => {
  const [content, setContent] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const imageUrlRef = useRef(null);

  // Effect to load preview when modal opens
  useEffect(() => {
    if (open && objectKey) {
      loadPreview();
    }
  }, [open, objectKey]);

  // Effect to cleanup blob URL when modal closes or component unmounts
  useEffect(() => {
    return () => {
      cleanupBlobUrl();
    };
  }, []);

  // Cleanup when modal is closed (open changes to false)
  useEffect(() => {
    if (!open) {
      cleanupBlobUrl();
    }
  }, [open]);

  // Cleanup blob URL helper
  const cleanupBlobUrl = useCallback(() => {
    if (imageUrlRef.current) {
      window.URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }
  }, []);

  const loadPreview = async () => {
    setLoading(true);
    setError(null);
    setContent(null);
    // Clear any previous blob URL before loading new preview
    cleanupBlobUrl();

    try {
      const ext = objectKey.split('.').pop().toLowerCase();
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
      const textExts = ['txt', 'md', 'json', 'xml', 'csv', 'log', 'yaml', 'yml', 'js', 'jsx', 'ts', 'tsx', 'py', 'html', 'css', 'sh', 'conf', 'ini'];

      const isImage = imageExts.includes(ext);
      const isText = textExts.includes(ext);

      if (isImage) {
        // For images, fetch with auth and create blob URL
        const response = await objectApi.download(bucketName, objectKey);
        const blob = new Blob([response.data]);
        const imageUrl = window.URL.createObjectURL(blob);
        imageUrlRef.current = imageUrl;
        setContent({ type: 'image', url: imageUrl });
      } else if (isText) {
        // For text files, fetch using API client (cookies are sent automatically)
        const response = await objectApi.download(bucketName, objectKey);
        const text = await response.data.text();
        setContent({ type: 'text', text, ext });
      } else {
        // Other files - show download option
        setContent({ type: 'download' });
      }
    } catch (err) {
      setError('Failed to load preview');
    } finally {
      setLoading(false);
    }
  };

  const getFileName = () => {
    return objectKey ? objectKey.split('/').pop() : '';
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{getFileName()}</DialogTitle>
      <DialogContent>
        {loading && (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Typography color="error" align="center">
            {error}
          </Typography>
        )}

        {content?.type === 'image' && (
          <Box display="flex" justifyContent="center">
            <img
              src={content.url}
              alt={getFileName()}
              style={{ maxWidth: '100%', maxHeight: '70vh' }}
            />
          </Box>
        )}

        {content?.type === 'text' && (
          <Box
            component="pre"
            sx={{
              backgroundColor: '#f5f5f5',
              p: 2,
              borderRadius: 1,
              overflow: 'auto',
              maxHeight: '70vh',
              fontSize: '0.875rem',
            }}
          >
            {content.text}
          </Box>
        )}

        {content?.type === 'download' && (
          <Box textAlign="center" p={4}>
            <Typography variant="body1" gutterBottom>
              Preview not available for this file type.
            </Typography>
            <Button
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={onDownload}
            >
              Download File
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        <Button
          variant="contained"
          startIcon={<DownloadIcon />}
          onClick={onDownload}
        >
          Download
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ObjectPreview;
