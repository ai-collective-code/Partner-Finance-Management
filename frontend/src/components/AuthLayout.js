import React from 'react';
import { Box, Typography } from '@mui/material';
import { ShieldRounded, BoltRounded, ReceiptLongRounded } from '@mui/icons-material';
import { BrandMark } from './ui';
import { tokens } from '../theme';

const POINTS = [
  { Icon: ReceiptLongRounded, title: 'One place for every invoice', body: 'Upload or generate an invoice, attach bank details and submit in minutes.' },
  { Icon: BoltRounded, title: 'Clear approvals', body: 'See exactly where each request is — owner, finance or paid.' },
  { Icon: ShieldRounded, title: 'Built for trust', body: 'Every decision is signed and logged. Documents stay private.' },
];

/**
 * Two-column sign-in frame: brand story on the left (desktop only), the form on the right.
 */
export default function AuthLayout({ children, footer }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(420px, 5fr) 7fr' }, bgcolor: 'background.default' }}>
      {/* Brand panel */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' }, flexDirection: 'column', justifyContent: 'space-between',
          p: 6, position: 'relative', overflow: 'hidden', borderRight: `1px solid ${tokens.border}`,
          background: `radial-gradient(900px 500px at 0% 0%, rgba(99,102,241,0.22), transparent 60%),
                       radial-gradient(700px 500px at 100% 100%, rgba(139,92,246,0.14), transparent 60%), ${tokens.surface}`,
        }}
      >
        {/* subtle grid texture */}
        <Box
          aria-hidden
          sx={{
            position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none',
            backgroundImage: 'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse at 30% 30%, #000 20%, transparent 70%)',
          }}
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, position: 'relative' }}>
          <BrandMark size={36} />
          <Box>
            <Typography sx={{ fontWeight: 650, letterSpacing: '-0.02em', lineHeight: 1.2 }}>AI Collective</Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Finance</Typography>
          </Box>
        </Box>

        <Box sx={{ position: 'relative', maxWidth: 440 }}>
          <Typography variant="h3" component="p" sx={{ mb: 2, lineHeight: 1.15 }}>
            Get paid for great work,{' '}
            <Box component="span" sx={{ background: 'linear-gradient(90deg, #A5B4FC, #C4B5FD)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              without the chase.
            </Box>
          </Typography>
          <Typography variant="body1" sx={{ color: 'text.secondary', mb: 5 }}>
            Invoices, approvals and payouts for the AI Collective team and its partners.
          </Typography>
          <Box sx={{ display: 'grid', gap: 2.5 }}>
            {POINTS.map(({ Icon, title, body }) => (
              <Box key={title} sx={{ display: 'flex', gap: 1.75 }}>
                <Box sx={{ width: 34, height: 34, borderRadius: '10px', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.05)', border: `1px solid ${tokens.border}`, color: tokens.accentSoft }}>
                  <Icon sx={{ fontSize: 18 }} />
                </Box>
                <Box>
                  <Typography variant="subtitle2">{title}</Typography>
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>{body}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        <Typography variant="caption" sx={{ color: 'text.disabled', position: 'relative' }}>
          © {new Date().getFullYear()} AI Collective
        </Typography>
      </Box>

      {/* Form panel */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', px: { xs: 2.5, sm: 4 }, py: 6 }}>
        <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1.25, mb: 4 }}>
          <BrandMark size={32} />
          <Typography sx={{ fontWeight: 650, letterSpacing: '-0.02em' }}>AI Collective Finance</Typography>
        </Box>
        <Box sx={{ width: '100%', maxWidth: 400 }}>{children}</Box>
        {footer && <Box sx={{ width: '100%', maxWidth: 400, mt: 4 }}>{footer}</Box>}
      </Box>
    </Box>
  );
}
