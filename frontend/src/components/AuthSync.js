import React, { useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useDispatch } from 'react-redux';
import { Box, CircularProgress, Typography } from '@mui/material';

export default function AuthSync({ children }) {
  const { getToken, isLoaded: authLoaded } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();
  const dispatch = useDispatch();
  const isSyncingRef = React.useRef(false);
  const [synced, setSynced] = React.useState(false);

  useEffect(() => {
    // If already synced or currently syncing, don't run again
    if (synced || isSyncingRef.current) return;

    async function syncUser() {
      if (authLoaded && userLoaded && user) {
        try {
          isSyncingRef.current = true;
          const token = await getToken();
          // 1. Sync user to backend DB (insert if new, preserve existing role)
          const API_BASE_URL = process.env.REACT_APP_API_URL || '';
          const syncRes = await fetch(`${API_BASE_URL}/api/sync-user`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              id: user.id,
              name: user.fullName || user.username || user.emailAddresses?.[0]?.emailAddress || 'User',
              role: 'DEV'  // only used if user is brand new
            })
          });

          let dbRole = 'DEV';
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            // backend now returns the actual persisted role
            if (syncData.role) dbRole = syncData.role;
          }

          // 2. Build the user object for Redux from Clerk + DB
          const meUser = {
            id: user.id,
            name: user.fullName || user.username || user.emailAddresses?.[0]?.emailAddress || 'User',
            role: dbRole,
            email: user.emailAddresses?.[0]?.emailAddress
          };

          dispatch({ type: 'auth/setAuth', payload: { user: meUser, token } });
          setSynced(true);

        } catch (err) {
          console.error("Failed to sync user:", err);
          // Even on error, allow app to load with basic Clerk data
          if (user) {
            dispatch({ type: 'auth/setAuth', payload: {
              user: { id: user.id, name: user.fullName || 'User', role: 'DEV' },
              token: null
            }});
          }
          setSynced(true);
        } finally {
          isSyncingRef.current = false;
        }
      }
    }
    syncUser();
  }, [authLoaded, userLoaded, user, getToken, dispatch, synced]);

  if (!synced) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', bgcolor: '#0b0f19', color: 'white' }}>
        <CircularProgress color="primary" sx={{ mb: 2 }} />
        <Typography>Authenticating and syncing profile...</Typography>
      </Box>
    );
  }

  return children;
}
