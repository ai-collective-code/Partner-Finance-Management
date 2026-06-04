import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, Button, TextField, CircularProgress, Avatar, Tooltip, Select,
  MenuItem, InputLabel, FormControl, Divider
} from '@mui/material';
import { Assignment, Download, FilterList, Person, BarChart } from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { useApi } from '../hooks/useApi';
import jsPDF from 'jspdf';

const WorksheetAdmin = () => {
  const { user } = useSelector((state) => state.auth);
  const { apiFetch } = useApi();

  const [sheets, setSheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterEmployee, setFilterEmployee] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  const [expanded, setExpanded] = useState(null);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/worksheets?all=1');
      if (res.ok) setSheets(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAll(); }, []); // eslint-disable-line

  const employees = [...new Set(sheets.map(s => s.employee_id))];

  const filtered = sheets.filter(s => {
    if (filterEmployee !== 'all' && s.employee_id !== filterEmployee) return false;
    if (filterDate && !s.date.startsWith(filterDate)) return false;
    return true;
  });

  // ── PDF Export ──────────────────────────────────────────────────────────────
  const exportPDF = () => {
    const doc = new jsPDF();
    const now = new Date().toLocaleString('en-IN');

    doc.setFillColor(17, 24, 39);
    doc.rect(0, 0, 210, 297, 'F');

    doc.setFontSize(18);
    doc.setTextColor(99, 102, 241);
    doc.text('AI Finance - Daily Work Progress Report', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(150, 150, 180);
    doc.text(`Generated: ${now}  |  Total Records: ${filtered.length}  |  By: ${user?.name || user?.role}`, 14, 28);

    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(0.5);
    doc.line(14, 32, 196, 32);

    let y = 40;
    filtered.forEach((s, i) => {
      if (y > 250) { doc.addPage(); doc.setFillColor(17, 24, 39); doc.rect(0, 0, 210, 297, 'F'); y = 20; }

      doc.setFillColor(30, 40, 60);
      doc.roundedRect(12, y - 4, 186, 46, 2, 2, 'F');

      doc.setFontSize(11);
      doc.setTextColor(165, 180, 252);
      doc.text(`${i + 1}. ${s.date}  |  Emp: ${s.employee_id.split('_').pop().slice(0, 12)}  |  ${s.hours_worked}h  |  ⚡${s.productivity}/5`, 16, y + 4);

      doc.setFontSize(9);
      doc.setTextColor(200, 200, 220);
      const tasksLines = doc.splitTextToSize(`✅ Completed: ${s.tasks_completed}`, 170);
      doc.text(tasksLines, 16, y + 11);
      y += 5 * tasksLines.length;

      if (s.tasks_in_progress) {
        const wipLines = doc.splitTextToSize(`🔄 In Progress: ${s.tasks_in_progress}`, 170);
        doc.text(wipLines, 16, y + 12);
        y += 5 * wipLines.length;
      }

      if (s.blockers) {
        doc.setTextColor(239, 68, 68);
        const blockLines = doc.splitTextToSize(`🚧 Blockers: ${s.blockers}`, 170);
        doc.text(blockLines, 16, y + 12);
        y += 5 * blockLines.length;
        doc.setTextColor(200, 200, 220);
      }

      if (s.tomorrow_plan) {
        const planLines = doc.splitTextToSize(`📅 Tomorrow: ${s.tomorrow_plan}`, 170);
        doc.text(planLines, 16, y + 12);
        y += 5 * planLines.length;
      }

      y += 20;
    });

    const filename = `work_report_${new Date().toISOString().split('T')[0]}${filterEmployee !== 'all' ? `_${filterEmployee.split('_').pop().slice(0, 8)}` : ''}.pdf`;
    doc.save(filename);
  };

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 4, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <BarChart sx={{ color: '#6366f1', fontSize: 30 }} />
          <Box>
            <Typography variant="h4" fontWeight={700}>Work Progress Reports</Typography>
            <Typography variant="body2" color="text.secondary">All employee daily worksheets — view & export as PDF</Typography>
          </Box>
        </Box>
        <Button
          variant="contained" startIcon={<Download />} onClick={exportPDF}
          disabled={filtered.length === 0}
          sx={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 2, px: 3 }}
        >
          Export PDF ({filtered.length} records)
        </Button>
      </Box>

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {[
          { label: 'Total Reports', value: sheets.length, color: '#6366f1' },
          { label: 'Employees', value: employees.length, color: '#8b5cf6' },
          { label: 'Avg Hours/Day', value: sheets.length ? (sheets.reduce((a, s) => a + (s.hours_worked || 0), 0) / sheets.length).toFixed(1) + 'h' : '—', color: '#3b82f6' },
          { label: 'Avg Productivity', value: sheets.length ? (sheets.reduce((a, s) => a + (s.productivity || 0), 0) / sheets.length).toFixed(1) + '/5' : '—', color: '#22c55e' },
          { label: 'With Blockers', value: sheets.filter(s => s.blockers?.trim()).length, color: '#ef4444' },
        ].map(s => (
          <Paper key={s.label} sx={{ p: 2, flex: '1 0 120px', borderRadius: 2, border: `1px solid ${s.color}33`, textAlign: 'center' }}>
            <Typography variant="h5" fontWeight={700} sx={{ color: s.color }}>{s.value}</Typography>
            <Typography variant="caption" color="text.secondary">{s.label}</Typography>
          </Paper>
        ))}
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', background: 'rgba(255,255,255,0.02)' }}>
        <FilterList color="primary" />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Filter by Employee</InputLabel>
          <Select value={filterEmployee} onChange={(e) => setFilterEmployee(e.target.value)} label="Filter by Employee">
            <MenuItem value="all">All Employees</MenuItem>
            {employees.map(id => (
              <MenuItem key={id} value={id}>Emp #{id.split('_').pop().slice(0, 10)}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          type="month" size="small" label="Filter Month"
          value={filterDate} onChange={(e) => setFilterDate(e.target.value)}
          InputLabelProps={{ shrink: true }} sx={{ width: 160 }}
        />
        {(filterEmployee !== 'all' || filterDate) && (
          <Button size="small" onClick={() => { setFilterEmployee('all'); setFilterDate(''); }}>Clear Filters</Button>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto' }}>
          Showing {filtered.length} of {sheets.length} reports
        </Typography>
      </Paper>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : filtered.length === 0 ? (
        <Paper sx={{ p: 6, textAlign: 'center', borderRadius: 3, background: 'rgba(255,255,255,0.02)' }}>
          <Assignment sx={{ fontSize: 56, color: 'text.disabled', mb: 2 }} />
          <Typography color="text.secondary">No worksheets found</Typography>
        </Paper>
      ) : (
        <Paper sx={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: 'rgba(99,102,241,0.1)' }}>
                <TableCell>Employee</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Hours</TableCell>
                <TableCell>Productivity</TableCell>
                <TableCell>Tasks Completed</TableCell>
                <TableCell>Blockers</TableCell>
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((s) => (
                <React.Fragment key={s.id}>
                  <TableRow
                    sx={{ cursor: 'pointer', '&:hover': { background: 'rgba(255,255,255,0.02)' } }}
                    onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Avatar sx={{ width: 28, height: 28, bgcolor: '#4f46e5', fontSize: 11 }}>
                          {s.employee_id.split('_').pop().slice(0, 2).toUpperCase()}
                        </Avatar>
                        <Typography variant="caption">#{s.employee_id.split('_').pop().slice(0, 10)}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell><Typography variant="body2">{s.date}</Typography></TableCell>
                    <TableCell><Chip label={`${s.hours_worked}h`} size="small" color="info" /></TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        {'⭐'.repeat(Math.round(s.productivity || 0))}
                        <Typography variant="caption" color="text.secondary"> {s.productivity}/5</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Tooltip title={s.tasks_completed}>
                        <Typography variant="caption" noWrap sx={{ maxWidth: 200, display: 'block' }}>{s.tasks_completed}</Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {s.blockers?.trim()
                        ? <Chip label={s.blockers.slice(0, 30) + (s.blockers.length > 30 ? '…' : '')} color="error" size="small" />
                        : <Chip label="None" color="success" size="small" />}
                    </TableCell>
                    <TableCell>
                      <Button size="small" variant="text" onClick={(e) => { e.stopPropagation(); setExpanded(expanded === s.id ? null : s.id); }}>
                        {expanded === s.id ? 'Hide' : 'View'}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {expanded === s.id && (
                    <TableRow>
                      <TableCell colSpan={7} sx={{ background: 'rgba(99,102,241,0.05)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <Box sx={{ p: 2, display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                          {[
                            { label: '✅ Completed', value: s.tasks_completed },
                            { label: '🔄 In Progress', value: s.tasks_in_progress },
                            { label: '🚧 Blockers', value: s.blockers || 'None' },
                            { label: '📅 Tomorrow Plan', value: s.tomorrow_plan || '—' },
                          ].map(({ label, value }) => (
                            <Box key={label} sx={{ flex: '1 0 200px' }}>
                              <Typography variant="caption" color="text.disabled" fontWeight={600}>{label}</Typography>
                              <Typography variant="body2" mt={0.5}>{value}</Typography>
                            </Box>
                          ))}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Box>
  );
};

export default WorksheetAdmin;
