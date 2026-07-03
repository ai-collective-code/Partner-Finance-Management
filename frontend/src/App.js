import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Box, AppBar, Toolbar, Typography, IconButton, Avatar, Menu, MenuItem, Chip, Divider, useMediaQuery, useTheme } from '@mui/material';
import { SignedIn, SignedOut, SignIn, SignOutButton } from '@clerk/clerk-react';
import { ExitToApp, Person, Menu as MenuIcon } from '@mui/icons-material';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import SubmitRequest from './pages/SubmitRequest';
import SubscriptionTracker from './pages/SubscriptionTracker';
import EmployeeDashboard from './pages/EmployeeDashboard';
import FinanceReview from './pages/FinanceReview';
import WorksheetForm from './pages/WorksheetForm';
import WorksheetAdmin from './pages/WorksheetAdmin';
import { TechDashboard, ContentDashboard } from './pages/VerifierDashboard';
import VendorLogin from './pages/VendorLogin';
import EmployeeLogin from './pages/EmployeeLogin';
import AuthSync from './components/AuthSync';
import { useSelector, useDispatch } from 'react-redux';
import { logout, setAuth } from './store/authSlice';

const ROLE_LABELS = {
  DEV: { label: '👨‍💻 Developer', color: '#3b82f6' },
  EMP: { label: '👤 Employee', color: '#6366f1' },
  VRF: { label: '👁️ Verifier', color: '#f59e0b' },
  FIN: { label: '💼 Finance', color: '#22c55e' },
  OWN: { label: '👑 Owner', color: '#8b5cf6' },
  ADM: { label: '🛡️ Admin', color: '#ef4444' },
  VND: { label: '🤝 Partner', color: '#f97316' },
};

// Inner layout for authenticated users (Clerk or Vendor)
function AuthenticatedLayout() {
  const [anchorEl, setAnchorEl] = React.useState(null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { user } = useSelector(state => state.auth);
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const handleMenu = (event) => setAnchorEl(event.currentTarget);
  const handleClose = () => setAnchorEl(null);
  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);

  const roleInfo = ROLE_LABELS[user?.role] || { label: user?.role, color: '#6366f1' };
  const isVendor = user?.role === 'VND';
  const isLocalEmployee = user?.role === 'EMP' && !!localStorage.getItem('employeeToken');

  const handleVendorLogout = () => {
    localStorage.removeItem('vendorToken');
    localStorage.removeItem('vendorUser');
    dispatch(logout());
    navigate('/vendor-login');
    handleClose();
  };

  const handleEmployeeLogout = () => {
    localStorage.removeItem('employeeToken');
    localStorage.removeItem('employeeUser');
    dispatch(logout());
    navigate('/employee-login');
    handleClose();
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', flexDirection: isMobile ? 'column' : 'row' }}>
      <Sidebar mobileOpen={mobileOpen} handleDrawerToggle={handleDrawerToggle} />
      <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', minWidth: 0, width: isMobile ? '100%' : 'calc(100% - 240px)' }}>
        <AppBar position="static" elevation={0} sx={{ backgroundColor: '#0b0f19', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <Toolbar sx={{ minHeight: 56, px: { xs: 1, sm: 2 } }}>
            {isMobile && (
              <IconButton color="inherit" aria-label="open drawer" edge="start" onClick={handleDrawerToggle} sx={{ mr: 1 }}>
                <MenuIcon />
              </IconButton>
            )}
            <Typography variant="body1" component="div" sx={{ flexGrow: 1, color: 'text.secondary', fontSize: { xs: 12, sm: 14 } }} noWrap>
              Ai Finance
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {/* Role Badge */}
              <Chip
                label={roleInfo.label}
                size="small"
                sx={{
                  bgcolor: `${roleInfo.color}22`,
                  color: roleInfo.color,
                  border: `1px solid ${roleInfo.color}44`,
                  fontWeight: 600,
                  fontSize: 11
                }}
              />
              <div>
                <IconButton size="small" onClick={handleMenu} color="inherit">
                  <Avatar sx={{
                    bgcolor: roleInfo.color,
                    width: 34, height: 34, fontSize: 14
                  }}>
                    {user?.name?.charAt(0).toUpperCase()}
                  </Avatar>
                </IconButton>
                <Menu id="menu-appbar" anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleClose}>
                  <MenuItem disabled sx={{ opacity: '1 !important' }}>
                    <Box>
                      <Typography variant="subtitle2" fontWeight={700}>{user?.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{user?.email || user?.id}</Typography>
                    </Box>
                  </MenuItem>
                  <MenuItem disabled sx={{ opacity: '1 !important' }}>
                    <Chip
                      icon={<Person sx={{ fontSize: 14 }} />}
                      label={roleInfo.label}
                      size="small"
                      sx={{ bgcolor: `${roleInfo.color}22`, color: roleInfo.color, fontWeight: 600 }}
                    />
                  </MenuItem>
                  <Divider />
                  {isVendor ? (
                    <MenuItem onClick={handleVendorLogout}>
                      <ExitToApp sx={{ mr: 1, fontSize: 18 }} /> Sign Out
                    </MenuItem>
                  ) : isLocalEmployee ? (
                    <MenuItem onClick={handleEmployeeLogout}>
                      <ExitToApp sx={{ mr: 1, fontSize: 18 }} /> Sign Out
                    </MenuItem>
                  ) : (
                    <MenuItem>
                      <SignOutButton />
                    </MenuItem>
                  )}
                </Menu>
              </div>
            </Box>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ flexGrow: 1, p: { xs: 1.5, sm: 3 }, backgroundColor: '#0b0f19', overflowX: 'hidden' }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/submit" element={<SubmitRequest />} />
            <Route path="/subscriptions" element={<SubscriptionTracker />} />
            <Route path="/employee-dashboard" element={<EmployeeDashboard />} />
            <Route path="/worksheet" element={<WorksheetForm />} />
            <Route path="/finance" element={<FinanceReview />} />
            <Route path="/worksheets-admin" element={<WorksheetAdmin />} />
            <Route path="/tech-dashboard" element={<TechDashboard />} />
            <Route path="/content-dashboard" element={<ContentDashboard />} />
          </Routes>
        </Box>
      </Box>
    </Box>
  );
}

// Local (non-Clerk) auth check — restores a vendor or employee session from localStorage
function LocalAuthWrapper({ children }) {
  const dispatch = useDispatch();
  const { isAuthenticated } = useSelector(state => state.auth);
  const [checked, setChecked] = React.useState(false);

  React.useEffect(() => {
    if (!isAuthenticated) {
      for (const [tokenKey, userKey] of [['vendorToken', 'vendorUser'], ['employeeToken', 'employeeUser']]) {
        const token = localStorage.getItem(tokenKey);
        const storedUser = localStorage.getItem(userKey);
        if (token && storedUser) {
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
    <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', bgcolor: '#0b0f19', flexDirection: 'column' }}>
      <Typography variant="h4" color="error" fontWeight={700} mb={2}>Access Denied</Typography>
      <Typography variant="body1" color="text.secondary" mb={4}>Your account does not have permission to access this application.</Typography>
      <SignOutButton>
        <Box component="button" sx={{ px: 4, py: 1.5, bgcolor: '#ef4444', color: 'white', borderRadius: 2, border: 'none', cursor: 'pointer', fontWeight: 600, '&:hover': { bgcolor: '#dc2626' } }}>
          Sign Out
        </Box>
      </SignOutButton>
    </Box>
  );
}

function App() {
  const location = useLocation();
  const { isAuthenticated, user } = useSelector(state => state.auth);
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
        <Box sx={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', bgcolor: '#0b0f19' }}>
          <Box sx={{ textAlign: 'center' }}>
            <SignIn />
            <Box sx={{ mt: 3 }}>
              <Typography variant="body2" color="text.secondary" mb={1}>
                Are you a partner?
              </Typography>
              <a href="/vendor-login" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>
                🤝 Go to Partner Login
              </a>
            </Box>
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" mb={1}>
                Are you an employee?
              </Typography>
              <a href="/employee-login" style={{ color: '#6366f1', textDecoration: 'none', fontWeight: 600 }}>
                👤 Go to Employee Login
              </a>
            </Box>
          </Box>
        </Box>
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
