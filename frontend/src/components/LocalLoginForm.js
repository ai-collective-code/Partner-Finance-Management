import React, { useState } from 'react';
import { Box, Typography, TextField, Button, Alert, CircularProgress, InputAdornment, IconButton, Divider } from '@mui/material';
import { VisibilityRounded, VisibilityOffRounded, ArrowForwardRounded } from '@mui/icons-material';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { setAuth } from '../store/authSlice';
import AuthLayout from './AuthLayout';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// The two ID/password sign-ins (partners and employees) differ only in these details.
const KINDS = {
  partner: {
    title: 'Partner sign in',
    subtitle: 'Use the Partner ID and password shared with you by AI Collective.',
    idLabel: 'Partner ID',
    placeholder: 'e.g. partner001',
    endpoint: '/api/vendor/login',
    idField: 'vendorId',
    tokenKey: 'vendorToken',
    userKey: 'vendorUser',
    other: { label: 'Employee sign in', href: '/employee-login' },
  },
  employee: {
    title: 'Employee sign in',
    subtitle: 'Use your Employee ID and password to file salary requests and worksheets.',
    idLabel: 'Employee ID',
    placeholder: 'e.g. employee001',
    endpoint: '/api/employee/login',
    idField: 'employeeId',
    tokenKey: 'employeeToken',
    userKey: 'employeeUser',
    other: { label: 'Partner sign in', href: '/vendor-login' },
  },
};

export default function LocalLoginForm({ kind }) {
  const k = KINDS[kind];
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    new URLSearchParams(window.location.search).get('expired')
      ? 'Your session expired (sign-ins last 24 hours). Please sign in again.'
      : ''
  );
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!loginId || !password) {
      setError(`Enter your ${k.idLabel} and password.`);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}${k.endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [k.idField]: loginId, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem(k.tokenKey, data.token);
        localStorage.setItem(k.userKey, JSON.stringify(data.user));
        dispatch(setAuth({ user: data.user, token: data.token }));
        navigate('/');
      } else {
        setError(data.error || 'Sign-in failed. Check your ID and password.');
      }
    } catch (err) {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      footer={
        <Box>
          <Divider sx={{ mb: 2.5 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', px: 1 }}>Other ways to sign in</Typography>
          </Divider>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
            <Button variant="outlined" href="/" fullWidth>Team (email)</Button>
            <Button variant="outlined" href={k.other.href} fullWidth>{k.other.label.replace(' sign in', '')}</Button>
          </Box>
        </Box>
      }
    >
      <Typography variant="h4" component="h1" sx={{ mb: 1 }}>{k.title}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>{k.subtitle}</Typography>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'grid', gap: 2.25 }}>
        <TextField
          fullWidth
          label={k.idLabel}
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          placeholder={k.placeholder}
          disabled={loading}
          autoComplete="username"
          autoFocus
        />
        <TextField
          fullWidth
          label="Password"
          type={showPassword ? 'text' : 'password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          autoComplete="current-password"
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">
                <IconButton
                  onClick={() => setShowPassword(!showPassword)}
                  edge="end"
                  size="small"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <VisibilityOffRounded fontSize="small" /> : <VisibilityRounded fontSize="small" />}
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        <Button type="submit" variant="contained" size="large" fullWidth disabled={loading} endIcon={!loading && <ArrowForwardRounded />} sx={{ mt: 0.5 }}>
          {loading ? <CircularProgress size={20} color="inherit" /> : 'Sign in'}
        </Button>
      </Box>

      <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 2.5 }}>
        Forgot your password? Ask the AI Collective finance team to reset it.
      </Typography>
    </AuthLayout>
  );
}
