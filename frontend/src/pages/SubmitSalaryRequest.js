import React, { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Paper, Alert, Grid, CircularProgress,
  Select, MenuItem, InputLabel, FormControl, Autocomplete, InputAdornment, IconButton, Tooltip,
} from '@mui/material';
import {
  CheckCircleRounded, DescriptionRounded, OpenInNewRounded, DeleteOutlineRounded,
  ReceiptLongRounded, AutoAwesome, ArrowForwardRounded,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { generateInvoicePdf } from '../utils/generateInvoicePdf';
import AuthedFile from '../components/AuthedFile';
import { PageHeader, SectionCard, ToneChip, ChecklistCard, FileDropZone, EmptyState } from '../components/ui';
import { tokens, tones } from '../theme';
import { formatINR, parseMsg } from '../utils/format';

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
  const [msgFrom, setMsgFrom] = useState('upload'); // which control the status message belongs to
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
    setMsgFrom('upload');
    setUploadMessage('Uploading document…');
    setUploading(true);
    const formData = new FormData();
    formData.append('invoice', file); // backend field name is generic
    formData.append('skip_ocr', 'true'); // payslip/ID proof — no AI extraction needed
    formData.append('invoice_kind', 'SALARY'); // gets a unique invoice code from the server
    try {
      const res = await apiFetch('/api/invoices/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setFileHash(data.file_hash);
        setUploadMessage(`✅ ${data.invoice_code ? `Uploaded · ${data.invoice_code}` : 'Document uploaded'}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setUploadMessage(`❌ ${data.error || 'Upload failed. Please try again.'}`);
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
    setMsgFrom('generate');
    if (!employeeName.trim() || !baseSalary || parseFloat(baseSalary) <= 0) {
      setUploadMessage('❌ Enter your name and base salary first, then generate the invoice.');
      return;
    }
    setGeneratingInvoice(true);
    setUploadMessage('Generating invoice from your details…');
    try {
      // Reserve the unique invoice code first so it can be printed on the PDF
      const codeRes = await apiFetch('/api/invoices/reserve-code', { method: 'POST', body: { kind: 'SALARY' } });
      const codeData = await codeRes.json().catch(() => ({}));
      if (!codeRes.ok || !codeData.invoice_code) {
        setUploadMessage(`❌ ${codeData.error || 'Could not get an invoice code. Please try again.'}`);
        return;
      }
      const invoiceCode = codeData.invoice_code;
      const pdfFile = generateInvoicePdf({
        invoiceNo: invoiceCode,
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
      formData.append('invoice_kind', 'SALARY');
      formData.append('invoice_code', invoiceCode);
      const res = await apiFetch('/api/invoices/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setFileHash(data.file_hash);
        setUploadMessage(`✅ Generated · ${data.invoice_code || invoiceCode}`);
      } else {
        const data = await res.json().catch(() => ({}));
        setUploadMessage(`❌ ${data.error || 'Could not generate the invoice.'}`);
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
    if (isFirstSubmission && !fileHash) missingFields.push('Payslip or proof (required on your first request; upload one or generate an invoice)');

    if (missingFields.length > 0) {
      setError(`Still needed: ${missingFields.join(', ')}.`);
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

  const done = {
    employee: !!(employeeName.trim() && phone.trim() && city.trim()),
    salary: !!(month && parseFloat(baseSalary) > 0 && projectHead.trim()),
    proof: !!fileHash || !isFirstSubmission,
    bank: !!(beneficiaryName.trim() && bankName.trim() && branchName.trim() && ifscCode.length === 11 && accountNumber.trim()),
    remarks: !!purpose.trim(),
  };
  const checklist = [
    { key: 'employee', label: 'Your details', anchor: 'sal-employee' },
    { key: 'salary', label: 'Salary', anchor: 'sal-salary' },
    { key: 'proof', label: isFirstSubmission ? 'Payslip or proof' : 'Payslip (optional)', anchor: 'sal-proof' },
    { key: 'bank', label: 'Bank details', anchor: 'sal-bank' },
    { key: 'remarks', label: 'Remarks', anchor: 'sal-remarks' },
  ];
  const upload = parseMsg(uploadMessage);
  const base = parseFloat(baseSalary) || 0;
  const ded = parseFloat(deductions) || 0;
  const monthLabel = month ? new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : null;

  if (success) {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
        <EmptyState
          icon={<CheckCircleRounded sx={{ color: tones.success.fg }} />}
          title="Salary request submitted"
          description="Your approver has been notified. Taking you back to the dashboard…"
        />
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 8 }}>
      <PageHeader
        eyebrow="Salary"
        title="Request a salary payment"
        subtitle="Tell us the month and amount, confirm your bank account, and we'll route it to your approver. Your progress is saved as you type."
      />

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 3, alignItems: 'start' }}>
        <Box sx={{ display: 'grid', gap: 2.5, minWidth: 0 }}>

          {/* ── 1. EMPLOYEE ── */}
          <SectionCard id="sal-employee" step={1} complete={done.employee} title="Your details" description="So finance knows who is being paid and how to reach you.">
            <Grid container spacing={2.5}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required label="Full name" value={employeeName} onChange={(e) => setEmployeeName(e.target.value)} autoComplete="name" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Employee ID" value={employeeCode} onChange={(e) => setEmployeeCode(e.target.value)} helperText="Optional" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" autoComplete="tel" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} helperText="Optional" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <Autocomplete
                  options={Object.keys(INDIA_CITIES)}
                  value={city || null}
                  onChange={(e, selectedCity) => {
                    setCity(selectedCity || '');
                    setState(selectedCity && INDIA_CITIES[selectedCity] ? INDIA_CITIES[selectedCity] : '');
                  }}
                  renderInput={(params) => <TextField {...params} label="City" required fullWidth />}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="State" value={state} InputProps={{ readOnly: true }} helperText="Filled in from your city" />
              </Grid>
            </Grid>
          </SectionCard>

          {/* ── 2. SALARY ── */}
          <SectionCard id="sal-salary" step={2} complete={done.salary} title="Salary" description="Net payable is worked out for you from the base salary and deductions.">
            <Grid container spacing={2.5}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required type="month" label="Salary month" value={month} onChange={(e) => setMonth(e.target.value)} InputLabelProps={{ shrink: true }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth required label="Approver" value={projectHead} onChange={(e) => setProjectHead(e.target.value)}
                  helperText="The project head who signs off on this payment"
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth required type="number" label="Base salary" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} inputProps={{ min: 0 }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth type="number" label="Deductions" value={deductions} onChange={(e) => setDeductions(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }} inputProps={{ min: 0 }}
                  helperText="Enter 0 if there are none"
                />
              </Grid>
            </Grid>
          </SectionCard>

          {/* ── 3. PROOF ── */}
          <SectionCard
            id="sal-proof" step={3} complete={!!fileHash}
            title="Payslip or proof"
            description={isFirstSubmission
              ? 'Required for your first request. No document? Generate one from this form in the summary panel.'
              : "You've submitted before, so this is optional. You can still attach one."}
            badge={fileHash
              ? <ToneChip tone="success" label="Attached" icon={<CheckCircleRounded />} />
              : <ToneChip tone={isFirstSubmission ? 'warning' : 'neutral'} label={isFirstSubmission ? 'Required' : 'Optional'} />}
          >
            {!fileHash && !uploading && (
              <FileDropZone
                onFile={(f) => handleFileUpload({ target: { files: [f] } })}
                title="Drop a payslip or ID proof here, or "
              />
            )}
            {uploading && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, borderRadius: `${tokens.radius.lg}px`, border: `1px solid ${tones.accent.border}`, bgcolor: tones.accent.bg }}>
                <CircularProgress size={20} thickness={5} />
                <Typography variant="body2">Uploading document…</Typography>
              </Box>
            )}
            {upload.text && msgFrom === 'upload' && !fileHash && !uploading && (
              <Alert severity={upload.tone} sx={{ mt: 2 }}>{upload.text}</Alert>
            )}
            {fileHash && !uploading && (
              <Box sx={{ border: `1px solid ${tokens.border}`, borderRadius: `${tokens.radius.lg}px`, overflow: 'hidden', bgcolor: tokens.surfaceSunken, maxWidth: 420 }}>
                <Box sx={{ px: 1.75, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderBottom: `1px solid ${tokens.border}` }}>
                  <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                    <DescriptionRounded sx={{ fontSize: 16 }} /> {upload.tone === 'success' && upload.text ? upload.text : 'Attached document'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
                    <AuthedFile name={fileHash}>
                      {(fileUrl) => (
                        <Tooltip title="Open in new tab">
                          <IconButton size="small" href={fileUrl} target="_blank" rel="noopener noreferrer" aria-label="Open document"><OpenInNewRounded fontSize="small" /></IconButton>
                        </Tooltip>
                      )}
                    </AuthedFile>
                    <Tooltip title="Remove">
                      <IconButton size="small" onClick={() => { setFileHash(''); setUploadMessage(''); }} aria-label="Remove document"><DeleteOutlineRounded fontSize="small" /></IconButton>
                    </Tooltip>
                  </Box>
                </Box>
                <Box sx={{ p: 1.5, textAlign: 'center' }}>
                  <AuthedFile name={fileHash}>
                    {(fileUrl) => fileHash.toLowerCase().endsWith('.pdf') ? (
                      <iframe src={fileUrl} title="Document preview" width="100%" height="220px" style={{ border: 'none', backgroundColor: '#fff', borderRadius: 8 }} />
                    ) : (
                      <img src={fileUrl} alt="Document preview" style={{ maxWidth: '100%', maxHeight: 220, borderRadius: 8, display: 'inline-block' }} onError={(e) => { e.target.style.display = 'none'; }} />
                    )}
                  </AuthedFile>
                </Box>
              </Box>
            )}
          </SectionCard>

          {/* ── 4. BANK ── */}
          <SectionCard id="sal-bank" step={4} complete={done.bank} title="Bank details" description="The account the salary is paid into. Check the IFSC and account number carefully.">
            <Grid container spacing={2.5}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required label="Account holder name" value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} helperText="As it appears on your bank account" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required label="Bank" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="HDFC Bank, SBI, ICICI…" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required label="Branch" value={branchName} onChange={(e) => setBranchName(e.target.value)} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth required label="IFSC" value={ifscCode} onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                  placeholder="HDFC0000123" inputProps={{ maxLength: 11, style: { fontFamily: tokens.mono, letterSpacing: '0.04em' } }}
                  error={ifscCode.length > 0 && ifscCode.length !== 11}
                  helperText={ifscCode.length > 0 && ifscCode.length !== 11 ? `${ifscCode.length}/11 characters` : ' '}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required label="Account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} inputProps={{ inputMode: 'numeric', style: { fontFamily: tokens.mono } }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Account type</InputLabel>
                  <Select value={accountType} label="Account type" onChange={(e) => setAccountType(e.target.value)}>
                    <MenuItem value="Savings">Savings</MenuItem>
                    <MenuItem value="Current">Current</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </SectionCard>

          {/* ── 5. REMARKS ── */}
          <SectionCard id="sal-remarks" step={5} complete={done.remarks} title="Remarks" description="A short note for your approver: the month, your role, any adjustments.">
            <TextField
              fullWidth required multiline minRows={3} label="Remarks" value={purpose} onChange={(e) => setPurpose(e.target.value)}
              inputProps={{ maxLength: 500 }} helperText={`${purpose.length}/500`}
            />
          </SectionCard>
        </Box>

        {/* ── SUMMARY (sticky on desktop) ── */}
        <Box sx={{ position: { lg: 'sticky' }, top: { lg: 80 }, display: 'grid', gap: 2 }}>
          <Paper sx={{ p: 2.75, overflow: 'hidden', position: 'relative' }}>
            <Box aria-hidden sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(400px 180px at 100% 0%, rgba(99,102,241,0.16), transparent 70%)', pointerEvents: 'none' }} />
            <Box sx={{ position: 'relative' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Net payable{monthLabel ? ` · ${monthLabel}` : ''}</Typography>
              <Typography sx={{ fontSize: 34, fontWeight: 650, letterSpacing: '-0.035em', lineHeight: 1.15, mt: 0.25, fontFeatureSettings: '"tnum"' }}>
                {formatINR(netAmount)}
              </Typography>
              <Box sx={{ display: 'grid', gap: 0.75, mt: 2, pt: 2, borderTop: `1px solid ${tokens.border}` }}>
                {[['Base salary', formatINR(base)], ['Deductions', ded ? `− ${formatINR(ded)}` : formatINR(0)]].map(([k, v]) => (
                  <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{k}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 520, fontFeatureSettings: '"tnum"' }}>{v}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Paper>

          <ChecklistCard items={checklist} done={done} />

          {!fileHash && (
            <Paper sx={{ p: 2.5, borderColor: tones.warning.border, bgcolor: 'rgba(245,158,11,0.04)' }}>
              <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <ReceiptLongRounded sx={{ fontSize: 18, color: tones.warning.fg }} /> No payslip to hand?
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, mb: 1.5 }}>
                Fill in your name and base salary, then we'll generate a numbered invoice from this form and attach it.
              </Typography>
              <Button variant="outlined" color="warning" fullWidth onClick={handleGenerateInvoice} disabled={generatingInvoice} startIcon={generatingInvoice ? <CircularProgress size={14} color="inherit" /> : <AutoAwesome />}>
                {generatingInvoice ? 'Generating…' : 'Generate invoice'}
              </Button>
              {upload.text && msgFrom === 'generate' && !generatingInvoice && upload.tone === 'error' && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1.25, color: tones.danger.fg }}>{upload.text}</Typography>
              )}
            </Paper>
          )}

          <Box>
            <Button
              type="submit" variant="contained" size="large" fullWidth
              disabled={loading || success || checkingHistory}
              endIcon={!loading && <ArrowForwardRounded />}
              sx={{ minHeight: 50, fontSize: 15 }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Submit for approval'}
            </Button>
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 1.25, color: 'text.disabled' }}>
              Next: approver sign-off → finance check → payment
            </Typography>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default SubmitSalaryRequest;
