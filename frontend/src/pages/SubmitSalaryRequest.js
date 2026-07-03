import React, { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Paper, Alert, Grid, CircularProgress,
  Select, MenuItem, InputLabel, FormControl, Divider, Chip, Autocomplete
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { generateInvoicePdf } from '../utils/generateInvoicePdf';

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

const INDIA_CITIES = {
  "Mumbai": "Maharashtra", "Delhi": "Delhi", "Bengaluru": "Karnataka",
  "Hyderabad": "Telangana", "Chennai": "Tamil Nadu", "Kolkata": "West Bengal",
  "Pune": "Maharashtra", "Ahmedabad": "Gujarat", "Jaipur": "Rajasthan",
  "Lucknow": "Uttar Pradesh", "Surat": "Gujarat", "Kanpur": "Uttar Pradesh",
  "Nagpur": "Maharashtra", "Indore": "Madhya Pradesh", "Thane": "Maharashtra",
  "Bhopal": "Madhya Pradesh", "Patna": "Bihar", "Vadodara": "Gujarat",
  "Ghaziabad": "Uttar Pradesh", "Ludhiana": "Punjab", "Agra": "Uttar Pradesh",
  "Nashik": "Maharashtra", "Faridabad": "Haryana", "Meerut": "Uttar Pradesh", "Rajkot": "Gujarat"
};

// Draft auto-save — navigating to another sidebar page (e.g. "Employee Queries") and back
// unmounts/remounts this form, which would otherwise wipe out everything typed so far.
const DRAFT_KEY = 'salaryRequestDraft';
function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
  } catch {
    return {};
  }
}

const SubmitSalaryRequest = () => {
  const navigate = useNavigate();
  const { apiFetch } = useApi();
  const draft = loadDraft();

  // Employee details
  const [employeeName, setEmployeeName] = useState(draft.employeeName || '');
  const [employeeCode, setEmployeeCode] = useState(draft.employeeCode || '');
  const [phone, setPhone] = useState(draft.phone || '');
  const [city, setCity] = useState(draft.city || '');
  const [state, setState] = useState(draft.state || '');
  const [department, setDepartment] = useState(draft.department || '');

  // Salary details
  const [month, setMonth] = useState(draft.month || '');
  const [baseSalary, setBaseSalary] = useState(draft.baseSalary || '');
  const [deductions, setDeductions] = useState(draft.deductions ?? '0');
  const [netAmount, setNetAmount] = useState(0);
  const [projectHead, setProjectHead] = useState(draft.projectHead || '');
  const [purpose, setPurpose] = useState(draft.purpose || '');

  // Optional payslip / proof upload
  const [fileHash, setFileHash] = useState(draft.fileHash || '');
  const [uploadMessage, setUploadMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);

  // Bank details
  const [beneficiaryName, setBeneficiaryName] = useState(draft.beneficiaryName || '');
  const [bankName, setBankName] = useState(draft.bankName || '');
  const [branchName, setBranchName] = useState(draft.branchName || '');
  const [ifscCode, setIfscCode] = useState(draft.ifscCode || '');
  const [accountNumber, setAccountNumber] = useState(draft.accountNumber || '');
  const [accountType, setAccountType] = useState(draft.accountType || 'Savings');

  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // A payslip/proof document is only required on this employee's very first submission.
  const [isFirstSubmission, setIsFirstSubmission] = useState(true);
  const [checkingHistory, setCheckingHistory] = useState(true);

  useEffect(() => {
    const checkHistory = async () => {
      try {
        const res = await apiFetch('/api/requests?limit=1');
        if (res.ok) {
          const data = await res.json();
          setIsFirstSubmission((data.pagination?.total || 0) === 0);
        }
      } catch (e) {
        console.error('Failed to check submission history', e);
      } finally {
        setCheckingHistory(false);
      }
    };
    checkHistory();
  }, [apiFetch]);

  useEffect(() => {
    const base = parseFloat(baseSalary) || 0;
    const ded = parseFloat(deductions) || 0;
    setNetAmount(Math.max(base - ded, 0));
  }, [baseSalary, deductions]);

  // Persist a draft on every change so switching to another page and back doesn't lose progress
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      employeeName, employeeCode, phone, city, state, department,
      month, baseSalary, deductions, projectHead, purpose, fileHash,
      beneficiaryName, bankName, branchName, ifscCode, accountNumber, accountType
    }));
  }, [
    employeeName, employeeCode, phone, city, state, department,
    month, baseSalary, deductions, projectHead, purpose, fileHash,
    beneficiaryName, bankName, branchName, ifscCode, accountNumber, accountType
  ]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadMessage('Uploading document...');
    setUploading(true);
    const formData = new FormData();
    formData.append('invoice', file); // backend field name is generic
    formData.append('skip_ocr', 'true'); // payslip/ID proof — no AI extraction needed
    try {
      const res = await apiFetch('/api/invoices/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setFileHash(data.file_hash);
        setUploadMessage('✅ Document uploaded successfully!');
      } else {
        const data = await res.json().catch(() => ({}));
        setUploadMessage(data.error || '❌ Upload failed.');
      }
    } catch (err) {
      setUploadMessage('❌ Network error uploading document.');
    } finally {
      setUploading(false);
    }
  };

  // For employees without a payslip/proof document — builds a simple PDF from
  // whatever they've already typed into the form and attaches it.
  const handleGenerateInvoice = async () => {
    if (!employeeName.trim() || !baseSalary || parseFloat(baseSalary) <= 0) {
      setUploadMessage('❌ Enter at least your Name and Base Salary before generating an invoice.');
      return;
    }
    setGeneratingInvoice(true);
    setUploadMessage('Generating invoice from your details...');
    try {
      const pdfFile = generateInvoicePdf({
        title: 'Salary Payment Request',
        fromName: employeeName,
        fromDetail: employeeCode ? `Employee ID: ${employeeCode}` : '',
        toName: 'Ai Collective Finance',
        date: month || new Date().toISOString().slice(0, 10),
        amount: netAmount || parseFloat(baseSalary),
        lineItems: [
          { label: `Base Salary (${month || 'this period'})`, amount: parseFloat(baseSalary) || 0 },
          ...(parseFloat(deductions) > 0 ? [{ label: 'Deductions', amount: -parseFloat(deductions) }] : [])
        ],
        purpose: purpose || `Salary payment for ${employeeName}`
      });
      const formData = new FormData();
      formData.append('invoice', pdfFile);
      formData.append('skip_ocr', 'true');
      const res = await apiFetch('/api/invoices/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setFileHash(data.file_hash);
        setUploadMessage('✅ Invoice generated and attached from your details.');
      } else {
        const data = await res.json().catch(() => ({}));
        setUploadMessage(data.error || '❌ Failed to generate invoice.');
      }
    } catch (err) {
      setUploadMessage('❌ Network error generating invoice.');
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const missingFields = [];
    if (!employeeName.trim()) missingFields.push('Employee Name');
    if (!phone.trim()) missingFields.push('Phone Number');
    if (!city.trim()) missingFields.push('City / Location');
    if (!month) missingFields.push('Salary Month');
    if (!baseSalary || parseFloat(baseSalary) <= 0) missingFields.push('Base Salary');
    if (!projectHead.trim()) missingFields.push('Project Head / Approver');
    if (!beneficiaryName.trim()) missingFields.push('Beneficiary Name');
    if (!bankName.trim()) missingFields.push('Bank Name');
    if (!branchName.trim()) missingFields.push('Branch Name');
    if (!ifscCode.trim() || ifscCode.length !== 11) missingFields.push('Valid 11-digit IFSC Code');
    if (!accountNumber.trim()) missingFields.push('Bank Account Number');
    if (!purpose.trim()) missingFields.push('Remarks');
    if (isFirstSubmission && !fileHash) missingFields.push('Payslip / Proof Document — required for your first submission; upload one or use "Generate Invoice" below');

    if (missingFields.length > 0) {
      setError(`Please fill in all mandatory fields: ${missingFields.join(', ')}.`);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const metadata = JSON.stringify({
        type: 'salary',
        employeeName, employeeCode, phone, city, state, department,
        month, baseSalary: parseFloat(baseSalary) || 0, deductions: parseFloat(deductions) || 0,
        netAmount, projectHead, fileHash,
        bankName, branchName, ifscCode, accountNumber, accountType, beneficiaryName
      });

      const res = await apiFetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: netAmount || parseFloat(baseSalary),
          purpose: purpose || `Salary payment for ${employeeName} — ${month}`,
          metadata,
          file_hash: fileHash,
          verifier: projectHead
        })
      });
      if (res.ok) {
        localStorage.removeItem(DRAFT_KEY);
        setSuccess(true);
        setTimeout(() => navigate('/'), 1500);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to submit request.');
      }
    } catch {
      setError('Network error. Failed to submit request.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <Alert severity="success" sx={{ fontSize: '1.1rem', p: 3 }}>✅ Salary request submitted successfully! Redirecting...</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 900, mx: 'auto' }}>
      <Paper sx={{ p: { xs: 2, sm: 4 }, borderRadius: 3 }}>
        <Typography variant="h5" fontWeight={700} mb={0.5}>Salary Payment Request Form</Typography>
        <Typography variant="body2" color="text.secondary" mb={3}>
          Submit a salary disbursement request. ★ Marked fields are mandatory.
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

        <form onSubmit={handleSubmit}>
          {/* ── EMPLOYEE DETAILS ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6" color="primary">1. Employee Details</Typography>
            <Chip label="All Fields Mandatory ★" size="small" sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700, fontSize: 10, border: '1px solid rgba(239,68,68,0.3)' }} />
          </Box>
          <Grid container spacing={3} mb={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Employee Name" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Employee ID / Code" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} placeholder="Optional" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Phone Number" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Optional" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                options={Object.keys(INDIA_CITIES)}
                value={city || null}
                onChange={(e, selectedCity) => {
                  setCity(selectedCity || '');
                  setState(selectedCity && INDIA_CITIES[selectedCity] ? INDIA_CITIES[selectedCity] : '');
                }}
                renderInput={(params) => (
                  <TextField {...params} label="City / Location ★" required fullWidth />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="State (Auto-filled)" value={state} InputProps={{ readOnly: true }} />
            </Grid>
          </Grid>
          <Divider sx={{ mb: 4 }} />

          {/* ── SALARY DETAILS ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6" color="primary">2. Salary Details</Typography>
            <Chip label="All Fields Mandatory ★" size="small" sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700, fontSize: 10, border: '1px solid rgba(239,68,68,0.3)' }} />
          </Box>
          <Grid container spacing={3} mb={2}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required type="month" label="Salary Month" value={month} onChange={(e) => setMonth(e.target.value)} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required type="number" label="Base Salary" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} InputProps={{ startAdornment: '₹' }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth type="number" label="Deductions (enter 0 if none)" value={deductions} onChange={(e) => setDeductions(e.target.value)} InputProps={{ startAdornment: '₹' }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth label="Net Payable (Auto-calculated)" value={netAmount.toFixed(2)} InputProps={{ readOnly: true, startAdornment: '₹' }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                label="Project Head / Approver"
                placeholder="Type the name of the person approving this request"
                value={projectHead}
                onChange={(e) => setProjectHead(e.target.value)}
              />
            </Grid>
          </Grid>
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12}>
              <TextField
                fullWidth required label="Remarks" multiline rows={3}
                value={purpose} onChange={(e) => setPurpose(e.target.value)}
                placeholder="Brief note about this salary payment (e.g. month, role, any adjustments)."
              />
            </Grid>
          </Grid>
          <Divider sx={{ mb: 4 }} />

          {/* ── OPTIONAL PROOF / PAYSLIP UPLOAD ── */}
          <Typography variant="h6" color="primary" mb={1}>
            3. Payslip / Proof Document {isFirstSubmission ? '★ Required (first submission)' : '(Optional)'}
          </Typography>
          {!isFirstSubmission && (
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              You've submitted before, so a document isn't required this time — but you can still attach one, or use "Generate Invoice from Details" below.
            </Typography>
          )}
          <Box sx={{ mb: 4, p: 3, border: '1px dashed rgba(99,102,241,0.5)', borderRadius: 2, bgcolor: 'rgba(99,102,241,0.05)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
              {!fileHash ? (
                <Button variant="outlined" component="label" disabled={uploading}>
                  📁 Upload Payslip / ID Proof (Image/PDF)
                  <input type="file" hidden accept="image/*,.webp,.heic,.heif,.pdf" onChange={handleFileUpload} />
                </Button>
              ) : (
                <>
                  <Button
                    variant="outlined"
                    color="primary"
                    href={`${API_BASE_URL}/uploads/${fileHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    👁️ Preview Document
                  </Button>
                  <Button variant="outlined" color="error" onClick={() => { setFileHash(''); setUploadMessage(''); }}>
                    ❌ Remove Document
                  </Button>
                </>
              )}
              {uploading && <CircularProgress size={20} />}
              {uploadMessage && (
                <Typography variant="body2" sx={{ color: uploadMessage.startsWith('✅') ? 'success.main' : 'text.secondary' }}>
                  {uploadMessage}
                </Typography>
              )}
            </Box>

            {fileHash && !uploading && (
              <Box sx={{ mt: 2, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', maxWidth: 340 }}>
                <Typography variant="caption" sx={{ p: 1, display: 'block', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 600, color: 'text.secondary', bgcolor: 'rgba(255,255,255,0.02)' }}>
                  📄 Document Preview
                </Typography>
                <Box sx={{ p: 1.5, backgroundColor: 'rgba(0,0,0,0.2)', textAlign: 'center' }}>
                  {fileHash.toLowerCase().endsWith('.pdf') ? (
                    <iframe src={`${API_BASE_URL}/uploads/${fileHash}`} title="Document Preview" width="100%" height="200px" style={{ border: 'none', backgroundColor: '#fff', borderRadius: 4 }} />
                  ) : (
                    <img
                      src={`${API_BASE_URL}/uploads/${fileHash}`}
                      alt="Document Preview"
                      style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4, display: 'inline-block' }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                  )}
                </Box>
              </Box>
            )}
          </Box>

          {/* ── BANK DETAILS ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6" color="primary">4. Bank Details</Typography>
            <Chip label="All Fields Mandatory ★" size="small" sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700, fontSize: 10, border: '1px solid rgba(239,68,68,0.3)' }} />
          </Box>
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Beneficiary / Account Holder Name" value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} placeholder="Name as in Bank Account" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Bank Name" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. HDFC Bank, SBI, ICICI" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Branch Name" value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="e.g. Connaught Place, Mumbai Main" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="IFSC Code" value={ifscCode} onChange={(e) => setIfscCode(e.target.value.toUpperCase())} placeholder="e.g. HDFC0000123" inputProps={{ maxLength: 11 }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required label="Bank Account Number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="e.g. 50100234567890" />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Account Type</InputLabel>
                <Select value={accountType} label="Account Type" onChange={(e) => setAccountType(e.target.value)}>
                  <MenuItem value="Savings">Savings</MenuItem>
                  <MenuItem value="Current">Current</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          {/* GENERATE INVOICE FROM TYPED DETAILS — for employees without a real payslip document */}
          <Paper sx={{
            p: 2.5, mb: 3, borderRadius: 2,
            bgcolor: fileHash ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
            border: `1px dashed ${fileHash ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}`
          }}>
            {fileHash ? (
              <>
                <Typography variant="subtitle2" fontWeight={700} color="success.main" mb={0.5}>
                  ✅ Document attached to this request
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                  See the preview in "3. Payslip / Proof Document" above. Remove it there if you'd like to attach a different one.
                </Typography>
                <Button
                  variant="outlined" size="small" color="primary"
                  href={`${API_BASE_URL}/uploads/${fileHash}`} target="_blank" rel="noopener noreferrer"
                >
                  👁️ Preview Attached Document
                </Button>
              </>
            ) : (
              <>
                <Typography variant="subtitle2" fontWeight={700} mb={0.5}>
                  🧾 Don't have a payslip or proof document?
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                  Fill in your Name and Base Salary above, then generate a simple invoice automatically from the details you've typed into this form.
                </Typography>
                <Button variant="outlined" color="warning" onClick={handleGenerateInvoice} disabled={generatingInvoice}>
                  {generatingInvoice ? <CircularProgress size={20} /> : '🧾 Generate Invoice from Details'}
                </Button>
                {uploadMessage && (
                  <Typography variant="body2" sx={{ mt: 1.5, color: uploadMessage.startsWith('✅') ? 'success.main' : uploadMessage.startsWith('❌') ? 'error.main' : 'text.secondary' }}>
                    {uploadMessage}
                  </Typography>
                )}
              </>
            )}
          </Paper>

          <Button
            type="submit" variant="contained" color="primary" size="large" fullWidth
            disabled={loading || success || checkingHistory} sx={{ py: 1.5, fontSize: '1.1rem' }}
          >
            {loading ? <CircularProgress size={24} color="inherit" /> : '🚀 Submit Salary Request'}
          </Button>
        </form>
      </Paper>
    </Box>
  );
};

export default SubmitSalaryRequest;
