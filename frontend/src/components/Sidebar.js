import React from 'react';
import {
  Box, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Typography, Avatar, Menu, MenuItem,
  ListItemIcon as MenuIcon, Divider, Tooltip,
} from '@mui/material';
import {
  SpaceDashboardRounded,
  SupportAgentRounded,
  AssignmentRounded,
  InsightsRounded,
  FactCheckRounded,
  EngineeringRounded,
  PaletteRounded,
  ReceiptLongRounded,
  EventRepeatRounded,
  LogoutRounded,
  UnfoldMoreRounded,
  ArrowOutwardRounded,
  UploadFileRounded,
  RequestQuoteRounded,
  TrendingUpRounded,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useClerk } from '@clerk/clerk-react';
import { logout } from '../store/authSlice';
import { BrandMark, RoleChip, avatarColor } from './ui';
import { initials } from '../utils/format';
import { roleMeta } from '../utils/status';
import { tokens } from '../theme';

export const DRAWER_WIDTH = 256;

// Central Hub link. Set REACT_APP_HUB_URL when the Hub is deployed; in development it
// defaults to the local Hub dev server, and in production the link is hidden until set.
const HUB_URL = process.env.REACT_APP_HUB_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : '');

// Navigation, grouped. `roles` limits who sees an item (omit = everyone).
export const NAV_GROUPS = [
  {
    label: null,
    items: [
      { key: 'home', text: 'Dashboard', icon: <SpaceDashboardRounded />, path: '/' },
    ],
  },
  {
    label: 'Review',
    items: [
      { text: 'Approvals', icon: <FactCheckRounded />, path: '/finance', roles: ['FIN', 'OWN', 'ADM'] },
      { text: 'Tech review', icon: <EngineeringRounded />, path: '/tech-dashboard', roles: ['VRF', 'ADM'] },
      { text: 'Content review', icon: <PaletteRounded />, path: '/content-dashboard', roles: ['VRF', 'ADM'] },
    ],
  },
  {
    label: 'Finance',
    items: [
      { text: 'Project profit', icon: <TrendingUpRounded />, path: '/project-profit', roles: ['FIN', 'OWN', 'ADM'] },
      { text: 'Invoices & estimates', icon: <ReceiptLongRounded />, path: '/billing', roles: ['FIN', 'OWN', 'ADM'] },
      { text: 'Subscriptions', icon: <EventRepeatRounded />, path: '/subscriptions', roles: ['FIN', 'OWN', 'ADM'] },
    ],
  },
  {
    label: 'Team',
    items: [
      { text: 'Employee queries', icon: <SupportAgentRounded />, path: '/employee-dashboard', roles: ['EMP', 'FIN', 'OWN'] },
      { text: 'Daily worksheet', icon: <AssignmentRounded />, path: '/worksheet', roles: ['EMP', 'DEV', 'ADM'] },
      { text: 'Work reports', icon: <InsightsRounded />, path: '/worksheets-admin', roles: ['ADM', 'OWN'] },
    ],
  },
];

// Page titles for the top bar, keyed by path
export const PAGE_TITLES = {
  '/': 'Dashboard',
  '/submit': 'New request',
  '/finance': 'Approvals',
  '/project-profit': 'Project profit',
  '/billing': 'Invoices & estimates',
  '/subscriptions': 'Subscriptions',
  '/employee-dashboard': 'Employee queries',
  '/worksheet': 'Daily worksheet',
  '/worksheets-admin': 'Work reports',
  '/tech-dashboard': 'Tech review',
  '/content-dashboard': 'Content review',
};

/** The home item's label depends on what the dashboard shows for this person. */
export function homeLabel(role) {
  if (role === 'VND') return { text: 'Submit invoice', icon: <UploadFileRounded /> };
  if (role === 'EMP' && localStorage.getItem('employeeToken')) return { text: 'Salary request', icon: <RequestQuoteRounded /> };
  return { text: 'Dashboard', icon: <SpaceDashboardRounded /> };
}

function visibleGroups(role, userName) {
  const name = (userName || '').toLowerCase();
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items
      .filter((item) => !item.roles || item.roles.includes(role))
      .filter((item) => {
        // Rup sees the tech dashboard, Soumana the content one; anyone else sees both
        if (role !== 'VRF') return true;
        if (item.path === '/tech-dashboard' && !name.includes('rup') && name.includes('soumana')) return false;
        if (item.path === '/content-dashboard' && !name.includes('soumana') && name.includes('rup')) return false;
        return true;
      })
      .map((item) => (item.key === 'home' ? { ...item, ...homeLabel(role) } : item)),
  })).filter((g) => g.items.length > 0);
}

/** Avatar + name + role, opening a menu with sign-out. Lives at the foot of the sidebar. */
function UserCard() {
  const { user } = useSelector((s) => s.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { signOut } = useClerk();
  const [anchor, setAnchor] = React.useState(null);

  const isVendor = user?.role === 'VND';
  const isLocalEmployee = user?.role === 'EMP' && !!localStorage.getItem('employeeToken');

  const handleSignOut = async () => {
    setAnchor(null);
    if (isVendor) {
      localStorage.removeItem('vendorToken');
      localStorage.removeItem('vendorUser');
      dispatch(logout());
      navigate('/vendor-login');
    } else if (isLocalEmployee) {
      localStorage.removeItem('employeeToken');
      localStorage.removeItem('employeeUser');
      dispatch(logout());
      navigate('/employee-login');
    } else {
      await signOut();
      dispatch(logout());
    }
  };

  const name = user?.name || 'Signed in';
  return (
    <>
      <ListItemButton
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-haspopup="menu"
        aria-label="Account menu"
        sx={{ px: 1.25, py: 1, gap: 1.25, border: `1px solid ${tokens.border}`, bgcolor: 'rgba(255,255,255,0.02)', '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' } }}
      >
        <Avatar sx={{ width: 32, height: 32, bgcolor: avatarColor(name), color: '#fff', fontSize: 13 }}>{initials(name)}</Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600, lineHeight: 1.25 }}>{name}</Typography>
          <Typography variant="caption" noWrap sx={{ color: 'text.secondary', display: 'block', lineHeight: 1.3 }}>
            {user?.email || roleMeta(user?.role).label}
          </Typography>
        </Box>
        <UnfoldMoreRounded sx={{ fontSize: 18, color: 'text.disabled' }} />
      </ListItemButton>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        PaperProps={{ sx: { width: 232, mt: -1 } }}
      >
        <Box sx={{ px: 1.5, pt: 1, pb: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{name}</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 1 }} noWrap>{user?.email || user?.id}</Typography>
          <RoleChip role={user?.role} />
        </Box>
        <Divider sx={{ my: 0.5 }} />
        <MenuItem onClick={handleSignOut}>
          <MenuIcon sx={{ minWidth: 30 }}><LogoutRounded fontSize="small" /></MenuIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}

const Sidebar = ({ mobileOpen, handleDrawerToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state) => state.auth);
  const groups = visibleGroups(user?.role, user?.name);

  const go = (path) => {
    navigate(path);
    if (mobileOpen) handleDrawerToggle();
  };

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Brand */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2.25, pt: 2.5, pb: 2 }}>
        <BrandMark size={30} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontWeight: 650, letterSpacing: '-0.02em', fontSize: 15, lineHeight: 1.2 }}>AI Collective</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.2 }}>Finance</Typography>
        </Box>
      </Box>

      {/* Navigation */}
      <Box component="nav" aria-label="Main" sx={{ flex: 1, overflowY: 'auto', px: 1.5, pb: 2 }}>
        {groups.map((group, gi) => (
          <Box key={group.label || gi} sx={{ mt: gi === 0 ? 0.5 : 2.25 }}>
            {group.label && (
              <Typography variant="overline" sx={{ px: 1.25, color: 'text.disabled', display: 'block', mb: 0.5, fontSize: 10.5 }}>
                {group.label}
              </Typography>
            )}
            <List disablePadding sx={{ display: 'grid', gap: 0.25 }}>
              {group.items.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <ListItemButton
                    key={item.path}
                    selected={active}
                    onClick={() => go(item.path)}
                    aria-current={active ? 'page' : undefined}
                    sx={{
                      py: 0.85, px: 1.25, position: 'relative',
                      color: active ? 'text.primary' : 'text.secondary',
                      '&.Mui-selected': { bgcolor: 'rgba(255,255,255,0.06)' },
                      '&.Mui-selected:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                      '&:hover': { color: 'text.primary', bgcolor: 'rgba(255,255,255,0.04)' },
                      '&.Mui-selected::before': {
                        content: '""', position: 'absolute', left: -12, top: 8, bottom: 8, width: 3, borderRadius: '0 3px 3px 0', bgcolor: tokens.accentSoft,
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 32, color: active ? tokens.accentSoft : 'inherit', '& svg': { fontSize: 19 } }}>{item.icon}</ListItemIcon>
                    <ListItemText primary={item.text} primaryTypographyProps={{ fontSize: 13.5, fontWeight: active ? 600 : 500, letterSpacing: '-0.005em' }} />
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      {/* Footer */}
      <Box sx={{ p: 1.5, borderTop: `1px solid ${tokens.border}`, display: 'grid', gap: 1 }}>
        {HUB_URL && (
          <Tooltip title="Open the AI Collective Hub" placement="right">
            <ListItemButton component="a" href={HUB_URL} sx={{ py: 0.6, px: 1.25, color: 'text.secondary', '&:hover': { color: 'text.primary' } }}>
              <ListItemText primary="Back to Hub" primaryTypographyProps={{ fontSize: 13, fontWeight: 500 }} />
              <ArrowOutwardRounded sx={{ fontSize: 15, opacity: 0.7 }} />
            </ListItemButton>
          </Tooltip>
        )}
        <UserCard />
      </Box>
    </Box>
  );

  const paperSx = { boxSizing: 'border-box', width: DRAWER_WIDTH, bgcolor: tokens.surface, borderRight: `1px solid ${tokens.border}` };

  return (
    <Box sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': paperSx }}
      >
        {drawerContent}
      </Drawer>
      <Drawer variant="permanent" open sx={{ display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': paperSx }}>
        {drawerContent}
      </Drawer>
    </Box>
  );
};

export default Sidebar;
