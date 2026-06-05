import React, { useEffect, useState } from 'react';
import { Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, IconButton, CircularProgress, Avatar, Tooltip } from '@mui/material';
import { useSelector, useDispatch } from 'react-redux';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useApi } from '../hooks/useApi';
import { setRequests } from '../store/paymentSlice';
import SubmitRequest from './SubmitRequest';

const VERIFIER_MAP = {
  rup:     { name: 'Rup',     color: '#3b82f6' },
  debojit: { name: 'Debojit', color: '#8b5cf6' },
  yash:    { name: 'Yash',    color: '#22c55e' },
  soumana:  { name: 'Soumana',  color: '#f59e0b' },
};

const getStatusColor = (status) => ({
  PND: 'warning',
  VRF: 'info',
  FIN: 'primary',
  OWN: 'secondary',
  DSB: 'success',
  REJ: 'error'
}[status] || 'default');

const getStatusText = (status) => ({
  PND: '⏳ Pending',
  VRF: '🔍 1st Verified',
  FIN: '💼 Finance Review',
  OWN: '👑 Owner Auth',
  DSB: '✅ Disbursed',
  REJ: '❌ Rejected'
}[status] || status);

const Dashboard = () => {
  const { user } = useSelector((state) => state.auth);
  const { requests } = useSelector((state) => state.payments);
  const dispatch = useDispatch();
  const { apiFetch } = useApi();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        const res = await apiFetch('/api/requests?limit=100');
        if (res.ok) {
          const data = await res.json();
          dispatch(setRequests(data.data || []));
        }
      } catch (e) {
        console.error('Failed to fetch requests', e);
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, [apiFetch, dispatch]);

  // ── VENDOR: Show invoice form instead of dashboard ──
  if (user?.role === 'VND') {
    return <SubmitRequest />;
  }

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" mb={1} fontWeight={700}>My Disbursement Requests</Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>Track your vendor requests through the 5-stage approval pipeline</Typography>

      {/* Workflow pipeline */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 3, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="caption" color="text.disabled" sx={{ mr: 1 }}>Workflow:</Typography>
        {[
          { label: '🏪 Vendor', color: '#6366f1' },
          { arrow: true },
          { label: '👁️ 1st Verify', color: '#3b82f6', sub: 'Rup/Debojit/Yash/Soumana' },
          { arrow: true },
          { label: '💼 Finance', color: '#6366f1', sub: 'Yash' },
          { arrow: true },
          { label: '👑 Owner', color: '#8b5cf6', sub: 'Debojit' },
          { arrow: true },
          { label: '✅ Payment', color: '#22c55e' },
        ].map((step, i) =>
          step.arrow ? (
            <Typography key={i} sx={{ color: 'text.disabled', fontWeight: 700 }}>→</Typography>
          ) : (
            <Tooltip key={i} title={step.sub || step.label} arrow>
              <Chip label={step.label} size="small"
                sx={{ bgcolor: `${step.color}22`, color: step.color, border: `1px solid ${step.color}44`, fontWeight: 600, fontSize: 11 }} />
            </Tooltip>
          )
        )}
      </Paper>
      
      <TableContainer component={Paper} sx={{ boxShadow: '0 8px 32px rgba(0,0,0,0.2)', borderRadius: 3 }}>
        <Table sx={{ minWidth: 600 }} aria-label="disbursement requests table">
          <TableHead sx={{ backgroundColor: 'rgba(99,102,241,0.1)' }}>
            <TableRow>
              <TableCell>Request ID</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Purpose</TableCell>
              <TableCell>Verifier</TableCell>
              <TableCell align="right">Amount</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell align="center">View</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {requests.map((row) => {
              const vInfo = row.verifier ? VERIFIER_MAP[row.verifier] : null;
              return (
                <TableRow
                  key={row.id}
                  sx={{ '&:last-child td, &:last-child th': { border: 0 }, '&:hover': { backgroundColor: 'rgba(255,255,255,0.03)' } }}
                >
                  <TableCell component="th" scope="row">
                    <Typography variant="body2" fontFamily="monospace" color="text.secondary">
                      {row.id}
                    </Typography>
                  </TableCell>
                  <TableCell>{new Date(row.ts || row.date).toLocaleDateString('en-IN')}</TableCell>
                  <TableCell sx={{ maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.purpose}
                  </TableCell>
                  <TableCell>
                    {vInfo ? (
                      <Chip
                        avatar={<Avatar sx={{ bgcolor: vInfo.color, width: 20, height: 20, fontSize: 10 }}>{vInfo.name.charAt(0)}</Avatar>}
                        label={vInfo.name}
                        size="small"
                        sx={{ bgcolor: `${vInfo.color}22`, color: vInfo.color, border: `1px solid ${vInfo.color}44`, fontSize: 11 }}
                      />
                    ) : <Typography variant="caption" color="text.disabled">—</Typography>}
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight="bold" color="primary.light">
                      ₹{parseFloat(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip 
                      label={getStatusText(row.status)} 
                      color={getStatusColor(row.status)} 
                      size="small"
                      sx={{ fontWeight: 'bold' }}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <IconButton color="primary" size="small">
                      <VisibilityIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {requests.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                  <Typography color="text.secondary">No payment requests found. Submit one via the sidebar!</Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default Dashboard;
