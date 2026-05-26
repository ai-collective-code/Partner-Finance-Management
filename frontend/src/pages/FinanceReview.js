import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Stepper, Step, StepLabel, Alert, CircularProgress, Divider, Avatar, Tooltip, Grid
} from '@mui/material';
import {
  AccountBalance, CheckCircle, Cancel, Send, Visibility,
  AttachMoney, Person, Schedule, Gavel, VerifiedUser, Receipt
} from '@mui/icons-material';

import { useApi } from '../hooks/useApi';
import { useSelector } from 'react-redux';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// New workflow: PND → VRF → FIN → OWN → DSB
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
  PND: 'warning',
  VRF: 'info',
  FIN: 'primary',
  OWN: 'secondary',
  DSB: 'success',
  REJ: 'error'
}[s] || 'default');

const stepIndex = (s) => Math.max(0, STATUS_FLOW.indexOf(s));

// The 4 first-line verifiers (Samaja replaces Sukanya)
const VERIFIER_MAP = {
  rup:     { name: 'Rup',     title: 'Tech Head',           color: '#3b82f6' },
  debojit: { name: 'Debojit', title: 'Creative Head & Owner', color: '#8b5cf6' },
  yash:    { name: 'Yash',    title: 'Finance Head',        color: '#22c55e' },
  samaja:  { name: 'Samaja',  title: 'Content Head',        color: '#f59e0b' },
};

// Parse metadata safely
const parseMetadata = (req) => {
  try {
    if (req.metadata) return JSON.parse(req.metadata);
  } catch { /* ignore */ }
  return null;
};

const FinanceReview = () => {
  const { user } = useSelector((state) => state.auth);
  const { apiFetch } = useApi();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [fullImage, setFullImage] = useState(null);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const isOwner   = user?.role === 'OWN' || user?.role === 'ADM';
  const isFin     = user?.role === 'FIN' || user?.role === 'ADM';
  const isVrf     = user?.role === 'VRF' || user?.role === 'FIN' || user?.role === 'OWN' || user?.role === 'ADM';
  const isStrictFin = user?.role === 'FIN';

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/requests?limit=100');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.data || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRequests(); }, []); // eslint-disable-line

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
        const stateLabels = {
          VRF: 'sent for 1st-line verification ✅',
          FIN: 'forwarded to Finance 💼',
          OWN: 'forwarded to Owner 👑',
          DSB: 'disbursed ✅',
          REJ: 'rejected ❌'
        };
        setActionResult({ type: 'success', msg: `Request ${stateLabels[nextState] || nextState}!` });
        setComment('');
        fetchRequests();
        setTimeout(() => { setSelected(null); setActionResult(null); }, 1800);
      } else {
        const err = await res.json();
        setActionResult({ type: 'error', msg: err.error || 'Action failed' });
      }
    } catch { setActionResult({ type: 'error', msg: 'Network error' }); }
    finally { setActionLoading(false); }
  };

  const filtered = filterStatus === 'all' ? requests : requests.filter(r => r.status === filterStatus);
  const pendingCount = requests.filter(r => ['PND', 'VRF', 'FIN', 'OWN'].includes(r.status)).length;

  const getVerifierInfo = (req) => {
    if (!req.verifier) return null;
    return VERIFIER_MAP[req.verifier] || { name: req.verifier, title: 'Verifier', color: '#6366f1' };
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AccountBalance sx={{ color: '#6366f1', fontSize: 28 }} />
          <Box>
            <Typography variant="h4" fontWeight={700}>Finance Review Center</Typography>
            <Typography variant="body2" color="text.secondary">
              Review vendor invoices through the 5-stage approval workflow
            </Typography>
          </Box>
        </Box>
        {pendingCount > 0 && (
          <Chip
            label={`${pendingCount} Pending Action${pendingCount > 1 ? 's' : ''}`}
            color="warning" icon={<Schedule />}
            sx={{ fontWeight: 700 }}
          />
        )}
      </Box>

      {/* Workflow Legend */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 3, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
        <Typography variant="caption" color="primary" sx={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
          Approval Pipeline
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
          {[
            { label: '🏪 Vendor Submits', state: 'PND', color: '#f59e0b' },
            { arrow: true },
            { label: '👁️ 1st Line Verify', state: 'VRF', color: '#3b82f6', sub: 'Rup / Debojit / Yash / Samaja' },
            { arrow: true },
            { label: '💼 Finance Review', state: 'FIN', color: '#6366f1', sub: 'Yash (Finance Head)' },
            { arrow: true },
            { label: '👑 Owner Auth', state: 'OWN', color: '#8b5cf6', sub: 'Debojit (Creative Head & Owner)' },
            { arrow: true },
            { label: '✅ Payment', state: 'DSB', color: '#22c55e' },
          ].map((step, i) =>
            step.arrow ? (
              <Typography key={i} sx={{ color: 'text.disabled', fontWeight: 700, fontSize: 16 }}>→</Typography>
            ) : (
              <Tooltip key={i} title={step.sub || ''} arrow>
                <Box sx={{ textAlign: 'center' }}>
                  <Chip label={step.label} size="small"
                    sx={{ bgcolor: `${step.color}22`, color: step.color, border: `1px solid ${step.color}55`, fontWeight: 600, mb: 0.3 }} />
                  {step.sub && <Typography variant="caption" display="block" color="text.disabled" sx={{ fontSize: 10 }}>{step.sub}</Typography>}
                </Box>
              </Tooltip>
            )
          )}
        </Box>
      </Paper>

      {/* Stats Row */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {[
          { label: 'Total', value: requests.length, color: '#6366f1' },
          { label: 'Pending', value: requests.filter(r => r.status === 'PND').length, color: '#f59e0b' },
          { label: '1st Verified', value: requests.filter(r => r.status === 'VRF').length, color: '#3b82f6' },
          { label: 'Finance Review', value: requests.filter(r => r.status === 'FIN').length, color: '#6366f1' },
          { label: 'Owner Auth', value: requests.filter(r => r.status === 'OWN').length, color: '#8b5cf6' },
          { label: 'Disbursed', value: requests.filter(r => r.status === 'DSB').length, color: '#22c55e' },
        ].map(s => (
          <Paper key={s.label} sx={{ p: 1.5, flex: '1 0 100px', borderRadius: 2, border: `1px solid ${s.color}33`, textAlign: 'center' }}>
            <Typography variant="h5" fontWeight={700} sx={{ color: s.color }}>{s.value}</Typography>
            <Typography variant="caption" color="text.secondary">{s.label}</Typography>
          </Paper>
        ))}
      </Box>

      {/* Filter Tabs */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
        {['all', 'PND', 'VRF', 'FIN', 'OWN', 'DSB', 'REJ'].map(s => (
          <Chip
            key={s} label={s === 'all' ? 'All' : statusLabel(s)}
            onClick={() => setFilterStatus(s)}
            color={filterStatus === s ? 'primary' : 'default'}
            variant={filterStatus === s ? 'filled' : 'outlined'}
            size="small" sx={{ cursor: 'pointer' }}
          />
        ))}
      </Box>

      {/* Requests Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <Paper sx={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'rgba(99,102,241,0.1)' }}>
                <TableCell>Request ID</TableCell>
                <TableCell>Purpose</TableCell>
                <TableCell>Verifier</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Workflow</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.disabled' }}>
                  No requests found
                </TableCell></TableRow>
              )}
              {filtered.map((req) => {
                const vInfo = getVerifierInfo(req);
                return (
                  <TableRow key={req.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' } }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{req.id}</TableCell>
                    <TableCell>
                      <Tooltip title={req.purpose}>
                        <Typography variant="body2" noWrap sx={{ maxWidth: 140 }}>{req.purpose}</Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {vInfo ? (
                        <Chip
                          avatar={<Avatar sx={{ bgcolor: vInfo.color, width: 20, height: 20, fontSize: 11 }}>{vInfo.name.charAt(0)}</Avatar>}
                          label={vInfo.name}
                          size="small"
                          sx={{ bgcolor: `${vInfo.color}22`, color: vInfo.color, border: `1px solid ${vInfo.color}44` }}
                        />
                      ) : <Typography variant="caption" color="text.disabled">—</Typography>}
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
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* REVIEW DIALOG — Formatted Invoice View + Original Invoice Image       */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: 3, background: '#111827', border: '1px solid rgba(255,255,255,0.1)' } }}>
        {selected && (() => {
          const vInfo = getVerifierInfo(selected);
          const meta = parseMetadata(selected);
          return (
            <>
              <DialogTitle>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography fontWeight={700}>Review: {selected.id}</Typography>
                  <Chip label={statusLabel(selected.status)} color={statusColor(selected.status)} size="small" />
                </Box>
              </DialogTitle>
              <DialogContent>
                {/* Workflow Stepper */}
                <Stepper activeStep={stepIndex(selected.status)} sx={{ mb: 3 }}>
                  {['Submitted', '1st Verified', 'Finance', 'Owner Auth', 'Disbursed'].map(l => (
                    <Step key={l}><StepLabel sx={{ '& .MuiStepLabel-label': { fontSize: 11 } }}>{l}</StepLabel></Step>
                  ))}
                </Stepper>
                <Divider sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.08)' }} />

                {/* ── FORMATTED INVOICE SECTION ── */}
                {meta && (
                  <Paper sx={{ p: 3, mb: 3, borderRadius: 3, border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.03)' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Receipt sx={{ color: '#6366f1' }} />
                      <Typography variant="h6" fontWeight={700} color="primary.light">Invoice Details</Typography>
                    </Box>
                    
                    {/* Vendor Info */}
                    <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1 }}>Vendor Information</Typography>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      <Grid item xs={6}><Typography variant="caption" color="text.secondary">Name</Typography><Typography variant="body2" fontWeight={600}>{meta.vendorName || '—'}</Typography></Grid>
                      <Grid item xs={6}><Typography variant="caption" color="text.secondary">Company</Typography><Typography variant="body2" fontWeight={600}>{meta.companyName || '—'}</Typography></Grid>
                      <Grid item xs={6}><Typography variant="caption" color="text.secondary">Phone</Typography><Typography variant="body2">{meta.phone || '—'}</Typography></Grid>
                      <Grid item xs={3}><Typography variant="caption" color="text.secondary">City</Typography><Typography variant="body2">{meta.city || '—'}</Typography></Grid>
                      <Grid item xs={3}><Typography variant="caption" color="text.secondary">State</Typography><Typography variant="body2">{meta.state || '—'}</Typography></Grid>
                    </Grid>
                    <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.06)' }} />

                    {/* Project Info */}
                    <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1 }}>Project Details</Typography>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      <Grid item xs={6}><Typography variant="caption" color="text.secondary">Project</Typography><Typography variant="body2" fontWeight={600}>{meta.projectName || '—'}</Typography></Grid>
                      <Grid item xs={6}><Typography variant="caption" color="text.secondary">Department</Typography><Typography variant="body2">{meta.department || '—'}</Typography></Grid>
                      <Grid item xs={6}><Typography variant="caption" color="text.secondary">Project Head</Typography><Typography variant="body2">{meta.projectHead || '—'}</Typography></Grid>
                      <Grid item xs={3}><Typography variant="caption" color="text.secondary">Start</Typography><Typography variant="body2">{meta.startDate || '—'}</Typography></Grid>
                      <Grid item xs={3}><Typography variant="caption" color="text.secondary">End</Typography><Typography variant="body2">{meta.endDate || '—'}</Typography></Grid>
                    </Grid>
                    <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.06)' }} />

                    {/* Financial Breakdown */}
                    <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1 }}>Financial Summary</Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.8, mt: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Base Amount</Typography>
                        <Typography variant="body2" fontWeight={600}>₹{(meta.baseAmount || 0).toLocaleString()}</Typography>
                      </Box>
                      {meta.advanceAmount > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Typography variant="body2" color="text.secondary">Advance Amount</Typography>
                          <Typography variant="body2">₹{meta.advanceAmount.toLocaleString()}</Typography>
                        </Box>
                      )}
                      {meta.isGst && (
                        <>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="text.secondary">GST ({meta.gstType})</Typography>
                            <Typography variant="body2">₹{(meta.gstAmount || 0).toLocaleString()}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="text.secondary">GST Number</Typography>
                            <Typography variant="body2" fontFamily="monospace">{meta.gstNumber || '—'}</Typography>
                          </Box>
                        </>
                      )}
                      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body1" fontWeight={700} color="primary.light">Total Amount</Typography>
                        <Typography variant="body1" fontWeight={700} color="primary.light">₹{(meta.totalAmount || selected.amount || 0).toLocaleString()}</Typography>
                      </Box>
                    </Box>
                  </Paper>
                )}

                {/* Quick details if no metadata */}
                {!meta && (
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
                )}

                {/* Verifier Info */}
                {vInfo && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="caption" color="text.secondary">1st-Line Verifier</Typography>
                    <Chip
                      icon={<VerifiedUser sx={{ fontSize: 14 }} />}
                      label={`${vInfo.name} — ${vInfo.title}`}
                      size="small"
                      sx={{ bgcolor: `${vInfo.color}22`, color: vInfo.color, border: `1px solid ${vInfo.color}55` }}
                    />
                  </Box>
                )}

                {/* ── ORIGINAL VENDOR INVOICE IMAGE ── */}
                {selected.file_hash && (
                  <Paper sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)' }}>
                    <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1, mb: 1, display: 'block' }}>
                      📄 Original Vendor Invoice
                    </Typography>
                    <Box
                      component="img"
                      src={`${API_BASE_URL}/uploads/${selected.file_hash}`}
                      alt="Original Vendor Invoice"
                      sx={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                      onClick={() => setFullImage(`${API_BASE_URL}/uploads/${selected.file_hash}`)}
                    />
                    <Typography variant="caption" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, cursor: 'pointer' }} onClick={() => setFullImage(`${API_BASE_URL}/uploads/${selected.file_hash}`)}>
                      <Visibility fontSize="inherit" /> Click to view full size
                    </Typography>
                  </Paper>
                )}
                
                <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.08)' }} />

                {/* Comment Field */}
                <TextField
                  label="Review Comment *" multiline rows={2} fullWidth
                  value={comment} onChange={(e) => setComment(e.target.value)}
                  placeholder="Add your review notes, approval reason, or rejection reason..."
                  sx={{ mb: 2 }}
                />

                {actionResult && (
                  <Alert severity={actionResult.type} sx={{ mb: 1 }}>{actionResult.msg}</Alert>
                )}

                {/* Contextual guidance per role & status */}
                {selected.status === 'PND' && isVrf && (
                  <Alert severity="info" sx={{ fontSize: 12 }} icon={<VerifiedUser />}>
                    <strong>First-Line Verification:</strong> As {vInfo ? vInfo.name : 'Verifier'}, review this request and either verify it (send to Finance) or reject it.
                  </Alert>
                )}
                {selected.status === 'VRF' && isFin && (
                  <Alert severity="info" sx={{ fontSize: 12 }} icon={<AccountBalance />}>
                    <strong>Finance Review (Yash):</strong> First-line verification is complete. Review financials and forward to Owner (Debojit) for authorization.
                  </Alert>
                )}
                {selected.status === 'FIN' && isOwner && (
                  <Alert severity="info" sx={{ fontSize: 12 }} icon={<Gavel />}>
                    <strong>Owner Authorization (Debojit):</strong> Finance has reviewed. Authorize payment or reject.
                  </Alert>
                )}
                {selected.status === 'OWN' && isStrictFin && (
                  <Alert severity="success" sx={{ fontSize: 12 }}>
                    <strong>Ready for Disbursement:</strong> Owner (Debojit) has authorized. You can now disburse the payment.
                  </Alert>
                )}
                {selected.status === 'DSB' && (
                  <Alert severity="success">✅ This request has been fully disbursed.</Alert>
                )}
                {selected.status === 'REJ' && (
                  <Alert severity="error">❌ This request was rejected.</Alert>
                )}
              </DialogContent>
              <DialogActions sx={{ p: 2.5, gap: 1 }}>
                <Button onClick={() => setSelected(null)} color="inherit">Close</Button>

                {/* STAGE 1: PND → VRF */}
                {selected.status === 'PND' && isVrf && (
                  <>
                    <Button startIcon={<Cancel />} color="error" variant="outlined" onClick={() => doAction('REJ')} disabled={actionLoading}>Reject</Button>
                    <Button startIcon={<CheckCircle />} variant="contained" color="info" onClick={() => doAction('VRF')} disabled={actionLoading}>
                      {actionLoading ? <CircularProgress size={18} color="inherit" /> : '✅ Verify (1st Line)'}
                    </Button>
                  </>
                )}

                {/* STAGE 2: VRF → FIN */}
                {selected.status === 'VRF' && isFin && (
                  <>
                    <Button startIcon={<Cancel />} color="error" variant="outlined" onClick={() => doAction('REJ')} disabled={actionLoading}>Reject</Button>
                    <Button startIcon={<Send />} variant="contained" color="primary" onClick={() => doAction('FIN')} disabled={actionLoading}>
                      {actionLoading ? <CircularProgress size={18} color="inherit" /> : '💼 Finance Review'}
                    </Button>
                  </>
                )}

                {/* STAGE 3: FIN → OWN */}
                {selected.status === 'FIN' && isOwner && (
                  <>
                    <Button startIcon={<Cancel />} color="error" variant="outlined" onClick={() => doAction('REJ')} disabled={actionLoading}>Reject</Button>
                    <Button startIcon={<Gavel />} variant="contained" color="secondary" onClick={() => doAction('OWN')} disabled={actionLoading}>
                      {actionLoading ? <CircularProgress size={18} color="inherit" /> : '👑 Authorize Payment'}
                    </Button>
                  </>
                )}

                {/* STAGE 4: OWN → DSB */}
                {selected.status === 'OWN' && isStrictFin && (
                  <Button startIcon={<CheckCircle />} variant="contained" color="success" onClick={() => doAction('DSB')} disabled={actionLoading}>
                    {actionLoading ? <CircularProgress size={18} color="inherit" /> : '💰 Disburse Payment'}
                  </Button>
                )}
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      {/* Full Screen Image Modal */}
      <Dialog open={!!fullImage} onClose={() => setFullImage(null)} maxWidth="lg" fullWidth PaperProps={{ sx: { background: '#111827', borderRadius: 3 } }}>
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography fontWeight={700}>Invoice Preview</Typography>
          <Button startIcon={<Cancel />} onClick={() => setFullImage(null)} color="error">Close Preview</Button>
        </DialogTitle>
        <DialogContent sx={{ p: 2, textAlign: 'center', backgroundColor: '#000', borderRadius: 2 }}>
          <Box component="img" src={fullImage} alt="Full Invoice" sx={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default FinanceReview;
