// Shared display helpers so every page formats money, dates and names the same way.

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
const inrCompact = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact', maximumFractionDigits: 1 });

/** ₹1,23,456.5 — Indian grouping, no trailing zeros for whole rupees. */
export const formatINR = (value) => {
  const n = Number(value);
  return inr.format(Number.isFinite(n) ? n : 0);
};

/** ₹1.2L / ₹3.4Cr — for stat cards where space is tight. */
export const formatINRCompact = (value) => {
  const n = Number(value);
  return inrCompact.format(Number.isFinite(n) ? n : 0);
};

/**
 * Parse API timestamps. SQLite's datetime('now') gives "2026-11-23 19:52:10" in UTC with no zone
 * marker, which browsers would read as local time, so zone-less date-times are treated as UTC.
 * Plain dates ("2026-11-23") stay local midnight.
 */
export const toDate = (value) => {
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
    if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)) return new Date(`${value.replace(' ', 'T')}Z`);
  }
  return new Date(value);
};

/** Today as YYYY-MM-DD in the user's own timezone (toISOString would give the UTC date). */
export const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** 12 Nov 2026 */
export const formatDate = (value) => {
  if (!value) return '—';
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** 12 Nov 2026, 4:05 pm */
export const formatDateTime = (value) => {
  if (!value) return '—';
  const d = toDate(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

/** "3h ago", "2d ago" — falls back to a date after a week. */
export const formatRelative = (value) => {
  if (!value) return '';
  const d = toDate(value);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (Number.isNaN(diff)) return '';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return formatDate(value);
};

export const initials = (name) =>
  String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '?';

/** Status messages from upload handlers carry a ✅ / ❌ prefix; turn that into an Alert tone and clean text. */
export const parseMsg = (m) => ({
  tone: !m ? 'info' : m.startsWith('✅') ? 'success' : m.startsWith('❌') ? 'error' : 'info',
  text: (m || '').replace(/^(✅|❌)\s*/u, ''),
});

export const parseMetadata = (req) => {
  try {
    return req && req.metadata ? JSON.parse(req.metadata) : null;
  } catch {
    return null;
  }
};
