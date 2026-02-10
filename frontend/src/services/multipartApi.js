/**
 * Multipart Upload API
 * 
 * Handles large file uploads by splitting them into chunks
 * and uploading via S3's multipart API.
 * 
 * Features:
 * - Parallel upload (3 concurrent parts by default)
 * - Gzip compression for text files
 * - Progress tracking
 */

import api from './api';

// Compression utility using native CompressionStream API
const compressChunk = async (chunk) => {
  try {
    const stream = new Response(chunk).body;
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const compressedBlob = await new Response(compressedStream).blob();
    return compressedBlob;
  } catch (e) {
    console.warn('Compression failed, uploading uncompressed:', e);
    return chunk;
  }
};

// Detect if file type should be compressed
const shouldCompress = (file) => {
  const compressibleTypes = [
    'text/',
    'application/json',
    'application/xml',
    'application/javascript',
    'application/typescript',
    'application/csv',
    'application/x-yaml',
    'application/x-www-form-urlencoded',
  ];
  
  const compressibleExtensions = [
    '.txt', '.csv', '.json', '.xml', '.yaml', '.yml', '.js', '.ts', 
    '.jsx', '.tsx', '.html', '.htm', '.css', '.scss', '.less', 
    '.md', '.log', '.py', '.rb', '.go', '.java', '.c', '.cpp', 
    '.h', '.hpp', '.rs', '.php', '.sh', '.bash', '.zsh', '.sql',
    '.dockerfile', '.properties', '.conf', '.cfg', '.ini', '.env'
  ];
  
  // Check MIME type
  if (compressibleTypes.some(type => file.type?.startsWith(type))) {
    return true;
  }
  
  // Check extension
  const name = file.name.toLowerCase();
  if (compressibleExtensions.some(ext => name.endsWith(ext))) {
    return true;
  }
  
  return false;
};

/**
 * Get the multipart upload threshold from the server
 * @returns {Promise<number>} Threshold in bytes
 */
export const getMultipartThreshold = async () => {
  const response = await api.get('/api/multipart/threshold');
  return response.data.threshold_bytes;
};

/**
 * Initiate a multipart upload session
 * @param {string} bucketName - The bucket name
 * @param {string} key - The object key (filename with prefix)
 * @param {number} storageConfigId - Optional storage config ID
 * @param {boolean} compressed - Whether parts will be gzip compressed
 * @returns {Promise<{upload_id: string, key: string, bucket: string}>}
 */
export const initiateMultipartUpload = async (bucketName, key, storageConfigId = null, compressed = false) => {
  const payload = {
    key,
    storage_config_id: storageConfigId
  };
  if (compressed) {
    payload.compressed = true;
  }
  
  const response = await api.post(
    `/api/buckets/${bucketName}/multipart/initiate`,
    payload
  );
  return response.data;
};

/**
 * Upload a single part
 * @param {string} bucketName - The bucket name
 * @param {string} uploadId - The multipart upload ID
 * @param {string} key - The object key
 * @param {number} partNumber - The part number (1-10000)
 * @param {Blob} chunk - The file chunk to upload
 * @param {number} storageConfigId - Optional storage config ID
 * @param {boolean} compressed - Whether this part is gzip compressed
 * @returns {Promise<{part_number: number, etag: string}>}
 */
export const uploadPart = async (bucketName, uploadId, key, partNumber, chunk, storageConfigId = null, compressed = false) => {
  const formData = new FormData();
  formData.append('upload_id', uploadId);
  formData.append('key', key);
  formData.append('part_number', partNumber.toString());
  formData.append('file', chunk);
  if (storageConfigId) {
    formData.append('storage_config_id', storageConfigId);
  }
  if (compressed) {
    formData.append('compressed', 'true');
  }

  const response = await api.post(
    `/api/buckets/${bucketName}/multipart/upload`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' }
    }
  );
  return response.data;
};

/**
 * Complete a multipart upload
 * @param {string} bucketName - The bucket name
 * @param {string} uploadId - The multipart upload ID
 * @param {string} key - The object key
 * @param {Array<{part_number: number, etag: string}>} parts - List of uploaded parts
 * @param {number} storageConfigId - Optional storage config ID
 * @param {boolean} compressed - Whether the file was compressed
 * @returns {Promise<{success: boolean, location: string, key: string, size: number}>}
 */
export const completeMultipartUpload = async (bucketName, uploadId, key, parts, storageConfigId = null, compressed = false) => {
  const payload = {
    upload_id: uploadId,
    key,
    parts,
    storage_config_id: storageConfigId
  };
  if (compressed) {
    payload.compressed = true;
  }
  
  const response = await api.post(
    `/api/buckets/${bucketName}/multipart/complete`,
    payload
  );
  return response.data;
};

/**
 * Abort a multipart upload (cleanup)
 * @param {string} bucketName - The bucket name
 * @param {string} uploadId - The multipart upload ID
 * @param {string} key - The object key
 * @param {number} storageConfigId - Optional storage config ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const abortMultipartUpload = async (bucketName, uploadId, key, storageConfigId = null) => {
  const response = await api.delete(
    `/api/buckets/${bucketName}/multipart/abort`,
    {
      params: {
        upload_id: uploadId,
        key,
        storage_config_id: storageConfigId
      }
    }
  );
  return response.data;
};

/**
 * Upload a file using multipart upload with parallel uploads and optional gzip compression
 * This is the main function that orchestrates the entire multipart upload process
 * 
 * @param {string} bucketName - The bucket name
 * @param {File} file - The file to upload
 * @param {string} prefix - Optional prefix (folder path)
 * @param {number} storageConfigId - Optional storage config ID
 * @param {Object} options - Upload options
 * @param {number} options.chunkSize - Size of each chunk (default: 10MB)
 * @param {number} options.maxConcurrent - Max concurrent uploads (default: 3)
 * @param {boolean} options.gzipEnabled - Whether to enable gzip compression
 * @param {Function} options.onProgress - Progress callback (progressPercent, partNumber, totalParts)
 * @param {AbortSignal} options.signal - AbortSignal for cancellation
 * @returns {Promise<{success: boolean, key: string, size: number}>}
 */
export const uploadFileMultipart = async (bucketName, file, prefix = '', storageConfigId = null, options = {}) => {
  const {
    chunkSize = 10 * 1024 * 1024, // 10MB default
    maxConcurrent = 3, // Upload 3 parts in parallel
    gzipEnabled = true, // Enable gzip by default
    onProgress = () => {},
    signal = null
  } = options;

  const key = prefix ? `${prefix}${file.name}` : file.name;
  
  // Determine if file should be compressed (check file type and user preference)
  const useCompression = gzipEnabled && shouldCompress(file);
  if (useCompression) {
    console.log(`File ${file.name} will be gzip compressed during upload`);
  }
  
  // Step 1: Initiate multipart upload
  const { upload_id } = await initiateMultipartUpload(bucketName, key, storageConfigId, useCompression);
  
  // Calculate parts
  const totalParts = Math.ceil(file.size / chunkSize);
  const completedParts = [];
  let completedCount = 0;
  
  // Helper to upload a single part (with optional compression)
  const uploadSinglePart = async (partNumber) => {
    // Check for cancellation
    if (signal?.aborted) {
      throw new Error('Upload cancelled');
    }

    const start = (partNumber - 1) * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    let chunk = file.slice(start, end);
    
    // Compress if enabled
    if (useCompression) {
      chunk = await compressChunk(chunk);
    }
    
    // Upload this part
    const { etag } = await uploadPart(bucketName, upload_id, key, partNumber, chunk, storageConfigId, useCompression);
    
    completedCount++;
    const progress = (completedCount / totalParts) * 100;
    onProgress(progress, completedCount, totalParts);
    
    return {
      part_number: partNumber,
      etag
    };
  };
  
  try {
    // Step 2: Upload parts in parallel batches
    for (let i = 0; i < totalParts; i += maxConcurrent) {
      // Check for cancellation
      if (signal?.aborted) {
        throw new Error('Upload cancelled');
      }
      
      // Create batch of concurrent uploads
      const batch = [];
      for (let j = 0; j < maxConcurrent && (i + j) < totalParts; j++) {
        batch.push(uploadSinglePart(i + j + 1));
      }
      
      // Wait for all uploads in this batch to complete
      const batchResults = await Promise.all(batch);
      completedParts.push(...batchResults);
    }
    
    // Sort parts by part number (S3 requires them in order)
    completedParts.sort((a, b) => a.part_number - b.part_number);
    
    // Step 3: Complete multipart upload
    const result = await completeMultipartUpload(bucketName, upload_id, key, completedParts, storageConfigId, useCompression);
    
    return {
      success: true,
      key: result.key,
      size: result.size || file.size,
      compressed: useCompression
    };
  } catch (error) {
    // Attempt to abort/cleanup on failure
    try {
      await abortMultipartUpload(bucketName, upload_id, key, storageConfigId);
    } catch (abortError) {
      console.error('Failed to abort multipart upload:', abortError);
    }
    throw error;
  }
};

// Default export for convenience
export default {
  getMultipartThreshold,
  initiateMultipartUpload,
  uploadPart,
  completeMultipartUpload,
  abortMultipartUpload,
  uploadFileMultipart
};
