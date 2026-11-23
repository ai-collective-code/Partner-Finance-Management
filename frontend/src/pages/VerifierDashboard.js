import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody, TableContainer,
  Alert, Skeleton, Tooltip, IconButton,
} from '@mui/material';
import {
  InboxRounded, ChevronRightRounded, AssignmentIndRounded, PendingActionsRounded,
  TaskAltRounded, CancelRounded, VisibilityRounded,
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { useApi } from '../hooks/useApi';
import RequestDrawer from '../components/RequestDrawer';
import { PageHeader, StatCard, StatusChip, PipelineProgress, EmptyState, Code } from '../components/ui';
import { formatINR, formatRelative, formatDate } from '../utils/format';

/**
 * Read-only view for a project head (Rup for tech, Soumana for content).
 * Shows only the requests a partner assigned to the signed-in person.
 * Approval starts at the owner now, so there is nothing to action here.
 */
const VerifierDashboard = ({ title, subtitle }) => {
  const { user } = useSelector((state) => state.auth);
  const { apiFetch } = useApi();

  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await apiFetch('/api/requests?limit=100');
      if (res.ok) setAllRequests((await res.json()).data || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [apiFetch]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  // Privacy: only requests where the partner picked the signed-in person
  const me = user?.name?.toLowerCase() || '';
  const mine = useMemo(() => allRequests.filter((r) => r.verifier?.toLowerCase() === me), [allRequests, me]);

  const counts = {
    total: mine.length,
    owner: mine.filter((r) => r.status === 'PND' || r.status === 'VRF').length,
    moving: mine.filter((r) => ['OWN', 'FIN', 'DSB'].includes(r.status)).length,
    rejected: mine.filter((r) => r.status === 'REJ').length,
  };

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader title={title} subtitle={subtitle} />

      <Alert severity="info" icon={<VisibilityRounded fontSize="inherit" />} sx={{ mb: 3 }}>
        You only see requests a partner assigned to you, and this view is read-only. Approval starts with the owner, so there's nothing for you to action here.
      </Alert>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <StatCard label="Assigned to you" value={counts.total} icon={<AssignmentIndRounded />} tone="accent" loading={loading} />
        <StatCard label="With the owner" value={counts.owner} icon={<PendingActionsRounded />} tone="warning" loading={loading} />
        <StatCard label="Approved or paid" value={counts.moving} icon={<TaskAltRounded />} tone="success" loading={loading} />
        <StatCard label="Rejected" value={counts.rejected} icon={<CancelRounded />} tone="danger" loading={loading} />
      </Box>

      <Paper sx={{ overflow: 'hidden' }}>
        <TableContainer>
          <Table sx={{ minWidth: 560 }} aria-label="Requests assigned to you">
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
              {loading && [0, 1, 2].map((i) => (
                <TableRow key={i}>
                  {[220, 80, 110, 140, 70, 20].map((w, j) => (
                    <TableCell key={j} sx={j === 3 ? { display: { xs: 'none', lg: 'table-cell' } } : undefined}><Skeleton width={w} /></TableCell>
                  ))}
                </TableRow>
              ))}
              {!loading && mine.map((row) => (
                <TableRow key={row.id} hover onClick={() => setSelected(row)} sx={{ cursor: 'pointer', '&:hover .row-chevron': { opacity: 1, transform: 'translateX(2px)' } }}>
                  <TableCell sx={{ maxWidth: { xs: 220, lg: 340 } }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 540 }}>{row.purpose}</Typography>
                    <Code muted>{row.id}</Code>
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>{formatINR(row.amount)}</TableCell>
                  <TableCell><StatusChip status={row.status} /></TableCell>
                  <TableCell sx={{ display: { xs: 'none', lg: 'table-cell' } }}><PipelineProgress status={row.status} /></TableCell>
                  <TableCell sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title={formatDate(row.ts)}>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{formatRelative(row.ts)}</Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell padding="checkbox">
                    <IconButton size="small" className="row-chevron" aria-label={`View ${row.id}`} onClick={(e) => { e.stopPropagation(); setSelected(row); }} sx={{ opacity: 0.5, transition: 'all .15s ease' }}>
                      <ChevronRightRounded fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!loading && mine.length === 0 && (
          <EmptyState icon={<InboxRounded />} title="Nothing assigned to you yet" description="When a partner names you as their project head, the request shows up here." />
        )}
      </Paper>

      <RequestDrawer request={selected} onClose={() => setSelected(null)} />
    </Box>
  );
};

export const TechDashboard = () => (
  <VerifierDashboard title="Tech review" subtitle="Partner requests where you're named as the tech project head." />
);

export const ContentDashboard = () => (
  <VerifierDashboard title="Content review" subtitle="Partner requests where you're named as the content project head." />
);

export default VerifierDashboard;
