import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, MenuItem, Button, IconButton, Alert,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, ToggleButton, ToggleButtonGroup,
  CircularProgress, Tooltip, Menu, InputAdornment, Skeleton,
} from '@mui/material';
import {
  AddRounded, DeleteOutlineRounded, PictureAsPdfRounded, ReceiptLongRounded, SwapHorizRounded, MoreVertRounded, AutoAwesome,
} from '@mui/icons-material';
import { useApi } from '../hooks/useApi';
import { downloadBillingPdf, formatINR } from '../utils/generateBillingPdf';
import { PageHeader, SectionCard, ToneChip, EmptyState, Code } from '../components/ui';
import { tokens, tones } from '../theme';
import { formatDate } from '../utils/format';

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

const STATUS_TONES = { Issued: 'info', Sent: 'accent', Accepted: 'violet', Paid: 'success', Cancelled: 'danger' };
const DUE_LABEL = (type) => (type === 'INV' || type === 'PI' ? 'Due date' : 'Valid until');

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
      setResult({ type: 'success', msg: `${data.doc_number} created for ${data.project_code}. The PDF has downloaded.` });
      resetForm();
      setProjectMode('existing');
      loadDocs();
      loadProjects();
    } catch (err) {
      setResult({ type: 'error', msg: 'Network error. Please try again.' });
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
  const money = (v) => `₹${formatINR(v)}`;
  const taxLines = [
    ...(effectiveTaxMode === 'CGST_SGST' ? [[`CGST @ ${totals.rate / 2}%`, round2(totals.tax / 2)], [`SGST @ ${totals.rate / 2}%`, round2(totals.tax - round2(totals.tax / 2))]] : []),
    ...(effectiveTaxMode === 'IGST' ? [[`IGST @ ${totals.rate}%`, totals.tax]] : []),
    ...(effectiveTaxMode === 'NONE' ? [['GST', 0]] : []),
  ];
  const projectDone = projectMode === 'existing' ? !!projectId : !!(np.name.trim() && CLIENT_RE.test(np.clientCode) && TAG_RE.test(np.projectTag));
  const itemsDone = items.some(it => it.description.trim() && Number(it.rate) > 0);

  return (
    <Box sx={{ pb: 6 }}>
      <PageHeader
        title="Invoices & estimates"
        subtitle="Fill in the essentials. The document number, AiC code, GST split and totals are worked out for you."
        actions={
          <ToggleButtonGroup size="small" exclusive value={tab} onChange={(_, v) => v && setTab(v)} aria-label="View">
            <ToggleButton value="create"><AddRounded sx={{ fontSize: 18, mr: 0.75 }} />Create</ToggleButton>
            <ToggleButton value="list"><ReceiptLongRounded sx={{ fontSize: 18, mr: 0.75 }} />Documents{docs.length ? ` · ${docs.length}` : ''}</ToggleButton>
          </ToggleButtonGroup>
        }
      />

      {result && <Alert severity={result.type} sx={{ mb: 3 }} onClose={() => setResult(null)}>{result.msg}</Alert>}

      {tab === 'create' && (
        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 3, alignItems: 'start' }}>
          <Box sx={{ display: 'grid', gap: 2.5, minWidth: 0 }}>
            {/* ── 1. Document */}
            <SectionCard step={1} complete={!!issueDate} title="Document" description="What you're issuing, and when.">
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField select fullWidth label="Type" value={docType} onChange={e => setDocType(e.target.value)}>
                    {docTypes.map(t => <MenuItem key={t.code} value={t.code}>{t.label}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid item xs={6} sm={4}>
                  <TextField fullWidth type="date" label="Issue date" InputLabelProps={{ shrink: true }} value={issueDate} onChange={e => setIssueDate(e.target.value)} required />
                </Grid>
                <Grid item xs={6} sm={4}>
                  <TextField fullWidth type="date" label={DUE_LABEL(docType)} InputLabelProps={{ shrink: true }} value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </Grid>
              </Grid>
            </SectionCard>

            {/* ── 2. Project */}
            <SectionCard
              step={2} complete={projectDone} title="Project"
              description="The project gives the document its AiC code."
              badge={
                <ToggleButtonGroup size="small" exclusive value={projectMode} onChange={(_, v) => v && setProjectMode(v)} sx={{ ml: 'auto' }}>
                  <ToggleButton value="existing">Existing</ToggleButton>
                  <ToggleButton value="new">New</ToggleButton>
                </ToggleButtonGroup>
              }
            >
              {projectMode === 'existing' ? (
                <TextField select fullWidth label="Project" value={projectId} onChange={e => setProjectId(e.target.value)}
                  helperText={projects.length ? ' ' : 'No active projects yet. Switch to "New" to create one.'}>
                  {projects.map(p => (
                    <MenuItem key={p.id} value={p.id}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="body2" noWrap>{p.name}</Typography>
                        <Code muted>{p.code}</Code>
                      </Box>
                    </MenuItem>
                  ))}
                </TextField>
              ) : (
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <TextField fullWidth label="Project name" placeholder="Dabur Amla Bihar Ad" value={np.name} onChange={e => setNp({ ...np, name: e.target.value })} />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField fullWidth label="Client code" value={np.clientCode}
                      inputProps={{ style: { fontFamily: tokens.mono } }}
                      error={!!np.clientCode && !CLIENT_RE.test(np.clientCode)} helperText="2–5 letters"
                      onChange={e => { setNpTouched(t => ({ ...t, clientCode: true })); setNp({ ...np, clientCode: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5) }); }} />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField fullWidth label="Project tag" value={np.projectTag}
                      inputProps={{ style: { fontFamily: tokens.mono } }}
                      error={!!np.projectTag && !TAG_RE.test(np.projectTag)} helperText="2–6, starts with a letter"
                      onChange={e => { setNpTouched(t => ({ ...t, projectTag: true })); setNp({ ...np, projectTag: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) }); }} />
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField select fullWidth label="Type" value={np.type} onChange={e => setNp({ ...np, type: e.target.value })}>
                      {projectTypes.map(t => <MenuItem key={t.code} value={t.code}>{t.label}</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <TextField fullWidth type="date" label="Start date" InputLabelProps={{ shrink: true }} value={np.startDate} onChange={e => setNp({ ...np, startDate: e.target.value })} />
                  </Grid>
                </Grid>
              )}
            </SectionCard>

            {/* ── 3. Client */}
            <SectionCard step={3} complete={!!client.name.trim()} title="Client" description="Who the document is addressed to. The client's state decides CGST + SGST or IGST.">
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField fullWidth label="Client or company name" required value={client.name} onChange={e => setClient({ ...client, name: e.target.value })} />
                </Grid>
                <Grid item xs={12}>
                  <TextField fullWidth label="Billing address" multiline minRows={2} value={client.address} onChange={e => setClient({ ...client, address: e.target.value })} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="GSTIN" helperText="Optional" inputProps={{ maxLength: 15, style: { fontFamily: tokens.mono } }}
                    value={client.gstin} onChange={e => setClient({ ...client, gstin: e.target.value.toUpperCase() })} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="State" placeholder={config?.company?.state || ''} value={client.state} onChange={e => setClient({ ...client, state: e.target.value })}
                    helperText={client.state.trim() ? (effectiveTaxMode === 'IGST' ? 'Other state: IGST applies' : 'Same state: CGST + SGST') : ' '} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Email" type="email" value={client.email} onChange={e => setClient({ ...client, email: e.target.value })} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Phone" type="tel" value={client.phone} onChange={e => setClient({ ...client, phone: e.target.value })} />
                </Grid>
              </Grid>
            </SectionCard>

            {/* ── 4. Items */}
            <SectionCard step={4} complete={itemsDone} title="Items" description="One line per deliverable. SAC is the GST service code (optional).">
              <Box sx={{ display: 'grid', gap: 1.5 }}>
                {items.map((it, i) => (
                  <Box key={i} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr 1fr auto', md: 'minmax(0, 1fr) 110px 80px 130px 110px auto' }, gap: 1.25, alignItems: 'center' }}>
                    <TextField size="small" label={`Item ${i + 1}`} value={it.description} onChange={e => setItem(i, 'description', e.target.value)}
                      sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }} />
                    <TextField size="small" label="SAC" placeholder="999612" value={it.sac} onChange={e => setItem(i, 'sac', e.target.value.replace(/[^0-9]/g, '').slice(0, 8))} />
                    <TextField size="small" type="number" label="Qty" inputProps={{ min: 0, step: 'any' }} value={it.qty} onChange={e => setItem(i, 'qty', e.target.value)} />
                    <TextField size="small" type="number" label="Rate" inputProps={{ min: 0, step: 'any' }} value={it.rate} onChange={e => setItem(i, 'rate', e.target.value)}
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
                    <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: 560, fontFeatureSettings: '"tnum"', display: { xs: 'none', md: 'block' } }}>
                      {money((Number(it.qty) || 0) * (Number(it.rate) || 0))}
                    </Typography>
                    <Tooltip title="Remove item">
                      <span>
                        <IconButton size="small" aria-label={`Remove item ${i + 1}`} disabled={items.length === 1} onClick={() => setItems(items.filter((_, idx) => idx !== i))}>
                          <DeleteOutlineRounded fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                ))}
              </Box>
              <Button size="small" startIcon={<AddRounded />} onClick={() => setItems([...items, emptyItem()])} disabled={items.length >= 50} sx={{ mt: 1.5 }}>
                Add item
              </Button>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 3, pt: 3, borderTop: `1px solid ${tokens.border}` }}>
                <TextField select fullWidth label="GST rate" value={taxRate} onChange={e => setTaxRate(e.target.value)}>
                  {(config?.taxRates || [0, 5, 12, 18, 28]).map(r => <MenuItem key={r} value={r}>{r}%</MenuItem>)}
                </TextField>
                <TextField select fullWidth label="GST type" value={taxMode} onChange={e => setTaxMode(e.target.value)}
                  helperText={taxMode === 'AUTO' ? `Using ${effectiveTaxMode === 'IGST' ? 'IGST' : 'CGST + SGST'} from the client's state` : ' '}>
                  <MenuItem value="AUTO">Automatic</MenuItem>
                  <MenuItem value="CGST_SGST">CGST + SGST</MenuItem>
                  <MenuItem value="IGST">IGST</MenuItem>
                  <MenuItem value="NONE">No GST</MenuItem>
                </TextField>
                <TextField fullWidth label="Notes or terms" multiline minRows={2} placeholder="50% advance, balance on delivery"
                  value={notes} onChange={e => setNotes(e.target.value)} sx={{ gridColumn: '1 / -1' }} helperText="Optional. Printed on the document." />
              </Box>
            </SectionCard>
          </Box>

          {/* ── Summary (sticky on desktop) */}
          <Box sx={{ position: { lg: 'sticky' }, top: { lg: 80 }, display: 'grid', gap: 2 }}>
            <Paper sx={{ p: 2.75, overflow: 'hidden', position: 'relative' }}>
              <Box aria-hidden sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(400px 180px at 100% 0%, rgba(99,102,241,0.16), transparent 70%)', pointerEvents: 'none' }} />
              <Box sx={{ position: 'relative' }}>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{typeLabel(docType)} total</Typography>
                <Typography sx={{ fontSize: 34, fontWeight: 650, letterSpacing: '-0.035em', lineHeight: 1.15, mt: 0.25, fontFeatureSettings: '"tnum"' }}>
                  {money(totals.total)}
                </Typography>
                <Box sx={{ display: 'grid', gap: 0.75, mt: 2, pt: 2, borderTop: `1px solid ${tokens.border}` }}>
                  {[['Subtotal', totals.subtotal], ...taxLines].map(([k, v]) => (
                    <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{k}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 520, fontFeatureSettings: '"tnum"' }}>{money(v)}</Typography>
                    </Box>
                  ))}
                </Box>
                <Box sx={{ display: 'grid', gap: 1, mt: 2, pt: 2, borderTop: `1px solid ${tokens.border}` }}>
                  {[['Number', nextNumber], ['AiC code', aicCode]].map(([k, v]) => (
                    <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
                      <Typography variant="caption" sx={{ color: 'text.disabled', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AutoAwesome sx={{ fontSize: 13, color: tones.violet.fg }} /> {k}
                      </Typography>
                      {v ? <Code sx={{ textAlign: 'right', wordBreak: 'break-all' }}>{v}</Code>
                        : <Typography variant="caption" sx={{ color: 'text.disabled' }}>{k === 'AiC code' ? 'Pick a project' : '…'}</Typography>}
                    </Box>
                  ))}
                </Box>
              </Box>
            </Paper>

            <Box>
              <Button type="submit" variant="contained" size="large" fullWidth disabled={saving}
                startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <PictureAsPdfRounded />} sx={{ minHeight: 50, fontSize: 15 }}>
                {saving ? 'Generating…' : `Create ${typeLabel(docType).toLowerCase()}`}
              </Button>
              <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 1.25, color: 'text.disabled' }}>
                Saves it and downloads the PDF
              </Typography>
            </Box>
          </Box>
        </Box>
      )}

      {tab === 'list' && (
        <Paper sx={{ overflow: 'hidden' }}>
          <Box sx={{ p: 2, borderBottom: `1px solid ${tokens.border}`, overflowX: 'auto' }}>
            <ToggleButtonGroup size="small" exclusive value={listFilter} onChange={(_, v) => v && setListFilter(v)} aria-label="Filter by type">
              {[{ code: 'ALL', label: 'All' }, ...docTypes].map(t => (
                <ToggleButton key={t.code} value={t.code} sx={{ whiteSpace: 'nowrap' }}>
                  {t.label}
                  <Box component="span" sx={{ ml: 0.75, color: 'text.disabled', fontFeatureSettings: '"tnum"' }}>
                    {t.code === 'ALL' ? docs.length : docs.filter(d => d.doc_type === t.code).length}
                  </Box>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {docsLoading && <Box sx={{ p: 2, display: 'grid', gap: 1 }}>{[0, 1, 2].map(i => <Skeleton key={i} height={44} />)}</Box>}

          {!docsLoading && filteredDocs.length === 0 && (
            <EmptyState icon={<ReceiptLongRounded />} title="No documents yet" description="Invoices, estimates and quotations you create will be listed here."
              action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setTab('create')}>Create one</Button>} />
          )}

          {!docsLoading && filteredDocs.length > 0 && (
            <TableContainer>
              <Table sx={{ minWidth: 620 }} aria-label="Billing documents">
                <TableHead>
                  <TableRow>
                    <TableCell>Document</TableCell>
                    <TableCell>Client</TableCell>
                    <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Date</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredDocs.map(d => (
                    <TableRow key={d.id} hover>
                      <TableCell>
                        <Code>{d.doc_number}</Code>
                        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>{typeLabel(d.doc_type)} · {d.project_code}</Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 220 }}>
                        <Typography variant="body2" noWrap>{d.client_name}</Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', display: { xs: 'none', lg: 'table-cell' }, color: 'text.secondary' }}>{formatDate(d.issue_date)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>{money(d.total)}</TableCell>
                      <TableCell><ToneChip tone={STATUS_TONES[d.status] || 'neutral'} label={d.status} /></TableCell>
                      <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title="Download PDF">
                          <IconButton size="small" aria-label="Download PDF" onClick={() => downloadBillingPdf(d, config?.company)}><PictureAsPdfRounded fontSize="small" /></IconButton>
                        </Tooltip>
                        {d.doc_type !== 'INV' && d.status !== 'Cancelled' && (
                          <Tooltip title="Convert to tax invoice">
                            <IconButton size="small" aria-label="Convert to tax invoice" onClick={() => convertToInvoice(d)}><SwapHorizRounded fontSize="small" /></IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Change status">
                          <IconButton size="small" aria-label="Change status" onClick={e => setMenu({ anchor: e.currentTarget, doc: d })}><MoreVertRounded fontSize="small" /></IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Menu anchorEl={menu.anchor} open={Boolean(menu.anchor)} onClose={() => setMenu({ anchor: null, doc: null })}>
            {(config?.statuses || ['Issued', 'Sent', 'Accepted', 'Paid', 'Cancelled'])
              .filter(s => s !== menu.doc?.status)
              .map(s => <MenuItem key={s} onClick={() => setStatus(menu.doc, s)}>Mark as {s.toLowerCase()}</MenuItem>)}
          </Menu>
        </Paper>
      )}
    </Box>
  );
}
