import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { Box, Typography, IconButton, Button, Divider } from '@mui/material';
import { SignedIn, SignedOut, SignIn, SignOutButton } from '@clerk/clerk-react';
import { MenuRounded, BlockRounded } from '@mui/icons-material';
import Sidebar, { PAGE_TITLES, homeLabel } from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import SubmitRequest from './pages/SubmitRequest';
import SubscriptionTracker from './pages/SubscriptionTracker';
import EmployeeDashboard from './pages/EmployeeDashboard';
import FinanceReview from './pages/FinanceReview';
import WorksheetForm from './pages/WorksheetForm';
import WorksheetAdmin from './pages/WorksheetAdmin';
import Billing from './pages/Billing';
import ProjectProfit from './pages/ProjectProfit';
import { TechDashboard, ContentDashboard } from './pages/VerifierDashboard';
import VendorLogin from './pages/VendorLogin';
import EmployeeLogin from './pages/EmployeeLogin';
import AuthSync from './components/AuthSync';
import AuthLayout from './components/AuthLayout';
import { RoleChip, BrandMark } from './components/ui';
import { useSelector, useDispatch } from 'react-redux';
import { setAuth } from './store/authSlice';
import { isTokenExpired } from './utils/token';
import { tokens } from './theme';

// Clerk's hosted sign-in, styled to match the app
const clerkAppearance = {
  variables: {
    colorPrimary: tokens.accent,
    colorBackground: tokens.surface,
    colorText: tokens.text,
    colorTextSecondary: tokens.textMuted,
    colorInputBackground: 'rgba(255,255,255,0.03)',
    colorInputText: tokens.text,
    colorNeutral: '#E5E7EB',
    borderRadius: '10px',
    fontFamily: tokens.font,
    fontSize: '14px',
  },
  elements: {
    rootBox: { width: '100%' },
    // Monochrome brand marks (GitHub, Apple) are black by default: invisible on the dark card
    socialButtonsProviderIcon__github: { filter: 'invert(1)' },
    socialButtonsProviderIcon__apple: { filter: 'invert(1)' },
    cardBox: { width: '100%', boxShadow: 'none', border: `1px solid ${tokens.border}`, borderRadius: '16px' },
    card: { boxShadow: 'none' },
    headerTitle: { fontSize: '20px', letterSpacing: '-0.02em' },
    formButtonPrimary: { background: 'linear-gradient(180deg, #6E70F4 0%, #5B5EEA 100%)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)', textTransform: 'none', fontSize: '14px' },
    footer: { background: 'transparent' },
  },
};

// Signed-in frame: sidebar + sticky top bar + centred page content
function AuthenticatedLayout() {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { user } = useSelector((state) => state.auth);
  const location = useLocation();
  const title = location.pathname === '/' ? homeLabel(user?.role).text : PAGE_TITLES[location.pathname] || '';

  React.useEffect(() => {
    document.title = title ? `${title} · AI Collective Finance` : 'AI Collective Finance';
  }, [title]);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar mobileOpen={mobileOpen} handleDrawerToggle={() => setMobileOpen((o) => !o)} />
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Box
          component="header"
          sx={{
            position: 'sticky', top: 0, zIndex: 10, height: 56, px: { xs: 1.5, sm: 3 },
            display: 'flex', alignItems: 'center', gap: 1.5,
            bgcolor: 'rgba(10,12,18,0.72)', backdropFilter: 'saturate(160%) blur(12px)',
            borderBottom: `1px solid ${tokens.border}`,
          }}
        >
          <IconButton onClick={() => setMobileOpen(true)} aria-label="Open navigation" sx={{ display: { md: 'none' } }}>
            <MenuRounded />
          </IconButton>
          <Box sx={{ display: { xs: 'flex', md: 'none' } }}><BrandMark size={24} /></Box>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600, color: 'text.primary', flex: 1 }}>
            {title}
          </Typography>
          <RoleChip role={user?.role} />
        </Box>
        <Box component="main" sx={{ flexGrow: 1, px: { xs: 2, sm: 3, lg: 5 }, py: { xs: 3, sm: 4 }, overflowX: 'hidden' }}>
          <Box sx={{ maxWidth: 1240, mx: 'auto' }}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/submit" element={<SubmitRequest />} />
              <Route path="/subscriptions" element={<SubscriptionTracker />} />
              <Route path="/employee-dashboard" element={<EmployeeDashboard />} />
              <Route path="/worksheet" element={<WorksheetForm />} />
              <Route path="/finance" element={<FinanceReview />} />
              <Route path="/worksheets-admin" element={<WorksheetAdmin />} />
              <Route path="/billing" element={<Billing />} />
              <Route path="/project-profit" element={<ProjectProfit />} />
              <Route path="/tech-dashboard" element={<TechDashboard />} />
              <Route path="/content-dashboard" element={<ContentDashboard />} />
            </Routes>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

// Local (non-Clerk) auth check — restores a vendor or employee session from localStorage
function LocalAuthWrapper({ children }) {
  const dispatch = useDispatch();
  const { isAuthenticated } = useSelector((state) => state.auth);
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    if (!isAuthenticated) {
      for (const [tokenKey, userKey] of [['vendorToken', 'vendorUser'], ['employeeToken', 'employeeUser']]) {
        const token = localStorage.getItem(tokenKey);
        const storedUser = localStorage.getItem(userKey);
        if (token && storedUser) {
          if (isTokenExpired(token)) {
            localStorage.removeItem(tokenKey);
            localStorage.removeItem(userKey);
            continue;
          }
          try {
            const user = JSON.parse(storedUser);
            dispatch(setAuth({ user, token }));
          } catch (e) {
            localStorage.removeItem(tokenKey);
            localStorage.removeItem(userKey);
          }
          break;
        }
      }
    }
    setChecked(true);
  }, [isAuthenticated, dispatch]);

  if (!checked) return null;
  return children;
}

function NoAccessScreen() {
  return (
    <AuthLayout>
      <Box sx={{ width: 48, height: 48, borderRadius: '14px', display: 'grid', placeItems: 'center', mb: 3, bgcolor: 'rgba(239,68,68,0.12)', color: '#F87171', border: '1px solid rgba(239,68,68,0.3)' }}>
        <BlockRounded />
      </Box>
      <Typography variant="h4" component="h1" sx={{ mb: 1 }}>No access yet</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 4 }}>
        You're signed in, but this email isn't set up for AI Collective Finance. Ask an admin to add it, then sign in again.
      </Typography>
      <SignOutButton>
        <Button variant="outlined" fullWidth size="large">Sign out</Button>
      </SignOutButton>
    </AuthLayout>
  );
}

function TeamSignIn() {
  return (
    <AuthLayout
      footer={
        <Box>
          <Divider sx={{ mb: 2.5 }}>
            <Typography variant="caption" sx={{ color: 'text.disabled', px: 1 }}>Not on the team?</Typography>
          </Divider>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
            <Button variant="outlined" href="/vendor-login" fullWidth>Partner sign in</Button>
            <Button variant="outlined" href="/employee-login" fullWidth>Employee sign in</Button>
          </Box>
        </Box>
      }
    >
      <SignIn appearance={clerkAppearance} />
    </AuthLayout>
  );
}

function App() {
  const location = useLocation();
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  const isVendorRoute = location.pathname === '/vendor-login';
  const isEmployeeRoute = location.pathname === '/employee-login';
  const isVendorAuthenticated = isAuthenticated && user?.role === 'VND';
  const isEmployeeAuthenticated = isAuthenticated && user?.role === 'EMP' && !!localStorage.getItem('employeeToken');

  // Partner/vendor login page — always accessible, no Clerk
  if (isVendorRoute) {
    return <VendorLogin />;
  }

  // Employee login page — always accessible, no Clerk
  if (isEmployeeRoute) {
    return <EmployeeLogin />;
  }

  // If a partner or employee is authenticated (from localStorage), show the layout directly
  if (isVendorAuthenticated || isEmployeeAuthenticated) {
    return <AuthenticatedLayout />;
  }

  return (
    <LocalAuthWrapper>
      <SignedOut>
        <TeamSignIn />
      </SignedOut>

      <SignedIn>
        <AuthSync>
          {user?.role === 'NONE' ? <NoAccessScreen /> : <AuthenticatedLayout />}
        </AuthSync>
      </SignedIn>
    </LocalAuthWrapper>
  );
}

export default App;
