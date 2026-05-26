import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Stepper, Step, StepLabel, Alert, CircularProgress, Divider, Avatar, Tooltip
} from '@mui/material';
import {
  CheckCircle, Cancel, Visibility, AttachMoney, Person, Schedule, VerifiedUser
} from '@mui/icons-material';
import { useApi } from '../hooks/useApi';

import { useSelector } from 'react-redux';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const STATUS_FLOW = ['PND', 'VRF', 'FIN', 'OWN', 'DSB'];

const statusLabel = (s) => ({
  PND: 'Pending Review',
  VRF: '🔍 1st Line Verified',
  FIN: '💼 Finance Review',
  OWN: '👑 Owner Auth',
  DSB: '✅ Disbursed',
  REJ: '❌ Rejected'
}[s] || s);

const statusColor = (s) => ({
  PND: 'warning', VRF: 'info', FIN: 'primary', OWN: 'secondary', DSB: 'success', REJ: 'error'
}[s] || 'default');

const stepIndex = (s) => Math.max(0, STATUS_FLOW.indexOf(s));

/**
 * VerifierDashboard — Shared component for Rup (Tech) and Samaja (Content).
 * Shows ONLY requests assigned to this verifier for privacy.
 *
 * Props:
 *   verifierId: 'rup' | 'samaja'
 *   title: Display title
 *   subtitle: Display subtitle
 *   icon: emoji/icon string
 *   accentColor: hex color
 */
const VerifierDashboard = ({ verifierId, title, subtitle, icon, accentColor }) => {
  const { user } = useSelector((state) => state.auth);
  const { apiFetch } = useApi();

  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState(null);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/requests?limit=100');
      if (res.ok) {
        const data = await res.json();
        setAllRequests(data.data || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRequests(); }, []); // eslint-disable-line

  // PRIVACY: Only show requests where the vendor chose THIS verifier
  const myRequests = allRequests.filter(r => r.verifier === verifierId);
  const pendingCount = myRequests.filter(r => r.status === 'PND').length;

  const doAction = async (nextState) => {
    if (!comment.trim()) { setActionResult({ type: 'error', msg: 'Please add a review comment.' }); return; }
    setActionLoading(true);
    setActionResult(null);
    try {
      const res = await apiFetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, nextState, comment })
      });
      if (res.ok) {
        setActionResult({ type: 'success', msg: nextState === 'VRF' ? 'Verified ✅' : 'Rejected ❌' });
        setComment('');
        fetchRequests();
        setTimeout(() => { setSelected(null); setActionResult(null); }, 1500);
      } else {
        const err = await res.json();
        setActionResult({ type: 'error', msg: err.error || 'Action failed' });
      }
    } catch { setActionResult({ type: 'error', msg: 'Network error' }); }
    finally { setActionLoading(false); }
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: accentColor, width: 48, height: 48, fontSize: 22 }}>{icon}</Avatar>
          <Box>
            <Typography variant="h4" fontWeight={700}>{title}</Typography>
            <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
          </Box>
        </Box>
        {pendingCount > 0 && (
          <Chip
            label={`${pendingCount} Pending Review${pendingCount > 1 ? 's' : ''}`}
            color="warning" icon={<Schedule />} sx={{ fontWeight: 700 }}
          />
        )}
      </Box>

      {/* Privacy Notice */}
      <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }} icon={<VerifiedUser />}>
        <strong>Privacy Mode:</strong> You only see requests where the vendor selected <strong>you</strong> as the first-line verifier. Other financial details are hidden.
      </Alert>

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {[
          { label: 'Assigned to Me', value: myRequests.length, color: accentColor },
          { label: 'Pending', value: myRequests.filter(r => r.status === 'PND').length, color: '#f59e0b' },
          { label: 'Verified', value: myRequests.filter(r => ['VRF', 'FIN', 'OWN', 'DSB'].includes(r.status)).length, color: '#22c55e' },
          { label: 'Rejected', value: myRequests.filter(r => r.status === 'REJ').length, color: '#ef4444' },
        ].map(s => (
          <Paper key={s.label} sx={{ p: 2, flex: '1 0 120px', borderRadius: 2, border: `1px solid ${s.color}33`, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={700} sx={{ color: s.color }}>{s.value}</Typography>
            <Typography variant="caption" color="text.secondary">{s.label}</Typography>
          </Paper>
        ))}
      </Box>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <Paper sx={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: `${accentColor}18` }}>
                <TableCell>Request ID</TableCell>
                <TableCell>Purpose</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Workflow</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {myRequests.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.disabled' }}>
                  No requests assigned to you yet
                </TableCell></TableRow>
              )}
              {myRequests.map((req) => (
                <TableRow key={req.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' } }}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{req.id}</TableCell>
                  <TableCell>
                    <Tooltip title={req.purpose}>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>{req.purpose}</Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={700} color="primary.light">₹{req.amount?.toLocaleString()}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(req.ts).toLocaleDateString('en-IN')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={statusLabel(req.status)} color={statusColor(req.status)} size="small" />
                  </TableCell>
                  <TableCell>
                    <Stepper activeStep={stepIndex(req.status)} sx={{ '& .MuiStepLabel-label': { fontSize: 9 }, minWidth: 240 }}>
                      {['Submit', '1st Verify', 'Finance', 'Owner', 'Paid'].map(l => (
                        <Step key={l}><StepLabel>{l}</StepLabel></Step>
                      ))}
                    </Stepper>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" startIcon={<Visibility />} onClick={() => { setSelected(req); setComment(''); setActionResult(null); }}>
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Review Dialog */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3, background: '#111827', border: '1px solid rgba(255,255,255,0.1)' } }}>
        {selected && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography fontWeight={700}>Review: {selected.id}</Typography>
                <Chip label={statusLabel(selected.status)} color={statusColor(selected.status)} size="small" />
              </Box>
            </DialogTitle>
            <DialogContent>
              <Stepper activeStep={stepIndex(selected.status)} sx={{ mb: 3 }}>
                {['Submitted', '1st Verified', 'Finance', 'Owner Auth', 'Disbursed'].map(l => (
                  <Step key={l}><StepLabel sx={{ '& .MuiStepLabel-label': { fontSize: 11 } }}>{l}</StepLabel></Step>
                ))}
              </Stepper>
              <Divider sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.08)' }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
                {[
                  { label: 'Amount', value: `₹${selected.amount?.toLocaleString()}`, icon: <AttachMoney sx={{ fontSize: 16 }} />, color: 'success.light' },
                  { label: 'Purpose', value: selected.purpose },
                  { label: 'Requester', value: selected.requester, icon: <Person sx={{ fontSize: 16 }} /> },
                  { label: 'Submitted', value: new Date(selected.ts).toLocaleString('en-IN') },
                ].map(({ label, value, icon, color }) => (
                  <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="body2" fontWeight={600} color={color || 'text.primary'} sx={{ display: 'flex', alignItems: 'center', gap: 0.3, textAlign: 'right', maxWidth: 280 }}>
                      {icon}{value}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {/* Show attached invoice if available */}
              {selected.file_hash && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="caption" color="text.secondary" mb={1} display="block">Attached Invoice</Typography>
                  <Box
                    component="img"
                    src={`${API_BASE_URL}/uploads/${selected.file_hash}`}
                    alt="Invoice"
                    sx={{ width: '100%', maxHeight: 250, objectFit: 'contain', borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.2)' }}
                  />
                </Box>
              )}

              <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.08)' }} />
              <TextField
                label="Review Comment *" multiline rows={3} fullWidth
                value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Add your review notes..."
                sx={{ mb: 2 }}
              />
              {actionResult && <Alert severity={actionResult.type} sx={{ mb: 1 }}>{actionResult.msg}</Alert>}

              {selected.status === 'PND' && (
                <Alert severity="info" sx={{ fontSize: 12 }} icon={<VerifiedUser />}>
                  <strong>First-Line Verification:</strong> Review this vendor request and either verify it (send to Finance) or reject it.
                </Alert>
              )}
              {selected.status === 'DSB' && <Alert severity="success">✅ This request has been fully disbursed.</Alert>}
              {selected.status === 'REJ' && <Alert severity="error">❌ This request was rejected.</Alert>}
            </DialogContent>
            <DialogActions sx={{ p: 2.5, gap: 1 }}>
              <Button onClick={() => setSelected(null)} color="inherit">Close</Button>
              {selected.status === 'PND' && (
                <>
                  <Button startIcon={<Cancel />} color="error" variant="outlined" onClick={() => doAction('REJ')} disabled={actionLoading}>Reject</Button>
                  <Button startIcon={<CheckCircle />} variant="contained" color="info" onClick={() => doAction('VRF')} disabled={actionLoading}>
                    {actionLoading ? <CircularProgress size={18} color="inherit" /> : '✅ Verify'}
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

// ── Rup's Tech Dashboard ──
export const TechDashboard = () => (
  <VerifierDashboard
    verifierId="rup"
    title="Tech Head Dashboard"
    subtitle="Requests assigned to Rup for first-line tech verification"
    icon="🔧"
    accentColor="#3b82f6"
  />
);

// ── Samaja's Content Dashboard ──
export const ContentDashboard = () => (
  <VerifierDashboard
    verifierId="samaja"
    title="Content Head Dashboard"
    subtitle="Requests assigned to Samaja for first-line content verification"
    icon="🎨"
    accentColor="#f59e0b"
  />
);

export default VerifierDashboard;
