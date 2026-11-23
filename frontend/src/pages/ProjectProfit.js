import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  ToggleButton, ToggleButtonGroup, Drawer, IconButton, TextField, MenuItem, Skeleton, Alert, Tooltip,
} from '@mui/material';
import {
  TrendingUpRounded, ReceiptLongRounded, GroupsRounded, AccountBalanceWalletRounded, CloseRounded,
  FileDownloadRounded, ChevronRightRounded, SearchRounded,
} from '@mui/icons-material';
import { useApi } from '../hooks/useApi';
import { PageHeader, StatCard, Surface, Code, ToneChip, StatusChip, EmptyState, KeyValue, SectionLabel } from '../components/ui';
import { tokens, tones } from '../theme';
import { formatINR, formatDate } from '../utils/format';

// ─────────────────────────────────────────────────────────────────────────────
// Project profit: for every AiC code, what the client was billed against what the
// partners cost, and the GST in and out for the return. Profit is before GST.
// ─────────────────────────────────────────────────────────────────────────────

const signed = (v) => (Number(v) < 0 ? `− ${formatINR(-Number(v))}` : formatINR(v));
const profitTone = (v) => (Number(v) > 0 ? 'success' : Number(v) < 0 ? 'danger' : 'neutral');
const monthKey = (iso) => String(iso || '').slice(0, 7);
const monthLabel = (key) => {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const hasMoney = (p) => !!(p.summary.billed || p.summary.partnerCost || p.client.length || p.partners.length);
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

const STAGE_LABEL = { ADVANCE: 'Advance invoice', FINAL: 'Final invoice', FULL: 'Tax invoice' };
const DOC_LABEL = { PI: 'Proforma', EST: 'Estimate', QUO: 'Quotation' };
const DOC_STATUS_TONES = { Issued: 'info', Sent: 'accent', Accepted: 'violet', Paid: 'success', Cancelled: 'danger' };

function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const blob = new Blob(['﻿' + rows.map(r => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function Money({ value, tone, strong, sx }) {
  return (
    <Box component="span" sx={{ fontFeatureSettings: '"tnum"', fontWeight: strong ? 620 : 500, color: tone ? tones[tone].fg : undefined, whiteSpace: 'nowrap', ...sx }}>
      {signed(value)}
    </Box>
  );
}

// One labelled line in the detail drawer's money breakdown
function Line({ label, value, hint, strong, tone, minus }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, py: 0.6 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" sx={{ color: strong ? 'text.primary' : 'text.secondary', fontWeight: strong ? 600 : 400 }}>{label}</Typography>
        {hint && <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>{hint}</Typography>}
      </Box>
      <Money value={minus ? -Math.abs(value) : value} tone={tone} strong={strong} />
    </Box>
  );
}

function ProjectDrawer({ project, onClose }) {
  const s = project?.summary;
  return (
    <Drawer anchor="right" open={!!project} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 520 }, bgcolor: 'background.default' } }}>
      {project && (
        <Box sx={{ p: { xs: 2.5, sm: 3 } }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, mb: 2.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" component="h2">{project.name}</Typography>
              <Code muted>{project.code}</Code>
            </Box>
            <IconButton onClick={onClose} aria-label="Close"><CloseRounded /></IconButton>
          </Box>

          <Paper sx={{ p: 2.25, mb: 2 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{s.profit < 0 ? 'Loss on this project' : 'Profit on this project'}</Typography>
            <Typography sx={{ fontSize: 30, fontWeight: 650, letterSpacing: '-0.03em', color: tones[profitTone(s.profit)].fg, fontFeatureSettings: '"tnum"' }}>
              {signed(s.profit)}
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.disabled' }}>
              {s.margin != null ? `${s.margin}% margin · ` : ''}before GST
            </Typography>
            <Box sx={{ mt: 2, pt: 1.5, borderTop: `1px solid ${tokens.border}` }}>
              {s.quoted != null && <Line label="Quoted" hint="Latest estimate or quotation" value={s.quoted} />}
              <Line label="Billed to client" hint="Tax invoices, plus advances not yet in a final invoice" value={s.billed} />
              <Line label="Partner costs" hint="Every partner bill that isn't rejected" value={s.partnerCost} minus />
              <Line label="Profit" value={s.profit} strong tone={profitTone(s.profit)} />
            </Box>
          </Paper>

          <Paper sx={{ p: 2.25, mb: 2 }}>
            <SectionLabel>Cash so far (GST included)</SectionLabel>
            <Line label="Received from client" hint={s.advanceReceived ? `Includes ${formatINR(s.advanceReceived)} advance` : 'Invoices marked Paid'} value={s.received} />
            <Line label="Paid to partners" hint="Disbursed partner bills" value={s.paidOut} minus />
            <Line label="Cash position" value={s.cashPosition} strong tone={profitTone(s.cashPosition)} />
            {s.toPay > 0 && <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.5 }}>Still to pay partners: {formatINR(s.toPay)}</Typography>}
          </Paper>

          <Paper sx={{ p: 2.25, mb: 2 }}>
            <SectionLabel>GST on this project</SectionLabel>
            <Line label="Output GST" hint="Charged to the client" value={s.outputGst} />
            <Line label="Input GST" hint="Paid to partners with a GSTIN" value={s.inputGst} minus />
            <Line label={s.netGst < 0 ? 'Net GST credit' : 'Net GST payable'} value={Math.abs(s.netGst)} strong />
          </Paper>

          <SectionLabel sx={{ mt: 3 }}>Client documents · {project.client.length}</SectionLabel>
          {project.client.length === 0 && <Typography variant="body2" sx={{ color: 'text.disabled', mb: 2 }}>No invoices or estimates for this AiC code yet.</Typography>}
          {project.client.map(d => (
            <Box key={d.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.1, borderBottom: `1px solid ${tokens.border}` }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Code>{d.doc_number}</Code>
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>
                  {d.doc_type === 'INV' ? STAGE_LABEL[d.stage] : DOC_LABEL[d.doc_type]} · {formatDate(d.issue_date)}
                  {d.stage === 'ADVANCE' && d.adjusted_in ? ' · deducted in final' : ''}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Money value={d.subtotal} strong />
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>{d.tax_amount ? `+ ${formatINR(d.tax_amount)} GST` : 'no GST'}</Typography>
              </Box>
              <ToneChip tone={DOC_STATUS_TONES[d.status] || 'neutral'} label={d.status} />
            </Box>
          ))}

          <SectionLabel sx={{ mt: 3 }}>Partner bills · {project.partners.length}</SectionLabel>
          {project.partners.length === 0 && <Typography variant="body2" sx={{ color: 'text.disabled' }}>No partner bills against this AiC code yet.</Typography>}
          {project.partners.map(r => (
            <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.1, borderBottom: `1px solid ${tokens.border}` }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 520 }}>{r.partner || '—'}</Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }} noWrap>
                  {[r.role, r.id, formatDate(r.date)].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Money value={r.base} strong />
                <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block' }}>{r.gst ? `+ ${formatINR(r.gst)} GST${r.gstin ? '' : ' (no GSTIN)'}` : 'no GST'}</Typography>
              </Box>
              <StatusChip status={r.status} variant="short" />
            </Box>
          ))}
        </Box>
      )}
    </Drawer>
  );
}

export default function ProjectProfit() {
  const { apiFetch } = useApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ACTIVE');
  const [query, setQuery] = useState('');
  const [openCode, setOpenCode] = useState(null);
  const [month, setMonth] = useState(thisMonth());

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await apiFetch('/api/reports/project-profit');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Could not load the report');
      setData(body);
    } catch (e) { setError(e.message); }
  }, [apiFetch]);
  useEffect(() => { load(); }, [load]);

  const projects = useMemo(() => data?.projects || [], [data]);
  const counts = useMemo(() => ({
    ACTIVE: projects.filter(hasMoney).length,
    PROFIT: projects.filter(p => p.summary.profit > 0).length,
    LOSS: projects.filter(p => p.summary.profit < 0).length,
    ALL: projects.length,
  }), [projects]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects
      .filter(p => (filter === 'ALL' ? true : filter === 'ACTIVE' ? hasMoney(p) : filter === 'PROFIT' ? p.summary.profit > 0 : p.summary.profit < 0))
      .filter(p => !q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q));
  }, [projects, filter, query]);
  const open = projects.find(p => p.code === openCode) || null;

  // GST for the return, by month
  const months = useMemo(() => {
    const set = new Set((data?.gstLines || []).map(l => monthKey(l.date)).filter(Boolean));
    set.add(thisMonth());
    return [...set].sort().reverse();
  }, [data]);
  const gst = useMemo(() => {
    const lines = (data?.gstLines || []).filter(l => month === 'ALL' || monthKey(l.date) === month);
    const out = lines.filter(l => l.direction === 'OUTPUT');
    const inp = lines.filter(l => l.direction === 'INPUT');
    const sum = (arr) => Math.round(arr.reduce((s, l) => s + l.tax, 0) * 100) / 100;
    const output = sum(out);
    const input = sum(inp.filter(l => l.claimable));
    return { lines, output, input, unclaimable: sum(inp.filter(l => !l.claimable)), net: Math.round((output - input) * 100) / 100 };
  }, [data, month]);

  const t = data?.totals;
  const loading = !data && !error;

  const exportProjects = () => downloadCsv(`project-profit-${thisMonth()}.csv`, [
    ['AiC code', 'Project', 'Quoted', 'Billed (before GST)', 'Partner costs (before GST)', 'Profit', 'Margin %', 'Received (incl GST)', 'Paid to partners (incl GST)', 'Still to pay partners', 'Output GST', 'Input GST', 'Net GST'],
    ...shown.map(p => {
      const s = p.summary;
      return [p.code, p.name, s.quoted ?? '', s.billed, s.partnerCost, s.profit, s.margin ?? '', s.received, s.paidOut, s.toPay, s.outputGst, s.inputGst, s.netGst];
    }),
  ]);
  const exportGst = () => downloadCsv(`gst-register-${month === 'ALL' ? 'all' : month}.csv`, [
    ['Type', 'Date', 'Document', 'Party', 'GSTIN', 'AiC code', 'Taxable value', 'CGST', 'SGST', 'IGST', 'Total GST', 'Input credit claimable'],
    ...gst.lines.map(l => [
      l.direction === 'OUTPUT' ? 'Output (sale)' : 'Input (purchase)', l.date, l.number, l.party, l.gstin, l.project_code,
      l.taxable, l.cgst, l.sgst, l.igst, l.tax, l.direction === 'INPUT' ? (l.claimable ? 'Yes' : 'No - partner has no GSTIN') : '',
    ]),
  ]);

  return (
    <Box sx={{ pb: 6 }}>
      <PageHeader
        title="Project profit"
        subtitle="For every AiC code: what the client was billed, what the partners cost and what's left. Profit is before GST; GST is shown separately for the return."
        actions={<Button variant="outlined" startIcon={<FileDownloadRounded />} onClick={exportProjects} disabled={!shown.length}>Download CSV</Button>}
      />

      {error && <Alert severity="error" sx={{ mb: 3 }} action={<Button color="inherit" size="small" onClick={load}>Retry</Button>}>{error}</Alert>}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <StatCard label="Billed to clients" value={t ? formatINR(t.billed) : '—'} icon={<ReceiptLongRounded />} tone="accent" hint="Before GST" loading={loading} />
        <StatCard label="Partner costs" value={t ? formatINR(t.partnerCost) : '—'} icon={<GroupsRounded />} tone="violet" hint={t ? `${formatINR(t.toPay)} still to pay` : ' '} loading={loading} />
        <StatCard label={t && t.profit < 0 ? 'Loss' : 'Profit'} value={t ? signed(t.profit) : '—'} icon={<TrendingUpRounded />} tone={t ? profitTone(t.profit) : 'neutral'}
          hint={t?.margin != null ? `${t.margin}% margin` : 'No billing yet'} loading={loading} />
        <StatCard label="Cash position" value={t ? signed(t.cashPosition) : '—'} icon={<AccountBalanceWalletRounded />} tone={t ? profitTone(t.cashPosition) : 'neutral'}
          hint="Received minus paid out" loading={loading} />
      </Box>

      <Surface
        title="Projects"
        subtitle="Click a project to see its invoices and partner bills."
        contentSx={{ px: 0, pb: 0 }}
        action={
          <TextField size="small" placeholder="Search name or code" value={query} onChange={e => setQuery(e.target.value)}
            InputProps={{ startAdornment: <SearchRounded sx={{ fontSize: 18, color: 'text.disabled', mr: 1 }} /> }} sx={{ width: { xs: 160, sm: 240 } }} />
        }
        sx={{ mb: 3 }}
      >
        <Box sx={{ px: 3, pb: 2, overflowX: 'auto' }}>
          <ToggleButtonGroup size="small" exclusive value={filter} onChange={(_, v) => v && setFilter(v)} aria-label="Filter projects">
            {[['ACTIVE', 'With activity'], ['PROFIT', 'In profit'], ['LOSS', 'In loss'], ['ALL', 'All']].map(([k, label]) => (
              <ToggleButton key={k} value={k} sx={{ whiteSpace: 'nowrap' }}>
                {label}<Box component="span" sx={{ ml: 0.75, color: 'text.disabled', fontFeatureSettings: '"tnum"' }}>{counts[k]}</Box>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        {loading && <Box sx={{ px: 3, pb: 2, display: 'grid', gap: 1 }}>{[0, 1, 2].map(i => <Skeleton key={i} height={48} />)}</Box>}
        {!loading && shown.length === 0 && (
          <EmptyState compact icon={<TrendingUpRounded />} title="Nothing here yet"
            description="Projects appear once a client invoice or a partner bill uses their AiC code." />
        )}
        {!loading && shown.length > 0 && (
          <TableContainer sx={{ borderTop: `1px solid ${tokens.border}` }}>
            <Table aria-label="Project profit">
              <TableHead>
                <TableRow>
                  <TableCell>Project</TableCell>
                  <TableCell align="right">Billed</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}>Partner costs</TableCell>
                  <TableCell align="right">Profit</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Received</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Paid out</TableCell>
                  <TableCell padding="checkbox" sx={{ display: { xs: 'none', sm: 'table-cell' } }} />
                </TableRow>
              </TableHead>
              <TableBody>
                {shown.map(p => {
                  const s = p.summary;
                  return (
                    <TableRow key={p.code} hover onClick={() => setOpenCode(p.code)} sx={{ cursor: 'pointer' }}>
                      <TableCell sx={{ maxWidth: 320 }}>
                        <Typography variant="body2" noWrap sx={{ fontWeight: 560 }}>{p.name}</Typography>
                        <Code muted sx={{ fontSize: '0.72rem' }}>{p.code}</Code>
                      </TableCell>
                      <TableCell align="right"><Money value={s.billed} /></TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', md: 'table-cell' } }}><Money value={s.partnerCost} /></TableCell>
                      <TableCell align="right">
                        <Money value={s.profit} tone={profitTone(s.profit)} strong />
                        {s.margin != null && <Typography variant="caption" sx={{ display: 'block', color: 'text.disabled' }}>{s.margin}%</Typography>}
                      </TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', lg: 'table-cell' } }}><Money value={s.received} /></TableCell>
                      <TableCell align="right" sx={{ display: { xs: 'none', lg: 'table-cell' } }}><Money value={s.paidOut} /></TableCell>
                      <TableCell padding="checkbox" sx={{ display: { xs: 'none', sm: 'table-cell' }, color: 'text.disabled' }}><ChevronRightRounded /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Surface>

      <Surface
        title="GST for the return"
        subtitle="Output GST on client tax invoices and input GST on partner bills, by month. Download the register for your CA."
        action={
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <TextField select size="small" value={month} onChange={e => setMonth(e.target.value)} sx={{ minWidth: 170 }} aria-label="Month">
              {months.map(m => <MenuItem key={m} value={m}>{monthLabel(m)}</MenuItem>)}
              <MenuItem value="ALL">All months</MenuItem>
            </TextField>
            <Button variant="outlined" size="small" startIcon={<FileDownloadRounded />} onClick={exportGst} disabled={!gst.lines.length}>CSV for CA</Button>
          </Box>
        }
        contentSx={{ px: 0, pb: 0 }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2, px: 3, pb: 2.5 }}>
          <KeyValue label="Output GST (charged to clients)" value={formatINR(gst.output)} strong />
          <KeyValue label="Input GST (paid to partners with GSTIN)" value={formatINR(gst.input)} strong />
          <KeyValue label={gst.net < 0 ? 'Net GST credit' : 'Net GST payable'} value={formatINR(Math.abs(gst.net))} strong />
        </Box>
        {gst.unclaimable > 0 && (
          <Alert severity="warning" sx={{ mx: 3, mb: 2 }}>
            {formatINR(gst.unclaimable)} of GST is on partner bills without a GSTIN, so it isn't counted as input credit.
          </Alert>
        )}
        {loading && <Box sx={{ px: 3, pb: 2 }}><Skeleton height={48} /></Box>}
        {!loading && gst.lines.length === 0 && (
          <EmptyState compact icon={<ReceiptLongRounded />} title="No GST entries this month" description="Tax invoices and partner bills with GST will be listed here." />
        )}
        {!loading && gst.lines.length > 0 && (
          <TableContainer sx={{ borderTop: `1px solid ${tokens.border}` }}>
            <Table size="small" aria-label="GST register">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Document</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Party</TableCell>
                  <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Taxable</TableCell>
                  <TableCell align="right">GST</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {gst.lines.map(l => (
                  <TableRow key={`${l.direction}-${l.number}`}>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>{formatDate(l.date)}</TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <ToneChip tone={l.direction === 'OUTPUT' ? 'accent' : 'violet'} label={l.direction === 'OUTPUT' ? 'Output' : 'Input'} />
                        <Code>{l.number}</Code>
                      </Box>
                      <Code muted sx={{ fontSize: '0.7rem' }}>{l.project_code}</Code>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' }, maxWidth: 220 }}>
                      <Typography variant="body2" noWrap>{l.party || '—'}</Typography>
                      <Typography variant="caption" sx={{ color: l.gstin ? 'text.disabled' : tones.warning.fg, fontFamily: l.gstin ? tokens.mono : undefined }}>
                        {l.gstin || 'No GSTIN'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ display: { xs: 'none', sm: 'table-cell' } }}><Money value={l.taxable} /></TableCell>
                    <TableCell align="right">
                      <Tooltip title={l.igst ? `IGST ${formatINR(l.igst)}` : `CGST ${formatINR(l.cgst)} + SGST ${formatINR(l.sgst)}`}>
                        <span><Money value={l.tax} strong /></span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', px: 3, py: 1.75, borderTop: `1px solid ${tokens.border}` }}>
          Partner bills are dated by when they were submitted. Rejected bills and cancelled invoices are left out. Check the figures with your CA before filing.
        </Typography>
      </Surface>

      <ProjectDrawer project={open} onClose={() => setOpenCode(null)} />
    </Box>
  );
}
