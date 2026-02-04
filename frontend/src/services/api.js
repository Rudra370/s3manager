import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Enable sending cookies with requests
});

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - redirect to login (if not already there)
      const pathname = window.location.pathname;
      const isPublicRoute = pathname === '/login' || 
                           pathname === '/setup' || 
                           pathname.startsWith('/s/');
      if (!isPublicRoute) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authApi = {
  login: (email, password) => api.post('/api/auth/login', { email, password }),
  logout: () => api.post('/api/auth/logout'),
  getMe: () => api.get('/api/auth/me'),
};

// Admin API
export const adminApi = {
  getSetupStatus: () => api.get('/api/admin/setup-status'),
  setup: (data) => api.post('/api/admin/setup', data),
  getS3Config: () => api.get('/api/admin/s3-config'),
  updateS3Config: (data) => api.put('/api/admin/s3-config', data),
  getAppConfig: () => api.get('/api/admin/app-config'),
};

// Storage Configs API
export const storageConfigsApi = {
  list: () => api.get('/api/storage-configs'),
  create: (data) => api.post('/api/storage-configs', data),
  get: (id) => api.get(`/api/storage-configs/${id}`),
  update: (id, data) => api.put(`/api/storage-configs/${id}`, data),
  delete: (id) => api.delete(`/api/storage-configs/${id}`),
  test: (id) => api.post(`/api/storage-configs/${id}/test`),
  listBuckets: (id) => api.get(`/api/storage-configs/${id}/buckets`),
};

// Helper to build params with optional storageConfigId
const buildParams = (storageConfigId, additionalParams = {}) => {
  const params = { ...additionalParams };
  if (storageConfigId) {
    params.storage_config_id = storageConfigId;
  }
  return params;
};

// Bucket API
export const bucketApi = {
  list: (storageConfigId) => api.get('/api/buckets', { 
    params: buildParams(storageConfigId) 
  }),
  create: (name, storageConfigId) => api.post('/api/buckets', { 
    name, 
    storage_config_id: storageConfigId 
  }),
  delete: (name, storageConfigId) => api.delete(`/api/buckets/${name}`, { 
    params: buildParams(storageConfigId) 
  }),
  getSize: (name, storageConfigId) => api.get(`/api/buckets/${name}/size`, { 
    params: buildParams(storageConfigId) 
  }),
};

// Object API
export const objectApi = {
  list: (bucketName, params, storageConfigId) => 
    api.get(`/api/buckets/${bucketName}/objects`, { 
      params: buildParams(storageConfigId, params) 
    }),
  upload: (bucketName, file, prefix = '', storageConfigId) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('prefix', prefix);
    if (storageConfigId) {
      formData.append('storage_config_id', storageConfigId);
    }
    return api.post(`/api/buckets/${bucketName}/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  getMetadata: (bucketName, objectKey, storageConfigId) =>
    api.get(`/api/buckets/${bucketName}/objects/${encodeURIComponent(objectKey)}/metadata`, {
      params: buildParams(storageConfigId)
    }),
  download: (bucketName, objectKey, storageConfigId) =>
    api.get(`/api/buckets/${bucketName}/objects/${encodeURIComponent(objectKey)}/download`, {
      responseType: 'blob',
      params: buildParams(storageConfigId)
    }),
  delete: (bucketName, objectKey, storageConfigId) =>
    api.delete(`/api/buckets/${bucketName}/objects/${encodeURIComponent(objectKey)}`, {
      params: buildParams(storageConfigId)
    }),
  bulkDelete: (bucketName, keys, storageConfigId) =>
    api.post(`/api/buckets/${bucketName}/bulk-delete`, { 
      keys, 
      storage_config_id: storageConfigId 
    }),
  createPrefix: (bucketName, prefix, storageConfigId) =>
    api.post(`/api/buckets/${bucketName}/prefix`, { 
      prefix, 
      storage_config_id: storageConfigId 
    }),
  deletePrefix: (bucketName, prefix, storageConfigId) =>
    api.delete(`/api/buckets/${bucketName}/prefix/${encodeURIComponent(prefix)}`, {
      params: buildParams(storageConfigId)
    }),
  getPrefixSize: (bucketName, prefix, storageConfigId) =>
    api.get(`/api/buckets/${bucketName}/prefix/${encodeURIComponent(prefix)}/size`, {
      params: buildParams(storageConfigId)
    }),
  search: (bucketName, query, prefix = '', storageConfigId) =>
    api.get(`/api/buckets/${bucketName}/search`, { 
      params: buildParams(storageConfigId, { query, prefix }) 
    }),
  getDownloadUrl: (bucketName, objectKey, storageConfigId) => {
    const params = new URLSearchParams();
    if (storageConfigId) {
      params.append('storage_config_id', storageConfigId);
    }
    const queryString = params.toString();
    return `${API_BASE_URL}/api/buckets/${bucketName}/objects/${encodeURIComponent(objectKey)}/download${queryString ? '?' + queryString : ''}`;
  },
};

// Users API
export const usersApi = {
  list: () => api.get('/api/users'),
  get: (id) => api.get(`/api/users/${id}`),
  create: (data) => api.post('/api/users', data),
  update: (id, data) => api.put(`/api/users/${id}`, data),
  delete: (id) => api.delete(`/api/users/${id}`),
  resetPassword: (id, newPassword) => api.post(`/api/users/${id}/reset-password`, null, {
    params: { new_password: newPassword }
  }),
  // Storage permissions
  getStoragePermissions: (userId) => api.get(`/api/users/${userId}/storage-permissions`),
  addStoragePermission: (userId, data) => api.post(`/api/users/${userId}/storage-permissions`, data),
  removeStoragePermission: (userId, permissionId) => api.delete(`/api/users/${userId}/storage-permissions/${permissionId}`),
  // Bucket permissions
  getBucketPermissions: (userId, storageConfigId) => api.get(`/api/users/${userId}/bucket-permissions`, {
    params: storageConfigId ? { storage_config_id: storageConfigId } : {}
  }),
  addBucketPermission: (userId, data) => api.post(`/api/users/${userId}/bucket-permissions`, data),
  removeBucketPermission: (userId, permissionId) => api.delete(`/api/users/${userId}/bucket-permissions/${permissionId}`),
};

// Shares API
export const sharesApi = {
  list: () => api.get('/api/shares/list'),
  create: (data) => api.post('/api/shares/create', data),
  delete: (id) => api.delete(`/api/shares/${id}`),
  // Public routes (no auth required)
  getPublicInfo: (token) => api.get(`/api/shares/public/${token}`),
  accessWithPassword: (token, password) => api.post(`/api/shares/public/${token}/access`, { password }),
  download: (token, password) => api.get(`/api/shares/public/${token}/download`, {
    params: { password },
    responseType: 'blob',
  }),
};

export default api;
