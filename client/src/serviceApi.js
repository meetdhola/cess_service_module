import axios from 'axios';

const svcApi = axios.create({ baseURL: '/api/service' });

svcApi.interceptors.request.use(cfg => {
  const token = localStorage.getItem('svc_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

svcApi.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('svc_token');
      localStorage.removeItem('svc_user');
      window.location.href = '/service/login';
    }
    return Promise.reject(err);
  }
);

export default svcApi;
