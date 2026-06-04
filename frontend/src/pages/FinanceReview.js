import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  Stepper, Step, StepLabel, Alert, CircularProgress, Divider, Avatar, Tooltip, Grid
} from '@mui/material';
import {
  AccountBalance, CheckCircle, Cancel, Send, Visibility,
  CurrencyRupee, Person, Schedule, Gavel, VerifiedUser, Receipt
} from '@mui/icons-material';

import { useApi } from '../hooks/useApi';
import { useSelector } from 'react-redux';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// New workflow: PND → VRF → OWN → FIN → DSB
const STATUS_FLOW = ['PND', 'VRF', 'OWN', 'FIN', 'DSB'];

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
  const [activeTab, setActiveTab] = useState('requests'); // 'requests' or 'projects'

  // Projects State
  const [projects, setProjects] = useState([]);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectCode, setNewProjectCode] = useState('');
  const [newProjectDetails, setNewProjectDetails] = useState('');
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerPhone, setNewPartnerPhone] = useState('');
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectSuccess, setProjectSuccess] = useState('');
  const [projectError, setProjectError] = useState('');
  const [editingProjectId, setEditingProjectId] = useState(null);

  // Comments history state
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

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

  const fetchProjects = async () => {
    try {
      const res = await apiFetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data || []);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { 
    fetchRequests(); 
    if (user?.role === 'FIN' || user?.role === 'ADM') fetchProjects();
  }, [user]); // eslint-disable-line

  // Fetch comments when selected request changes
  useEffect(() => {
    if (selected) {
      const fetchComments = async () => {
        setCommentsLoading(true);
        try {
          const res = await apiFetch(`/api/audit?reqId=${selected.id}`);
          if (res.ok) {
            const data = await res.json();
            setComments(data.data || []);
          }
        } catch (e) {
          console.error('Failed to fetch comments', e);
        } finally {
          setCommentsLoading(false);
        }
      };
      fetchComments();
    } else {
      setComments([]);
    }
  }, [selected, apiFetch]);

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
          OWN: 'forwarded to Owner 👑',
          FIN: 'forwarded to Finance 💼',
          DSB: 'disbursed ✅',
          REJ: 'rejected ❌'
        };
        setActionResult({ type: 'success', msg: `Request ${stateLabels[nextState] || nextState}!` });
        setComment('');
        // Re-fetch comments to show the new comment immediately
        const cRes = await apiFetch(`/api/audit?reqId=${selected.id}`);
        if (cRes.ok) {
          const cData = await cRes.json();
          setComments(cData.data || []);
        }
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
  const pendingCount = requests.filter(r => ['PND', 'VRF', 'OWN', 'FIN'].includes(r.status)).length;

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName || !newProjectCode) return;
    setProjectLoading(true);
    setProjectSuccess('');
    setProjectError('');
    try {
      const url = editingProjectId ? `/api/projects/${editingProjectId}` : '/api/projects';
      const method = editingProjectId ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newProjectName, code: newProjectCode, details: newProjectDetails, partnerName: newPartnerName, partnerPhone: newPartnerPhone })
      });
      if (res.ok) {
        const data = await res.json();
        setNewProjectName('');
        setNewProjectCode('');
        setNewProjectDetails('');
        setNewPartnerName('');
        setNewPartnerPhone('');
        setEditingProjectId(null);
        setProjectSuccess(editingProjectId ? `Project "${data.name}" successfully updated!` : `Project "${data.name}" successfully saved!`);
        fetchProjects();
      } else {
        const err = await res.json();
        setProjectError(err.error || 'Failed to save project');
      }
    } catch (e) {
      console.error(e);
      setProjectError('Network error occurred');
    }
    finally { setProjectLoading(false); }
  };

  const handleStartEditProject = (p) => {
    setEditingProjectId(p.id);
    setNewProjectName(p.name);
    setNewProjectCode(p.code);
    setNewProjectDetails(p.details || '');
    setNewPartnerName(p.partner_name || '');
    setNewPartnerPhone(p.partner_phone || '');
  };

  const handleCancelEditProject = () => {
    setEditingProjectId(null);
    setNewProjectName('');
    setNewProjectCode('');
    setNewProjectDetails('');
    setNewPartnerName('');
    setNewPartnerPhone('');
  };

  const handleCompleteProject = async (id) => {
    try {
      await apiFetch(`/api/projects/${id}/complete`, { method: 'PUT' });
      fetchProjects();
    } catch (e) { console.error(e); }
  };

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
        <Box sx={{ display: 'flex', gap: 2 }}>
          {isFin && (
            <Button variant={activeTab === 'requests' ? 'contained' : 'outlined'} onClick={() => setActiveTab('requests')}>Requests</Button>
          )}
          {isFin && (
            <Button variant={activeTab === 'projects' ? 'contained' : 'outlined'} onClick={() => setActiveTab('projects')}>Projects</Button>
          )}
          {pendingCount > 0 && activeTab === 'requests' && (
            <Chip
              label={`${pendingCount} Pending Action${pendingCount > 1 ? 's' : ''}`}
              color="warning" icon={<Schedule />}
              sx={{ fontWeight: 700 }}
            />
          )}
        </Box>
      </Box>

      {activeTab === 'projects' && isFin && (
        <Paper sx={{ p: 4, borderRadius: 3 }}>
          <Typography variant="h5" mb={3}>Project Management</Typography>
          {projectSuccess && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setProjectSuccess('')}>{projectSuccess}</Alert>}
          {projectError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setProjectError('')}>{projectError}</Alert>}
          <Box component="form" onSubmit={handleCreateProject} sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
              <TextField label="Project Name" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} required />
              <TextField label="Project Code" value={newProjectCode} onChange={e => setNewProjectCode(e.target.value)} required />
              <TextField label="Details" value={newProjectDetails} onChange={e => setNewProjectDetails(e.target.value)} sx={{ flexGrow: 1 }} />
            </Box>
            <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
              <TextField label="Partner Name" value={newPartnerName} onChange={e => setNewPartnerName(e.target.value)} placeholder="Authorized partner name" />
              <TextField label="Partner Phone" value={newPartnerPhone} onChange={e => setNewPartnerPhone(e.target.value)} placeholder="+91 XXXXXXXXXX" />
              <Button type="submit" variant="contained" color={editingProjectId ? "secondary" : "primary"} disabled={projectLoading}>
                {editingProjectId ? 'Save Changes' : 'Create Project'}
              </Button>
              {editingProjectId && (
                <Button variant="outlined" color="inherit" onClick={handleCancelEditProject}>
                  Cancel
                </Button>
              )}
            </Box>
          </Box>
          <Typography variant="caption" color="warning.main" sx={{ display: 'block', mb: 3 }}>
            ⚠️ Partner Name & Phone are used for anti-fraud verification. Only the matching partner can submit invoices for this project.
          </Typography>
          <Typography variant="h6" mb={2}>Active Projects</Typography>
          <Table>
            <TableHead><TableRow><TableCell>Name</TableCell><TableCell>Code</TableCell><TableCell>Partner</TableCell><TableCell>Phone</TableCell><TableCell>Details</TableCell><TableCell>Created</TableCell><TableCell>Action</TableCell></TableRow></TableHead>
            <TableBody>
              {projects.map(p => (
                <TableRow key={p.id}>
                  <TableCell><strong>{p.name}</strong></TableCell>
                  <TableCell><Chip label={p.code} size="small" /></TableCell>
                  <TableCell>{p.partner_name || <Typography variant="caption" color="text.disabled">Not set</Typography>}</TableCell>
                  <TableCell>{p.partner_phone || <Typography variant="caption" color="text.disabled">Not set</Typography>}</TableCell>
                  <TableCell>{p.details}</TableCell>
                  <TableCell>{new Date(p.created_at).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button size="small" variant="outlined" color="primary" onClick={() => handleStartEditProject(p)}>Edit</Button>
                      <Button size="small" color="success" onClick={() => handleCompleteProject(p.id)}>Mark Completed</Button>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              {projects.length === 0 && <TableRow><TableCell colSpan={7} align="center">No active projects.</TableCell></TableRow>}
            </TableBody>
          </Table>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>* Completed projects will automatically be deleted after 30 days.</Typography>
        </Paper>
      )}

      {activeTab === 'requests' && (
        <>
      {/* Workflow Legend */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 3, background: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.15)' }}>
        <Typography variant="caption" color="primary" sx={{ fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
          Approval Pipeline
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, flexWrap: 'wrap' }}>
          {[
            { label: '🤝 Partner Submits', state: 'PND', color: '#f59e0b' },
            { arrow: true },
            { label: '👁️ 1st Line Verify', state: 'VRF', color: '#3b82f6', sub: 'Rup / Debojit / Yash / Samaja' },
            { arrow: true },
            { label: '👑 Owner Auth', state: 'OWN', color: '#8b5cf6', sub: 'Debojit (Creative Head & Owner)' },
            { arrow: true },
            { label: '💼 Finance Review', state: 'FIN', color: '#6366f1', sub: 'Yash (Finance Head)' },
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
          { label: 'Owner Auth', value: requests.filter(r => r.status === 'OWN').length, color: '#8b5cf6' },
          { label: 'Finance Review', value: requests.filter(r => r.status === 'FIN').length, color: '#6366f1' },
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
        <Paper sx={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
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
                        {['Submit', '1st Verify', 'Owner', 'Finance', 'Paid'].map(l => (
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
        </>
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
                  {['Submitted', '1st Verified', 'Owner Auth', 'Finance', 'Disbursed'].map(l => (
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
                    
                    {/* Partner Info */}
                    <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1 }}>Partner Information</Typography>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      <Grid item xs={6}><Typography variant="caption" color="text.secondary">Name</Typography><Typography variant="body2" fontWeight={600}>{meta.vendorName || meta.partnerName || '—'}</Typography></Grid>
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
                      <Grid item xs={6}><Typography variant="caption" color="text.secondary">Job Description</Typography><Typography variant="body2">{meta.jobDescription || meta.department || '—'}</Typography></Grid>
                      <Grid item xs={6}><Typography variant="caption" color="text.secondary">Project Head</Typography><Typography variant="body2">{meta.projectHead || '—'}</Typography></Grid>
                      <Grid item xs={3}><Typography variant="caption" color="text.secondary">Start</Typography><Typography variant="body2">{meta.startDate || '—'}</Typography></Grid>
                      <Grid item xs={3}><Typography variant="caption" color="text.secondary">End</Typography><Typography variant="body2">{meta.endDate || '—'}</Typography></Grid>
                    </Grid>
                    <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.06)' }} />

                    {/* Bank & Cheque Details */}
                    {(meta.bankName || meta.chequeFileHash) && (
                      <>
                        <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1 }}>Bank & Payment Information</Typography>
                        <Grid container spacing={2} sx={{ mb: 2, mt: 0.5 }}>
                          <Grid item xs={6}><Typography variant="caption" color="text.secondary">Beneficiary Name</Typography><Typography variant="body2" fontWeight={600}>{meta.beneficiaryName || '—'}</Typography></Grid>
                          <Grid item xs={6}><Typography variant="caption" color="text.secondary">Bank Name</Typography><Typography variant="body2" fontWeight={600}>{meta.bankName || '—'}</Typography></Grid>
                          <Grid item xs={6}><Typography variant="caption" color="text.secondary">Branch Name</Typography><Typography variant="body2">{meta.branchName || '—'}</Typography></Grid>
                          <Grid item xs={6}><Typography variant="caption" color="text.secondary">IFSC Code</Typography><Typography variant="body2" fontFamily="monospace" fontWeight={600}>{meta.ifscCode || '—'}</Typography></Grid>
                          <Grid item xs={6}><Typography variant="caption" color="text.secondary">Account Number</Typography><Typography variant="body2" fontFamily="monospace">{meta.accountNumber || '—'}</Typography></Grid>
                          <Grid item xs={6}><Typography variant="caption" color="text.secondary">Account Type</Typography><Typography variant="body2">{meta.accountType || '—'}</Typography></Grid>
                          {meta.chequeFileHash && (
                            <Grid item xs={12} sx={{ mt: 1 }}>
                              <Typography variant="caption" color="success.main" sx={{ display: 'block', mb: 0.5, fontWeight: 700 }}>
                                📸 Attached Cancelled Cheque
                              </Typography>
                              {meta.chequeFileHash.toLowerCase().endsWith('.pdf') ? (
                                <Box sx={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                                  <iframe
                                    src={`${API_BASE_URL}/uploads/${meta.chequeFileHash}`}
                                    title="Cancelled Cheque PDF"
                                    width="100%"
                                    height="250px"
                                    style={{ border: 'none', backgroundColor: '#fff', borderRadius: 4 }}
                                  />
                                </Box>
                              ) : (
                                <Box 
                                  component="img"
                                  src={`${API_BASE_URL}/uploads/${meta.chequeFileHash}`}
                                  alt="Cancelled Cheque"
                                  sx={{ maxWidth: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                                  onClick={() => setFullImage(`${API_BASE_URL}/uploads/${meta.chequeFileHash}`)}
                                />
                              )}
                            </Grid>
                          )}
                        </Grid>
                        <Divider sx={{ my: 1.5, borderColor: 'rgba(255,255,255,0.06)' }} />
                      </>
                    )}

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
                      { label: 'Amount', value: `₹${selected.amount?.toLocaleString()}`, icon: <CurrencyRupee sx={{ fontSize: 16 }} />, color: 'success.light' },
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

                {/* ── ORIGINAL PARTNER INVOICE ── */}
                {selected.file_hash && (() => {
                  const isPdf = selected.file_hash.toLowerCase().endsWith('.pdf');
                  return (
                    <Paper sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)' }}>
                      <Typography variant="overline" color="text.disabled" sx={{ letterSpacing: 1, mb: 1, display: 'block' }}>
                        📄 Original Partner Invoice
                      </Typography>
                      {isPdf ? (
                        <Box sx={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                          <iframe
                            src={`${API_BASE_URL}/uploads/${selected.file_hash}`}
                            title="Invoice PDF"
                            width="100%"
                            height="400px"
                            style={{ border: 'none', backgroundColor: '#fff' }}
                          />
                          <Box sx={{ p: 1, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', bgcolor: 'rgba(0,0,0,0.2)' }}>
                            <Button
                              variant="outlined"
                              size="small"
                              component="a"
                              href={`${API_BASE_URL}/uploads/${selected.file_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              📂 Open PDF in New Tab
                            </Button>
                          </Box>
                        </Box>
                      ) : (
                        <>
                          <Box
                            component="img"
                            src={`${API_BASE_URL}/uploads/${selected.file_hash}`}
                            alt="Original Partner Invoice"
                            sx={{ width: '100%', maxHeight: 400, objectFit: 'contain', borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
                            onClick={() => setFullImage(`${API_BASE_URL}/uploads/${selected.file_hash}`)}
                          />
                          <Typography variant="caption" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1, cursor: 'pointer' }} onClick={() => setFullImage(`${API_BASE_URL}/uploads/${selected.file_hash}`)}>
                            <Visibility fontSize="inherit" /> Click to view full size
                          </Typography>
                        </>
                      )}
                    </Paper>
                  );
                })()}
                
                {/* Previous Comments Section */}
                {comments.length > 0 && (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" color="primary" mb={1.5} sx={{ fontWeight: 700 }}>
                      💬 Previous Comments & Reviews
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                      {comments.map((log) => {
                        const dateStr = new Date(log.ts).toLocaleString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        });
                        const roleLabel = {
                          DEV: '👨‍💻 Developer',
                          EMP: '👤 Employee',
                          VRF: '👁️ Verifier',
                          FIN: '💼 Finance',
                          OWN: '👑 Owner',
                          ADM: '🛡️ Admin',
                          VND: '🤝 Partner',
                        }[log.actor_role] || log.actor_role || 'System';

                        return (
                          <Paper 
                            key={log.id} 
                            sx={{ 
                              p: 2, 
                              borderRadius: 2, 
                              border: '1px solid rgba(255,255,255,0.06)', 
                              background: 'rgba(255,255,255,0.02)',
                              position: 'relative'
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" fontWeight={700}>
                                  {log.actor_name || log.actor}
                                </Typography>
                                <Chip label={roleLabel} size="small" sx={{ fontSize: 9, height: 16 }} />
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                {dateStr}
                              </Typography>
                            </Box>
                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 1, borderLeft: '2px solid rgba(99,102,241,0.4)' }}>
                              "{log.comment || 'No comment provided'}"
                            </Typography>
                            <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                              <Chip label={`${log.prev || '-'} → ${log.next || '-'}`} size="small" variant="outlined" color="primary" sx={{ fontSize: 8, height: 14 }} />
                            </Box>
                          </Paper>
                        );
                      })}
                    </Box>
                  </Box>
                )}
                {commentsLoading && (
                  <Box sx={{ py: 2, textAlign: 'center', mb: 2 }}>
                    <CircularProgress size={20} />
                  </Box>
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
                    <strong>First-Line Verification:</strong> As {vInfo ? vInfo.name : 'Verifier'}, review this request and either verify it (send to Owner) or reject it.
                  </Alert>
                )}
                {selected.status === 'VRF' && isOwner && (
                  <Alert severity="info" sx={{ fontSize: 12 }} icon={<Gavel />}>
                    <strong>Owner Authorization (Debojit):</strong> First-line verification is complete. Authorize payment or reject.
                  </Alert>
                )}
                {selected.status === 'OWN' && isFin && (
                  <Alert severity="info" sx={{ fontSize: 12 }} icon={<AccountBalance />}>
                    <strong>Finance Review (Yash):</strong> Owner has authorized. Review financials and prepare for disbursement.
                  </Alert>
                )}
                {selected.status === 'FIN' && isStrictFin && (
                  <Alert severity="success" sx={{ fontSize: 12 }}>
                    <strong>Ready for Disbursement:</strong> All approvals are complete. You can now disburse the payment.
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

                {/* STAGE 2: VRF → OWN */}
                {selected.status === 'VRF' && isOwner && (
                  <>
                    <Button startIcon={<Cancel />} color="error" variant="outlined" onClick={() => doAction('REJ')} disabled={actionLoading}>Reject</Button>
                    <Button startIcon={<Gavel />} variant="contained" color="secondary" onClick={() => doAction('OWN')} disabled={actionLoading}>
                      {actionLoading ? <CircularProgress size={18} color="inherit" /> : '👑 Authorize Payment'}
                    </Button>
                  </>
                )}

                {/* STAGE 3: OWN → FIN */}
                {selected.status === 'OWN' && isFin && (
                  <>
                    <Button startIcon={<Cancel />} color="error" variant="outlined" onClick={() => doAction('REJ')} disabled={actionLoading}>Reject</Button>
                    <Button startIcon={<Send />} variant="contained" color="primary" onClick={() => doAction('FIN')} disabled={actionLoading}>
                      {actionLoading ? <CircularProgress size={18} color="inherit" /> : '💼 Finance Review'}
                    </Button>
                  </>
                )}

                {/* STAGE 4: FIN → DSB */}
                {selected.status === 'FIN' && isStrictFin && (
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
