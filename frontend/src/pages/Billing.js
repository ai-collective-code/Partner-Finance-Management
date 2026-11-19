import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, MenuItem, Button, IconButton, Alert, Chip, Divider,
  Table, TableHead, TableRow, TableCell, TableBody, Tabs, Tab, ToggleButton, ToggleButtonGroup,
  CircularProgress, Tooltip, Menu,
} from '@mui/material';
import {
  Add, Delete, PictureAsPdf, ReceiptLong, SwapHoriz, MoreVert, AutoAwesome,
} from '@mui/icons-material';
import { useApi } from '../hooks/useApi';
import { downloadBillingPdf, formatINR } from '../utils/generateBillingPdf';

// Today's date as YYYY-MM-DD in the user's local time zone
const todayLocal = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// Same suggestions the Projects screen uses for the AiC code parts
const suggestClientCode = (name) => ((name || '').trim().split(/\s+/)[0] || '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
const TAG_SKIP_WORDS = new Set(['THE', 'AND', 'FOR', 'OF', 'PROJECT', 'AD', 'AN', 'SMR', 'CGI', 'MV', 'CRP', 'PHO', 'OTH']);
const suggestProjectTag = (name) => (((name || '').trim().split(/\s+/).slice(1)
  .map(w => w.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
  .find(w => w.length >= 2 && /^[A-Z]/.test(w) && !TAG_SKIP_WORDS.has(w))) || '').slice(0, 6);
const TAG_RE = /^[A-Z][A-Z0-9]{1,5}$/;
const CLIENT_RE = /^[A-Z]{2,5}$/;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const emptyItem = () => ({ description: '', sac: '', qty: 1, rate: '' });

const STATUS_COLORS = { Issued: 'info', Sent: 'primary', Accepted: 'secondary', Paid: 'success', Cancelled: 'error' };
const DUE_LABEL = (type) => (type === 'INV' || type === 'PI' ? 'Due date' : 'Valid until');

const paperSx = { p: { xs: 2, sm: 3 }, bgcolor: '#111827', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 3 };

export default function Billing() {
  const { apiFetch } = useApi();
  const [tab, setTab] = useState('create');
  const [config, setConfig] = useState(null);
  const [projects, setProjects] = useState([]);
  const [projectTypes, setProjectTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [listFilter, setListFilter] = useState('ALL');

  // ── Form state
  const [docType, setDocType] = useState('INV');
  const [issueDate, setIssueDate] = useState(todayLocal());
  const [dueDate, setDueDate] = useState(todayLocal(15));
  const [nextNumber, setNextNumber] = useState('');

  const [projectMode, setProjectMode] = useState('existing'); // 'existing' | 'new'
  const [projectId, setProjectId] = useState('');
  const [np, setNp] = useState({ name: '', clientCode: '', projectTag: '', type: 'AD', startDate: todayLocal() });
  const [npTouched, setNpTouched] = useState({ clientCode: false, projectTag: false });
  const [newCodePreview, setNewCodePreview] = useState('');

  const [client, setClient] = useState({ name: '', address: '', gstin: '', state: '', email: '', phone: '' });
  const [items, setItems] = useState([emptyItem()]);
  const [taxRate, setTaxRate] = useState(18);
  const [taxMode, setTaxMode] = useState('AUTO'); // AUTO picks CGST+SGST vs IGST from the client's state
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  const [menu, setMenu] = useState({ anchor: null, doc: null });

  // ── Loaders
  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      const res = await apiFetch('/api/billing/docs');
      if (res.ok) setDocs(await res.json());
    } catch (e) { console.error(e); } finally { setDocsLoading(false); }
  }, [apiFetch]);

  const loadProjects = useCallback(async () => {
    try {
      const res = await apiFetch('/api/projects');
      if (res.ok) setProjects(await res.json());
    } catch (e) { console.error(e); }
  }, [apiFetch]);

  useEffect(() => {
    (async () => {
      try {
        const [c, t] = await Promise.all([apiFetch('/api/billing/config'), apiFetch('/api/projects/types')]);
        if (c.ok) setConfig(await c.json());
        if (t.ok) setProjectTypes(await t.json());
      } catch (e) { console.error(e); }
    })();
    loadProjects();
    loadDocs();
  }, []); // eslint-disable-line

  // Preview of the document number this will get
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/billing/next-number?type=${docType}&date=${issueDate}`);
        const data = await res.json();
        if (!cancelled) setNextNumber(res.ok ? data.number : '');
      } catch { if (!cancelled) setNextNumber(''); }
    })();
    return () => { cancelled = true; };
  }, [docType, issueDate, docs]); // eslint-disable-line

  // New-project code parts follow the project name until edited by hand
  useEffect(() => {
    setNp(p => ({
      ...p,
      clientCode: npTouched.clientCode ? p.clientCode : suggestClientCode(p.name),
      projectTag: npTouched.projectTag ? p.projectTag : suggestProjectTag(p.name),
    }));
  }, [np.name, npTouched]);

  // Live preview of the AiC code a new project would get
  useEffect(() => {
    if (projectMode !== 'new' || !CLIENT_RE.test(np.clientCode) || !TAG_RE.test(np.projectTag) || !np.type || !np.startDate) {
      setNewCodePreview('');
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ clientCode: np.clientCode, projectTag: np.projectTag, type: np.type, startDate: np.startDate });
        const res = await apiFetch(`/api/projects/next-code?${q}`);
        const data = await res.json();
        if (!cancelled) setNewCodePreview(res.ok ? data.code : '');
      } catch { if (!cancelled) setNewCodePreview(''); }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [projectMode, np.clientCode, np.projectTag, np.type, np.startDate, projects]); // eslint-disable-line

  const selectedProject = projects.find(p => p.id === projectId);

  // Picking an existing project pre-fills the client from it
  useEffect(() => {
    if (selectedProject?.partner_name && !client.name) {
      setClient(c => ({ ...c, name: selectedProject.partner_name, phone: c.phone || selectedProject.partner_phone || '' }));
    }
  }, [projectId]); // eslint-disable-line

  const companyState = (config?.company?.state || '').trim().toLowerCase();
  const effectiveTaxMode = taxMode !== 'AUTO' ? taxMode
    : (client.state.trim() && client.state.trim().toLowerCase() !== companyState ? 'IGST' : 'CGST_SGST');

  const totals = useMemo(() => {
    const subtotal = round2(items.reduce((s, it) => s + round2((Number(it.qty) || 0) * (Number(it.rate) || 0)), 0));
    const rate = effectiveTaxMode === 'NONE' ? 0 : Number(taxRate);
    const tax = round2(subtotal * rate / 100);
    return { subtotal, rate, tax, total: round2(subtotal + tax) };
  }, [items, taxRate, effectiveTaxMode]);

  const aicCode = projectMode === 'existing' ? (selectedProject?.code || '') : newCodePreview;

  const setItem = (i, key, value) => setItems(list => list.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));

  const resetForm = () => {
    setProjectId('');
    setNp({ name: '', clientCode: '', projectTag: '', type: 'AD', startDate: todayLocal() });
    setNpTouched({ clientCode: false, projectTag: false });
    setClient({ name: '', address: '', gstin: '', state: '', email: '', phone: '' });
    setItems([emptyItem()]);
    setNotes('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setResult(null);
    if (projectMode === 'existing' && !projectId) { setResult({ type: 'error', msg: 'Pick a project (it gives the AiC code), or switch to "New project".' }); return; }
    if (projectMode === 'new') {
      if (!np.name.trim()) { setResult({ type: 'error', msg: 'Enter the new project name.' }); return; }
      if (!CLIENT_RE.test(np.clientCode)) { setResult({ type: 'error', msg: 'Client code must be 2 to 5 letters (A-Z).' }); return; }
      if (!TAG_RE.test(np.projectTag)) { setResult({ type: 'error', msg: 'Project tag must be 2 to 6 letters/digits, starting with a letter.' }); return; }
    }
    const cleanItems = items.filter(it => it.description.trim() || Number(it.rate));
    if (!cleanItems.length) { setResult({ type: 'error', msg: 'Add at least one item with a description and rate.' }); return; }
    if (cleanItems.some(it => !it.description.trim())) { setResult({ type: 'error', msg: 'Every item needs a description.' }); return; }

    setSaving(true);
    try {
      const res = await apiFetch('/api/billing/docs', {
        method: 'POST',
        body: {
          docType,
          issueDate,
          dueDate: dueDate || '',
          ...(projectMode === 'existing' ? { projectId } : { newProject: np }),
          client,
          items: cleanItems.map(it => ({ description: it.description, sac: it.sac, qty: Number(it.qty) || 0, rate: Number(it.rate) || 0 })),
          taxMode: effectiveTaxMode,
          taxRate: Number(taxRate),
          notes,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.details?.map(d => d.message).join(', ');
        setResult({ type: 'error', msg: detail || data.error || 'Could not create the document' });
        return;
      }
      downloadBillingPdf(data, config?.company);
      setResult({ type: 'success', msg: `${data.doc_number} created for ${data.project_code} — PDF downloaded.` });
      resetForm();
      setProjectMode('existing');
      loadDocs();
      loadProjects();
    } catch (err) {
      setResult({ type: 'error', msg: 'Network error — please try again.' });
    } finally { setSaving(false); }
  };

  const convertToInvoice = async (doc) => {
    setMenu({ anchor: null, doc: null });
    const res = await apiFetch(`/api/billing/docs/${doc.id}/convert`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      downloadBillingPdf(data, config?.company);
      setResult({ type: 'success', msg: `${doc.doc_number} converted to invoice ${data.doc_number}.` });
      loadDocs();
    } else {
      setResult({ type: 'error', msg: data.error || 'Could not convert' });
    }
  };

  const setStatus = async (doc, status) => {
    setMenu({ anchor: null, doc: null });
    const res = await apiFetch(`/api/billing/docs/${doc.id}/status`, { method: 'PUT', body: { status } });
    if (res.ok) loadDocs();
  };

  const filteredDocs = listFilter === 'ALL' ? docs : docs.filter(d => d.doc_type === listFilter);
  const docTypes = config?.docTypes || [{ code: 'INV', label: 'Tax Invoice' }, { code: 'PI', label: 'Proforma Invoice' }, { code: 'EST', label: 'Estimate' }, { code: 'QUO', label: 'Quotation' }];
  const typeLabel = (code) => docTypes.find(t => t.code === code)?.label || code;

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
        <ReceiptLong color="primary" />
        <Typography variant="h5" fontWeight={700}>Invoices & Estimates</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Fill in the key details — the document number, AiC code, GST and totals are generated automatically.
      </Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab value="create" label="Create new" />
        <Tab value="list" label={`All documents (${docs.length})`} />
      </Tabs>

      {result && <Alert severity={result.type} sx={{ mb: 2 }} onClose={() => setResult(null)}>{result.msg}</Alert>}

      {tab === 'create' && (
        <Box component="form" onSubmit={handleSubmit}>
          <Grid container spacing={2}>
            {/* ── Document */}
            <Grid item xs={12}>
              <Paper sx={paperSx}>
                <Typography fontWeight={700} mb={2}>1. Document</Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={4}>
                    <TextField select fullWidth size="small" label="Type" value={docType} onChange={e => setDocType(e.target.value)}>
                      {docTypes.map(t => <MenuItem key={t.code} value={t.code}>{t.label}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <TextField fullWidth size="small" type="date" label="Issue date" InputLabelProps={{ shrink: true }}
                      value={issueDate} onChange={e => setIssueDate(e.target.value)} required />
                  </Grid>
                  <Grid item xs={6} sm={4}>
                    <TextField fullWidth size="small" type="date" label={DUE_LABEL(docType)} InputLabelProps={{ shrink: true }}
                      value={dueDate} onChange={e => setDueDate(e.target.value)} />
                  </Grid>
                </Grid>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}>
                  <Chip icon={<AutoAwesome sx={{ fontSize: 16 }} />} color="primary" variant="outlined"
                    label={`Number: ${nextNumber || '…'}`} />
                  <Chip icon={<AutoAwesome sx={{ fontSize: 16 }} />} color="secondary" variant="outlined"
                    label={`AiC Code: ${aicCode || 'pick or create a project'}`} />
                </Box>
              </Paper>
            </Grid>

            {/* ── Project / AiC code */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ ...paperSx, height: '100%' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1, flexWrap: 'wrap' }}>
                  <Typography fontWeight={700}>2. Project (AiC code)</Typography>
                  <ToggleButtonGroup size="small" exclusive value={projectMode} onChange={(_, v) => v && setProjectMode(v)}>
                    <ToggleButton value="existing">Existing</ToggleButton>
                    <ToggleButton value="new">New project</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
                {projectMode === 'existing' ? (
                  <TextField select fullWidth size="small" label="Project" value={projectId} onChange={e => setProjectId(e.target.value)}
                    helperText={projects.length ? 'Active projects' : 'No active projects yet — create one with "New project".'}>
                    {projects.map(p => (
                      <MenuItem key={p.id} value={p.id}>
                        <Box>
                          <Typography variant="body2">{p.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{p.code}</Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <Grid container spacing={1.5}>
                    <Grid item xs={12}>
                      <TextField fullWidth size="small" label="Project name" placeholder="e.g. Dabur Amla Bihar Ad"
                        value={np.name} onChange={e => setNp({ ...np, name: e.target.value })} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth size="small" label="Client code" value={np.clientCode}
                        onChange={e => { setNpTouched(t => ({ ...t, clientCode: true })); setNp({ ...np, clientCode: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) }); }} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth size="small" label="Project tag" value={np.projectTag}
                        onChange={e => { setNpTouched(t => ({ ...t, projectTag: true })); setNp({ ...np, projectTag: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) }); }} />
                    </Grid>
                    <Grid item xs={6}>
                      <TextField select fullWidth size="small" label="Type" value={np.type} onChange={e => setNp({ ...np, type: e.target.value })}>
                        {projectTypes.map(t => <MenuItem key={t.code} value={t.code}>{t.label}</MenuItem>)}
                      </TextField>
                    </Grid>
                    <Grid item xs={6}>
                      <TextField fullWidth size="small" type="date" label="Start date" InputLabelProps={{ shrink: true }}
                        value={np.startDate} onChange={e => setNp({ ...np, startDate: e.target.value })} />
                    </Grid>
                  </Grid>
                )}
              </Paper>
            </Grid>

            {/* ── Client */}
            <Grid item xs={12} md={6}>
              <Paper sx={{ ...paperSx, height: '100%' }}>
                <Typography fontWeight={700} mb={2}>3. Client</Typography>
                <Grid container spacing={1.5}>
                  <Grid item xs={12}>
                    <TextField fullWidth size="small" label="Client / company name" required
                      value={client.name} onChange={e => setClient({ ...client, name: e.target.value })} />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField fullWidth size="small" label="Billing address" multiline minRows={2}
                      value={client.address} onChange={e => setClient({ ...client, address: e.target.value })} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth size="small" label="GSTIN (optional)" inputProps={{ maxLength: 15 }}
                      value={client.gstin} onChange={e => setClient({ ...client, gstin: e.target.value.toUpperCase() })} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth size="small" label="State" placeholder={config?.company?.state || ''}
                      value={client.state} onChange={e => setClient({ ...client, state: e.target.value })} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth size="small" label="Email"
                      value={client.email} onChange={e => setClient({ ...client, email: e.target.value })} />
                  </Grid>
                  <Grid item xs={6}>
                    <TextField fullWidth size="small" label="Phone"
                      value={client.phone} onChange={e => setClient({ ...client, phone: e.target.value })} />
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            {/* ── Items */}
            <Grid item xs={12}>
              <Paper sx={paperSx}>
                <Typography fontWeight={700} mb={2}>4. Items</Typography>
                {items.map((it, i) => (
                  <Grid container spacing={1.5} key={i} sx={{ mb: 1.5 }} alignItems="center">
                    <Grid item xs={12} md={5}>
                      <TextField fullWidth size="small" label={`Item ${i + 1} description`}
                        value={it.description} onChange={e => setItem(i, 'description', e.target.value)} />
                    </Grid>
                    <Grid item xs={4} md={2}>
                      <TextField fullWidth size="small" label="SAC" placeholder="999612"
                        value={it.sac} onChange={e => setItem(i, 'sac', e.target.value.replace(/[^0-9]/g, '').slice(0, 8))} />
                    </Grid>
                    <Grid item xs={3} md={1}>
                      <TextField fullWidth size="small" type="number" label="Qty" inputProps={{ min: 0, step: 'any' }}
                        value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} />
                    </Grid>
                    <Grid item xs={5} md={2}>
                      <TextField fullWidth size="small" type="number" label="Rate (₹)" inputProps={{ min: 0, step: 'any' }}
                        value={it.rate} onChange={e => setItem(i, 'rate', e.target.value)} />
                    </Grid>
                    <Grid item xs={10} md={1.5}>
                      <Typography variant="body2" textAlign="right">₹ {formatINR((Number(it.qty) || 0) * (Number(it.rate) || 0))}</Typography>
                    </Grid>
                    <Grid item xs={2} md={0.5}>
                      <IconButton size="small" disabled={items.length === 1} onClick={() => setItems(items.filter((_, idx) => idx !== i))}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </Grid>
                  </Grid>
                ))}
                <Button size="small" startIcon={<Add />} onClick={() => setItems([...items, emptyItem()])} disabled={items.length >= 50}>
                  Add item
                </Button>

                <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.08)' }} />

                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <Grid container spacing={1.5}>
                      <Grid item xs={6}>
                        <TextField select fullWidth size="small" label="GST rate" value={taxRate} onChange={e => setTaxRate(e.target.value)}>
                          {(config?.taxRates || [0, 5, 12, 18, 28]).map(r => <MenuItem key={r} value={r}>{r}%</MenuItem>)}
                        </TextField>
                      </Grid>
                      <Grid item xs={6}>
                        <TextField select fullWidth size="small" label="GST type" value={taxMode} onChange={e => setTaxMode(e.target.value)}
                          helperText={taxMode === 'AUTO' ? `Auto → ${effectiveTaxMode === 'IGST' ? 'IGST (other state)' : 'CGST + SGST (same state)'}` : ' '}>
                          <MenuItem value="AUTO">Auto (by client state)</MenuItem>
                          <MenuItem value="CGST_SGST">CGST + SGST</MenuItem>
                          <MenuItem value="IGST">IGST</MenuItem>
                          <MenuItem value="NONE">No GST</MenuItem>
                        </TextField>
                      </Grid>
                      <Grid item xs={12}>
                        <TextField fullWidth size="small" label="Notes / terms (optional)" multiline minRows={2}
                          placeholder="e.g. 50% advance, balance on delivery"
                          value={notes} onChange={e => setNotes(e.target.value)} />
                      </Grid>
                    </Grid>
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <Box sx={{ bgcolor: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: 2, p: 2 }}>
                      {[
                        ['Subtotal', totals.subtotal],
                        ...(effectiveTaxMode === 'CGST_SGST' ? [[`CGST @ ${totals.rate / 2}%`, round2(totals.tax / 2)], [`SGST @ ${totals.rate / 2}%`, round2(totals.tax - round2(totals.tax / 2))]] : []),
                        ...(effectiveTaxMode === 'IGST' ? [[`IGST @ ${totals.rate}%`, totals.tax]] : []),
                      ].map(([k, v]) => (
                        <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
                          <Typography variant="body2" color="text.secondary">{k}</Typography>
                          <Typography variant="body2">₹ {formatINR(v)}</Typography>
                        </Box>
                      ))}
                      <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.1)' }} />
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography fontWeight={700}>Total</Typography>
                        <Typography fontWeight={700} color="primary">₹ {formatINR(totals.total)}</Typography>
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </Paper>
            </Grid>

            <Grid item xs={12}>
              <Button type="submit" variant="contained" size="large" disabled={saving}
                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <PictureAsPdf />}>
                {saving ? 'Generating…' : `Generate ${typeLabel(docType)} & download PDF`}
              </Button>
            </Grid>
          </Grid>
        </Box>
      )}

      {tab === 'list' && (
        <Paper sx={paperSx}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
            {[{ code: 'ALL', label: 'All' }, ...docTypes].map(t => (
              <Chip key={t.code} label={t.label} onClick={() => setListFilter(t.code)}
                color={listFilter === t.code ? 'primary' : 'default'} variant={listFilter === t.code ? 'filled' : 'outlined'} />
            ))}
          </Box>
          {docsLoading ? <CircularProgress size={24} /> : filteredDocs.length === 0 ? (
            <Typography color="text.secondary" variant="body2">No documents yet.</Typography>
          ) : (
            <Box sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Number</TableCell>
                    <TableCell>Type</TableCell>
                    <TableCell>AiC Code</TableCell>
                    <TableCell>Client</TableCell>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Total (₹)</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredDocs.map(d => (
                    <TableRow key={d.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{d.doc_number}</TableCell>
                      <TableCell>{typeLabel(d.doc_type)}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{d.project_code}</TableCell>
                      <TableCell>{d.client_name}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{d.issue_date}</TableCell>
                      <TableCell align="right">{formatINR(d.total)}</TableCell>
                      <TableCell><Chip size="small" label={d.status} color={STATUS_COLORS[d.status] || 'default'} /></TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Download PDF">
                          <IconButton size="small" onClick={() => downloadBillingPdf(d, config?.company)}><PictureAsPdf fontSize="small" /></IconButton>
                        </Tooltip>
                        {d.doc_type !== 'INV' && d.status !== 'Cancelled' && (
                          <Tooltip title="Convert to Tax Invoice">
                            <IconButton size="small" onClick={() => convertToInvoice(d)}><SwapHoriz fontSize="small" /></IconButton>
                          </Tooltip>
                        )}
                        <IconButton size="small" onClick={e => setMenu({ anchor: e.currentTarget, doc: d })}><MoreVert fontSize="small" /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
          <Menu anchorEl={menu.anchor} open={Boolean(menu.anchor)} onClose={() => setMenu({ anchor: null, doc: null })}>
            {(config?.statuses || ['Issued', 'Sent', 'Accepted', 'Paid', 'Cancelled'])
              .filter(s => s !== menu.doc?.status)
              .map(s => <MenuItem key={s} onClick={() => setStatus(menu.doc, s)}>Mark as {s}</MenuItem>)}
          </Menu>
        </Paper>
      )}
    </Box>
  );
}
