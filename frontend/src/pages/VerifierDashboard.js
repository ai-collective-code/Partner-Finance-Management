import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Table, TableHead, TableRow, TableCell, TableBody,
  Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions,
  Stepper, Step, StepLabel, Alert, CircularProgress, Divider, Avatar, Tooltip,
  IconButton
} from '@mui/material';
import {
  Visibility, CurrencyRupee, Person, Schedule, VerifiedUser,
  ZoomIn, OpenInNew, Close as CloseIcon
} from '@mui/icons-material';
import { useApi } from '../hooks/useApi';

import { useSelector } from 'react-redux';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const STATUS_FLOW = ['PND', 'OWN', 'FIN', 'DSB'];

const statusLabel = (s) => ({
  PND: 'Pending Review',
  VRF: '🔍 1st Line Verified (legacy)',
  FIN: '💼 Finance Review',
  OWN: '👑 Owner Auth',
  DSB: '✅ Disbursed',
  REJ: '❌ Rejected'
}[s] || s);

const statusColor = (s) => ({
  PND: 'warning', VRF: 'info', FIN: 'primary', OWN: 'secondary', DSB: 'success', REJ: 'error'
}[s] || 'default');

const stepIndex = (s) => Math.max(0, STATUS_FLOW.indexOf(s));

/**
 * VerifierDashboard — Shared component for Rup (Tech) and Soumana (Content).
 * Shows ONLY requests assigned to this verifier for privacy.
 *
 * Props:
 *   verifierId: 'rup' | 'soumana'
 *   title: Display title
 *   subtitle: Display subtitle
 *   icon: emoji/icon string
 *   accentColor: hex color
 */
const VerifierDashboard = ({ verifierId, title, subtitle, icon, accentColor }) => {
  const { user } = useSelector((state) => state.auth);
  const { apiFetch } = useApi();

  const [allRequests, setAllRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [imagePreview, setImagePreview] = useState(null); // lightbox URL
  
  // Comments history state
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/requests?limit=100');
      if (res.ok) {
        const data = await res.json();
        setAllRequests(data.data || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRequests(); }, []); // eslint-disable-line

  // Fetch comments when selected request changes
  useEffect(() => {
    if (selected) {
      const fetchComments = async () => {
        setCommentsLoading(true);
        try {
          const res = await apiFetch(`/api/audit?reqId=${selected.id}`);
          if (res.ok) {
            const data = await res.json();
            setComments(data.data || []);
          }
        } catch (e) {
          console.error('Failed to fetch comments', e);
        } finally {
          setCommentsLoading(false);
        }
      };
      fetchComments();
    } else {
      setComments([]);
    }
  }, [selected, apiFetch]);

  // PRIVACY: Only show requests where the vendor chose THIS logged in verifier
  const loggedInVerifierId = user?.name?.toLowerCase() || '';
  const myRequests = allRequests.filter(r => r.verifier?.toLowerCase() === loggedInVerifierId);
  const pendingCount = myRequests.filter(r => r.status === 'PND').length;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: accentColor, width: 48, height: 48, fontSize: 22 }}>{icon}</Avatar>
          <Box>
            <Typography variant="h4" fontWeight={700}>{title}</Typography>
            <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
          </Box>
        </Box>
        {pendingCount > 0 && (
          <Chip
            label={`${pendingCount} Pending Review${pendingCount > 1 ? 's' : ''}`}
            color="warning" icon={<Schedule />} sx={{ fontWeight: 700 }}
          />
        )}
      </Box>

      {/* Privacy Notice */}
      <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }} icon={<VerifiedUser />}>
        <strong>Privacy Mode:</strong> You only see requests where the vendor selected <strong>you</strong> as the first-line verifier. Other financial details are hidden.
      </Alert>

      {/* Stats */}
      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        {[
          { label: 'Assigned to Me', value: myRequests.length, color: accentColor },
          { label: 'Pending', value: myRequests.filter(r => r.status === 'PND').length, color: '#f59e0b' },
          { label: 'Verified', value: myRequests.filter(r => ['VRF', 'FIN', 'OWN', 'DSB'].includes(r.status)).length, color: '#22c55e' },
          { label: 'Rejected', value: myRequests.filter(r => r.status === 'REJ').length, color: '#ef4444' },
        ].map(s => (
          <Paper key={s.label} sx={{ p: 2, flex: '1 0 120px', borderRadius: 2, border: `1px solid ${s.color}33`, textAlign: 'center' }}>
            <Typography variant="h4" fontWeight={700} sx={{ color: s.color }}>{s.value}</Typography>
            <Typography variant="caption" color="text.secondary">{s.label}</Typography>
          </Paper>
        ))}
      </Box>

      {/* Table */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
      ) : (
        <Paper sx={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)', overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: `${accentColor}18` }}>
                <TableCell>Request ID</TableCell>
                <TableCell>Purpose</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Workflow</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {myRequests.length === 0 && (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.disabled' }}>
                  No requests assigned to you yet
                </TableCell></TableRow>
              )}
              {myRequests.map((req) => (
                <TableRow key={req.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.02)' } }}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{req.id}</TableCell>
                  <TableCell>
                    <Tooltip title={req.purpose}>
                      <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>{req.purpose}</Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Typography fontWeight={700} color="primary.light">₹{req.amount?.toLocaleString()}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(req.ts).toLocaleDateString('en-IN')}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip label={statusLabel(req.status)} color={statusColor(req.status)} size="small" />
                  </TableCell>
                  <TableCell>
                    <Stepper activeStep={stepIndex(req.status)} sx={{ '& .MuiStepLabel-label': { fontSize: 9 }, minWidth: 240 }}>
                      {['Submit', 'Owner', 'Finance', 'Paid'].map(l => (
                        <Step key={l}><StepLabel>{l}</StepLabel></Step>
                      ))}
                    </Stepper>
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" startIcon={<Visibility />} onClick={() => setSelected(req)}>
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Review Dialog */}
      <Dialog open={!!selected} onClose={() => setSelected(null)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3, background: '#111827', border: '1px solid rgba(255,255,255,0.1)' } }}>
        {selected && (
          <>
            <DialogTitle>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography fontWeight={700}>Review: {selected.id}</Typography>
                <Chip label={statusLabel(selected.status)} color={statusColor(selected.status)} size="small" />
              </Box>
            </DialogTitle>
            <DialogContent>
              <Stepper activeStep={stepIndex(selected.status)} sx={{ mb: 3 }}>
                {['Submitted', 'Owner Auth', 'Finance', 'Disbursed'].map(l => (
                  <Step key={l}><StepLabel sx={{ '& .MuiStepLabel-label': { fontSize: 11 } }}>{l}</StepLabel></Step>
                ))}
              </Stepper>
              <Divider sx={{ mb: 3, borderColor: 'rgba(255,255,255,0.08)' }} />

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
                {[
                  { label: 'Amount', value: `₹${selected.amount?.toLocaleString()}`, icon: <CurrencyRupee sx={{ fontSize: 16 }} />, color: 'success.light' },
                  { label: 'Purpose', value: selected.purpose },
                  { label: 'Requester', value: selected.requester, icon: <Person sx={{ fontSize: 16 }} /> },
                  { label: 'Submitted', value: new Date(selected.ts).toLocaleString('en-IN') },
                ].map(({ label, value, icon, color }) => (
                  <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Typography variant="caption" color="text.secondary">{label}</Typography>
                    <Typography variant="body2" fontWeight={600} color={color || 'text.primary'} sx={{ display: 'flex', alignItems: 'center', gap: 0.3, textAlign: 'right', maxWidth: 280 }}>
                      {icon}{value}
                    </Typography>
                  </Box>
                ))}
              </Box>

              {/* Show attached invoice if available */}
              {selected.file_hash && (() => {
                const isPdf = selected.file_hash.toLowerCase().endsWith('.pdf');
                return (
                  <Box sx={{ mb: 3 }}>
                    <Typography variant="caption" color="text.secondary" mb={1} display="block">Attached Invoice</Typography>
                    {isPdf ? (
                      <Box sx={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
                        <iframe
                          src={`${API_BASE_URL}/uploads/${selected.file_hash}`}
                          title="Invoice PDF"
                          width="100%"
                          height="350px"
                          style={{ border: 'none', backgroundColor: '#fff' }}
                        />
                        <Box sx={{ p: 1, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', bgcolor: 'rgba(0,0,0,0.2)' }}>
                          <Button
                            variant="outlined"
                            size="small"
                            component="a"
                            href={`${API_BASE_URL}/uploads/${selected.file_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            📂 Open PDF in New Tab
                          </Button>
                        </Box>
                      </Box>
                    ) : (
                      <Box sx={{ position: 'relative' }}>
                        <Box
                          component="img"
                          src={`${API_BASE_URL}/uploads/${selected.file_hash}`}
                          alt="Invoice"
                          onClick={() => setImagePreview(`${API_BASE_URL}/uploads/${selected.file_hash}`)}
                          sx={{
                            width: '100%', maxHeight: 250, objectFit: 'contain',
                            borderRadius: 2, border: '1px solid rgba(255,255,255,0.1)',
                            backgroundColor: 'rgba(0,0,0,0.2)',
                            cursor: 'zoom-in',
                            transition: 'opacity 0.2s',
                            '&:hover': { opacity: 0.85 }
                          }}
                        />
                        {/* Zoom hint overlay */}
                        <Box sx={{
                          position: 'absolute', top: 8, right: 8,
                          bgcolor: 'rgba(0,0,0,0.55)', borderRadius: 1,
                          px: 0.8, py: 0.3,
                          display: 'flex', alignItems: 'center', gap: 0.5,
                          pointerEvents: 'none'
                        }}>
                          <ZoomIn sx={{ fontSize: 14, color: '#fff' }} />
                          <Typography variant="caption" sx={{ color: '#fff', fontSize: 10 }}>Click to expand</Typography>
                        </Box>
                        {/* View Full Image button */}
                        <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<ZoomIn />}
                            onClick={() => setImagePreview(`${API_BASE_URL}/uploads/${selected.file_hash}`)}
                            sx={{ flex: 1, borderColor: 'rgba(99,102,241,0.4)', color: '#818cf8',
                              '&:hover': { borderColor: '#6366f1', bgcolor: 'rgba(99,102,241,0.08)' } }}
                          >
                            View Full Image
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<OpenInNew />}
                            component="a"
                            href={`${API_BASE_URL}/uploads/${selected.file_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ flex: 1, borderColor: 'rgba(255,255,255,0.15)', color: 'text.secondary',
                              '&:hover': { borderColor: 'rgba(255,255,255,0.3)', bgcolor: 'rgba(255,255,255,0.04)' } }}
                          >
                            Open in Tab
                          </Button>
                        </Box>
                      </Box>
                    )}
                  </Box>
                );
              })()}

              {/* Previous Comments Section */}
              {comments.length > 0 && (
                <Box sx={{ mb: 3 }}>
                  <Typography variant="subtitle2" color="primary" mb={1.5} sx={{ fontWeight: 700 }}>
                    💬 Previous Comments & Reviews
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    {comments.map((log) => {
                      const dateStr = new Date(log.ts).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      });
                      const roleLabel = {
                        DEV: '👨‍💻 Developer',
                        EMP: '👤 Employee',
                        VRF: '👁️ Verifier',
                        FIN: '💼 Finance',
                        OWN: '👑 Owner',
                        ADM: '🛡️ Admin',
                        VND: '🏪 Vendor',
                      }[log.actor_role] || log.actor_role || 'System';

                      return (
                        <Paper 
                          key={log.id} 
                          sx={{ 
                            p: 2, 
                            borderRadius: 2, 
                            border: '1px solid rgba(255,255,255,0.06)', 
                            background: 'rgba(255,255,255,0.02)',
                            position: 'relative'
                          }}
                        >
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" fontWeight={700}>
                                {log.actor_name || log.actor}
                              </Typography>
                              <Chip label={roleLabel} size="small" sx={{ fontSize: 9, height: 16 }} />
                            </Box>
                            <Typography variant="caption" color="text.secondary">
                              {dateStr}
                            </Typography>
                          </Box>
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 1, borderLeft: '2px solid rgba(99,102,241,0.4)' }}>
                            "{log.comment || 'No comment provided'}"
                          </Typography>
                          <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                            <Chip label={`${log.prev || '-'} → ${log.next || '-'}`} size="small" variant="outlined" color="primary" sx={{ fontSize: 8, height: 14 }} />
                          </Box>
                        </Paper>
                      );
                    })}
                  </Box>
                </Box>
              )}
              {commentsLoading && (
                <Box sx={{ py: 2, textAlign: 'center', mb: 2 }}>
                  <CircularProgress size={20} />
                </Box>
              )}

              <Divider sx={{ mb: 2, borderColor: 'rgba(255,255,255,0.08)' }} />

              {selected.status === 'PND' && (
                <Alert severity="warning" sx={{ fontSize: 12 }} icon={<VerifiedUser />}>
                  <strong>1st-line verification has been removed from the workflow.</strong> This request now goes directly to Owner Auth (Debojit) — there's nothing to action here anymore.
                </Alert>
              )}
              {selected.status === 'VRF' && (
                <Alert severity="info" sx={{ fontSize: 12 }} icon={<VerifiedUser />}>
                  This is a legacy request submitted before the 1st-line verify stage was removed. Owner Auth (Debojit) can move it forward from the Finance Review page.
                </Alert>
              )}
              {selected.status === 'DSB' && <Alert severity="success">✅ This request has been fully disbursed.</Alert>}
              {selected.status === 'REJ' && <Alert severity="error">❌ This request was rejected.</Alert>}
            </DialogContent>
            <DialogActions sx={{ p: 2.5, gap: 1 }}>
              <Button onClick={() => setSelected(null)} color="inherit">Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* ── Full-Image Lightbox ── */}
      <Dialog
        open={!!imagePreview}
        onClose={() => setImagePreview(null)}
        maxWidth={false}
        PaperProps={{
          sx: {
            background: 'rgba(5,7,15,0.97)',
            boxShadow: 'none',
            borderRadius: 3,
            border: '1px solid rgba(255,255,255,0.08)',
            m: 1,
            maxWidth: '95vw',
            maxHeight: '95vh',
            position: 'relative',
          }
        }}
      >
        {/* Close button */}
        <IconButton
          onClick={() => setImagePreview(null)}
          sx={{
            position: 'absolute', top: 8, right: 8, zIndex: 10,
            bgcolor: 'rgba(0,0,0,0.6)', color: '#fff',
            '&:hover': { bgcolor: 'rgba(239,68,68,0.8)' }
          }}
        >
          <CloseIcon />
        </IconButton>

        <Box sx={{ p: 1.5, textAlign: 'center' }}>
          <Box
            component="img"
            src={imagePreview}
            alt="Full Invoice"
            sx={{
              maxWidth: '90vw',
              maxHeight: '88vh',
              objectFit: 'contain',
              borderRadius: 2,
              display: 'block',
              margin: '0 auto',
            }}
          />
          <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'center', gap: 2 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<OpenInNew />}
              component="a"
              href={imagePreview}
              target="_blank"
              rel="noopener noreferrer"
              sx={{ borderColor: 'rgba(99,102,241,0.5)', color: '#818cf8' }}
            >
              Open in New Tab
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<CloseIcon />}
              onClick={() => setImagePreview(null)}
              sx={{ borderColor: 'rgba(255,255,255,0.15)', color: 'text.secondary' }}
            >
              Close
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
};

// ── Rup's Tech Dashboard ──
export const TechDashboard = () => (
  <VerifierDashboard
    verifierId="rup"
    title="Tech Head Dashboard"
    subtitle="Requests assigned to Rup for first-line tech verification"
    icon="🔧"
    accentColor="#3b82f6"
  />
);

// ── Soumana's Content Dashboard ──
export const ContentDashboard = () => (
  <VerifierDashboard
    verifierId="soumana"
    title="Content Head Dashboard"
    subtitle="Requests assigned to Soumana for first-line content verification"
    icon="🎨"
    accentColor="#f59e0b"
  />
);

export default VerifierDashboard;
