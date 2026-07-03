import React from 'react';
import { Box, Drawer, List, ListItem, ListItemIcon, ListItemText, Typography, Divider, Chip, useMediaQuery, useTheme } from '@mui/material';
import {
  Dashboard as DashboardIcon,
  AccountBalance as AccountBalanceIcon,
  EventNote as EventNoteIcon,
  SupportAgent as SupportAgentIcon,
  Assignment as AssignmentIcon,
  BarChart as BarChartIcon,
  RateReview as RateReviewIcon,
  Engineering as EngineeringIcon,
  Palette as PaletteIcon,
  ArrowBack as ArrowBackIcon,
  Launch as LaunchIcon,
} from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

const drawerWidth = 240;

// Central Hub URL — update this when deploying the Hub to a subdomain
const HUB_URL = 'http://localhost:5173';

const Sidebar = ({ mobileOpen, handleDrawerToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state) => state.auth);
  const role = user?.role;
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const menuItems = [
    // ── Everyone
    { text: 'Dashboard', icon: <DashboardIcon />, path: '/' },

    // ── Employee messaging (private: EMP, FIN, OWN only)
    { text: 'Employee Queries', icon: <SupportAgentIcon />, path: '/employee-dashboard', roles: ['EMP', 'FIN', 'OWN'] },

    // ── Worksheet for employees/devs only (NOT vendor, NOT finance)
    { text: 'Daily Worksheet', icon: <AssignmentIcon />, path: '/worksheet', roles: ['EMP', 'DEV', 'ADM'] },

    // ── Verifier dashboards (Rup = Tech, Soumana = Content)
    { text: '🔧 Tech Dashboard', icon: <EngineeringIcon />, path: '/tech-dashboard', roles: ['VRF', 'ADM'] },
    { text: '🎨 Content Dashboard', icon: <PaletteIcon />, path: '/content-dashboard', roles: ['VRF', 'ADM'] },

    // ── Finance / Owner
    { text: 'Finance Review', icon: <RateReviewIcon />, path: '/finance', roles: ['FIN', 'OWN', 'ADM'] },

    { text: 'Subscriptions', icon: <EventNoteIcon />, path: '/subscriptions', roles: ['FIN', 'OWN', 'ADM'] },

    // ── Admin / Owner
    { text: 'Work Reports', icon: <BarChartIcon />, path: '/worksheets-admin', roles: ['ADM', 'OWN'], badge: 'PDF' },
  ];

  const userName = user?.name?.toLowerCase() || '';
  const filteredMenuItems = menuItems.filter(item => {
    if (item.roles && !item.roles.includes(role)) return false;
    if (role === 'VRF') {
      if (item.path === '/tech-dashboard' && !userName.includes('rup') && userName.includes('soumana')) return false;
      if (item.path === '/content-dashboard' && !userName.includes('soumana') && userName.includes('rup')) return false;
    }
    return true;
  });

  const getRoleLabel = (r) => {
    const map = {
      VRF: 'Verifier (1st-Line)',
      FIN: '💼 Finance',
      OWN: '👑 Owner (Debojit)',
      VND: 'Partner',
      ADM: '🛡️ Admin',
      EMP: 'Employee',
      DEV: '👨‍💻 Developer',
    };
    return map[r] || r;
  };

  const drawerContent = (
    <>
      {/* Back to Hub Button */}
      <Box sx={{ px: 1.5, pt: 1.5 }}>
        <Box
          component="a"
          href={HUB_URL}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 0.75,
            px: 1.5,
            py: 0.75,
            borderRadius: 2,
            textDecoration: 'none',
            color: '#94a3b8',
            fontSize: 12,
            fontWeight: 500,
            background: 'rgba(99, 102, 241, 0.06)',
            border: '1px solid rgba(99, 102, 241, 0.12)',
            transition: 'all 0.2s ease',
            '&:hover': {
              background: 'rgba(99, 102, 241, 0.15)',
              color: '#a5b4fc',
              borderColor: 'rgba(99, 102, 241, 0.3)',
            },
          }}
        >
          <ArrowBackIcon sx={{ fontSize: 14 }} />
          Back to Hub
          <LaunchIcon sx={{ fontSize: 10, ml: 'auto', opacity: 0.5 }} />
        </Box>
      </Box>

      <Box sx={{ p: 2.5, pt: 1.5 }}>
        <Typography variant="h6" color="primary" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
          <AccountBalanceIcon fontSize="small" /> Ai Finance
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Logged in as: {getRoleLabel(role)}
        </Typography>
      </Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,0.05)' }} />
      <List sx={{ px: 1.5, pt: 1 }}>
        {filteredMenuItems.map((item) => {
          const active = location.pathname === item.path;
          return (
            <ListItem
              button
              key={item.text}
              onClick={() => {
                navigate(item.path);
                if (isMobile) handleDrawerToggle();
              }}
              sx={{
                mb: 0.5,
                borderRadius: 2,
                py: 0.8,
                backgroundColor: active ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                color: active ? 'primary.main' : 'text.secondary',
                '&:hover': {
                  backgroundColor: 'rgba(99, 102, 241, 0.1)',
                  color: 'primary.main',
                  '& .MuiListItemIcon-root': { color: 'primary.main' }
                }
              }}
            >
              <ListItemIcon sx={{ color: active ? 'primary.main' : 'text.secondary', minWidth: 36 }}>
                {item.icon}
              </ListItemIcon>
              <ListItemText primary={item.text} primaryTypographyProps={{ fontWeight: active ? 600 : 400, fontSize: 13 }} />
              {item.badge && <Chip label={item.badge} size="small" color="success" sx={{ height: 18, fontSize: 10 }} />}
            </ListItem>
          );
        })}
      </List>
    </>
  );

  return (
    <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }} // Better open performance on mobile.
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, backgroundColor: '#111827' },
        }}
      >
        {drawerContent}
      </Drawer>
      {/* Desktop Drawer */}
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: 'none', md: 'block' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth, backgroundColor: '#111827', borderRight: '1px solid rgba(255, 255, 255, 0.05)' },
        }}
        open
      >
        {drawerContent}
      </Drawer>
    </Box>

  );
};

export default Sidebar;
