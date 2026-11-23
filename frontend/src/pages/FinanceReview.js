import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton, Skeleton,
  Alert, CircularProgress, Divider, Tooltip, Grid, MenuItem, Tabs, Tab, ToggleButton, ToggleButtonGroup,
  useMediaQuery, useTheme,
} from '@mui/material';
import {
  AccountBalance, CheckCircle, Cancel, Send, Gavel, Receipt,
  CloseRounded, OpenInNewRounded, AddRounded, EditRounded, TaskAltRounded, FolderOpenRounded,
  InboxRounded, PendingActionsRounded, HourglassTopRounded, PaymentsRounded,
} from '@mui/icons-material';

import { useApi } from '../hooks/useApi';
import { useSelector } from 'react-redux';
import AuthedFile from '../components/AuthedFile';
import { ActivityList } from '../components/RequestDrawer';
import {
  PageHeader, StatCard, StatusChip, PipelineStepper, KeyValue, SectionLabel, Code, Person, EmptyState, Surface, ToneChip, RequestCardList,
} from '../components/ui';
import { formatINR, formatINRCompact, formatDate, formatDateTime, formatRelative, parseMetadata } from '../utils/format';
import { tokens, tones } from '../theme';

// Today's date as YYYY-MM-DD in the user's local time zone
const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Suggest a client code from the project name: first 3 letters of the first word ("Dabur AD Oil" → DAB)
const suggestClientCode = (name) => ((name || '').trim().split(/\s+/)[0] || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
// Suggest a project tag from what the project is about: the first real word after the client
// in the name ("Dabur Amla Bihar" → AMLA), else the first word of the details
const TAG_SKIP_WORDS = new Set(['THE', 'AND', 'FOR', 'OF', 'PROJECT', 'AD', 'AN', 'SMR', 'CGI', 'MV', 'CRP', 'PHO', 'OTH']);
const suggestProjectTag = (name, details) => {
  const pick = (words) => words
    .map(w => w.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
    .find(w => w.length >= 2 && /^[A-Z]/.test(w) && !TAG_SKIP_WORDS.has(w));
  const fromName = pick((name || '').trim().split(/\s+/).slice(1));
  return (fromName || pick((details || '').trim().split(/\s+/)) || '').slice(0, 6);
};
const TAG_RE = /^[A-Z][A-Z0-9]{1,5}$/;

// The 4 first-line verifiers (Soumana replaces Sukanya)
const VERIFIER_MAP = {
  rup:     { name: 'Rup',     title: 'Tech Head',           color: '#3b82f6' },
  debojit: { name: 'Debojit', title: 'Creative Head & Owner', color: '#8b5cf6' },
  yash:    { name: 'Yash',    title: 'Finance Head',        color: '#22c55e' },
  soumana:  { name: 'Soumana',  title: 'Content Head',        color: '#f59e0b' },
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
  const [newProjectCode, setNewProjectCode] = useState(''); // shown read-only (preview, or the saved code while editing)
  const [newClientCode, setNewClientCode] = useState('');
  const [clientCodeTouched, setClientCodeTouched] = useState(false);
  const [newProjectTag, setNewProjectTag] = useState('');
  const [projectTagTouched, setProjectTagTouched] = useState(false);
  const [newProjectType, setNewProjectType] = useState('AD');
  const [newStartDate, setNewStartDate] = useState(todayLocal());
  const [projectTypes, setProjectTypes] = useState([]);
  const [newProjectDetails, setNewProjectDetails] = useState('');
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerPhone, setNewPartnerPhone] = useState('');
  const [projectLoading, setProjectLoading] = useState(false);
  const [projectSuccess, setProjectSuccess] = useState('');
  const [projectError, setProjectError] = useState('');
  const [editingProjectId, setEditingProjectId] = useState(null);
  const [confirmComplete, setConfirmComplete] = useState(null);
  const theme = useTheme();
  const fullScreenDialog = useMediaQuery(theme.breakpoints.down('md'));
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));

  // Comments history state
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const isOwner   = user?.role === 'OWN' || user?.role === 'ADM';
  const isFin     = user?.role === 'FIN' || user?.role === 'ADM';
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

  const fetchProjectTypes = async () => {
    try {
      const res = await apiFetch('/api/projects/types');
      if (res.ok) setProjectTypes(await res.json());
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchRequests();
    if (user?.role === 'FIN' || user?.role === 'ADM') { fetchProjects(); fetchProjectTypes(); }
  }, [user]); // eslint-disable-line

  // Client code follows the project name until the user types their own
  useEffect(() => {
    if (!clientCodeTouched && !editingProjectId) setNewClientCode(suggestClientCode(newProjectName));
  }, [newProjectName, clientCodeTouched, editingProjectId]);

  // Project tag follows the name/details until the user types their own
  useEffect(() => {
    if (!projectTagTouched && !editingProjectId) setNewProjectTag(suggestProjectTag(newProjectName, newProjectDetails));
  }, [newProjectName, newProjectDetails, projectTagTouched, editingProjectId]);

  // Live preview of the code the new project will get
  useEffect(() => {
    if (editingProjectId) return;
    if (!/^[A-Z]{2,5}$/.test(newClientCode) || !TAG_RE.test(newProjectTag) || !newProjectType || !newStartDate) { setNewProjectCode(''); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ clientCode: newClientCode, projectTag: newProjectTag, type: newProjectType, startDate: newStartDate });
        const res = await apiFetch(`/api/projects/next-code?${q}`);
        const data = await res.json();
        if (!cancelled) setNewProjectCode(res.ok ? data.code : '');
      } catch (e) { if (!cancelled) setNewProjectCode(''); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [newClientCode, newProjectTag, newProjectType, newStartDate, editingProjectId, projects]); // eslint-disable-line

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
          VRF: 'verified',
          OWN: 'approved and sent to finance',
          FIN: 'cleared for payment',
          DSB: 'marked as paid',
          REJ: 'rejected'
        };
        setActionResult({ type: 'success', msg: `Done — request ${stateLabels[nextState] || nextState}.` });
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

  // 'mine' = waiting on this person; 'PND' also covers legacy VRF requests (both await the owner)
  const filtered = requests.filter(r => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'mine') return actionsFor(r).length > 0;
    if (filterStatus === 'PND') return r.status === 'PND' || r.status === 'VRF';
    return r.status === filterStatus;
  });

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    if (!editingProjectId && !/^[A-Z]{2,5}$/.test(newClientCode)) {
      setProjectError('Client code must be 2 to 5 letters (A-Z).');
      return;
    }
    if (!editingProjectId && !TAG_RE.test(newProjectTag)) {
      setProjectError('Project tag must be 2 to 6 letters or digits, starting with a letter (e.g. AMLA).');
      return;
    }
    setProjectLoading(true);
    setProjectSuccess('');
    setProjectError('');
    try {
      const url = editingProjectId ? `/api/projects/${editingProjectId}` : '/api/projects';
      const method = editingProjectId ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingProjectId
          ? { name: newProjectName, details: newProjectDetails, partnerName: newPartnerName, partnerPhone: newPartnerPhone }
          : { name: newProjectName, clientCode: newClientCode, projectTag: newProjectTag, type: newProjectType, startDate: newStartDate, details: newProjectDetails, partnerName: newPartnerName, partnerPhone: newPartnerPhone })
      });
      if (res.ok) {
        const data = await res.json();
        setNewProjectName('');
        setNewProjectCode('');
        setNewProjectDetails('');
        setNewPartnerName('');
        setNewPartnerPhone('');
        setNewClientCode('');
        setClientCodeTouched(false);
        setNewProjectTag('');
        setProjectTagTouched(false);
        setNewStartDate(todayLocal());
        setEditingProjectId(null);
        setProjectSuccess(editingProjectId ? `Project "${data.name}" successfully updated!` : `Project "${data.name}" created with code ${data.code}`);
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
    const parts = (p.code || '').split('_');
    setNewClientCode(parts[0] || '');
    setNewProjectTag(parts.length === 6 ? parts[1] : ''); // older codes have no tag
    if (p.project_type) setNewProjectType(p.project_type);
    if (p.start_date) setNewStartDate(p.start_date);
  };

  const handleCancelEditProject = () => {
    setEditingProjectId(null);
    setNewProjectName('');
    setNewProjectCode('');
    setNewClientCode('');
    setClientCodeTouched(false);
    setNewProjectTag('');
    setProjectTagTouched(false);
    setNewProjectType('AD');
    setNewStartDate(todayLocal());
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
    return VERIFIER_MAP[req.verifier] || { name: req.verifier, title: 'Project head' };
  };

  // Who can act on a request right now, and with which buttons
  function actionsFor(req) {
    if (!req) return [];
    const s = req.status;
    if ((s === 'PND' || s === 'VRF') && isOwner) {
      return [
        { state: 'REJ', label: 'Reject', variant: 'outlined', color: 'error', icon: <Cancel /> },
        { state: 'OWN', label: 'Approve', variant: 'contained', color: 'primary', icon: <Gavel /> },
      ];
    }
    if (s === 'OWN' && isFin) {
      return [
        { state: 'REJ', label: 'Reject', variant: 'outlined', color: 'error', icon: <Cancel /> },
        { state: 'FIN', label: 'Clear for payment', variant: 'contained', color: 'primary', icon: <Send /> },
      ];
    }
    if (s === 'FIN' && isStrictFin) {
      return [{ state: 'DSB', label: 'Mark as paid', variant: 'contained', color: 'success', icon: <CheckCircle /> }];
    }
    return [];
  }

  const guidance = (req) => {
    if (!req) return null;
    const s = req.status;
    if (s === 'PND' && isOwner) return { tone: 'info', text: 'New request. Approve it to send it to finance, or reject it with a reason.' };
    if (s === 'VRF' && isOwner) return { tone: 'info', text: 'Submitted before the first-line check was removed. Approve it to send it to finance, or reject it.' };
    if (s === 'OWN' && isFin) return { tone: 'info', text: 'Owner approved. Check the invoice, GST and bank details, then clear it for payment.' };
    if (s === 'FIN' && isStrictFin) return { tone: 'success', text: 'All approvals are in. Mark it paid once the transfer has gone out.' };
    if (s === 'DSB') return { tone: 'success', text: 'This request has been paid.' };
    if (s === 'REJ') return { tone: 'error', text: 'This request was rejected.' };
    return { tone: 'info', text: 'Nothing for you to do on this one right now.' };
  };

  const counts = requests.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {});
  const FILTER_TABS = [
    { key: 'all', label: 'All', count: requests.length },
    { key: 'PND', label: 'Awaiting owner', count: (counts.PND || 0) },
    { key: 'OWN', label: 'With finance', count: counts.OWN || 0 },
    { key: 'FIN', label: 'Ready to pay', count: counts.FIN || 0 },
    { key: 'DSB', label: 'Paid', count: counts.DSB || 0 },
    { key: 'REJ', label: 'Rejected', count: counts.REJ || 0 },
    ...(counts.VRF ? [{ key: 'VRF', label: 'Verified (legacy)', count: counts.VRF }] : []),
  ];
  const myQueue = requests.filter(r => actionsFor(r).length > 0);
  const actionable = selected ? actionsFor(selected) : [];
  const hint = guidance(selected);
  const openReview = (req) => { setSelected(req); setComment(''); setActionResult(null); };

  return (
    <Box>
      <PageHeader
        title="Approvals"
        subtitle="Review partner invoices and salary requests, approve them, and record payouts."
        actions={isFin && (
          <ToggleButtonGroup size="small" exclusive value={activeTab} onChange={(e, v) => v && setActiveTab(v)} aria-label="Section">
            <ToggleButton value="requests">Requests</ToggleButton>
            <ToggleButton value="projects">Projects</ToggleButton>
          </ToggleButtonGroup>
        )}
      />

      {activeTab === 'projects' && isFin && (
        <Box sx={{ display: 'grid', gap: 2.5 }}>
          <Surface
            title={editingProjectId ? 'Edit project' : 'New project'}
            subtitle={editingProjectId ? 'The project code is fixed once created; you can change everything else.' : 'Projects get a unique code that partners pick when they submit an invoice.'}
            action={editingProjectId && <Button color="inherit" onClick={handleCancelEditProject} sx={{ color: 'text.secondary' }}>Cancel edit</Button>}
          >
            {projectSuccess && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setProjectSuccess('')}>{projectSuccess}</Alert>}
            {projectError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setProjectError('')}>{projectError}</Alert>}
            <Box component="form" onSubmit={handleCreateProject}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label="Project name" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} required placeholder="e.g. Dabur Amla Hair Oil" />
                </Grid>
                <Grid item xs={12} md={6}>
                  <TextField fullWidth label="Details" value={newProjectDetails} onChange={e => setNewProjectDetails(e.target.value)} placeholder="Scope, deliverables, notes" />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    fullWidth label="Client code" value={newClientCode} required disabled={!!editingProjectId}
                    onChange={e => { setClientCodeTouched(true); setNewClientCode(e.target.value.replace(/[^A-Za-z]/g, '').slice(0, 5).toUpperCase()); }}
                    helperText={editingProjectId ? ' ' : '2–5 letters, e.g. DAB'}
                    inputProps={{ style: { fontFamily: tokens.mono } }}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    fullWidth label="Project tag" value={newProjectTag} required disabled={!!editingProjectId}
                    onChange={e => { setProjectTagTouched(true); setNewProjectTag(e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase()); }}
                    helperText={editingProjectId ? ' ' : 'Product or campaign'}
                    inputProps={{ style: { fontFamily: tokens.mono } }}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField select fullWidth label="Type" value={newProjectType} required disabled={!!editingProjectId} onChange={e => setNewProjectType(e.target.value)} helperText=" ">
                    {projectTypes.map(t => <MenuItem key={t.code} value={t.code}>{t.label}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField fullWidth type="date" label="Start date" value={newStartDate} required disabled={!!editingProjectId} onChange={e => setNewStartDate(e.target.value)} InputLabelProps={{ shrink: true }} helperText=" " />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Authorized partner name" value={newPartnerName} onChange={e => setNewPartnerName(e.target.value)} placeholder="Only this partner can submit for the project" />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Partner phone" value={newPartnerPhone} onChange={e => setNewPartnerPhone(e.target.value)} placeholder="+91 98765 43210" />
                </Grid>
              </Grid>

              <Box sx={{ mt: 2.5, p: 2, borderRadius: `${tokens.radius.md}px`, bgcolor: tokens.surfaceSunken, border: `1px solid ${tokens.border}`, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ flex: 1, minWidth: 220 }}>
                  <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>
                    {editingProjectId ? 'Project code' : 'Code this project will get'}
                  </Typography>
                  <Typography sx={{ fontFamily: tokens.mono, fontWeight: 600, fontSize: 15, color: newProjectCode ? 'text.primary' : 'text.disabled', mt: 0.25, wordBreak: 'break-all' }}>
                    {newProjectCode || 'Fill in client code, tag, type and date'}
                  </Typography>
                </Box>
                <Button type="submit" variant="contained" disabled={projectLoading || (!editingProjectId && !newProjectCode)} startIcon={projectLoading ? <CircularProgress size={14} color="inherit" /> : editingProjectId ? <CheckCircle /> : <AddRounded />}>
                  {editingProjectId ? 'Save changes' : 'Create project'}
                </Button>
              </Box>
              <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 1.5 }}>
                The partner name is checked when invoices are submitted — only the matching partner can submit for this project.
              </Typography>
            </Box>
          </Surface>

          <Paper sx={{ overflow: 'hidden' }}>
            <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${tokens.border}` }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Active projects</Typography>
              <ToneChip tone="neutral" label={`${projects.length}`} />
            </Box>
            <TableContainer>
              <Table sx={{ minWidth: 720 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Project</TableCell>
                    <TableCell>Partner</TableCell>
                    <TableCell>Start</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {projects.map(p => (
                    <TableRow key={p.id} hover selected={editingProjectId === p.id}>
                      <TableCell sx={{ maxWidth: 360 }}>
                        <Typography variant="body2" sx={{ fontWeight: 560 }}>{p.name}</Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25, flexWrap: 'wrap' }}>
                          <Code muted>{p.code}</Code>
                          {p.project_type && <Typography variant="caption" sx={{ color: 'text.disabled' }}>· {(projectTypes.find(t => t.code === p.project_type) || {}).label || p.project_type}</Typography>}
                        </Box>
                        {p.details && <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5 }} noWrap>{p.details}</Typography>}
                      </TableCell>
                      <TableCell>
                        {p.partner_name
                          ? <Person name={p.partner_name} sub={p.partner_phone} />
                          : <Typography variant="body2" sx={{ color: 'text.disabled' }}>Any partner</Typography>}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{formatDate(p.start_date || p.created_at)}</TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Button size="small" variant="outlined" startIcon={<EditRounded />} onClick={() => handleStartEditProject(p)} sx={{ mr: 1 }}>Edit</Button>
                        <Button size="small" color="success" startIcon={<TaskAltRounded />} onClick={() => setConfirmComplete(p)}>Complete</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {projects.length === 0 && (
              <EmptyState compact icon={<FolderOpenRounded />} title="No active projects" description="Create a project above so partners can submit invoices against it." />
            )}
          </Paper>
        </Box>
      )}

      {activeTab === 'requests' && (
        <>
          {/* Stats */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
            <StatCard label="Waiting on you" value={myQueue.length} icon={<PendingActionsRounded />} tone="warning" loading={loading}
              hint={myQueue.length ? `${formatINRCompact(myQueue.reduce((s, r) => s + (Number(r.amount) || 0), 0))} to review` : 'All caught up'}
              onClick={() => setFilterStatus('mine')} active={filterStatus === 'mine'} />
            <StatCard label="Awaiting owner" value={(counts.PND || 0) + (counts.VRF || 0)} icon={<HourglassTopRounded />} tone="violet" loading={loading}
              onClick={() => setFilterStatus('PND')} active={filterStatus === 'PND'} />
            <StatCard label="With finance" value={counts.OWN || 0} icon={<AccountBalance />} tone="accent" loading={loading}
              onClick={() => setFilterStatus('OWN')} active={filterStatus === 'OWN'} />
            <StatCard label="Paid" value={counts.DSB || 0} icon={<PaymentsRounded />} tone="success" loading={loading}
              hint={formatINRCompact(requests.filter(r => r.status === 'DSB').reduce((s, r) => s + (Number(r.amount) || 0), 0)) + ' paid out'}
              onClick={() => setFilterStatus('DSB')} active={filterStatus === 'DSB'} />
          </Box>

          <Paper sx={{ overflow: 'hidden' }}>
            {/* Filters */}
            <Box sx={{ px: 1.5, borderBottom: `1px solid ${tokens.border}`, overflowX: 'auto' }}>
              <Tabs value={filterStatus === 'mine' ? false : filterStatus} onChange={(e, v) => setFilterStatus(v)} variant="scrollable" scrollButtons={false} aria-label="Filter by status">
                {FILTER_TABS.map(t => (
                  <Tab
                    key={t.key} value={t.key}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        {t.label}
                        <Box component="span" sx={{ px: 0.75, minWidth: 20, borderRadius: '6px', fontSize: 11.5, fontWeight: 600, lineHeight: '18px', bgcolor: 'rgba(255,255,255,0.06)', color: 'text.secondary', fontFeatureSettings: '"tnum"' }}>{t.count}</Box>
                      </Box>
                    }
                  />
                ))}
              </Tabs>
            </Box>
            {filterStatus === 'mine' && (
              <Box sx={{ px: 2.5, py: 1.25, display: 'flex', alignItems: 'center', gap: 1, bgcolor: tones.warning.bg, borderBottom: `1px solid ${tokens.border}` }}>
                <Typography variant="body2" sx={{ flex: 1 }}>Showing requests that are waiting on you.</Typography>
                <Button size="small" color="inherit" onClick={() => setFilterStatus('all')}>Show all</Button>
              </Box>
            )}

            {isPhone ? (
              <RequestCardList
                rows={filtered} loading={loading} onSelect={openReview}
                renderAside={(req) => (
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body2" sx={{ fontWeight: 650, fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>{formatINR(req.amount)}</Typography>
                    {actionsFor(req).length > 0 && <Typography variant="caption" sx={{ color: '#FBBF24', fontWeight: 600 }}>Review</Typography>}
                  </Box>
                )}
              />
            ) : (
            <TableContainer>
              <Table sx={{ minWidth: 560 }} aria-label="Requests to review">
                <TableHead>
                  <TableRow>
                    <TableCell>Request</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Project head</TableCell>
                    <TableCell>Submitted</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {loading && [0, 1, 2, 3].map(i => (
                    <TableRow key={i}>{[240, 80, 110, 90, 70, 70].map((w, j) => <TableCell key={j} sx={j === 3 ? { display: { xs: 'none', lg: 'table-cell' } } : undefined}><Skeleton width={w} /></TableCell>)}</TableRow>
                  ))}
                  {!loading && filtered.map((req) => {
                    const canAct = actionsFor(req).length > 0;
                    return (
                      <TableRow key={req.id} hover onClick={() => openReview(req)} sx={{ cursor: 'pointer' }}>
                        <TableCell sx={{ maxWidth: { xs: 220, md: 240, lg: 340 } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {canAct && <Box aria-label="Needs your action" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: '#FBBF24', flexShrink: 0, boxShadow: '0 0 0 3px rgba(251,191,36,0.15)' }} />}
                            <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>{req.purpose}</Typography>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.25, pl: canAct ? 2 : 0 }}>
                            <Code muted>{req.id}</Code>
                            {req.invoice_code && <Code muted sx={{ color: 'text.disabled' }}>· {req.invoice_code}</Code>}
                          </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>{formatINR(req.amount)}</TableCell>
                        <TableCell><StatusChip status={req.status} /></TableCell>
                        <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}><Person name={getVerifierInfo(req)?.name} /></TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                          <Tooltip title={formatDate(req.ts)}><span>{formatRelative(req.ts)}</span></Tooltip>
                        </TableCell>
                        <TableCell align="right">
                          <Button size="small" variant={canAct ? 'contained' : 'text'} color={canAct ? 'primary' : 'inherit'}
                            onClick={(e) => { e.stopPropagation(); openReview(req); }}
                            sx={!canAct ? { color: 'text.secondary' } : undefined}>
                            {canAct ? 'Review' : 'View'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            )}
            {!loading && filtered.length === 0 && (
              <EmptyState
                icon={<InboxRounded />}
                title={filterStatus === 'mine' ? "You're all caught up" : 'No requests here'}
                description={filterStatus === 'mine' ? 'Nothing is waiting on you right now.' : 'Requests with this status will appear here.'}
              />
            )}
          </Paper>
        </>
      )}

      {/* ═════════════ REVIEW DIALOG ═════════════ */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="lg" fullWidth fullScreen={fullScreenDialog} scroll="paper">
        {selected && (() => {
          const meta = parseMetadata(selected);
          const isSalary = meta?.type === 'salary';
          const isPdf = selected.file_hash && selected.file_hash.toLowerCase().endsWith('.pdf');
          return (
            <>
              <DialogTitle sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, borderBottom: `1px solid ${tokens.border}`, pb: 2 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', columnGap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                    <Code muted sx={{ whiteSpace: 'nowrap' }}>{selected.id}</Code>
                    {selected.invoice_code && <Code muted sx={{ color: 'text.disabled', whiteSpace: 'nowrap' }}>· {selected.invoice_code}</Code>}
                  </Box>
                  <Typography variant="h6" component="span" sx={{ display: 'block' }}>{selected.purpose}</Typography>
                  <Box sx={{ display: { xs: 'block', sm: 'none' }, mt: 1 }}><StatusChip status={selected.status} /></Box>
                </Box>
                <Box sx={{ display: { xs: 'none', sm: 'block' } }}><StatusChip status={selected.status} /></Box>
                <IconButton onClick={() => setSelected(null)} aria-label="Close" sx={{ mt: -0.5, mr: -1 }}><CloseRounded /></IconButton>
              </DialogTitle>

              <DialogContent sx={{ p: 0 }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 7fr) minmax(0, 5fr)' }, minHeight: '100%' }}>
                  {/* Left — the request */}
                  <Box sx={{ p: 3, display: 'grid', gap: 3, alignContent: 'start', borderRight: { md: `1px solid ${tokens.border}` } }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: 'text.secondary' }}>{isSalary ? 'Net payable' : 'Total payable'}</Typography>
                        <Typography sx={{ fontSize: 32, fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.15, fontFeatureSettings: '"tnum"' }}>
                          {formatINR(meta?.totalAmount || meta?.netAmount || selected.amount)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'text.disabled' }}>Submitted {formatDateTime(selected.ts)}</Typography>
                      </Box>
                    </Box>

                    <Box sx={{ p: 2, borderRadius: `${tokens.radius.lg}px`, border: `1px solid ${tokens.border}`, bgcolor: tokens.surfaceSunken }}>
                      {selected.status === 'REJ'
                        ? <Typography variant="body2" sx={{ color: 'text.secondary' }}>This request was rejected. See the activity for the reason.</Typography>
                        : <PipelineStepper status={selected.status} />}
                    </Box>

                    {meta && (
                      <>
                        <Box>
                          <SectionLabel>{isSalary ? 'Employee' : 'Partner'}</SectionLabel>
                          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
                            {isSalary ? (
                              <>
                                <KeyValue label="Name" value={meta.employeeName} strong />
                                <KeyValue label="Employee ID" value={meta.employeeCode} mono />
                                <KeyValue label="Phone" value={meta.phone} />
                                <KeyValue label="City" value={meta.city} />
                                <KeyValue label="State" value={meta.state} />
                              </>
                            ) : (
                              <>
                                <KeyValue label="Name" value={meta.vendorName || meta.partnerName} strong />
                                <KeyValue label="Company" value={meta.companyName} />
                                <KeyValue label="Phone" value={meta.phone} />
                                <KeyValue label="City" value={meta.city} />
                                <KeyValue label="State" value={meta.state} />
                                {meta.isGst && <KeyValue label="GSTIN" value={meta.gstNumber} mono />}
                              </>
                            )}
                          </Box>
                        </Box>

                        <Box>
                          <SectionLabel>{isSalary ? 'Salary' : 'Project'}</SectionLabel>
                          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
                            {isSalary ? (
                              <>
                                <KeyValue label="Month" value={meta.month} strong />
                                <KeyValue label="Department" value={meta.department} />
                                <KeyValue label="Approver" value={meta.projectHead} />
                              </>
                            ) : (
                              <>
                                <KeyValue label="Project" value={meta.projectName} strong sx={{ gridColumn: { xs: '1 / -1', sm: 'span 3' } }} />
                                <KeyValue label="Role" value={meta.jobDescription || meta.department} />
                                <KeyValue label="Project head" value={meta.projectHead} />
                                <KeyValue label="Dates" value={meta.startDate ? `${formatDate(meta.startDate)} – ${formatDate(meta.endDate)}` : null} />
                              </>
                            )}
                          </Box>
                        </Box>

                        {(meta.bankName || meta.accountNumber) && (
                          <Box>
                            <SectionLabel>Bank account</SectionLabel>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
                              <KeyValue label="Account holder" value={meta.beneficiaryName} strong />
                              <KeyValue label="Bank" value={meta.bankName} />
                              <KeyValue label="Branch" value={meta.branchName} />
                              <KeyValue label="Account no." value={meta.accountNumber} mono />
                              <KeyValue label="IFSC" value={meta.ifscCode} mono />
                              <KeyValue label="Type" value={meta.accountType} />
                            </Box>
                            {meta.chequeFileHash && (
                              <AuthedFile name={meta.chequeFileHash}>
                                {(chequeUrl) => (
                                  <Button size="small" variant="outlined" sx={{ mt: 2 }} startIcon={<Receipt />}
                                    {...(meta.chequeFileHash.toLowerCase().endsWith('.pdf')
                                      ? { href: chequeUrl, target: '_blank', rel: 'noopener noreferrer' }
                                      : { onClick: () => setFullImage(chequeUrl) })}>
                                    View cancelled cheque
                                  </Button>
                                )}
                              </AuthedFile>
                            )}
                          </Box>
                        )}

                        <Box>
                          <SectionLabel>Breakdown</SectionLabel>
                          <Box sx={{ display: 'grid', gap: 0.75, p: 2, borderRadius: `${tokens.radius.md}px`, border: `1px solid ${tokens.border}` }}>
                            {[
                              [isSalary ? 'Base salary' : 'Base amount', isSalary ? (meta.baseSalary || 0) : (meta.baseAmount || 0)],
                              ...(isSalary && meta.deductions > 0 ? [['Deductions', -meta.deductions]] : []),
                              ...(meta.advanceAmount > 0 ? [['Advance received', meta.advanceAmount]] : []),
                              ...(meta.isGst ? [[`GST · ${meta.gstType || '18%'}`, meta.gstAmount || 0]] : []),
                            ].map(([k, v]) => (
                              <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                                <Typography variant="body2" sx={{ color: 'text.secondary' }}>{k}</Typography>
                                <Typography variant="body2" sx={{ fontFeatureSettings: '"tnum"' }}>{formatINR(v)}</Typography>
                              </Box>
                            ))}
                            <Divider sx={{ my: 0.5 }} />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>Total</Typography>
                              <Typography variant="body2" sx={{ fontWeight: 650, fontFeatureSettings: '"tnum"' }}>{formatINR(meta.totalAmount || meta.netAmount || selected.amount)}</Typography>
                            </Box>
                          </Box>
                        </Box>
                      </>
                    )}

                    {!meta && (
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                        <KeyValue label="Requester" value={selected.requester} mono />
                        <KeyValue label="Project head" value={getVerifierInfo(selected)?.name} />
                      </Box>
                    )}
                  </Box>

                  {/* Right — document, activity, decision */}
                  <Box sx={{ p: 3, display: 'grid', gap: 3, alignContent: 'start', bgcolor: 'rgba(255,255,255,0.012)' }}>
                    {selected.file_hash && (
                      <Box>
                        <SectionLabel>{isSalary ? 'Payslip / proof' : 'Invoice document'}</SectionLabel>
                        <AuthedFile name={selected.file_hash}>
                          {(fileUrl) => isPdf ? (
                            <Box sx={{ border: `1px solid ${tokens.border}`, borderRadius: `${tokens.radius.md}px`, overflow: 'hidden' }}>
                              <iframe src={fileUrl} title="Invoice PDF" width="100%" height="320px" style={{ border: 'none', backgroundColor: '#fff', display: 'block' }} />
                              <Button fullWidth size="small" component="a" href={fileUrl} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRounded />} sx={{ borderRadius: 0, borderTop: `1px solid ${tokens.border}` }}>
                                Open in new tab
                              </Button>
                            </Box>
                          ) : (
                            <Box
                              component="button" type="button" onClick={() => setFullImage(fileUrl)}
                              sx={{ p: 0, border: `1px solid ${tokens.border}`, borderRadius: `${tokens.radius.md}px`, overflow: 'hidden', cursor: 'zoom-in', bgcolor: '#000', width: '100%', display: 'block', '&:focus-visible': { outline: 'none', boxShadow: tokens.focusRing } }}
                              aria-label="View document full size"
                            >
                              <Box component="img" src={fileUrl} alt="Attached document" sx={{ width: '100%', maxHeight: 320, objectFit: 'contain', display: 'block' }} />
                            </Box>
                          )}
                        </AuthedFile>
                      </Box>
                    )}

                    <Box>
                      <SectionLabel>Activity</SectionLabel>
                      {commentsLoading ? <Skeleton height={60} /> : comments.length ? <ActivityList logs={comments} /> : <Typography variant="body2" sx={{ color: 'text.disabled' }}>No activity yet.</Typography>}
                    </Box>

                    <Box>
                      <SectionLabel>Your decision</SectionLabel>
                      {hint && <Alert severity={hint.tone} sx={{ mb: 2 }}>{hint.text}</Alert>}
                      {actionable.length > 0 && (
                        <TextField
                          label="Comment" required multiline minRows={2} fullWidth
                          value={comment} onChange={(e) => setComment(e.target.value)}
                          placeholder="Why you're approving, rejecting or paying — this is logged."
                          inputProps={{ maxLength: 500 }}
                        />
                      )}
                      {actionResult && <Alert severity={actionResult.type} sx={{ mt: 2 }}>{actionResult.msg}</Alert>}
                    </Box>
                  </Box>
                </Box>
              </DialogContent>

              <DialogActions>
                <Button color="inherit" onClick={() => setSelected(null)} sx={{ color: 'text.secondary', mr: 'auto' }}>Close</Button>
                {actionable.map(a => (
                  <Button key={a.state} variant={a.variant} color={a.color} startIcon={actionLoading ? null : a.icon} onClick={() => doAction(a.state)} disabled={actionLoading}>
                    {actionLoading && a.variant === 'contained' ? <CircularProgress size={18} color="inherit" /> : a.label}
                  </Button>
                ))}
              </DialogActions>
            </>
          );
        })()}
      </Dialog>

      {/* Full-size document preview */}
      <Dialog open={!!fullImage} onClose={() => setFullImage(null)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          Document preview
          <IconButton onClick={() => setFullImage(null)} aria-label="Close preview"><CloseRounded /></IconButton>
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center', bgcolor: '#000', p: 2 }}>
          <Box component="img" src={fullImage} alt="Full-size document" sx={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
        </DialogContent>
      </Dialog>

      {/* Confirm completing a project */}
      <Dialog open={!!confirmComplete} onClose={() => setConfirmComplete(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Mark project complete?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{confirmComplete?.name}</Box> will be removed from the active list, and partners won't be able to submit invoices for it.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setConfirmComplete(null)}>Cancel</Button>
          <Button variant="contained" color="success" onClick={() => { handleCompleteProject(confirmComplete.id); setConfirmComplete(null); }}>Mark complete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FinanceReview;
