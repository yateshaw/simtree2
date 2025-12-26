import axios from 'axios';
import config from './config';

// Create a base axios instance with common configuration
export const api = axios.create({
  baseURL: config.baseUrl,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for handling common request tasks
api.interceptors.request.use(
  (config) => {
    // You could add authentication tokens here if needed
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add response interceptor for handling common response tasks
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle common errors here
    if (error.response?.status === 401) {
      // Unauthorized - redirect to login using proper base URL
      window.location.href = config.getFullUrl('/login');
    }
    return Promise.reject(error);
  }
);

export default api;