import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, TextField, InputAdornment, ToggleButtonGroup, ToggleButton, Skeleton, Tooltip, IconButton,
  useMediaQuery, useTheme,
} from '@mui/material';
import {
  SearchRounded, AddRounded, InboxRounded, ChevronRightRounded, PendingActionsRounded,
  TaskAltRounded, PaymentsRounded, ReceiptLongRounded, ArrowForwardRounded,
} from '@mui/icons-material';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { setRequests } from '../store/paymentSlice';
import SubmitRequest from './SubmitRequest';
import SubmitSalaryRequest from './SubmitSalaryRequest';
import RequestDrawer from '../components/RequestDrawer';
import { PageHeader, StatCard, StatusChip, PipelineProgress, EmptyState, Code, RequestCardList } from '../components/ui';
import { formatINR, formatINRCompact, formatRelative, formatDate } from '../utils/format';
import { OPEN_STATUSES } from '../utils/status';

const REVIEWER_ROLES = ['FIN', 'OWN', 'ADM'];

// Which statuses are waiting on *this* person's decision
const AWAITING_ME = {
  OWN: ['PND', 'VRF'],
  FIN: ['OWN', 'FIN'],
  ADM: ['PND', 'VRF', 'OWN', 'FIN'],
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'In progress' },
  { key: 'DSB', label: 'Paid' },
  { key: 'REJ', label: 'Rejected' },
];

const Dashboard = () => {
  const { user } = useSelector((state) => state.auth);
  const { requests } = useSelector((state) => state.payments);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { apiFetch } = useApi();
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const theme = useTheme();
  const isPhone = useMediaQuery(theme.breakpoints.down('sm'));

  const isPartner = user?.role === 'VND';
  const isLocalEmployee = user?.role === 'EMP' && !!localStorage.getItem('employeeToken');

  useEffect(() => {
    if (isPartner || isLocalEmployee) return; // those roles see a form instead
    const fetchRequests = async () => {
      try {
        const res = await apiFetch('/api/requests?limit=100');
        if (res.ok) {
          const data = await res.json();
          dispatch(setRequests(data.data || []));
        }
      } catch (e) {
        console.error('Failed to fetch requests', e);
      } finally {
        setLoading(false);
      }
    };
    fetchRequests();
  }, [apiFetch, dispatch, isPartner, isLocalEmployee]);

  const stats = useMemo(() => {
    const open = requests.filter((r) => OPEN_STATUSES.includes(r.status));
    const paid = requests.filter((r) => r.status === 'DSB');
    const mine = AWAITING_ME[user?.role] || [];
    return {
      open: open.length,
      openValue: open.reduce((s, r) => s + (Number(r.amount) || 0), 0),
      awaiting: requests.filter((r) => mine.includes(r.status)).length,
      paid: paid.length,
      paidValue: paid.reduce((s, r) => s + (Number(r.amount) || 0), 0),
      total: requests.length,
    };
  }, [requests, user?.role]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return requests
      .filter((r) => (filter === 'all' ? true : filter === 'open' ? OPEN_STATUSES.includes(r.status) : r.status === filter))
      .filter((r) => !q || `${r.id} ${r.purpose} ${r.invoice_code || ''} ${r.verifier || ''}`.toLowerCase().includes(q));
  }, [requests, filter, query]);

  // ── Partners land on the invoice form; local employees on the salary form ──
  if (isPartner) return <SubmitRequest />;
  if (isLocalEmployee) return <SubmitSalaryRequest />;

  const isReviewer = REVIEWER_ROLES.includes(user?.role);
  const firstName = (user?.name || '').split(' ')[0];

  return (
    <Box>
      <PageHeader
        eyebrow={firstName ? `Welcome back, ${firstName}` : undefined}
        title={isReviewer ? 'Overview' : user?.role === 'VRF' ? 'Assigned to you' : 'My requests'}
        subtitle={
          isReviewer
            ? 'Every payout request across partners and employees, and where each one stands.'
            : 'Track your requests from submission through approval to payment.'
        }
        actions={
          <>
            {isReviewer && (
              <Button variant="outlined" onClick={() => navigate('/finance')} endIcon={<ArrowForwardRounded />}>
                Go to approvals
              </Button>
            )}
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => navigate('/submit')}>
              New request
            </Button>
          </>
        }
      />

      {/* Stats */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        {AWAITING_ME[user?.role] ? (
          <StatCard label="Waiting on you" value={stats.awaiting} icon={<PendingActionsRounded />} tone="warning" loading={loading}
            hint={stats.awaiting ? 'Open Approvals to act' : 'All caught up'} onClick={() => navigate('/finance')} />
        ) : (
          <StatCard label="Total requests" value={stats.total} icon={<ReceiptLongRounded />} tone="accent" loading={loading} />
        )}
        <StatCard label="In progress" value={stats.open} icon={<ReceiptLongRounded />} tone="violet" loading={loading}
          hint={stats.open ? `${formatINRCompact(stats.openValue)} in the pipeline` : 'Nothing pending'}
          onClick={() => setFilter('open')} active={filter === 'open'} />
        <StatCard label="Paid" value={stats.paid} icon={<TaskAltRounded />} tone="success" loading={loading}
          onClick={() => setFilter('DSB')} active={filter === 'DSB'} />
        <StatCard label="Paid out" value={formatINRCompact(stats.paidValue)} icon={<PaymentsRounded />} tone="info" loading={loading}
          hint={stats.paidValue ? formatINR(stats.paidValue) : undefined} />
      </Box>

      {/* Requests */}
      <Paper sx={{ overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <ToggleButtonGroup size="small" exclusive value={filter} onChange={(e, v) => v && setFilter(v)} aria-label="Filter by status">
            {FILTERS.map((f) => <ToggleButton key={f.key} value={f.key}>{f.label}</ToggleButton>)}
          </ToggleButtonGroup>
          <TextField
            size="small"
            placeholder="Search ID, purpose or invoice no."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ ml: { sm: 'auto' }, width: { xs: '100%', sm: 300 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment> }}
            inputProps={{ 'aria-label': 'Search requests' }}
          />
        </Box>

        {isPhone ? (
          <RequestCardList rows={visible} loading={loading} onSelect={setSelected} />
        ) : (
        <TableContainer>
          <Table sx={{ minWidth: 620 }} aria-label="Requests">
            <TableHead>
              <TableRow>
                <TableCell>Request</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Status</TableCell>
                <TableCell sx={{ width: 160, display: { xs: 'none', lg: 'table-cell' } }}>Progress</TableCell>
                <TableCell>Submitted</TableCell>
                <TableCell padding="checkbox" />
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && [0, 1, 2, 3].map((i) => (
                <TableRow key={i}>
                  {[220, 80, 110, 140, 70, 20].map((w, j) => (
                    <TableCell key={j} sx={j === 3 ? { display: { xs: 'none', lg: 'table-cell' } } : undefined}><Skeleton width={w} /></TableCell>
                  ))}
                </TableRow>
              ))}

              {!loading && visible.map((row) => (
                <TableRow
                  key={row.id}
                  hover
                  onClick={() => setSelected(row)}
                  sx={{ cursor: 'pointer', '&:hover .row-chevron': { opacity: 1, transform: 'translateX(2px)' } }}
                >
                  <TableCell sx={{ maxWidth: 340 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>{row.purpose}</Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.25 }}>
                      <Code muted>{row.id}</Code>
                      {row.invoice_code && <Code muted sx={{ color: 'text.disabled' }}>· {row.invoice_code}</Code>}
                    </Box>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>
                    {formatINR(row.amount)}
                  </TableCell>
                  <TableCell><StatusChip status={row.status} /></TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}><PipelineProgress status={row.status} /></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title={formatDate(row.ts)}>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{formatRelative(row.ts)}</Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell padding="checkbox">
                    <IconButton
                      size="small"
                      aria-label={`View ${row.id}`}
                      onClick={(e) => { e.stopPropagation(); setSelected(row); }}
                      className="row-chevron"
                      sx={{ opacity: 0.5, transition: 'all .15s ease' }}
                    >
                      <ChevronRightRounded fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        )}

        {!loading && visible.length === 0 && (
          <EmptyState
            icon={<InboxRounded />}
            title={requests.length === 0 ? 'No requests yet' : 'Nothing matches'}
            description={requests.length === 0 ? 'Requests you submit, or that are assigned to you, will show up here.' : 'Try a different filter or search.'}
            action={
              requests.length === 0
                ? <Button variant="contained" startIcon={<AddRounded />} onClick={() => navigate('/submit')}>New request</Button>
                : <Button variant="outlined" onClick={() => { setFilter('all'); setQuery(''); }}>Clear filters</Button>
            }
          />
        )}
      </Paper>

      <RequestDrawer request={selected} onClose={() => setSelected(null)} />
    </Box>
  );
};

export default Dashboard;
