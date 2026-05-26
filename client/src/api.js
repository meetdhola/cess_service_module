import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

// Attach JWT to every request
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('cess_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Auto-logout on 401
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('cess_token');
      localStorage.removeItem('cess_user');
      window.location.href = '/';
    }
    return Promise.reject(err);
  }
);

export default api;
