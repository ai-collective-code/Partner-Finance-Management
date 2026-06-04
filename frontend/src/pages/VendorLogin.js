import React, { useState } from 'react';
import {
  Box, Typography, TextField, Button, Paper, Alert, CircularProgress,
  InputAdornment, IconButton, Divider, Avatar
} from '@mui/material';
import { Visibility, VisibilityOff, Storefront as StorefrontIcon, Lock, ArrowBack } from '@mui/icons-material';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { setAuth } from '../store/authSlice';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const VendorLogin = () => {
  const [vendorId, setVendorId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!vendorId || !password) {
      setError('Please enter both Partner ID and Password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/vendor/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, password })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Store vendor token and user in Redux + localStorage
        localStorage.setItem('vendorToken', data.token);
        localStorage.setItem('vendorUser', JSON.stringify(data.user));
        dispatch(setAuth({ user: data.user, token: data.token }));
        navigate('/');
      } else {
        setError(data.error || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      setError('Network error. Please check if the server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{
      display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center',
      bgcolor: '#0b0f19',
      background: 'radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 60%), #0b0f19'
    }}>
      <Paper sx={{
        p: 5, borderRadius: 4, maxWidth: 440, width: '100%', mx: 2,
        background: 'linear-gradient(135deg, rgba(30,35,55,0.95) 0%, rgba(20,25,40,0.98) 100%)',
        border: '1px solid rgba(99,102,241,0.15)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 40px rgba(99,102,241,0.05)'
      }}>
        {/* Header */}
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Avatar sx={{ m: 'auto', bgcolor: '#6366f1', width: 56, height: 56, mb: 2 }}>
            <StorefrontIcon fontSize="large" />
          </Avatar>
          <Typography variant="h4" fontWeight={700} color="primary" gutterBottom>
            Partner Portal
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Sign in with your Partner ID and Password
          </Typography>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
            {error}
          </Alert>
        )}

        <form onSubmit={handleSubmit}>
          <TextField
            required
            fullWidth
            label="Partner ID"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
            placeholder="e.g. partner001"
            disabled={loading}
            sx={{ mb: 2.5 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <StorefrontIcon sx={{ color: 'text.secondary', fontSize: 20 }} />
                </InputAdornment>
              )
            }}
            autoFocus
          />

          <TextField
            fullWidth
            label="Password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mb: 3 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Lock sx={{ color: 'text.secondary', fontSize: 20 }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" size="small">
                    {showPassword ? <VisibilityOff sx={{ fontSize: 18 }} /> : <Visibility sx={{ fontSize: 18 }} />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={loading}
            sx={{ py: 1.5, fontSize: '1.1rem', fontWeight: 600, borderRadius: 2 }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : '🤝 Sign In as Partner'}
          </Button>
        </form>

        <Divider sx={{ my: 3, borderColor: 'rgba(255,255,255,0.08)' }} />

        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
            Are you a team member? Sign in with your company email instead.
          </Typography>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ArrowBack />}
            onClick={() => navigate('/login')}
            sx={{
              borderColor: 'rgba(99,102,241,0.3)', color: '#6366f1',
              '&:hover': { borderColor: '#6366f1', bgcolor: 'rgba(99,102,241,0.08)' }
            }}
          >
            Team Login (Clerk)
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};

export default VendorLogin;
