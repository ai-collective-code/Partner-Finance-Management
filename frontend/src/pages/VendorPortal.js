import React, { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Paper, Button, CircularProgress, Chip, Table,
  TableHead, TableRow, TableCell, TableBody, Tooltip, LinearProgress,
  Alert, Avatar, TextField
} from '@mui/material';
import { CloudUpload, CheckCircle, Receipt, AttachMoney, AccessTime } from '@mui/icons-material';
import { useApi } from '../hooks/useApi';
import { useSelector } from 'react-redux';

const statusColor = (s) => ({ PND: 'warning', FIN: 'info', OWN: 'secondary', DSB: 'success', REJ: 'error' }[s] || 'default');
const statusLabel = (s) => ({ PND: '⏳ Pending Review', FIN: '🔍 Finance Review', OWN: '👑 Owner Auth', DSB: '✅ Disbursed', REJ: '❌ Rejected' }[s] || s);

const VendorPortal = () => {
  const { user } = useSelector((state) => state.auth);
  const { apiFetch } = useApi();
  const fileInputRef = useRef(null);

  const [invoices, setInvoices] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [extractedData, setExtractedData] = useState(null); // Data from upload
  const [invoiceForm, setInvoiceForm] = useState({ amount: '', purpose: '' });
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchInvoices = async () => {
    try {
      const res = await apiFetch('/api/requests');
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.data || []);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchInvoices(); }, []); // eslint-disable-line

  const handleFile = async (file) => {
    if (!file) return;
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    if (!allowed.includes(file.type)) {
      setError('Only JPG, PNG files are allowed.');
      return;
    }
    setError(null);
    setUploading(true);
    setUploadProgress(10);
    setExtractedData(null);

    try {
      const formData = new FormData();
      formData.append('invoice', file);

      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 15, 85));
      }, 300);

      const res = await apiFetch('/api/invoices/upload', {
        method: 'POST',
        body: formData
        // NOTE: Do NOT set Content-Type header - browser sets it with boundary automatically
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (res.ok) {
        const data = await res.json();
        setExtractedData(data);
        setInvoiceForm({ amount: '', purpose: data.purpose || '' });
        setTimeout(() => setUploadProgress(0), 800);
      } else {
        const err = await res.json();
        setError(err.error || 'Upload failed');
      }
    } catch (e) {
      setError('Network error. Please try again.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const submitInvoiceRequest = async () => {
    if (!invoiceForm.amount || !invoiceForm.purpose) {
      setError('Please fill in both amount and purpose.');
      return;
    }
    setSubmitLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Number(invoiceForm.amount),
          purpose: invoiceForm.purpose,
          file_hash: extractedData.file_hash
        })
      });
      if (res.ok) {
        setExtractedData(null);
        setInvoiceForm({ amount: '', purpose: '' });
        fetchInvoices();
      } else {
        const err = await res.json();
        setError(err.error || 'Submission failed');
      }
    } catch (e) {
      setError('Network error during submission.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const onFileChange = (e) => handleFile(e.target.files[0]);
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <Receipt sx={{ color: '#6366f1', fontSize: 30 }} />
        <Box>
          <Typography variant="h4" fontWeight={700}>Partner Portal</Typography>
          <Typography variant="body2" color="text.secondary">Upload invoices for automatic extraction & Finance review</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* ── Upload Zone ── */}
        <Box sx={{ flex: '0 0 340px', minWidth: 300 }}>
          <Paper
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            sx={{
              p: 4, textAlign: 'center', borderRadius: 3, cursor: 'pointer',
              border: dragOver ? '2px solid #6366f1' : '2px dashed rgba(99,102,241,0.3)',
              backgroundColor: dragOver ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)',
              transition: 'all 0.2s ease',
              '&:hover': { borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.06)' }
            }}
            onClick={() => !uploading && fileInputRef.current?.click()}
          >
            <input ref={fileInputRef} type="file" hidden onChange={onFileChange} accept=".jpg,.jpeg,.png" />
            <CloudUpload sx={{ fontSize: 56, color: dragOver ? '#6366f1' : 'text.disabled', mb: 2, transition: 'color 0.2s' }} />
            <Typography variant="h6" mb={1}>
              {uploading ? 'Processing Invoice...' : 'Upload Invoice'}
            </Typography>
            <Typography variant="body2" color="text.secondary" mb={3}>
              Drag & drop or click to select<br />
              <strong>JPG, PNG</strong> supported
            </Typography>

            {uploading && (
              <Box sx={{ mb: 2 }}>
                <LinearProgress variant="determinate" value={uploadProgress} sx={{ mb: 1, borderRadius: 1 }} />
                <Typography variant="caption" color="primary">
                  {uploadProgress < 85 ? 'Uploading & extracting data...' : 'Finalizing...'}
                </Typography>
              </Box>
            )}

            {!uploading && (
              <Button
                variant="contained"
                sx={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', borderRadius: 2, px: 3 }}
                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              >
                Select & Submit File
              </Button>
            )}

            {error && <Alert severity="error" sx={{ mt: 2, textAlign: 'left' }}>{error}</Alert>}
          </Paper>

          {/* Verification Form Card */}
          {extractedData && (
            <Paper sx={{ mt: 2, p: 3, borderRadius: 3, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)' }}>
              <Typography variant="subtitle1" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <CheckCircle /> Verify Invoice Details
              </Typography>
              <Typography variant="body2" color="text.secondary" mb={2}>
                Please review the auto-extracted details and submit to Finance.
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField
                  label="Extracted Amount (₹)"
                  type="number"
                  fullWidth
                  size="small"
                  value={invoiceForm.amount}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })}
                />
                <TextField
                  label="Purpose / Description"
                  fullWidth
                  size="small"
                  multiline
                  rows={2}
                  value={invoiceForm.purpose}
                  onChange={(e) => setInvoiceForm({ ...invoiceForm, purpose: e.target.value })}
                />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                  <Button 
                    variant="text" 
                    color="error" 
                    onClick={() => { setExtractedData(null); setInvoiceForm({ amount: '', purpose: '' }); }}
                  >
                    Remove
                  </Button>
                  <Button 
                    variant="contained" 
                    color="primary" 
                    disabled={submitLoading}
                    onClick={submitInvoiceRequest}
                  >
                    {submitLoading ? <CircularProgress size={20} color="inherit" /> : 'Submit Request'}
                  </Button>
                </Box>
              </Box>
            </Paper>
          )}
        </Box>

        {/* ── Invoice History ── */}
        <Box sx={{ flex: 1, minWidth: 300 }}>
          <Typography variant="h6" mb={2} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccessTime fontSize="small" color="primary" /> My Invoice History
          </Typography>
          <Paper sx={{ borderRadius: 3, border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: 'rgba(99,102,241,0.1)' }}>
                  <TableCell>Invoice ID</TableCell>
                  <TableCell>Purpose</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Date</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoices.length === 0 && (
                  <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.disabled' }}>No invoices submitted yet</TableCell></TableRow>
                )}
                {invoices.map((inv) => (
                  <TableRow key={inv.id} sx={{ '&:hover': { backgroundColor: 'rgba(255,255,255,0.03)' } }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.id}</TableCell>
                    <TableCell sx={{ maxWidth: 150 }}>
                      <Tooltip title={inv.purpose}>
                        <Typography variant="caption" noWrap>{inv.purpose}</Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600} color="primary.light">₹{inv.amount}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">{new Date(inv.ts).toLocaleDateString('en-IN')}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={statusLabel(inv.status)} color={statusColor(inv.status)} size="small" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
};

export default VendorPortal;
