import { createTheme, alpha } from '@mui/material/styles';

// ─────────────────────────────────────────────────────────────────────────────
// Design tokens — one source for colour, radius, type and elevation.
// Components should use theme values (or these tokens) instead of raw hex codes.
// ─────────────────────────────────────────────────────────────────────────────
export const tokens = {
  bg: '#0A0C12',          // app canvas
  surface: '#10131B',     // cards, sidebar
  surfaceRaised: '#151925', // menus, dialogs, hovered rows
  surfaceSunken: '#0D1017', // inputs, wells
  border: 'rgba(255,255,255,0.07)',
  borderStrong: 'rgba(255,255,255,0.12)',
  text: '#F3F4F7',
  textMuted: '#A3A9B6',
  textSubtle: '#6E7584',
  accent: '#6366F1',
  accentSoft: '#818CF8',
  radius: { sm: 8, md: 10, lg: 14, xl: 18 },
  font: '"Geist", "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  focusRing: '0 0 0 3px rgba(99,102,241,0.35)',
};

// Semantic tones used by status chips, stat cards and alerts
export const tones = {
  neutral: { fg: '#C3C8D2', bg: 'rgba(148,163,184,0.10)', border: 'rgba(148,163,184,0.22)' },
  accent:  { fg: '#A5B4FC', bg: 'rgba(99,102,241,0.12)',  border: 'rgba(99,102,241,0.30)' },
  violet:  { fg: '#C4B5FD', bg: 'rgba(139,92,246,0.12)',  border: 'rgba(139,92,246,0.30)' },
  info:    { fg: '#7DD3FC', bg: 'rgba(56,189,248,0.10)',  border: 'rgba(56,189,248,0.28)' },
  success: { fg: '#6EE7B7', bg: 'rgba(16,185,129,0.11)',  border: 'rgba(16,185,129,0.30)' },
  warning: { fg: '#FCD34D', bg: 'rgba(245,158,11,0.11)',  border: 'rgba(245,158,11,0.30)' },
  danger:  { fg: '#FCA5A5', bg: 'rgba(239,68,68,0.11)',   border: 'rgba(239,68,68,0.30)' },
};

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: tokens.accent, light: tokens.accentSoft, dark: '#4F46E5', contrastText: '#FFFFFF' },
    secondary: { main: '#8B5CF6', light: '#A78BFA', dark: '#7C3AED', contrastText: '#FFFFFF' },
    success: { main: '#10B981', light: '#34D399', dark: '#059669' },
    warning: { main: '#F59E0B', light: '#FBBF24', dark: '#D97706' },
    error: { main: '#EF4444', light: '#F87171', dark: '#DC2626' },
    info: { main: '#38BDF8', light: '#7DD3FC', dark: '#0284C7' },
    background: { default: tokens.bg, paper: tokens.surface },
    text: { primary: tokens.text, secondary: tokens.textMuted, disabled: tokens.textSubtle },
    divider: tokens.border,
    action: {
      hover: 'rgba(255,255,255,0.04)',
      selected: 'rgba(99,102,241,0.12)',
      focus: 'rgba(99,102,241,0.16)',
      disabledBackground: 'rgba(255,255,255,0.06)',
      disabled: 'rgba(255,255,255,0.32)',
    },
  },
  shape: { borderRadius: tokens.radius.md },
  typography: {
    fontFamily: tokens.font,
    fontSize: 14,
    h1: { fontWeight: 650, letterSpacing: '-0.035em' },
    h2: { fontWeight: 650, letterSpacing: '-0.03em' },
    h3: { fontWeight: 650, letterSpacing: '-0.03em', fontSize: '2rem' },
    h4: { fontWeight: 650, letterSpacing: '-0.025em', fontSize: '1.625rem', lineHeight: 1.25 },
    h5: { fontWeight: 620, letterSpacing: '-0.02em', fontSize: '1.25rem', lineHeight: 1.3 },
    h6: { fontWeight: 600, letterSpacing: '-0.015em', fontSize: '1.0625rem', lineHeight: 1.35 },
    subtitle1: { fontWeight: 560, letterSpacing: '-0.01em' },
    subtitle2: { fontWeight: 600, letterSpacing: '-0.005em', fontSize: '0.875rem' },
    body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.55 },
    caption: { fontSize: '0.78rem', lineHeight: 1.45, letterSpacing: '0.005em' },
    overline: { fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.08em', lineHeight: 1.6 },
    button: { textTransform: 'none', fontWeight: 560, letterSpacing: '-0.005em' },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': { colorScheme: 'dark' },
        html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'optimizeLegibility' },
        body: {
          backgroundColor: tokens.bg,
          fontFeatureSettings: '"cv11", "ss01", "tnum"',
          backgroundImage: 'radial-gradient(1200px 600px at 85% -10%, rgba(99,102,241,0.07), transparent 60%)',
          backgroundAttachment: 'fixed',
        },
        '::selection': { background: 'rgba(99,102,241,0.35)' },
        '*': { scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.14) transparent' },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': { background: 'rgba(255,255,255,0.12)', borderRadius: 10, border: '2px solid transparent', backgroundClip: 'content-box' },
        '*::-webkit-scrollbar-thumb:hover': { background: 'rgba(255,255,255,0.22)', backgroundClip: 'content-box' },
        'code, kbd, .mono': { fontFamily: tokens.mono },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': { animationDuration: '0.01ms !important', transitionDuration: '0.01ms !important' },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          borderRadius: tokens.radius.lg,
          border: `1px solid ${tokens.border}`,
        },
      },
    },
    MuiCard: { defaultProps: { elevation: 0 } },
    MuiButtonBase: { defaultProps: { disableRipple: true } },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.md,
          padding: '8px 16px',
          minHeight: 38,
          transition: 'background-color .15s ease, border-color .15s ease, box-shadow .15s ease, transform .05s ease',
          '&:active': { transform: 'translateY(0.5px)' },
          '&.Mui-focusVisible': { boxShadow: tokens.focusRing },
        },
        sizeSmall: { padding: '5px 12px', minHeight: 32, fontSize: '0.8125rem' },
        sizeLarge: { padding: '11px 22px', minHeight: 46, fontSize: '0.9375rem' },
        containedPrimary: {
          background: 'linear-gradient(180deg, #6E70F4 0%, #5B5EEA 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), 0 1px 2px rgba(0,0,0,0.4)',
          '&:hover': { background: 'linear-gradient(180deg, #7779F6 0%, #6366F1 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 6px 18px -6px rgba(99,102,241,0.6)' },
        },
        outlined: {
          borderColor: tokens.borderStrong,
          color: tokens.text,
          '&:hover': { borderColor: 'rgba(255,255,255,0.22)', backgroundColor: 'rgba(255,255,255,0.04)' },
        },
        outlinedError: { color: '#FCA5A5', borderColor: 'rgba(239,68,68,0.4)', '&:hover': { borderColor: '#EF4444', backgroundColor: 'rgba(239,68,68,0.08)' } },
        outlinedSuccess: { color: '#6EE7B7', borderColor: 'rgba(16,185,129,0.4)', '&:hover': { borderColor: '#10B981', backgroundColor: 'rgba(16,185,129,0.08)' } },
        outlinedWarning: { color: '#FCD34D', borderColor: 'rgba(245,158,11,0.4)', '&:hover': { borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.08)' } },
        outlinedPrimary: { color: '#C7D2FE', borderColor: 'rgba(99,102,241,0.45)', '&:hover': { borderColor: tokens.accent, backgroundColor: 'rgba(99,102,241,0.08)' } },
        text: { '&:hover': { backgroundColor: 'rgba(255,255,255,0.05)' } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.sm,
          '&:hover': { backgroundColor: 'rgba(255,255,255,0.06)' },
          '&.Mui-focusVisible': { boxShadow: tokens.focusRing },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { color: tokens.textMuted, '&.Mui-focused': { color: tokens.accentSoft } },
        asterisk: { color: '#F87171' },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.md,
          backgroundColor: 'rgba(255,255,255,0.025)',
          transition: 'background-color .15s ease, box-shadow .15s ease',
          '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.borderStrong, transition: 'border-color .15s ease' },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.22)' },
          '&.Mui-focused': { backgroundColor: 'rgba(99,102,241,0.04)', boxShadow: '0 0 0 3px rgba(99,102,241,0.18)' },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: tokens.accent, borderWidth: 1 },
          '&.Mui-disabled': { backgroundColor: 'rgba(255,255,255,0.015)' },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(239,68,68,0.6)' },
        },
        input: { '&::placeholder': { color: tokens.textSubtle, opacity: 1 } },
      },
    },
    MuiFormHelperText: { styleOverrides: { root: { marginLeft: 2, marginTop: 6, color: tokens.textSubtle } } },
    MuiTextField: { defaultProps: { variant: 'outlined' } },
    MuiSelect: { defaultProps: { MenuProps: { PaperProps: { sx: { mt: 0.5 } } } } },
    MuiMenu: {
      styleOverrides: {
        paper: { backgroundColor: tokens.surfaceRaised, border: `1px solid ${tokens.borderStrong}`, boxShadow: '0 16px 40px -12px rgba(0,0,0,0.6)' },
        list: { padding: 6 },
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.sm,
          fontSize: '0.875rem',
          minHeight: 36,
          '&.Mui-selected': { backgroundColor: 'rgba(99,102,241,0.14)' },
          '&.Mui-selected:hover': { backgroundColor: 'rgba(99,102,241,0.2)' },
        },
      },
    },
    MuiAutocomplete: {
      styleOverrides: {
        paper: { backgroundColor: tokens.surfaceRaised, border: `1px solid ${tokens.borderStrong}`, boxShadow: '0 16px 40px -12px rgba(0,0,0,0.6)', marginTop: 4 },
        listbox: { padding: 6, '& .MuiAutocomplete-option': { borderRadius: tokens.radius.sm, fontSize: '0.875rem' } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: tokens.radius.sm, fontWeight: 560, letterSpacing: '0.005em' },
        sizeSmall: { height: 24, fontSize: '0.75rem' },
        outlined: { borderColor: tokens.borderStrong },
        label: { paddingLeft: 9, paddingRight: 9 },
        icon: { marginLeft: 7 },
      },
    },
    MuiTableContainer: { styleOverrides: { root: { borderRadius: tokens.radius.lg } } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderBottom: `1px solid ${tokens.border}`, padding: '13px 16px', fontSize: '0.875rem' },
        head: {
          color: tokens.textSubtle,
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.07em',
          textTransform: 'uppercase',
          backgroundColor: 'rgba(255,255,255,0.015)',
          paddingTop: 11,
          paddingBottom: 11,
          whiteSpace: 'nowrap',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color .12s ease',
          '&:last-child td': { borderBottom: 0 },
          '&.MuiTableRow-hover:hover': { backgroundColor: 'rgba(255,255,255,0.025)' },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundColor: tokens.surface,
          border: `1px solid ${tokens.borderStrong}`,
          borderRadius: tokens.radius.xl,
          boxShadow: '0 32px 80px -20px rgba(0,0,0,0.75)',
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: { root: { '&:not(.MuiBackdrop-invisible)': { backgroundColor: 'rgba(4,6,10,0.72)', backdropFilter: 'blur(4px)' } } },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: '1.0625rem', fontWeight: 620, letterSpacing: '-0.015em', padding: '20px 24px 12px' } } },
    MuiDialogContent: { styleOverrides: { root: { padding: '8px 24px 20px' } } },
    MuiDialogActions: { styleOverrides: { root: { padding: '14px 24px 20px', gap: 8, borderTop: `1px solid ${tokens.border}` } } },
    MuiDrawer: { styleOverrides: { paper: { backgroundColor: tokens.surface, backgroundImage: 'none', borderColor: tokens.border } } },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: tokens.radius.md, border: '1px solid', fontSize: '0.875rem', alignItems: 'flex-start' },
        standardSuccess: { backgroundColor: tones.success.bg, borderColor: tones.success.border, color: '#D1FAE5', '& .MuiAlert-icon': { color: '#34D399' } },
        standardError: { backgroundColor: tones.danger.bg, borderColor: tones.danger.border, color: '#FEE2E2', '& .MuiAlert-icon': { color: '#F87171' } },
        standardWarning: { backgroundColor: tones.warning.bg, borderColor: tones.warning.border, color: '#FEF3C7', '& .MuiAlert-icon': { color: '#FBBF24' } },
        standardInfo: { backgroundColor: tones.accent.bg, borderColor: tones.accent.border, color: '#E0E7FF', '& .MuiAlert-icon': { color: '#A5B4FC' } },
        message: { paddingTop: 9 },
        icon: { paddingTop: 9 },
      },
    },
    MuiTooltip: {
      defaultProps: { arrow: true },
      styleOverrides: {
        tooltip: { backgroundColor: '#1E2230', border: `1px solid ${tokens.borderStrong}`, fontSize: '0.75rem', fontWeight: 500, padding: '6px 10px', borderRadius: 8 },
        arrow: { color: '#1E2230' },
      },
    },
    MuiDivider: { styleOverrides: { root: { borderColor: tokens.border } } },
    MuiTabs: {
      styleOverrides: {
        root: { minHeight: 40 },
        indicator: { height: 2, borderRadius: 2, backgroundColor: tokens.accentSoft },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 40, textTransform: 'none', fontWeight: 560, fontSize: '0.875rem', color: tokens.textMuted, padding: '8px 14px', minWidth: 0,
          '&.Mui-selected': { color: tokens.text },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: { '&.Mui-checked + .MuiSwitch-track': { opacity: 1 } },
        track: { backgroundColor: 'rgba(255,255,255,0.18)', opacity: 1 },
      },
    },
    MuiStepIcon: {
      styleOverrides: {
        root: { color: 'rgba(255,255,255,0.12)', '&.Mui-active': { color: tokens.accent }, '&.Mui-completed': { color: '#10B981' } },
        text: { fontWeight: 700, fill: '#fff' },
      },
    },
    MuiStepConnector: { styleOverrides: { line: { borderColor: tokens.borderStrong } } },
    MuiAvatar: { styleOverrides: { root: { fontWeight: 600, fontSize: '0.875rem' } } },
    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: 99, height: 6, backgroundColor: 'rgba(255,255,255,0.06)' }, bar: { borderRadius: 99 } },
    },
    MuiSkeleton: { styleOverrides: { root: { backgroundColor: 'rgba(255,255,255,0.06)' } } },
    MuiListItemButton: {
      styleOverrides: { root: { borderRadius: tokens.radius.sm, '&.Mui-focusVisible': { boxShadow: tokens.focusRing } } },
    },
    MuiAppBar: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          textTransform: 'none', borderColor: tokens.borderStrong, color: tokens.textMuted, fontWeight: 560, fontSize: '0.8125rem', padding: '6px 12px',
          '&.Mui-selected': { color: tokens.text, backgroundColor: 'rgba(99,102,241,0.16)', '&:hover': { backgroundColor: 'rgba(99,102,241,0.22)' } },
        },
      },
    },
  },
});

export { alpha };
export default theme;
