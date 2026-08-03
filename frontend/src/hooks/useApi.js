import { useAuth } from '@clerk/clerk-react';
import { useDispatch } from 'react-redux';
import { useCallback } from 'react';
import { updateToken } from '../store/authSlice';
import { clearLocalSession } from '../utils/token';

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
    let token = null;
    try {
      token = await getToken();
      if (token) {
        dispatch(updateToken(token));
      }
    } catch (e) {
      // Ignore Clerk errors for local vendor sessions
    }

    // Whether this call is authenticated by a local partner/employee JWT rather than Clerk.
    // Those expire after 24h and cannot be refreshed, so a 401 means the session is dead.
    let localLoginPath = null;
    if (!token) {
      if (localStorage.getItem('vendorToken')) {
        token = localStorage.getItem('vendorToken');
        localLoginPath = '/vendor-login';
      } else if (localStorage.getItem('employeeToken')) {
        token = localStorage.getItem('employeeToken');
        localLoginPath = '/employee-login';
      }
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

    const res = await fetch(targetUrl, { ...options, headers });

    if (res.status === 401 && localLoginPath) {
      clearLocalSession();
      window.location.replace(`${localLoginPath}?expired=1`);
    }

    return res;
  }, [getToken, dispatch]);

  return { apiFetch };
}
