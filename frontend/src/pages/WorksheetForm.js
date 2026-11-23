import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, TextField, Button, Alert, Rating, Slider, CircularProgress, Skeleton,
  ToggleButtonGroup, ToggleButton, Tooltip,
} from '@mui/material';
import {
  SendRounded, AssignmentRounded, CheckCircleOutlineRounded, AutorenewRounded, BlockRounded, EventRounded,
  SentimentVeryDissatisfiedRounded, SentimentDissatisfiedRounded, SentimentNeutralRounded,
  SentimentSatisfiedRounded, SentimentVerySatisfiedRounded, BoltRounded, ScheduleRounded,
} from '@mui/icons-material';
import { useApi } from '../hooks/useApi';
import { PageHeader, ToneChip, EmptyState, SectionLabel } from '../components/ui';
import { tokens, tones } from '../theme';
import { formatDate, localToday } from '../utils/format';

export const MOODS = [
  { value: 1, label: 'Rough', Icon: SentimentVeryDissatisfiedRounded, color: '#F87171' },
  { value: 2, label: 'Meh', Icon: SentimentDissatisfiedRounded, color: '#FB923C' },
  { value: 3, label: 'Okay', Icon: SentimentNeutralRounded, color: '#FBBF24' },
  { value: 4, label: 'Good', Icon: SentimentSatisfiedRounded, color: '#34D399' },
  { value: 5, label: 'Great', Icon: SentimentVerySatisfiedRounded, color: '#818CF8' },
];

const FIELDS = [
  { key: 'tasks_completed', label: 'Done today', placeholder: 'What did you finish?', Icon: CheckCircleOutlineRounded, rows: 3, required: true },
  { key: 'tasks_in_progress', label: 'In progress', placeholder: "What's still ongoing?", Icon: AutorenewRounded, rows: 2 },
  { key: 'blockers', label: 'Blockers', placeholder: 'Anything slowing you down, or help you need?', Icon: BlockRounded, rows: 2 },
  { key: 'tomorrow_plan', label: 'Plan for tomorrow', placeholder: "What's next?", Icon: EventRounded, rows: 2 },
];

function SheetLine({ Icon, label, text, tone }) {
  if (!text) return null;
  return (
    <Box sx={{ display: 'flex', gap: 1.25 }}>
      <Icon sx={{ fontSize: 17, mt: '2px', color: tone ? tones[tone].fg : 'text.disabled', flexShrink: 0 }} />
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" sx={{ color: tone ? tones[tone].fg : 'text.disabled', fontWeight: 600 }}>{label}</Typography>
        <Typography variant="body2" sx={{ color: 'text.primary', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{text}</Typography>
      </Box>
    </Box>
  );
}

const WorksheetForm = () => {
  const { apiFetch } = useApi();

  const [form, setForm] = useState({
    date: localToday(),
    tasks_completed: '',
    tasks_in_progress: '',
    blockers: '',
    tomorrow_plan: '',
    productivity: 4,
    hours_worked: 8,
    mood: 3,
  });
  const [mySheets, setMySheets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState(null);

  const fetchMySheets = useCallback(async () => {
    try {
      const res = await apiFetch('/api/worksheets');
      if (res.ok) setMySheets(await res.json());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [apiFetch]);

  useEffect(() => { fetchMySheets(); }, [fetchMySheets]);

  const handle = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.tasks_completed.trim()) { setStatus({ type: 'error', msg: 'Add at least one thing you finished today.' }); return; }
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await apiFetch('/api/worksheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setStatus({ type: 'success', msg: 'Submitted. Your manager can see it now.' });
        setForm((prev) => ({ ...prev, tasks_completed: '', tasks_in_progress: '', blockers: '', tomorrow_plan: '' }));
        fetchMySheets();
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus({ type: 'error', msg: err.error || 'Submission failed. Please try again.' });
      }
    } catch { setStatus({ type: 'error', msg: 'Network error. Please try again.' }); }
    finally { setSubmitting(false); }
  };

  const submittedToday = mySheets.some((s) => s.date === localToday());

  return (
    <Box sx={{ pb: 4 }}>
      <PageHeader
        title="Daily worksheet"
        subtitle="A two-minute update on what you did today. It goes to the owner and admins."
        actions={!loading && (submittedToday
          ? <ToneChip tone="success" label="Today's update is in" icon={<CheckCircleOutlineRounded />} />
          : <ToneChip tone="warning" label="Not submitted today" icon={<ScheduleRounded />} />)}
      />

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '400px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
        {/* Form */}
        <Paper component="form" onSubmit={handleSubmit} sx={{ p: 2.75, position: { md: 'sticky' }, top: { md: 80 }, display: 'grid', gap: 2.25 }}>
          <TextField type="date" label="Date" value={form.date} fullWidth onChange={handle('date')} InputLabelProps={{ shrink: true }} />

          {FIELDS.map((f) => (
            <TextField
              key={f.key} label={f.label} required={f.required} multiline minRows={f.rows} fullWidth
              value={form[f.key]} onChange={handle(f.key)} placeholder={f.placeholder}
            />
          ))}

          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>Hours worked</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, fontFeatureSettings: '"tnum"' }}>{form.hours_worked}h</Typography>
            </Box>
            <Slider
              value={form.hours_worked} min={1} max={12} step={0.5} aria-label="Hours worked"
              onChange={(_, v) => setForm((prev) => ({ ...prev, hours_worked: v }))}
              marks={[{ value: 4, label: '4h' }, { value: 8, label: '8h' }, { value: 12, label: '12h' }]}
              sx={{ mt: 0.5, '& .MuiSlider-markLabel': { fontSize: 11, color: 'text.disabled' } }}
            />
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Productivity</Typography>
            <Rating
              value={form.productivity} max={5}
              onChange={(_, v) => v && setForm((prev) => ({ ...prev, productivity: v }))}
              icon={<BoltRounded fontSize="inherit" />} emptyIcon={<BoltRounded fontSize="inherit" />}
              sx={{ '& .MuiRating-iconFilled': { color: tokens.accentSoft }, '& .MuiRating-iconEmpty': { color: 'rgba(255,255,255,0.14)' } }}
            />
          </Box>

          <Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>How was today?</Typography>
            <ToggleButtonGroup
              exclusive fullWidth value={form.mood} aria-label="Mood"
              onChange={(_, v) => v && setForm((prev) => ({ ...prev, mood: v }))}
            >
              {MOODS.map((m) => (
                <ToggleButton key={m.value} value={m.value} aria-label={m.label} sx={{ flexDirection: 'column', gap: 0.25, py: 0.9, '&.Mui-selected, &.Mui-selected:hover': { color: m.color, bgcolor: `${m.color}1F` } }}>
                  <m.Icon sx={{ fontSize: 22 }} />
                  <Box component="span" sx={{ fontSize: 11 }}>{m.label}</Box>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          <Button
            type="submit" variant="contained" fullWidth size="large" disabled={submitting}
            endIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SendRounded />}
          >
            {submitting ? 'Submitting…' : 'Submit update'}
          </Button>

          {status && <Alert severity={status.type} onClose={() => setStatus(null)}>{status.msg}</Alert>}
        </Paper>

        {/* History */}
        <Box sx={{ minWidth: 0 }}>
          <SectionLabel>Your past updates{!loading && mySheets.length ? ` · ${mySheets.length}` : ''}</SectionLabel>

          {loading && <Box sx={{ display: 'grid', gap: 2 }}>{[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={120} />)}</Box>}

          {!loading && mySheets.length === 0 && (
            <Paper><EmptyState icon={<AssignmentRounded />} title="No updates yet" description="Your daily updates will build up here so you can look back on your week." /></Paper>
          )}

          <Box sx={{ display: 'grid', gap: 2 }}>
            {mySheets.map((s) => {
              const mood = MOODS.find((m) => m.value === Number(s.mood));
              return (
                <Paper key={s.id} sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1.75, flexWrap: 'wrap' }}>
                    <Typography variant="subtitle2" sx={{ fontSize: 15 }}>{formatDate(s.date)}</Typography>
                    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'center' }}>
                      {mood && (
                        <Tooltip title={`Mood: ${mood.label}`}>
                          <mood.Icon sx={{ fontSize: 20, color: mood.color }} />
                        </Tooltip>
                      )}
                      <ToneChip tone="info" label={`${s.hours_worked}h`} icon={<ScheduleRounded />} />
                      <ToneChip tone="accent" label={`${s.productivity}/5`} icon={<BoltRounded />} />
                    </Box>
                  </Box>
                  <Box sx={{ display: 'grid', gap: 1.25 }}>
                    <SheetLine Icon={CheckCircleOutlineRounded} label="Done" text={s.tasks_completed} tone="success" />
                    <SheetLine Icon={AutorenewRounded} label="In progress" text={s.tasks_in_progress} />
                    <SheetLine Icon={BlockRounded} label="Blocked" text={s.blockers} tone="danger" />
                    <SheetLine Icon={EventRounded} label="Tomorrow" text={s.tomorrow_plan} />
                  </Box>
                </Paper>
              );
            })}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default WorksheetForm;
