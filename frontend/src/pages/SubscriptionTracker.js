import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Button, TextField,
  Dialog, DialogTitle, DialogContent, DialogActions, MenuItem, InputAdornment, Skeleton, Alert, CircularProgress,
} from '@mui/material';
import { AddRounded, AutorenewRounded, EventRepeatRounded, PaymentsRounded, NotificationsActiveRounded } from '@mui/icons-material';
import { useApi } from '../hooks/useApi';
import { PageHeader, StatCard, ToneChip, EmptyState } from '../components/ui';
import { formatINR, formatINRCompact, formatDate, toDate } from '../utils/format';

const CYCLES = { Monthly: 1, Quarterly: 3, Yearly: 12 };
const SOON_DAYS = 14;
const EMPTY = { name: '', vendor_id: '', cost: '', billing_cycle: 'Monthly', next_renewal_date: '' };

const daysUntil = (date) => {
  const d = toDate(date);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
};

function RenewalChip({ days }) {
  if (days === null) return <Typography variant="body2" sx={{ color: 'text.disabled' }}>—</Typography>;
  if (days < 0) return <ToneChip tone="danger" label={`${-days}d overdue`} />;
  if (days === 0) return <ToneChip tone="danger" label="Today" />;
  if (days <= SOON_DAYS) return <ToneChip tone="warning" label={`In ${days}d`} />;
  return <ToneChip tone="neutral" label={`In ${days}d`} />;
}

const SubscriptionTracker = () => {
  const { apiFetch } = useApi();
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState(EMPTY);

  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await apiFetch('/api/subscriptions');
      if (res.ok) setSubscriptions(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [apiFetch]);

  useEffect(() => { fetchSubscriptions(); }, [fetchSubscriptions]);

  const rows = useMemo(() => subscriptions
    .map((s) => ({ ...s, days: daysUntil(s.next_renewal_date) }))
    .sort((a, b) => (a.days ?? Infinity) - (b.days ?? Infinity)), [subscriptions]);

  const monthly = rows.reduce((sum, s) => sum + (Number(s.cost) || 0) / (CYCLES[s.billing_cycle] || 1), 0);
  const soon = rows.filter((s) => s.days !== null && s.days <= SOON_DAYS);

  const set = (k) => (e) => setFormData((f) => ({ ...f, [k]: e.target.value }));
  const valid = formData.name.trim() && Number(formData.cost) > 0 && formData.next_renewal_date;

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch('/api/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setOpen(false);
        setFormData(EMPTY);
        fetchSubscriptions();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Could not save the subscription.');
      }
    } catch { setError('Network error. Please try again.'); }
    finally { setSaving(false); }
  };

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Subscriptions"
        subtitle="Software and services the company pays for, sorted by what renews next."
        actions={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setOpen(true)}>Add subscription</Button>}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
        <StatCard label="Active subscriptions" value={rows.length} icon={<AutorenewRounded />} tone="accent" loading={loading} />
        <StatCard label="Monthly spend" value={formatINRCompact(monthly)} icon={<PaymentsRounded />} tone="violet" loading={loading}
          hint={monthly ? `${formatINRCompact(monthly * 12)} a year` : undefined} />
        <StatCard label={`Renewing in ${SOON_DAYS} days`} value={soon.length} icon={<NotificationsActiveRounded />} tone={soon.length ? 'warning' : 'success'} loading={loading}
          hint={soon.length ? formatINR(soon.reduce((s, r) => s + (Number(r.cost) || 0), 0)) : 'Nothing due soon'} />
      </Box>

      <Paper sx={{ overflow: 'hidden' }}>
        <TableContainer>
          <Table sx={{ minWidth: 560 }} aria-label="Subscriptions">
            <TableHead>
              <TableRow>
                <TableCell>Service</TableCell>
                <TableCell align="right">Cost</TableCell>
                <TableCell>Cycle</TableCell>
                <TableCell>Next renewal</TableCell>
                <TableCell>Due</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && [0, 1, 2].map((i) => (
                <TableRow key={i}>{[180, 70, 70, 100, 60].map((w, j) => <TableCell key={j}><Skeleton width={w} /></TableCell>)}</TableRow>
              ))}
              {!loading && rows.map((row) => (
                <TableRow key={row.id} hover>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 560 }}>{row.name}</Typography>
                    {row.vendor_id && <Typography variant="caption" sx={{ color: 'text.disabled' }}>{row.vendor_id}</Typography>}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>{formatINR(row.cost)}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{row.billing_cycle || '—'}</TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(row.next_renewal_date)}</TableCell>
                  <TableCell><RenewalChip days={row.days} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && rows.length === 0 && (
          <EmptyState
            icon={<EventRepeatRounded />}
            title="No subscriptions yet"
            description="Add the tools you pay for and we'll flag them two weeks before they renew."
            action={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setOpen(true)}>Add subscription</Button>}
          />
        )}
      </Paper>

      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="xs" fullWidth PaperProps={{ component: 'form', onSubmit: handleSubmit }}>
        <DialogTitle>Add subscription</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Service" required autoFocus fullWidth value={formData.name} onChange={set('name')} placeholder="Figma, Google Workspace…" />
          <TextField label="Vendor" fullWidth value={formData.vendor_id} onChange={set('vendor_id')} helperText="Optional" />
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="Cost" required type="number" fullWidth value={formData.cost} onChange={set('cost')}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} inputProps={{ min: 0 }} />
            <TextField select label="Billed" fullWidth value={formData.billing_cycle} onChange={set('billing_cycle')}>
              {Object.keys(CYCLES).map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
            </TextField>
          </Box>
          <TextField label="Next renewal" required type="date" InputLabelProps={{ shrink: true }} fullWidth value={formData.next_renewal_date} onChange={set('next_renewal_date')} />
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!valid || saving} startIcon={saving ? <CircularProgress size={14} color="inherit" /> : null}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SubscriptionTracker;
