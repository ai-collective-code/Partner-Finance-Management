import { useAuth } from '@clerk/clerk-react';
import { useDispatch } from 'react-redux';
import { useCallback } from 'react';
import { updateToken } from '../store/authSlice';

/**
 * useApi - a hook that returns a fetch function that automatically:
 * 1. Gets a fresh Clerk token before every call (no expired token errors)
 * 2. Injects the Authorization header
 * 3. Updates the token in Redux if it changed
 */
export function useApi() {
  const { getToken } = useAuth();
  const dispatch = useDispatch();

  const apiFetch = useCallback(async (url, options = {}) => {
    const token = await getToken();
    
    if (token) {
      dispatch(updateToken(token));
    }

    const headers = { ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const isFormData = options.body instanceof FormData;
    if (!isFormData && options.body && typeof options.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const API_BASE_URL = process.env.REACT_APP_API_URL || '';
    const targetUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;

    return fetch(targetUrl, { ...options, headers });
  }, [getToken, dispatch]);

  return { apiFetch };
}
