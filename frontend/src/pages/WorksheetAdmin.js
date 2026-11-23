import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Button, TextField, Avatar, Tooltip, Select, MenuItem, InputLabel, FormControl, Skeleton, IconButton, Collapse,
} from '@mui/material';
import {
  AssignmentRounded, DownloadRounded, GroupsRounded, ScheduleRounded, BoltRounded, BlockRounded,
  KeyboardArrowDownRounded, CheckCircleOutlineRounded, AutorenewRounded, EventRounded,
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { useApi } from '../hooks/useApi';
import jsPDF from 'jspdf';
import { PageHeader, StatCard, ToneChip, EmptyState, avatarColor } from '../components/ui';
import { tokens, tones } from '../theme';
import { formatDate, localToday } from '../utils/format';
import { MOODS } from './WorksheetForm';

const empShort = (id = '') => String(id).split('_').pop().slice(0, 8);

const DETAIL_FIELDS = [
  { key: 'tasks_completed', label: 'Done', Icon: CheckCircleOutlineRounded, tone: 'success' },
  { key: 'tasks_in_progress', label: 'In progress', Icon: AutorenewRounded },
  { key: 'blockers', label: 'Blocked', Icon: BlockRounded, tone: 'danger' },
  { key: 'tomorrow_plan', label: 'Tomorrow', Icon: EventRounded },
];

const WorksheetAdmin = () => {
  const { user } = useSelector((state) => state.auth);
  const { apiFetch } = useApi();

  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [expanded, setExpanded] = useState(null);

  const fetchAll = useCallback(async () => {
    try {
      const res = await apiFetch('/api/worksheets?all=1');
      if (res.ok) setSheets(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [apiFetch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const employees = useMemo(() => [...new Set(sheets.map((s) => s.employee_id))], [sheets]);

  const filtered = sheets.filter((s) => {
    if (filterEmployee !== 'all' && s.employee_id !== filterEmployee) return false;
    if (filterDate && !String(s.date).startsWith(filterDate)) return false;
    return true;
  });

  const stats = useMemo(() => {
    const n = filtered.length;
    const avg = (k) => (n ? filtered.reduce((a, s) => a + (Number(s[k]) || 0), 0) / n : 0);
    return {
      n,
      people: new Set(filtered.map((s) => s.employee_id)).size,
      hours: n ? `${avg('hours_worked').toFixed(1)}h` : '—',
      productivity: n ? `${avg('productivity').toFixed(1)}/5` : '—',
      blocked: filtered.filter((s) => s.blockers?.trim()).length,
    };
  }, [filtered]);

  // ── PDF export: printable white layout, plain-text labels (jsPDF core fonts have no emoji) ──
  const exportPDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210; const M = 16; const CW = W - M * 2;
    const ink = [17, 24, 39]; const muted = [107, 114, 128]; const accent = [79, 70, 229]; const danger = [185, 28, 28];
    let y = 22;

    const header = () => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...ink);
      doc.text('Daily work report', M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
      const scope = [
        filterEmployee !== 'all' ? `Employee ${empShort(filterEmployee)}` : 'All employees',
        filterDate ? new Date(`${filterDate}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : 'All dates',
      ].join(' · ');
      doc.text(`AI Collective · ${scope} · ${filtered.length} updates · exported ${new Date().toLocaleString('en-IN')} by ${user?.name || user?.role || ''}`, M, y + 6);
      doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3); doc.line(M, y + 10, W - M, y + 10);
      y += 18;
    };
    header();

    filtered.forEach((s) => {
      const blocks = DETAIL_FIELDS
        .filter((f) => s[f.key]?.trim())
        .map((f) => ({ ...f, lines: doc.splitTextToSize(String(s[f.key]).trim(), CW - 26) }));
      const height = 9 + blocks.reduce((h, b) => h + b.lines.length * 4.4 + 2, 0) + 4;
      if (y + height > 282) { doc.addPage(); y = 22; header(); }

      doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...ink);
      doc.text(formatDate(s.date), M, y);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
      const mood = MOODS.find((m) => m.value === Number(s.mood));
      doc.text(`Employee ${empShort(s.employee_id)}  ·  ${s.hours_worked}h  ·  productivity ${s.productivity}/5${mood ? `  ·  mood ${mood.label.toLowerCase()}` : ''}`, M + 34, y);
      y += 6.5;

      blocks.forEach((b) => {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
        doc.setTextColor(...(b.tone === 'danger' ? danger : b.tone === 'success' ? accent : muted));
        doc.text(b.label.toUpperCase(), M, y);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...ink);
        doc.text(b.lines, M + 26, y);
        y += b.lines.length * 4.4 + 2;
      });

      y += 2;
      doc.setDrawColor(243, 244, 246); doc.line(M, y, W - M, y);
      y += 7;
    });

    const filename = `work_report_${localToday()}${filterEmployee !== 'all' ? `_${empShort(filterEmployee)}` : ''}.pdf`;
    doc.save(filename);
  };

  const filtersActive = filterEmployee !== 'all' || filterDate;

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Work reports"
        subtitle="Everyone's daily updates in one place. Filter by person or month and export a printable PDF."
        actions={
          <Button variant="contained" startIcon={<DownloadRounded />} onClick={exportPDF} disabled={filtered.length === 0}>
            Export PDF
          </Button>
        }
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <StatCard label="Updates" value={stats.n} icon={<AssignmentRounded />} tone="accent" loading={loading} hint={`from ${stats.people} ${stats.people === 1 ? 'person' : 'people'}`} />
        <StatCard label="Avg hours / day" value={stats.hours} icon={<ScheduleRounded />} tone="info" loading={loading} />
        <StatCard label="Avg productivity" value={stats.productivity} icon={<BoltRounded />} tone="violet" loading={loading} />
        <StatCard label="Blockers" value={stats.blocked} icon={<BlockRounded />} tone={stats.blocked ? 'danger' : 'success'} loading={loading} hint={stats.blocked ? 'Worth a follow-up' : 'Nothing blocked'} />
      </Box>

      <Paper sx={{ overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', p: 2, borderBottom: `1px solid ${tokens.border}` }}>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Employee</InputLabel>
            <Select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} label="Employee" startAdornment={<GroupsRounded sx={{ fontSize: 18, color: 'text.disabled', mr: 1 }} />}>
              <MenuItem value="all">Everyone</MenuItem>
              {employees.map((id) => <MenuItem key={id} value={id}>Employee {empShort(id)}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField type="month" size="small" label="Month" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 180 }} />
          {filtersActive && <Button size="small" color="inherit" onClick={() => { setFilterEmployee('all'); setFilterDate(''); }} sx={{ color: 'text.secondary' }}>Clear</Button>}
          <Typography variant="caption" sx={{ color: 'text.disabled', ml: 'auto' }}>
            {filtered.length} of {sheets.length} updates
          </Typography>
        </Box>

        {loading && <Box sx={{ p: 2, display: 'grid', gap: 1 }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} height={44} />)}</Box>}

        {!loading && filtered.length === 0 && (
          <EmptyState
            icon={<AssignmentRounded />}
            title={sheets.length ? 'Nothing matches' : 'No updates yet'}
            description={sheets.length ? 'Try another person or month.' : 'Daily worksheets from the team will appear here.'}
            action={filtersActive && <Button variant="outlined" onClick={() => { setFilterEmployee('all'); setFilterDate(''); }}>Clear filters</Button>}
          />
        )}

        {!loading && filtered.length > 0 && (
          <TableContainer>
            <Table sx={{ minWidth: 500 }} aria-label="Work reports">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" />
                  <TableCell>Employee</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell align="right">Hours</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Productivity</TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}>Done</TableCell>
                  <TableCell>Blockers</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map((s) => {
                  const open = expanded === s.id;
                  const mood = MOODS.find((m) => m.value === Number(s.mood));
                  return (
                    <React.Fragment key={s.id}>
                      <TableRow hover onClick={() => setExpanded(open ? null : s.id)} sx={{ cursor: 'pointer', '& > td': { borderBottom: open ? 'none' : undefined } }}>
                        <TableCell padding="checkbox">
                          <IconButton size="small" aria-label={open ? 'Collapse' : 'Expand'} aria-expanded={open}>
                            <KeyboardArrowDownRounded fontSize="small" sx={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'none' }} />
                          </IconButton>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 26, height: 26, fontSize: 11, bgcolor: avatarColor(s.employee_id), color: '#fff' }}>{empShort(s.employee_id).slice(0, 2).toUpperCase()}</Avatar>
                            <Typography variant="body2" sx={{ fontWeight: 520 }}>{empShort(s.employee_id)}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                            {formatDate(s.date)}
                            {mood && <Tooltip title={`Mood: ${mood.label}`}><mood.Icon sx={{ fontSize: 17, color: mood.color }} /></Tooltip>}
                          </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ fontFeatureSettings: '"tnum"' }}>{s.hours_worked}h</TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                          <Box sx={{ display: 'flex', gap: '2px' }} aria-label={`${s.productivity} of 5`}>
                            {[1, 2, 3, 4, 5].map((i) => (
                              <Box key={i} sx={{ width: 14, height: 6, borderRadius: 1, bgcolor: i <= Number(s.productivity) ? tokens.accentSoft : 'rgba(255,255,255,0.08)' }} />
                            ))}
                          </Box>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 260, display: { xs: 'none', lg: 'table-cell' } }}>
                          <Typography variant="body2" noWrap sx={{ color: 'text.secondary' }}>{s.tasks_completed}</Typography>
                        </TableCell>
                        <TableCell>
                          {s.blockers?.trim()
                            ? (
                              <Tooltip title={s.blockers}>
                                <Box sx={{ maxWidth: 160 }}><ToneChip tone="danger" label={s.blockers} sx={{ maxWidth: '100%' }} /></Box>
                              </Tooltip>
                            )
                            : <Typography variant="body2" sx={{ color: 'text.disabled' }}>None</Typography>}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={7} sx={{ p: 0, borderBottom: open ? undefined : 'none' }}>
                          <Collapse in={open} unmountOnExit>
                            <Box sx={{ px: 3, py: 2.25, pl: 9, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2.25, bgcolor: tokens.surfaceSunken }}>
                              {DETAIL_FIELDS.map((f) => (
                                <Box key={f.key} sx={{ display: 'flex', gap: 1.25, minWidth: 0 }}>
                                  <f.Icon sx={{ fontSize: 17, mt: '2px', color: f.tone ? tones[f.tone].fg : 'text.disabled' }} />
                                  <Box sx={{ minWidth: 0 }}>
                                    <Typography variant="caption" sx={{ color: f.tone ? tones[f.tone].fg : 'text.disabled', fontWeight: 600 }}>{f.label}</Typography>
                                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: s[f.key]?.trim() ? 'text.primary' : 'text.disabled' }}>
                                      {s[f.key]?.trim() || '—'}
                                    </Typography>
                                  </Box>
                                </Box>
                              ))}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

export default WorksheetAdmin;
