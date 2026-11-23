import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, Paper, TextField, Button, MenuItem, Alert, Avatar, InputAdornment,
  CircularProgress, IconButton, Skeleton, ToggleButtonGroup, ToggleButton, useMediaQuery, useTheme,
} from '@mui/material';
import {
  SendRounded, InboxRounded, ForumRounded, ArrowBackRounded, LockRounded,
  AccountBalanceRounded, WorkspacePremiumRounded,
} from '@mui/icons-material';
import { useSelector } from 'react-redux';
import { useApi } from '../hooks/useApi';
import { PageHeader, ToneChip, EmptyState, avatarColor } from '../components/ui';
import { tokens, tones } from '../theme';
import { formatDateTime, formatRelative } from '../utils/format';

const MANAGER_ROLES = ['FIN', 'OWN', 'ADM'];

const TEAMS = {
  FIN: { label: 'Finance team', short: 'Finance', Icon: AccountBalanceRounded },
  OWN: { label: 'Founder / owner', short: 'Owner', Icon: WorkspacePremiumRounded },
};
const team = (role) => TEAMS[role] || TEAMS.FIN;

const shortId = (id = '') => String(id).split('_').pop().slice(0, 8);

function QueryStatus({ answered }) {
  return answered
    ? <ToneChip tone="success" label="Replied" />
    : <ToneChip tone="warning" label="Awaiting reply" />;
}

/** One message bubble. `mine` aligns it right with the accent tint. */
function Bubble({ author, time, children, mine, tone }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <Typography variant="caption" sx={{ color: 'text.disabled', mb: 0.5, px: 0.5 }}>
        <Box component="span" sx={{ color: 'text.secondary', fontWeight: 600 }}>{author}</Box>
        {time && <> · {time}</>}
      </Typography>
      <Box
        sx={{
          maxWidth: { xs: '92%', sm: '80%' }, px: 1.75, py: 1.25, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontSize: 14, lineHeight: 1.55,
          borderRadius: mine ? '14px 4px 14px 14px' : '4px 14px 14px 14px',
          bgcolor: tone === 'success' ? tones.success.bg : mine ? 'rgba(99,102,241,0.16)' : 'rgba(255,255,255,0.045)',
          border: `1px solid ${tone === 'success' ? tones.success.border : mine ? 'rgba(99,102,241,0.3)' : tokens.border}`,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

// ─── Employee: compose + own thread ──────────────────────────────────────────
function EmployeeView({ apiFetch }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipient, setRecipient] = useState('FIN');
  const [queries, setQueries] = useState([]);
  const [status, setStatus] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchMyQueries = useCallback(async () => {
    try {
      const res = await apiFetch('/api/queries');
      if (res.ok) setQueries(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [apiFetch]);

  useEffect(() => { fetchMyQueries(); }, [fetchMyQueries]);

  const handleSend = async (e) => {
    e.preventDefault();
    setStatus(null);
    setSending(true);
    try {
      const res = await apiFetch('/api/queries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, recipient_role: recipient }),
      });
      if (res.ok) {
        setSubject(''); setMessage('');
        setStatus('success');
        fetchMyQueries();
      } else setStatus('error');
    } catch { setStatus('error'); }
    finally { setSending(false); }
  };

  const open = queries.filter((q) => q.status !== 'Answered').length;

  return (
    <Box>
      <PageHeader
        title="Employee queries"
        subtitle="Ask finance or the founder about pay, reimbursements or anything HR. Only you and the team you write to can see these messages."
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
        {/* Compose */}
        <Paper component="form" onSubmit={handleSend} sx={{ p: 2.75, position: { md: 'sticky' }, top: { md: 80 } }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>New message</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.5, mb: 2.25 }}>
            <LockRounded sx={{ fontSize: 13 }} /> Private to you and the recipient
          </Typography>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField select label="To" value={recipient} onChange={(e) => setRecipient(e.target.value)} fullWidth>
              {Object.entries(TEAMS).map(([k, t]) => (
                <MenuItem key={k} value={k}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><t.Icon sx={{ fontSize: 18, color: 'text.secondary' }} /> {t.label}</Box>
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Subject" value={subject} required onChange={(e) => setSubject(e.target.value)} fullWidth inputProps={{ maxLength: 120 }} />
            <TextField
              label="Message" value={message} required multiline minRows={5} onChange={(e) => setMessage(e.target.value)} fullWidth
              placeholder="What do you need help with?"
            />
            <Button type="submit" variant="contained" fullWidth disabled={sending || !subject.trim() || !message.trim()}
              endIcon={sending ? <CircularProgress size={14} color="inherit" /> : <SendRounded />}>
              {sending ? 'Sending…' : 'Send message'}
            </Button>
            {status === 'success' && <Alert severity="success" onClose={() => setStatus(null)}>Sent. You'll see the reply here.</Alert>}
            {status === 'error' && <Alert severity="error" onClose={() => setStatus(null)}>Couldn't send that. Please try again.</Alert>}
          </Box>
        </Paper>

        {/* Thread */}
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1.25, mb: 1.75 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Your messages</Typography>
            {!loading && (
              <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                {queries.length} total{open ? ` · ${open} awaiting reply` : ''}
              </Typography>
            )}
          </Box>

          {loading && <Box sx={{ display: 'grid', gap: 2 }}>{[0, 1].map((i) => <Skeleton key={i} variant="rounded" height={150} />)}</Box>}

          {!loading && queries.length === 0 && (
            <Paper><EmptyState icon={<ForumRounded />} title="No messages yet" description="Questions you send will appear here with the team's reply." /></Paper>
          )}

          <Box sx={{ display: 'grid', gap: 2 }}>
            {queries.map((q) => {
              const answered = q.status === 'Answered';
              const t = team(q.recipient_role);
              return (
                <Paper key={q.id} sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 2 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="subtitle2" sx={{ fontSize: 15 }}>{q.subject}</Typography>
                      <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                        To {t.label.toLowerCase()} · {formatRelative(q.created_at)}
                      </Typography>
                    </Box>
                    <QueryStatus answered={answered} />
                  </Box>
                  <Box sx={{ display: 'grid', gap: 1.5 }}>
                    <Bubble author="You" time={formatDateTime(q.created_at)} mine>{q.message}</Bubble>
                    {q.response
                      ? <Bubble author={t.label} time={q.updated_at ? formatDateTime(q.updated_at) : null} tone="success">{q.response}</Bubble>
                      : (
                        <Typography variant="caption" sx={{ color: 'text.disabled', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: tones.warning.fg }} />
                          Waiting for {t.short.toLowerCase()} to reply
                        </Typography>
                      )}
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Finance / Owner: inbox grouped by employee ──────────────────────────────
function ManagerView({ user, apiFetch }) {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down('md'));
  const [inbox, setInbox] = useState(user.role === 'ADM' ? 'FIN' : user.role);
  const [queries, setQueries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState({});
  const [replyStatus, setReplyStatus] = useState({});
  const [selectedSender, setSelectedSender] = useState(null);

  const fetchQueries = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/queries?viewAs=${inbox}`);
      if (res.ok) setQueries(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [apiFetch, inbox]);

  useEffect(() => { setLoading(true); setSelectedSender(null); fetchQueries(); }, [fetchQueries]);

  const handleReply = async (id) => {
    if (!replyText[id]?.trim()) return;
    setReplyStatus((prev) => ({ ...prev, [id]: 'loading' }));
    try {
      const res = await apiFetch(`/api/queries/${id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: replyText[id] }),
      });
      if (res.ok) {
        setReplyText((prev) => ({ ...prev, [id]: '' }));
        setReplyStatus((prev) => ({ ...prev, [id]: 'done' }));
        fetchQueries();
      } else {
        setReplyStatus((prev) => ({ ...prev, [id]: 'error' }));
      }
    } catch { setReplyStatus((prev) => ({ ...prev, [id]: 'error' })); }
  };

  // One row per employee, most recent activity first, with their unanswered count
  const senders = useMemo(() => {
    const map = new Map();
    for (const q of queries) {
      const s = map.get(q.employee_id) || { id: q.employee_id, total: 0, open: 0, last: q.created_at, lastSubject: q.subject };
      s.total += 1;
      if (q.status !== 'Answered') s.open += 1;
      if (new Date(q.created_at) > new Date(s.last)) { s.last = q.created_at; s.lastSubject = q.subject; }
      map.set(q.employee_id, s);
    }
    return [...map.values()].sort((a, b) => (b.open > 0) - (a.open > 0) || new Date(b.last) - new Date(a.last));
  }, [queries]);

  // Open the first conversation automatically on wide screens
  useEffect(() => {
    if (!narrow && !selectedSender && senders.length) setSelectedSender(senders[0].id);
  }, [narrow, senders, selectedSender]);

  const thread = queries.filter((q) => q.employee_id === selectedSender).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const totalOpen = queries.filter((q) => q.status !== 'Answered').length;
  const youLabel = `You · ${team(inbox).short}`;

  const list = (
    <Paper sx={{ overflow: 'auto', height: '100%' }}>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0.75 }}>
        {senders.map((s) => {
          const active = selectedSender === s.id;
          return (
            <Box component="li" key={s.id}>
              <Box
                component="button" type="button" onClick={() => setSelectedSender(s.id)}
                sx={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, p: 1.25, border: 0, borderRadius: '10px', textAlign: 'left',
                  font: 'inherit', color: 'inherit', cursor: 'pointer',
                  bgcolor: active ? 'rgba(99,102,241,0.14)' : 'transparent',
                  '&:hover': { bgcolor: active ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.04)' },
                  '&:focus-visible': { outline: 'none', boxShadow: tokens.focusRing },
                }}
              >
                <Avatar sx={{ width: 34, height: 34, fontSize: 12, bgcolor: avatarColor(s.id), color: '#fff' }}>{shortId(s.id).slice(0, 2).toUpperCase()}</Avatar>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: s.open ? 650 : 520, flex: 1 }}>Employee {shortId(s.id)}</Typography>
                    <Typography variant="caption" sx={{ color: 'text.disabled', flexShrink: 0 }}>{formatRelative(s.last)}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="caption" noWrap sx={{ color: s.open ? 'text.secondary' : 'text.disabled', flex: 1 }}>{s.lastSubject}</Typography>
                    {s.open > 0 && (
                      <Box sx={{ minWidth: 18, height: 18, px: 0.5, borderRadius: 99, bgcolor: tokens.accent, color: '#fff', fontSize: 11, fontWeight: 700, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        {s.open}
                      </Box>
                    )}
                  </Box>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );

  const conversation = selectedSender ? (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Box sx={{ px: 2.5, py: 1.75, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: `1px solid ${tokens.border}` }}>
        {narrow && <IconButton size="small" onClick={() => setSelectedSender(null)} aria-label="Back to list"><ArrowBackRounded fontSize="small" /></IconButton>}
        <Avatar sx={{ width: 30, height: 30, fontSize: 11.5, bgcolor: avatarColor(selectedSender), color: '#fff' }}>{shortId(selectedSender).slice(0, 2).toUpperCase()}</Avatar>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2">Employee {shortId(selectedSender)}</Typography>
          <Typography variant="caption" sx={{ color: 'text.disabled' }}>{thread.length} message{thread.length !== 1 ? 's' : ''}</Typography>
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflowY: 'auto', p: 2.5, display: 'grid', gap: 3, alignContent: 'start' }}>
        {thread.map((q) => (
          <Box key={q.id} sx={{ display: 'grid', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="subtitle2">{q.subject}</Typography>
              <QueryStatus answered={q.status === 'Answered'} />
            </Box>
            <Bubble author={`Employee ${shortId(q.employee_id)}`} time={formatDateTime(q.created_at)}>{q.message}</Bubble>
            {q.response ? (
              <Bubble author={youLabel} time={q.updated_at ? formatDateTime(q.updated_at) : null} mine>{q.response}</Bubble>
            ) : (
              <Box>
                <TextField
                  size="small" fullWidth multiline maxRows={6}
                  placeholder="Reply… (Enter to send)"
                  value={replyText[q.id] || ''}
                  onChange={(e) => setReplyText((prev) => ({ ...prev, [q.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(q.id); } }}
                  inputProps={{ 'aria-label': `Reply to ${q.subject}` }}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          size="small" color="primary" aria-label="Send reply"
                          disabled={replyStatus[q.id] === 'loading' || !replyText[q.id]?.trim()}
                          onClick={() => handleReply(q.id)}
                        >
                          {replyStatus[q.id] === 'loading' ? <CircularProgress size={16} /> : <SendRounded fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                {replyStatus[q.id] === 'error' && <Typography variant="caption" sx={{ color: tones.danger.fg, mt: 0.5, display: 'block' }}>Couldn't send the reply. Try again.</Typography>}
              </Box>
            )}
          </Box>
        ))}
      </Box>
    </Paper>
  ) : (
    <Paper sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
      <EmptyState icon={<ForumRounded />} title="Pick a conversation" description="Choose an employee on the left to read and reply." compact />
    </Paper>
  );

  return (
    <Box>
      <PageHeader
        title="Employee queries"
        subtitle={loading ? 'Messages employees have sent to you.' : `${queries.length} message${queries.length !== 1 ? 's' : ''} from ${senders.length} employee${senders.length !== 1 ? 's' : ''}${totalOpen ? ` · ${totalOpen} awaiting your reply` : ''}`}
        actions={user.role === 'ADM' && (
          <ToggleButtonGroup size="small" exclusive value={inbox} onChange={(e, v) => v && setInbox(v)} aria-label="Inbox">
            <ToggleButton value="FIN">Finance inbox</ToggleButton>
            <ToggleButton value="OWN">Owner inbox</ToggleButton>
          </ToggleButtonGroup>
        )}
      />

      {loading && <Skeleton variant="rounded" height={420} />}

      {!loading && queries.length === 0 && (
        <Paper><EmptyState icon={<InboxRounded />} title="Inbox zero" description="When employees send a question to you, it will show up here." /></Paper>
      )}

      {!loading && queries.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px minmax(0, 1fr)' }, gap: 2, height: { md: 'calc(100vh - 230px)' }, minHeight: { md: 480 } }}>
          {(!narrow || !selectedSender) && list}
          {(!narrow || selectedSender) && conversation}
        </Box>
      )}
    </Box>
  );
}

// ─── Router ───────────────────────────────────────────────────────────────────
const EmployeeDashboard = () => {
  const { user } = useSelector((state) => state.auth);
  const { apiFetch } = useApi();

  if (!user) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;

  return (
    <Box sx={{ pb: 4 }}>
      {MANAGER_ROLES.includes(user.role)
        ? <ManagerView user={user} apiFetch={apiFetch} />
        : <EmployeeView apiFetch={apiFetch} />}
    </Box>
  );
};

export default EmployeeDashboard;
