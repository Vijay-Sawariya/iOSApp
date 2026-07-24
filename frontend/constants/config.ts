const DEFAULT_API_URL = 'https://sagar-home-api.onrender.com';

const configuredApiUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();

// EAS injects the URL for preview/production builds. The fallback keeps local
// Xcode/Expo builds functional when no developer .env file is present.
export const API_URL = (configuredApiUrl || DEFAULT_API_URL).replace(/\/+$/, '');

