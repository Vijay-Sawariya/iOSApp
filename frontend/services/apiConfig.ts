const DEFAULT_BACKEND_URL = 'https://sagar-home-api.onrender.com';

const normalizeBackendUrl = (url?: string): string => {
  const trimmed = url?.trim();
  return (trimmed || DEFAULT_BACKEND_URL).replace(/\/+$/, '');
};

export const API_URL = normalizeBackendUrl(process.env.EXPO_PUBLIC_BACKEND_URL);
