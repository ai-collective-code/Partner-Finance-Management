import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, Grid, TextField, MenuItem, Button, IconButton, Alert,
  Table, TableHead, TableRow, TableCell, TableBody, TableContainer, ToggleButton, ToggleButtonGroup,
  CircularProgress, Tooltip, Menu, InputAdornment, Skeleton, Checkbox, Autocomplete,
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
// GST is always 18%: one IGST for other states, or 9% CGST + 9% SGST in our own state
const GST_RATE = 18;
const GST_OPTIONS = [
  { mode: 'IGST', label: `${GST_RATE}% (IGST)` },
  { mode: 'CGST_SGST', label: `${GST_RATE / 2}% + ${GST_RATE / 2}% (CGST + SGST)` },
];
const gstLabel = (mode) => GST_OPTIONS.find(o => o.mode === mode)?.label || '';

const emptyClient = () => ({ name: '', address: '', gstin: '', state: '', email: '', phone: '' });
const isBlank = (o) => Object.values(o).every(v => !String(v).trim());
const emptyRefs = () => ({ refNo: '', refDate: '', poNumber: '', paymentTerms: '' });
const emptyItem = () => ({ description: '', sac: '', qty: 1, rate: '' });
const DEFAULT_ADVANCE = { by: 'pct', value: '50' }; // by: 'pct' (of the project value) or 'amt' (rupees)

const STATUS_TONES = { Issued: 'info', Sent: 'accent', Accepted: 'violet', Paid: 'success', Cancelled: 'danger' };

// A Tax Invoice can be for the full amount, an advance (no GST), or the final bill that charges GST
// on the full project value and deducts the advances already invoiced.
const STAGES = [
  { code: 'FULL', label: 'Full amount', help: 'One invoice for the whole amount, with GST.' },
  { code: 'ADVANCE', label: 'Advance', help: 'Enter the full project value and how much to bill now. No GST yet. Pick this code again later and the final invoice fills itself in.' },
  { code: 'FINAL', label: 'Final (after advance)', help: 'GST is charged on the full project value, then the advances you tick are deducted.' },
];
const STAGE_NAMES = { ADVANCE: 'Advance invoice', FINAL: 'Final invoice' };
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

  const [client, setClient] = useState(emptyClient());
  const [items, setItems] = useState([emptyItem()]);
  const [taxMode, setTaxMode] = useState('AUTO'); // AUTO follows the client's state until one is picked by hand
  const [notes, setNotes] = useState('');
  const [refs, setRefs] = useState(emptyRefs()); // Ref No, Ref Date, Purchase Order No., Payment Term
  const [stage, setStage] = useState('FULL');
  const [advances, setAdvances] = useState([]); // open advance invoices of the selected project
  const [advanceIds, setAdvanceIds] = useState([]);
  const [advancesLoading, setAdvancesLoading] = useState(false);
  const [advancePart, setAdvancePart] = useState(DEFAULT_ADVANCE); // how much of the project value an advance bills
  // What the form filled in by itself, so it can be replaced when the project changes; typed values are kept
  const filled = useRef({ projectId: '', client: '', items: '', refs: '', stage: false });
  const form = useRef({});
  form.current = { client, items, refs, stage };

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
    const name = selectedProject?.partner_name || '';
    if (isBlank(client) || JSON.stringify(client) === filled.current.client) {
      const next = { ...emptyClient(), name, phone: name ? selectedProject.partner_phone || '' : '' };
      filled.current.client = JSON.stringify(next);
      setClient(next);
    } else if (name && !client.name) {
      setClient(c => ({ ...c, name, phone: c.phone || selectedProject.partner_phone || '' }));
    }
  }, [projectId]); // eslint-disable-line

  // Stages only apply to Tax Invoices
  const invStage = docType === 'INV' ? stage : 'FULL';
  const isFinal = invStage === 'FINAL';

  // A final invoice deducts advances, which belong to an existing project
  useEffect(() => { if (isFinal) setProjectMode('existing'); }, [isFinal]);

  // A code with an open advance: switch to the final invoice and fill in the project value, client and
  // references saved with that advance. Anything typed by hand is left alone.
  const fillFromAdvances = (list) => {
    const f = filled.current;
    const cur = form.current;
    const auto = {
      items: cur.items.every(it => !it.description.trim() && !Number(it.rate)) || JSON.stringify(cur.items) === f.items,
      client: isBlank(cur.client) || JSON.stringify(cur.client) === f.client,
      refs: isBlank(cur.refs) || JSON.stringify(cur.refs) === f.refs,
    };
    const last = list[list.length - 1];
    const scoped = [...list].reverse().find(a => a.project_items?.length);
    if (last && cur.stage === 'FULL') { f.stage = true; setStage('FINAL'); }
    if (!last && f.stage) { f.stage = false; setStage('FULL'); }

    if (auto.items && (scoped || f.items)) {
      const next = scoped ? scoped.project_items.map(l => ({ description: l.description, sac: l.sac || '', qty: l.qty, rate: l.rate })) : [emptyItem()];
      f.items = scoped ? JSON.stringify(next) : '';
      setItems(next);
    }
    if (auto.client && last) {
      const next = {
        name: last.client_name || '', address: last.client_address || '', gstin: last.client_gstin || '',
        state: last.client_state || '', email: last.client_email || '', phone: last.client_phone || '',
      };
      f.client = JSON.stringify(next);
      setClient(next);
    }
    if (auto.refs && (last || f.refs)) {
      const next = last ? { refNo: last.ref_no || '', refDate: last.ref_date || '', poNumber: last.po_number || '', paymentTerms: last.payment_terms || '' } : emptyRefs();
      f.refs = last ? JSON.stringify(next) : '';
      setRefs(next);
    }
  };

  // Open advance invoices of the selected project; all ticked by default
  const advanceProject = docType === 'INV' && projectMode === 'existing' ? projectId : '';
  useEffect(() => {
    if (!advanceProject) { filled.current.projectId = ''; setAdvances([]); setAdvanceIds([]); return undefined; }
    let cancelled = false;
    setAdvancesLoading(true);
    (async () => {
      try {
        const res = await apiFetch(`/api/billing/advances?projectId=${encodeURIComponent(advanceProject)}`);
        const list = res.ok ? await res.json() : [];
        if (!cancelled) {
          setAdvances(list);
          setAdvanceIds(list.map(a => a.id));
          if (filled.current.projectId !== advanceProject) { filled.current.projectId = advanceProject; fillFromAdvances(list); }
        }
      } catch { if (!cancelled) { setAdvances([]); setAdvanceIds([]); } } finally { if (!cancelled) setAdvancesLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [advanceProject, docs]); // eslint-disable-line

  const companyState = (config?.company?.state || '').trim().toLowerCase();
  const stateTaxMode = client.state.trim() && client.state.trim().toLowerCase() !== companyState ? 'IGST' : 'CGST_SGST';
  const gstMode = taxMode === 'AUTO' ? stateTaxMode : taxMode;
  const effectiveTaxMode = invStage === 'ADVANCE' ? 'NONE' : gstMode; // an advance carries no GST

  const totals = useMemo(() => {
    const subtotal = round2(items.reduce((s, it) => s + round2((Number(it.qty) || 0) * (Number(it.rate) || 0)), 0));
    // An advance bills part of the project value (the items) and no GST
    const isAdvance = invStage === 'ADVANCE';
    const part = Number(advancePart.value) || 0;
    const advanceNow = isAdvance ? round2(advancePart.by === 'pct' ? subtotal * part / 100 : part) : 0;
    const rate = effectiveTaxMode === 'NONE' ? 0 : GST_RATE;
    const tax = round2(subtotal * rate / 100);
    const total = isAdvance ? advanceNow : round2(subtotal + tax);
    const billed = round2(advances.reduce((s, a) => s + Number(a.total || 0), 0)); // open advances so far
    const later = round2(subtotal + subtotal * GST_RATE / 100 - billed - advanceNow);
    const advance = isFinal ? round2(advances.filter(a => advanceIds.includes(a.id)).reduce((s, a) => s + Number(a.total || 0), 0)) : 0;
    return { subtotal, rate, tax, total, advance, advanceNow, billed, later, balance: round2(total - advance) };
  }, [items, effectiveTaxMode, invStage, isFinal, advances, advanceIds, advancePart]);

  // Estimates, quotations and proformas of the selected project, offered as the reference
  const refOptions = projectMode === 'existing' && projectId
    ? docs.filter(d => d.project_id === projectId && d.doc_type !== 'INV' && d.status !== 'Cancelled')
    : [];

  // Everything already made on the picked code, oldest first. Only live invoices count towards the
  // totals; a final invoice counts for its balance, since its advances are listed on their own.
  const history = projectMode === 'existing' && projectId
    ? docs.filter(d => d.project_id === projectId).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    : [];
  const payable = (d) => Number(d.billing_stage === 'FINAL' && d.balance_due != null ? d.balance_due : d.total) || 0;
  const liveInvoices = history.filter(d => d.doc_type === 'INV' && d.status !== 'Cancelled');
  const historyBilled = round2(liveInvoices.reduce((t, d) => t + payable(d), 0));
  const historyReceived = round2(liveInvoices.filter(d => d.status === 'Paid').reduce((t, d) => t + payable(d), 0));
  const fullyBilled = liveInvoices.filter(d => d.billing_stage !== 'ADVANCE').map(d => d.doc_number);

  // Say where the GST choice came from, and flag one that doesn't fit the client's state
  const gstMismatch = invStage !== 'ADVANCE' && !!client.state.trim() && gstMode !== stateTaxMode;
  const gstHelp = invStage === 'ADVANCE' ? 'Charged in the final invoice'
    : gstMismatch ? `Client's state is ${client.state.trim()}, which normally takes ${gstLabel(stateTaxMode)}`
    : taxMode === 'AUTO' ? (client.state.trim() ? "Chosen from the client's state" : "Enter the client's state to choose this automatically") : ' ';

  const aicCode = projectMode === 'existing' ? (selectedProject?.code || '') : newCodePreview;

  const setItem = (i, key, value) => setItems(list => list.map((it, idx) => (idx === i ? { ...it, [key]: value } : it)));

  const resetForm = () => {
    setProjectId('');
    setNp({ name: '', clientCode: '', projectTag: '', type: 'AD', startDate: todayLocal() });
    setNpTouched({ clientCode: false, projectTag: false });
    setClient(emptyClient());
    filled.current = { projectId: '', client: '', items: '', refs: '', stage: false };
    setStage('FULL');
    setAdvancePart(DEFAULT_ADVANCE);
    setItems([emptyItem()]);
    setNotes('');
    setRefs(emptyRefs());
    setTaxMode('AUTO');
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
    if (invStage === 'ADVANCE' && (totals.advanceNow <= 0 || totals.advanceNow > totals.subtotal)) {
      setResult({ type: 'error', msg: `The advance must be more than 0 and not more than the full project value (${money(totals.subtotal)}).` });
      return;
    }
    if (isFinal && totals.advance > totals.total) {
      setResult({ type: 'error', msg: `The advances ticked (${money(totals.advance)}) are more than this invoice's total (${money(totals.total)}). Enter the full project value.` });
      return;
    }

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
          taxRate: GST_RATE,
          notes,
          ...refs,
          stage: invStage,
          ...(isFinal ? { advanceIds } : {}),
          ...(invStage === 'ADVANCE' ? { advanceAmount: totals.advanceNow } : {}),
        },
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.details?.map(d => d.message).join(', ');
        setResult({ type: 'error', msg: detail || data.error || 'Could not create the document' });
        return;
      }
      downloadBillingPdf(data, config?.company);
      const what = STAGE_NAMES[data.billing_stage] ? `${STAGE_NAMES[data.billing_stage]} ${data.doc_number}` : data.doc_number;
      const balance = data.billing_stage === 'FINAL' && data.advance_amount ? ` Balance due ${money(data.balance_due)} after ${money(data.advance_amount)} advance.` : '';
      setResult({ type: 'success', msg: `${what} created for ${data.project_code}.${balance} The PDF has downloaded.` });
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
    if (res.ok) { loadDocs(); return; }
    const data = await res.json().catch(() => ({}));
    setResult({ type: 'error', msg: data.error || 'Could not change the status' });
  };

  const filteredDocs = listFilter === 'ALL' ? docs : docs.filter(d => d.doc_type === listFilter);
  const docTypes = config?.docTypes || [{ code: 'INV', label: 'Tax Invoice' }, { code: 'PI', label: 'Proforma Invoice' }, { code: 'EST', label: 'Estimate' }, { code: 'QUO', label: 'Quotation' }];
  const typeLabel = (code) => docTypes.find(t => t.code === code)?.label || code;
  const money = (v) => `₹${formatINR(v)}`;
  const taxLines = [
    ...(effectiveTaxMode === 'CGST_SGST' ? [[`CGST @ ${totals.rate / 2}%`, round2(totals.tax / 2)], [`SGST @ ${totals.rate / 2}%`, round2(totals.tax - round2(totals.tax / 2))]] : []),
    ...(effectiveTaxMode === 'IGST' ? [[`IGST @ ${totals.rate}%`, totals.tax]] : []),
    ...(effectiveTaxMode === 'NONE' ? [['GST', invStage === 'ADVANCE' ? 'In final invoice' : 0]] : []),
  ];
  // Summary rows; strings are shown as-is
  const summaryRows = invStage === 'ADVANCE' ? [
    ['Project value', totals.subtotal],
    ...(totals.billed ? [['Earlier advances', totals.billed]] : []),
    ...taxLines,
    [`To bill later, with ${GST_RATE}% GST`, totals.later],
  ] : isFinal && totals.advance ? [
    ['Project value', totals.subtotal],
    ['Less advances', -totals.advance],
    ['Balance before GST', round2(totals.subtotal - totals.advance)],
    ...taxLines.map(([k, v]) => [`${k} on project value`, v]),
  ] : [
    ['Subtotal', totals.subtotal],
    ...taxLines,
  ];
  // What the picked code still has to be billed, from the project value saved with its latest advance
  const scopedAdvance = [...advances].reverse().find(a => Number(a.project_value) > 0);
  const projectValue = scopedAdvance ? Number(scopedAdvance.project_value) : 0;
  const projectGst = round2(projectValue * GST_RATE / 100);
  const unpaidAdvances = advances.filter(a => a.status !== 'Paid').map(a => a.doc_number);
  const headline = isFinal && totals.advance
    ? { label: 'Balance due', value: totals.balance }
    : { label: `${STAGE_NAMES[invStage] || typeLabel(docType)} total`, value: totals.total };
  const submitLabel = STAGE_NAMES[invStage] ? `Create ${STAGE_NAMES[invStage].toLowerCase()}` : `Create ${typeLabel(docType).toLowerCase()}`;
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
                {docType === 'INV' && (
                  <Grid item xs={12}>
                    <Typography variant="caption" component="div" sx={{ color: 'text.secondary', mb: 1 }}>Invoice for</Typography>
                    <ToggleButtonGroup size="small" exclusive value={stage} onChange={(_, v) => { if (v) { filled.current.stage = false; setStage(v); } }} aria-label="Invoice for"
                      sx={{ flexWrap: 'wrap' }}>
                      {STAGES.map(s => <ToggleButton key={s.code} value={s.code} sx={{ whiteSpace: 'nowrap' }}>{s.label}</ToggleButton>)}
                    </ToggleButtonGroup>
                    <Typography variant="caption" component="div" sx={{ color: 'text.disabled', mt: 1 }}>
                      {STAGES.find(s => s.code === stage)?.help}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </SectionCard>

            {/* ── 2. Project */}
            <SectionCard
              step={2} complete={projectDone} title="Project"
              description="The project gives the document its AiC code."
              badge={
                <ToggleButtonGroup size="small" exclusive value={projectMode} onChange={(_, v) => v && setProjectMode(v)} sx={{ ml: 'auto' }}>
                  <ToggleButton value="existing">Existing</ToggleButton>
                  <ToggleButton value="new" disabled={isFinal} title={isFinal ? 'A final invoice deducts advances of an existing project' : undefined}>New</ToggleButton>
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

            {projectMode === 'existing' && projectId && (
              <Paper sx={{ p: 2.5 }} role="region" aria-label="History of this code">
                <Typography variant="body2" sx={{ fontWeight: 600 }}>History of this code</Typography>
                {history.length === 0 ? (
                  <Typography variant="body2" sx={{ color: 'text.disabled', mt: 0.5 }}>
                    {docsLoading ? 'Loading…' : "Nothing made on this code here yet. Invoices made outside this app aren't listed."}
                  </Typography>
                ) : (
                  <>
                    <Box sx={{ mt: 1, display: 'grid' }}>
                      {history.map(d => (
                        <Box key={d.id} sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.5, rowGap: 0.25, py: 0.75, borderBottom: `1px solid ${tokens.border}`, opacity: d.status === 'Cancelled' ? 0.5 : 1 }}>
                          <Code>{d.doc_number}</Code>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {(d.doc_type === 'INV' && (STAGE_NAMES[d.billing_stage] || 'Full invoice')) || typeLabel(d.doc_type)} · {formatDate(d.issue_date)}
                          </Typography>
                          <ToneChip tone={STATUS_TONES[d.status] || 'info'} label={d.status} />
                          <Typography variant="body2" sx={{ ml: 'auto', fontWeight: 560, fontFeatureSettings: '"tnum"' }}>{money(payable(d))}</Typography>
                        </Box>
                      ))}
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3, rowGap: 0.5, mt: 1.25, fontFeatureSettings: '"tnum"' }}>
                      {[['Invoiced', historyBilled], ['Received', historyReceived], ['Still to receive', round2(historyBilled - historyReceived)]].map(([k, v]) => (
                        <Typography key={k} variant="body2" sx={{ color: 'text.secondary' }}>{k} <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{money(v)}</Box></Typography>
                      ))}
                    </Box>
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.disabled' }}>
                      GST included. An invoice counts as received once it is marked Paid in Documents.
                    </Typography>
                  </>
                )}
                {docType === 'INV' && fullyBilled.length > 0 && (
                  <Alert severity="warning" sx={{ mt: 1.5 }}>
                    This code already has {fullyBilled.join(', ')} for the whole amount. Another invoice bills the client again.
                  </Alert>
                )}
              </Paper>
            )}

            {advances.length > 0 && (
              <Alert severity={invStage === 'FULL' || unpaidAdvances.length ? 'warning' : 'info'}>
                <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.75 }}>
                  This code has {advances.length === 1 ? 'an advance' : `${advances.length} advances`} billed: {advances.map(a => a.doc_number).join(', ')}
                </Typography>
                {projectValue > 0 ? (
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 3, rowGap: 0.25, width: 'fit-content', fontFeatureSettings: '"tnum"' }}>
                    {[
                      ['Project value', money(projectValue)],
                      ['Advance billed', `− ${money(totals.billed)}`],
                      ['Balance', money(round2(projectValue - totals.billed))],
                      [`GST ${GST_RATE}% on project value`, `+ ${money(projectGst)}`],
                      ['To collect now', money(round2(projectValue + projectGst - totals.billed))],
                    ].map(([k, v], i, all) => (
                      <React.Fragment key={k}>
                        <Typography variant="body2" sx={{ fontWeight: i === all.length - 1 ? 650 : 400 }}>{k}</Typography>
                        <Typography variant="body2" sx={{ textAlign: 'right', fontWeight: i === all.length - 1 ? 650 : 400 }}>{v}</Typography>
                      </React.Fragment>
                    ))}
                  </Box>
                ) : (
                  <Typography variant="body2">Advance billed {money(totals.billed)}. The full project value wasn't saved with it, so enter it in Items.</Typography>
                )}
                {unpaidAdvances.length > 0 && (
                  <Typography variant="body2" sx={{ mt: 0.75 }}>Not marked Paid yet: {unpaidAdvances.join(', ')}. If the client has paid, mark it Paid in Documents.</Typography>
                )}
                {invStage === 'FULL' && (
                  <Typography variant="body2" sx={{ mt: 0.75 }}>A full invoice won't deduct it. Choose "Final (after advance)" to bill the balance.</Typography>
                )}
              </Alert>
            )}

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

            {/* ── 4. References */}
            <SectionCard step={4} complete={!!(refs.refNo.trim() || refs.poNumber.trim())} title="References" description="Printed on the invoice. Leave blank what doesn't apply.">
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Autocomplete
                    freeSolo options={refOptions} componentsProps={{ paper: { sx: { '&:empty': { display: 'none' } } } }} inputValue={refs.refNo} value={null}
                    getOptionLabel={o => (typeof o === 'string' ? o : o.doc_number)}
                    onInputChange={(_, v, reason) => { if (reason !== 'reset') setRefs(r => ({ ...r, refNo: v.slice(0, 60) })); }}
                    onChange={(_, o) => { if (o && typeof o !== 'string') setRefs(r => ({ ...r, refNo: o.doc_number, refDate: String(o.issue_date).slice(0, 10) })); }}
                    renderOption={(props, o) => (
                      <Box component="li" {...props} key={o.id} sx={{ gap: 1 }}>
                        <Code>{o.doc_number}</Code>
                        <Typography variant="body2" sx={{ color: 'text.secondary', ml: 'auto' }}>{formatDate(o.issue_date)}</Typography>
                      </Box>
                    )}
                    renderInput={params => <TextField {...params} label="Ref No" placeholder="Estimate or quotation number" />}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth type="date" label="Ref date" InputLabelProps={{ shrink: true }} value={refs.refDate} onChange={e => setRefs({ ...refs, refDate: e.target.value })} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Purchase order no." inputProps={{ maxLength: 60 }} value={refs.poNumber} onChange={e => setRefs({ ...refs, poNumber: e.target.value })} />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField fullWidth label="Payment term" placeholder="50% advance, balance on delivery" inputProps={{ maxLength: 300 }} value={refs.paymentTerms} onChange={e => setRefs({ ...refs, paymentTerms: e.target.value })} />
                </Grid>
              </Grid>
            </SectionCard>

            {/* ── 5. Items */}
            <SectionCard step={5} complete={itemsDone} title="Items" description="One line per deliverable. SAC is the GST service code (optional)."
              badge={invStage !== 'FULL' && <ToneChip tone="info" label="Full project value" />}>
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

              {isFinal && (
                <Box sx={{ mt: 3, pt: 3, borderTop: `1px solid ${tokens.border}` }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>Advances to deduct</Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1.25 }}>
                    Advance invoices of this project that aren't in a final invoice yet. These are taken off after GST on the full project value.
                  </Typography>
                  {!projectId && <Typography variant="body2" sx={{ color: 'text.disabled' }}>Pick a project to see its advances.</Typography>}
                  {projectId && advancesLoading && <Skeleton height={44} />}
                  {projectId && !advancesLoading && advances.length === 0 && (
                    <Typography variant="body2" sx={{ color: 'text.disabled' }}>No open advance invoices for this project. This will be a normal invoice.</Typography>
                  )}
                  {projectId && !advancesLoading && advances.map(a => (
                    <Box key={a.id} component="label" sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5, cursor: 'pointer' }}>
                      <Checkbox size="small" checked={advanceIds.includes(a.id)}
                        onChange={e => setAdvanceIds(ids => (e.target.checked ? [...ids, a.id] : ids.filter(x => x !== a.id)))} />
                      <Code>{a.doc_number}</Code>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{formatDate(a.issue_date)}</Typography>
                      <ToneChip tone={STATUS_TONES[a.status] || 'info'} label={a.status} />
                      <Typography variant="body2" sx={{ ml: 'auto', fontWeight: 560, fontFeatureSettings: '"tnum"' }}>{money(a.total)}</Typography>
                    </Box>
                  ))}
                </Box>
              )}

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 3, pt: 3, borderTop: `1px solid ${tokens.border}` }}>
                {invStage === 'ADVANCE' && (
                  <>
                    <TextField fullWidth type="number" label="Advance %" inputProps={{ min: 0, max: 100, step: 'any' }}
                      value={advancePart.by === 'pct' ? advancePart.value : totals.subtotal ? round2(totals.advanceNow / totals.subtotal * 100) : ''}
                      onChange={e => setAdvancePart({ by: 'pct', value: e.target.value })} helperText="Of the full project value above" />
                    <TextField fullWidth type="number" label="Advance amount" inputProps={{ min: 0, step: 'any' }}
                      value={advancePart.by === 'amt' ? advancePart.value : totals.advanceNow || ''}
                      onChange={e => setAdvancePart({ by: 'amt', value: e.target.value })} helperText="Billed on this invoice, without GST"
                      InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} />
                  </>
                )}
                <TextField select fullWidth label="GST" value={gstMode} onChange={e => setTaxMode(e.target.value)} disabled={invStage === 'ADVANCE'}
                  error={gstMismatch} helperText={gstHelp} sx={{ gridColumn: '1 / -1' }}>
                  {GST_OPTIONS.map(o => <MenuItem key={o.mode} value={o.mode}>{o.label}</MenuItem>)}
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
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{headline.label}</Typography>
                <Typography sx={{ fontSize: 34, fontWeight: 650, letterSpacing: '-0.035em', lineHeight: 1.15, mt: 0.25, fontFeatureSettings: '"tnum"' }}>
                  {money(headline.value)}
                </Typography>
                <Box sx={{ display: 'grid', gap: 0.75, mt: 2, pt: 2, borderTop: `1px solid ${tokens.border}` }}>
                  {summaryRows.map(([k, v]) => (
                    <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{k}</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 520, fontFeatureSettings: '"tnum"', color: typeof v === 'string' ? 'text.disabled' : undefined }}>
                        {typeof v === 'string' ? v : v < 0 ? `− ${money(-v)}` : money(v)}
                      </Typography>
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
                {saving ? 'Generating…' : submitLabel}
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
                        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>
                          {(d.doc_type === 'INV' && STAGE_NAMES[d.billing_stage]) || typeLabel(d.doc_type)} · {d.project_code}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ maxWidth: 220 }}>
                        <Typography variant="body2" noWrap>{d.client_name}</Typography>
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', display: { xs: 'none', lg: 'table-cell' }, color: 'text.secondary' }}>{formatDate(d.issue_date)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>
                        {money(d.total)}
                        {d.billing_stage === 'FINAL' && Number(d.advance_amount) > 0 && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary', fontWeight: 400 }}>Balance {money(d.balance_due)}</Typography>
                        )}
                        {d.billing_stage === 'ADVANCE' && d.adjusted_in && (
                          <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled', fontWeight: 400 }}>Deducted in final</Typography>
                        )}
                      </TableCell>
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
