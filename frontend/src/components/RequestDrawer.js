import React, { useEffect, useState } from 'react';
import { Drawer, Box, Typography, IconButton, Divider, Button, Skeleton, Tooltip, Avatar } from '@mui/material';
import { CloseRounded, OpenInNewRounded, ContentCopyRounded } from '@mui/icons-material';
import { useApi } from '../hooks/useApi';
import AuthedFile from './AuthedFile';
import { StatusChip, PipelineStepper, KeyValue, SectionLabel, Code, avatarColor } from './ui';
import { formatINR, formatDateTime, formatRelative, parseMetadata, initials } from '../utils/format';
import { statusMeta, roleMeta } from '../utils/status';
import { tokens } from '../theme';

// What a transition *into* each status means, as a verb phrase
const ACTION_VERBS = {
  VRF: 'verified it',
  OWN: 'approved it',
  FIN: 'cleared it for payment',
  DSB: 'marked it paid',
  REJ: 'rejected it',
  PND: 'reopened it',
};

/** Vertical timeline of audit-log entries: who did what, when, and their comment. */
export function ActivityList({ logs }) {
  return (
    <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {logs.map((l, i) => {
        const name = l.actor_name || l.actor;
        const action = !l.prev || l.prev === '-' ? 'submitted the request' : (ACTION_VERBS[l.next] || `moved it to ${statusMeta(l.next).label.toLowerCase()}`);
        const last = i === logs.length - 1;
        return (
          <Box component="li" key={l.id || i} sx={{ display: 'flex', gap: 1.5, position: 'relative', pb: last ? 0 : 2.25 }}>
            {!last && <Box aria-hidden sx={{ position: 'absolute', left: 13, top: 32, bottom: 4, width: 1.5, borderRadius: 1, bgcolor: tokens.border }} />}
            <Avatar sx={{ width: 28, height: 28, fontSize: 11.5, bgcolor: avatarColor(name), color: '#fff', flexShrink: 0 }}>{initials(name)}</Avatar>
            <Box sx={{ minWidth: 0, flex: 1, pt: 0.25 }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>{name}</Box>
                  {l.actor_role && <Box component="span" sx={{ color: 'text.disabled' }}> · {roleMeta(l.actor_role).label}</Box>} {action}
                </Typography>
                <Tooltip title={formatDateTime(l.ts)}>
                  <Typography variant="caption" sx={{ color: 'text.disabled', ml: 'auto', whiteSpace: 'nowrap' }}>{formatRelative(l.ts)}</Typography>
                </Tooltip>
              </Box>
              {l.comment && (
                <Typography variant="body2" sx={{ mt: 0.75, px: 1.5, py: 1, borderRadius: '10px', bgcolor: 'rgba(255,255,255,0.03)', border: `1px solid ${tokens.border}`, color: 'text.primary' }}>
                  {l.comment}
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

/** Who moved the request into each pipeline stage, from the audit trail. */
function stageEvents(logs) {
  const out = {};
  for (const l of logs) {
    const key = l.next === 'VRF' ? 'PND' : l.next;
    if (['PND', 'OWN', 'FIN', 'DSB'].includes(key)) out[key] = formatRelative(l.ts);
  }
  return out;
}

/**
 * Read-only detail panel for one request: amount, pipeline, details and activity.
 * Used from the dashboard; approvals have their own review dialog with actions.
 */
export default function RequestDrawer({ request, onClose }) {
  const { apiFetch } = useApi();
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const open = !!request;
  const meta = parseMetadata(request);

  useEffect(() => {
    if (!request) return undefined;
    let cancelled = false;
    setLoadingLogs(true);
    setLogs([]);
    (async () => {
      try {
        const res = await apiFetch(`/api/audit?reqId=${encodeURIComponent(request.id)}`);
        if (res.ok && !cancelled) setLogs((await res.json()).data || []);
      } catch (e) {
        /* activity is optional */
      } finally {
        if (!cancelled) setLoadingLogs(false);
      }
    })();
    return () => { cancelled = true; };
  }, [request, apiFetch]);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(request.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard unavailable */ }
  };

  const isSalary = meta?.type === 'salary';

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100%', sm: 480 }, borderLeft: `1px solid ${tokens.borderStrong}` } }}
    >
      {request && (
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <Box sx={{ px: 3, pt: 2.5, pb: 2, display: 'flex', alignItems: 'flex-start', gap: 1.5, borderBottom: `1px solid ${tokens.border}` }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Code muted>{request.id}</Code>
                <Tooltip title={copied ? 'Copied' : 'Copy ID'}>
                  <IconButton size="small" onClick={copyId} aria-label="Copy request ID" sx={{ p: 0.25 }}>
                    <ContentCopyRounded sx={{ fontSize: 14 }} />
                  </IconButton>
                </Tooltip>
              </Box>
              <Typography variant="h6" sx={{ mt: 0.5, lineHeight: 1.35 }}>{request.purpose}</Typography>
            </Box>
            <IconButton onClick={onClose} aria-label="Close details" sx={{ mt: -0.5, mr: -1 }}>
              <CloseRounded />
            </IconButton>
          </Box>

          <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: 3, py: 2.5, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 3, alignContent: 'start' }}>
            {/* Amount + status */}
            <Box sx={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
              <Box>
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>Amount</Typography>
                <Typography sx={{ fontSize: 30, fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.15, fontFeatureSettings: '"tnum"' }}>
                  {formatINR(request.amount)}
                </Typography>
              </Box>
              <StatusChip status={request.status} />
            </Box>

            {/* Pipeline */}
            <Box sx={{ p: 2, borderRadius: `${tokens.radius.lg}px`, border: `1px solid ${tokens.border}`, bgcolor: tokens.surfaceSunken }}>
              {request.status === 'REJ' ? (
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {statusMeta('REJ').hint}. See the activity below for the reason.
                </Typography>
              ) : (
                <PipelineStepper status={request.status} events={stageEvents(logs)} />
              )}
            </Box>

            {/* Details */}
            <Box>
              <SectionLabel>Details</SectionLabel>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                <KeyValue label="Submitted" value={formatDateTime(request.ts)} />
                <KeyValue label="Invoice no." value={request.invoice_code} mono />
                {meta && !isSalary && (
                  <>
                    <KeyValue label="Partner" value={meta.vendorName || meta.partnerName} strong />
                    <KeyValue label="Company" value={meta.companyName} />
                    <KeyValue label="Project" value={meta.projectName} sx={{ gridColumn: '1 / -1' }} />
                    <KeyValue label="Role" value={meta.jobDescription || meta.department} />
                    <KeyValue label="Project head" value={meta.projectHead} />
                  </>
                )}
                {meta && isSalary && (
                  <>
                    <KeyValue label="Employee" value={meta.employeeName} strong />
                    <KeyValue label="Month" value={meta.month} />
                    <KeyValue label="Department" value={meta.department} />
                    <KeyValue label="Approver" value={meta.projectHead} />
                  </>
                )}
              </Box>
            </Box>

            {/* Money breakdown */}
            {meta && (
              <Box>
                <SectionLabel>Breakdown</SectionLabel>
                <Box sx={{ display: 'grid', gap: 0.75 }}>
                  {(isSalary
                    ? [['Base salary', meta.baseSalary], ['Deductions', meta.deductions ? -meta.deductions : 0]]
                    : [['Base amount', meta.baseAmount], [meta.isGst ? `GST · ${meta.gstType || '18%'}` : 'GST', meta.isGst ? meta.gstAmount : null], ['Advance received', meta.advanceAmount]]
                  ).filter(([, v]) => v !== null && v !== undefined).map(([k, v]) => (
                    <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>{k}</Typography>
                      <Typography variant="body2" sx={{ fontFeatureSettings: '"tnum"' }}>{formatINR(v)}</Typography>
                    </Box>
                  ))}
                  <Divider sx={{ my: 0.5 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Total</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 650, fontFeatureSettings: '"tnum"' }}>{formatINR(meta.totalAmount || meta.netAmount || request.amount)}</Typography>
                  </Box>
                </Box>
              </Box>
            )}

            {/* Document */}
            {request.file_hash && (
              <Box>
                <SectionLabel>{isSalary ? 'Payslip / proof' : 'Invoice'}</SectionLabel>
                <AuthedFile name={request.file_hash}>
                  {(url) => (
                    <Box sx={{ border: `1px solid ${tokens.border}`, borderRadius: `${tokens.radius.lg}px`, overflow: 'hidden', bgcolor: tokens.surfaceSunken }}>
                      {request.file_hash.toLowerCase().endsWith('.pdf') ? (
                        <iframe src={url} title="Document preview" width="100%" height="260" style={{ border: 'none', display: 'block', backgroundColor: '#fff' }} />
                      ) : (
                        <Box component="a" href={url} target="_blank" rel="noopener noreferrer" sx={{ display: 'block', p: 1.5, textAlign: 'center', cursor: 'zoom-in' }}>
                          <Box component="img" src={url} alt="Attached document" sx={{ maxWidth: '100%', maxHeight: 260, borderRadius: '8px', display: 'inline-block' }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        </Box>
                      )}
                      <Box sx={{ px: 1.5, py: 1, borderTop: `1px solid ${tokens.border}`, display: 'flex', justifyContent: 'flex-end' }}>
                        <Button size="small" href={url} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRounded />}>Open in new tab</Button>
                      </Box>
                    </Box>
                  )}
                </AuthedFile>
              </Box>
            )}

            {/* Activity */}
            <Box>
              <SectionLabel>Activity</SectionLabel>
              {loadingLogs && (
                <Box sx={{ display: 'grid', gap: 1.5 }}>
                  <Skeleton height={44} /><Skeleton height={44} />
                </Box>
              )}
              {!loadingLogs && logs.length === 0 && (
                <Typography variant="body2" sx={{ color: 'text.disabled' }}>No activity yet.</Typography>
              )}
              <ActivityList logs={logs} />
            </Box>
          </Box>
        </Box>
      )}
    </Drawer>
  );
}
