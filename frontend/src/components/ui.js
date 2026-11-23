import React from 'react';
import { Box, Typography, Paper, Chip, Avatar, Tooltip, Skeleton, LinearProgress } from '@mui/material';
import { CheckRounded, CheckCircleRounded, RadioButtonUncheckedRounded, CloudUploadRounded } from '@mui/icons-material';
import { tokens, tones } from '../theme';
import { statusMeta, roleMeta, PIPELINE, pipelineIndex } from '../utils/status';
import { initials, formatINR, formatRelative } from '../utils/format';

// ─────────────────────────────────────────────────────────────────────────────
// Small, composable building blocks shared by every page. Keep visual decisions
// here so pages describe *what* they show, not how it is styled.
// ─────────────────────────────────────────────────────────────────────────────

/** Page title row: title, one-line description and right-aligned actions. */
export function PageHeader({ title, subtitle, eyebrow, actions, sx }) {
  return (
    <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'flex-end' }, justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 3.5, ...sx }}>
      <Box sx={{ minWidth: 0 }}>
        {eyebrow && (
          <Typography variant="overline" sx={{ color: tokens.accentSoft, display: 'block', mb: 0.5 }}>
            {eyebrow}
          </Typography>
        )}
        <Typography variant="h4" component="h1">{title}</Typography>
        {subtitle && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75, maxWidth: 680 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>{actions}</Box>}
    </Box>
  );
}

/** Soft tinted pill in one of the semantic tones. */
export function ToneChip({ tone = 'neutral', label, icon, size = 'small', sx, ...rest }) {
  const t = tones[tone] || tones.neutral;
  return (
    <Chip
      size={size}
      icon={icon}
      label={label}
      sx={{
        bgcolor: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        '& .MuiChip-icon': { color: t.fg, fontSize: 15 },
        ...sx,
      }}
      {...rest}
    />
  );
}

/** The one status chip used everywhere a request status is shown. */
export function StatusChip({ status, size = 'small', variant = 'label', sx }) {
  const m = statusMeta(status);
  const { Icon } = m;
  return (
    <Tooltip title={m.hint} disableHoverListener={!m.hint}>
      <span>
        <ToneChip tone={m.tone} size={size} icon={<Icon />} label={variant === 'short' ? m.short : m.label} sx={{ fontWeight: 600, ...sx }} />
      </span>
    </Tooltip>
  );
}

export function RoleChip({ role, size = 'small', sx }) {
  const m = roleMeta(role);
  const { Icon } = m;
  return <ToneChip tone={m.tone} size={size} icon={<Icon />} label={m.label} sx={sx} />;
}

/** Bordered surface with optional header row. */
export function Surface({ title, subtitle, action, children, padding = 3, sx, contentSx }) {
  return (
    <Paper sx={{ overflow: 'hidden', ...sx }}>
      {(title || action) && (
        <Box sx={{ px: padding, pt: padding - 0.5, pb: 2, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            {title && <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 600 }}>{title}</Typography>}
            {subtitle && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25 }}>{subtitle}</Typography>}
          </Box>
          {action}
        </Box>
      )}
      <Box sx={{ px: padding, pb: padding, pt: title || action ? 0 : padding, ...contentSx }}>{children}</Box>
    </Paper>
  );
}

/** Numbered form section: "1  Upload invoice" with description and status badge. */
export function SectionCard({ step, title, description, badge, complete, children, id, sx }) {
  return (
    <Paper id={id} component="section" sx={{ p: { xs: 2.5, sm: 3.5 }, scrollMarginTop: 88, ...sx }}>
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', mb: 3 }}>
        {step != null && (
          <Box
            aria-hidden
            sx={{
              width: 30, height: 30, borderRadius: '9px', flexShrink: 0, display: 'grid', placeItems: 'center',
              fontSize: 13, fontWeight: 700, fontFeatureSettings: '"tnum"',
              color: complete ? '#052E1F' : tokens.accentSoft,
              bgcolor: complete ? '#34D399' : 'rgba(99,102,241,0.14)',
              border: `1px solid ${complete ? 'transparent' : 'rgba(99,102,241,0.3)'}`,
              transition: 'all .2s ease',
            }}
          >
            {complete ? <CheckRounded sx={{ fontSize: 18 }} /> : step}
          </Box>
        )}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
            <Typography variant="h6" component="h2">{title}</Typography>
            {badge}
          </Box>
          {description && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>{description}</Typography>}
        </Box>
      </Box>
      {children}
    </Paper>
  );
}

/** Headline number with label, optional icon and sub-line. */
export function StatCard({ label, value, icon, tone = 'accent', hint, loading, onClick, active }) {
  const t = tones[tone] || tones.accent;
  return (
    <Paper
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      sx={{
        p: 2.25, position: 'relative', overflow: 'hidden', cursor: onClick ? 'pointer' : 'default',
        borderColor: active ? t.border : tokens.border,
        bgcolor: active ? t.bg : 'background.paper',
        transition: 'border-color .15s ease, background-color .15s ease, transform .15s ease',
        '&:hover': onClick ? { borderColor: t.border } : undefined,
        '&:focus-visible': { outline: 'none', boxShadow: tokens.focusRing },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 540 }}>{label}</Typography>
        {icon && (
          <Box sx={{ width: 28, height: 28, borderRadius: '8px', display: 'grid', placeItems: 'center', bgcolor: t.bg, color: t.fg, '& svg': { fontSize: 17 } }}>
            {icon}
          </Box>
        )}
      </Box>
      {loading ? (
        <Skeleton width="60%" height={34} />
      ) : (
        <Typography sx={{ fontSize: '1.625rem', fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.15, fontFeatureSettings: '"tnum"' }}>
          {value}
        </Typography>
      )}
      {hint && <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mt: 0.5 }}>{hint}</Typography>}
    </Paper>
  );
}

/** Centered, friendly message for empty lists. */
export function EmptyState({ icon, title, description, action, compact }) {
  return (
    <Box sx={{ textAlign: 'center', py: compact ? 4 : 7, px: 3 }}>
      {icon && (
        <Box sx={{ width: 48, height: 48, mx: 'auto', mb: 2, borderRadius: '14px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.04)', border: `1px solid ${tokens.border}`, color: 'text.secondary', '& svg': { fontSize: 24 } }}>
          {icon}
        </Box>
      )}
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{title}</Typography>
      {description && <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5, maxWidth: 380, mx: 'auto' }}>{description}</Typography>}
      {action && <Box sx={{ mt: 2.5 }}>{action}</Box>}
    </Box>
  );
}

/** Label above value — for read-only detail grids. */
export function KeyValue({ label, value, mono, strong, sx }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <Box sx={{ minWidth: 0, ...sx }}>
      <Typography variant="caption" sx={{ color: 'text.disabled', display: 'block', mb: 0.25 }}>{label}</Typography>
      <Typography
        variant="body2"
        sx={{
          color: empty ? 'text.disabled' : 'text.primary',
          fontWeight: strong ? 600 : 450,
          fontFamily: mono ? tokens.mono : undefined,
          fontSize: mono ? '0.8125rem' : undefined,
          wordBreak: 'break-word',
        }}
      >
        {empty ? '—' : value}
      </Typography>
    </Box>
  );
}

/** Small uppercase group heading inside cards and drawers. */
export function SectionLabel({ children, sx }) {
  return <Typography variant="overline" component="h3" sx={{ color: 'text.disabled', display: 'block', mb: 1.25, ...sx }}>{children}</Typography>;
}

/** Name with a deterministic coloured avatar. */
const AVATAR_COLORS = ['#6366F1', '#8B5CF6', '#0EA5E9', '#10B981', '#F59E0B', '#EC4899', '#14B8A6', '#F97316'];
export const avatarColor = (name) => {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

export function Person({ name, sub, size = 26 }) {
  if (!name) return <Typography variant="body2" sx={{ color: 'text.disabled' }}>—</Typography>;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Avatar sx={{ width: size, height: size, fontSize: size * 0.42, bgcolor: avatarColor(name), color: '#fff' }}>{initials(name)}</Avatar>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 520, lineHeight: 1.3 }}>{name}</Typography>
        {sub && <Typography variant="caption" noWrap sx={{ color: 'text.disabled', display: 'block', lineHeight: 1.3 }}>{sub}</Typography>}
      </Box>
    </Box>
  );
}

/** Monospace identifier (request IDs, invoice codes, project codes). */
export function Code({ children, sx, muted }) {
  return (
    <Box component="span" sx={{ fontFamily: tokens.mono, fontSize: '0.78rem', color: muted ? 'text.secondary' : 'text.primary', letterSpacing: '-0.01em', ...sx }}>
      {children}
    </Box>
  );
}

/** Compact horizontal progress through the approval pipeline. */
export function PipelineProgress({ status, showLabels = false, sx }) {
  const rejected = status === 'REJ';
  const idx = pipelineIndex(status);
  return (
    <Box sx={{ ...sx }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }} aria-label={`Progress: ${statusMeta(status).label}`}>
        {PIPELINE.map((p, i) => {
          const done = !rejected && i <= idx;
          const current = !rejected && i === idx + 1;
          return (
            <Box
              key={p.key}
              sx={{
                flex: 1, height: 5, borderRadius: 99, minWidth: 14,
                bgcolor: rejected ? 'rgba(239,68,68,0.35)' : done ? '#10B981' : current ? tokens.accent : 'rgba(255,255,255,0.08)',
                boxShadow: current ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none',
              }}
            />
          );
        })}
      </Box>
      {showLabels && (
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75 }}>
          {PIPELINE.map((p, i) => (
            <Typography key={p.key} variant="caption" sx={{ flex: 1, fontSize: 11, color: !rejected && i <= idx + 1 ? 'text.secondary' : 'text.disabled' }}>
              {p.label}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
}

/** Large stepper used in detail views: dots, connectors and labels with who/when. */
export function PipelineStepper({ status, events = {} }) {
  const rejected = status === 'REJ';
  const idx = pipelineIndex(status);
  return (
    <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
      {PIPELINE.map((p, i) => {
        const done = !rejected && i <= idx;
        const current = !rejected && i === idx + 1;
        const ev = events[p.key];
        return (
          <React.Fragment key={p.key}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', width: 88, flexShrink: 0 }}>
              <Box
                sx={{
                  width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  bgcolor: done ? '#10B981' : current ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.05)',
                  border: `1.5px solid ${done ? '#10B981' : current ? tokens.accent : tokens.borderStrong}`,
                  color: done ? '#052E1F' : current ? tokens.accentSoft : 'text.disabled',
                  fontSize: 12, fontWeight: 700,
                }}
              >
                {done ? <CheckRounded sx={{ fontSize: 16 }} /> : i + 1}
              </Box>
              <Typography variant="caption" sx={{ mt: 0.75, fontWeight: 560, color: done || current ? 'text.primary' : 'text.disabled', lineHeight: 1.3 }}>
                {p.label}
              </Typography>
              {ev && <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: 11, lineHeight: 1.3 }}>{ev}</Typography>}
            </Box>
            {i < PIPELINE.length - 1 && (
              <Box sx={{ flex: 1, height: 1.5, mt: '12px', bgcolor: done ? '#10B981' : tokens.borderStrong, minWidth: 12 }} />
            )}
          </React.Fragment>
        );
      })}
    </Box>
  );
}

/**
 * Form progress card: a bar plus one row per section. Rows scroll to their section.
 * items: [{ key, label, anchor }], done: { [key]: boolean }
 */
export function ChecklistCard({ items, done, title = 'Checklist' }) {
  const count = items.filter((c) => done[c.key]).length;
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <Paper sx={{ p: 2.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
        <Typography variant="subtitle2">{title}</Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontFeatureSettings: '"tnum"' }}>{count} of {items.length}</Typography>
      </Box>
      <LinearProgress variant="determinate" value={(count / items.length) * 100} color={count === items.length ? 'success' : 'primary'} sx={{ mb: 1.75 }} />
      <Box component="ul" sx={{ listStyle: 'none', p: 0, m: 0, display: 'grid', gap: 0.25 }}>
        {items.map((c) => (
          <Box component="li" key={c.key}>
            <Box
              component="button" type="button" onClick={() => scrollTo(c.anchor)}
              sx={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 1.25, px: 1, py: 0.75, border: 0, borderRadius: '8px',
                bgcolor: 'transparent', color: done[c.key] ? 'text.secondary' : 'text.primary', cursor: 'pointer', font: 'inherit', fontSize: 13.5, textAlign: 'left',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' }, '&:focus-visible': { outline: 'none', boxShadow: tokens.focusRing },
              }}
            >
              {done[c.key]
                ? <CheckCircleRounded sx={{ fontSize: 18, color: '#34D399' }} />
                : <RadioButtonUncheckedRounded sx={{ fontSize: 18, color: 'text.disabled' }} />}
              <Box component="span" sx={{ flex: 1, textDecoration: done[c.key] ? 'line-through' : 'none', textDecorationColor: 'rgba(255,255,255,0.25)' }}>{c.label}</Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

/** Dashed drop zone for a single file. Calls onFile(file). */
export function FileDropZone({ onFile, title, hint, accept = 'image/*,.webp,.heic,.heif,.pdf', disabled }) {
  const [over, setOver] = React.useState(false);
  return (
    <Box
      component="label"
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !disabled) onFile(f); }}
      sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: disabled ? 'default' : 'pointer',
        px: 3, py: 4.5, borderRadius: `${tokens.radius.lg}px`, border: '1.5px dashed',
        borderColor: over ? tokens.accent : tokens.borderStrong,
        bgcolor: over ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.015)',
        opacity: disabled ? 0.6 : 1,
        transition: 'all .15s ease',
        '&:hover': disabled ? undefined : { borderColor: 'rgba(99,102,241,0.6)', bgcolor: 'rgba(99,102,241,0.05)' },
        '&:focus-within': { boxShadow: tokens.focusRing },
      }}
    >
      <input type="file" hidden accept={accept} disabled={disabled} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      <Box sx={{ width: 44, height: 44, borderRadius: '12px', display: 'grid', placeItems: 'center', mb: 1.5, bgcolor: 'rgba(99,102,241,0.14)', color: tokens.accentSoft }}>
        <CloudUploadRounded />
      </Box>
      <Typography variant="subtitle2">{title || 'Drop a file here, or '}<Box component="span" sx={{ color: tokens.accentSoft }}>browse</Box></Typography>
      <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5 }}>{hint || 'PDF, JPG, PNG, WEBP or HEIC · up to 10 MB'}</Typography>
    </Box>
  );
}

/**
 * Phone layout for request tables: one tappable row per request.
 * `renderAside(row)` can replace the default right-hand amount (e.g. an action hint).
 */
export function RequestCardList({ rows, loading, onSelect, renderAside }) {
  if (loading) {
    return <Box sx={{ p: 2, display: 'grid', gap: 1.5 }}>{[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={68} />)}</Box>;
  }
  return (
    <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {rows.map((row) => (
        <Box component="li" key={row.id} sx={{ '& + &': { borderTop: `1px solid ${tokens.border}` } }}>
          <Box
            component="button" type="button" onClick={() => onSelect(row)}
            sx={{
              width: '100%', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1.5, alignItems: 'center',
              px: 2, py: 1.75, border: 0, bgcolor: 'transparent', color: 'inherit', font: 'inherit', textAlign: 'left', cursor: 'pointer',
              '&:active': { bgcolor: 'rgba(255,255,255,0.04)' }, '&:focus-visible': { outline: 'none', boxShadow: `inset ${tokens.focusRing}` },
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap sx={{ fontWeight: 560 }}>{row.purpose}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.75 }}>
                <StatusChip status={row.status} />
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>{formatRelative(row.ts)}</Typography>
              </Box>
            </Box>
            {renderAside ? renderAside(row) : (
              <Typography variant="body2" sx={{ fontWeight: 650, fontFeatureSettings: '"tnum"', whiteSpace: 'nowrap' }}>{formatINR(row.amount)}</Typography>
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/** Brand mark used in the sidebar and on sign-in screens. */
export function BrandMark({ size = 32 }) {
  return (
    <Box
      aria-hidden
      sx={{
        width: size, height: size, borderRadius: size * 0.3, flexShrink: 0,
        background: 'linear-gradient(140deg, #8B8DF8 0%, #6366F1 45%, #4338CA 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 14px -4px rgba(99,102,241,0.7)',
        display: 'grid', placeItems: 'center',
      }}
    >
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none">
        <path d="M5 18.5 11.2 5.2c.3-.6 1.2-.6 1.5 0L19 18.5" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8.2 13.6h7.6" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    </Box>
  );
}
