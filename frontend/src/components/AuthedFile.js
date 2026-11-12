import React, { useEffect, useState } from 'react';
import { CircularProgress, Typography } from '@mui/material';
import { useApi } from '../hooks/useApi';

/**
 * Uploaded documents (invoices, cancelled cheques, payslips) are only served by the
 * authenticated GET /api/files/:name endpoint, so they can't be linked to directly from
 * <img>/<iframe>/<a> (those can't send an Authorization header). This hook downloads the
 * file with the user's token and returns a temporary blob: URL that can be used instead.
 */
export function useAuthedFileUrl(name) {
  const { apiFetch } = useApi();
  const [state, setState] = useState({ url: null, error: false });

  useEffect(() => {
    if (!name) {
      setState({ url: null, error: false });
      return undefined;
    }
    let cancelled = false;
    let objectUrl = null;
    setState({ url: null, error: false });

    (async () => {
      try {
        const res = await apiFetch(`/api/files/${encodeURIComponent(name)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ url: objectUrl, error: false });
      } catch (e) {
        if (!cancelled) setState({ url: null, error: true });
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [name, apiFetch]);

  return state;
}

/**
 * Render-prop wrapper: <AuthedFile name={fileHash}>{(url) => <img src={url} />}</AuthedFile>
 * Shows a spinner while loading and a short message if the file can't be opened.
 */
export default function AuthedFile({ name, children }) {
  const { url, error } = useAuthedFileUrl(name);
  if (error) {
    return <Typography variant="caption" color="error">Could not load this document.</Typography>;
  }
  if (!url) return <CircularProgress size={20} />;
  return children(url);
}
