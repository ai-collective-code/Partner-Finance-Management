import React, { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Paper, InputAdornment,
  Alert, Grid, CircularProgress, Switch, FormControlLabel,
  Select, MenuItem, InputLabel, FormControl,
  Tooltip, Autocomplete, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useApi } from '../hooks/useApi';
import { generateInvoicePdf } from '../utils/generateInvoicePdf';
import AuthedFile from '../components/AuthedFile';
import {
  CheckCircle, Cancel, AutoAwesome, PlayForWork, VerifiedUser, Lock,
  CheckRounded, CloseRounded, CloudUploadRounded, DescriptionRounded, SwapHorizRounded, OpenInNewRounded,
  CheckCircleRounded, ReceiptLongRounded, ArrowForwardRounded,
  UploadFileRounded, AccountBalanceRounded,
} from '@mui/icons-material';
import { PageHeader, SectionCard, ToneChip, KeyValue, Code, ChecklistCard } from '../components/ui';
import { tokens, tones } from '../theme';
import { formatINR, parseMsg, localToday } from '../utils/format';

const OUR_COMPANY_STATE = 'Uttar Pradesh';

const JOB_DESCRIPTIONS = ['Voice Own', 'AI Operator', 'AI Video Artist', 'Music', 'Scripting', 'Production', 'Sound Mixing', 'Story Board', 'Others'];

const INDIA_CITIES = {
  // Andhra Pradesh
  "Visakhapatnam": "Andhra Pradesh", "Vijayawada": "Andhra Pradesh", "Guntur": "Andhra Pradesh",
  "Nellore": "Andhra Pradesh", "Kurnool": "Andhra Pradesh", "Kadapa": "Andhra Pradesh",
  "Rajahmundry": "Andhra Pradesh", "Tirupati": "Andhra Pradesh", "Kakinada": "Andhra Pradesh",
  "Anantapur": "Andhra Pradesh", "Eluru": "Andhra Pradesh", "Ongole": "Andhra Pradesh",
  "Chittoor": "Andhra Pradesh", "Srikakulam": "Andhra Pradesh", "Machilipatnam": "Andhra Pradesh",
  // Arunachal Pradesh
  "Itanagar": "Arunachal Pradesh", "Naharlagun": "Arunachal Pradesh", "Pasighat": "Arunachal Pradesh",
  // Assam
  "Guwahati": "Assam", "Silchar": "Assam", "Dibrugarh": "Assam", "Jorhat": "Assam",
  "Nagaon": "Assam", "Tinsukia": "Assam", "Tezpur": "Assam", "Bongaigaon": "Assam",
  // Bihar
  "Patna": "Bihar", "Gaya": "Bihar", "Bhagalpur": "Bihar", "Muzaffarpur": "Bihar",
  "Purnia": "Bihar", "Darbhanga": "Bihar", "Bihar Sharif": "Bihar", "Arrah": "Bihar",
  "Begusarai": "Bihar", "Katihar": "Bihar", "Munger": "Bihar", "Chhapra": "Bihar",
  // Chhattisgarh
  "Raipur": "Chhattisgarh", "Bhilai": "Chhattisgarh", "Bilaspur (CG)": "Chhattisgarh",
  "Korba": "Chhattisgarh", "Durg": "Chhattisgarh", "Rajnandgaon": "Chhattisgarh",
  "Jagdalpur": "Chhattisgarh", "Ambikapur": "Chhattisgarh",
  // Goa
  "Panaji": "Goa", "Margao": "Goa", "Vasco da Gama": "Goa", "Mapusa": "Goa",
  // Gujarat
  "Ahmedabad": "Gujarat", "Surat": "Gujarat", "Vadodara": "Gujarat", "Rajkot": "Gujarat",
  "Bhavnagar": "Gujarat", "Jamnagar": "Gujarat", "Gandhinagar": "Gujarat", "Junagadh": "Gujarat",
  "Anand": "Gujarat", "Nadiad": "Gujarat", "Morbi": "Gujarat", "Mehsana": "Gujarat",
  "Bharuch": "Gujarat", "Vapi": "Gujarat", "Navsari": "Gujarat", "Porbandar": "Gujarat",
  // Haryana
  "Faridabad": "Haryana", "Gurugram": "Haryana", "Panipat": "Haryana", "Ambala": "Haryana",
  "Yamunanagar": "Haryana", "Rohtak": "Haryana", "Hisar": "Haryana", "Karnal": "Haryana",
  "Sonipat": "Haryana", "Panchkula": "Haryana", "Bhiwani": "Haryana", "Sirsa": "Haryana",
  "Bahadurgarh": "Haryana", "Jind": "Haryana", "Kaithal": "Haryana", "Rewari": "Haryana", "Palwal": "Haryana",
  // Himachal Pradesh
  "Shimla": "Himachal Pradesh", "Solan": "Himachal Pradesh", "Dharamshala": "Himachal Pradesh",
  "Mandi": "Himachal Pradesh", "Kullu": "Himachal Pradesh", "Una": "Himachal Pradesh",
  "Bilaspur (HP)": "Himachal Pradesh", "Hamirpur": "Himachal Pradesh",
  // Jharkhand
  "Ranchi": "Jharkhand", "Jamshedpur": "Jharkhand", "Dhanbad": "Jharkhand", "Bokaro": "Jharkhand",
  "Deoghar": "Jharkhand", "Hazaribagh": "Jharkhand", "Giridih": "Jharkhand",
  // Karnataka
  "Bengaluru": "Karnataka", "Mysuru": "Karnataka", "Hubballi-Dharwad": "Karnataka",
  "Mangaluru": "Karnataka", "Belagavi": "Karnataka", "Kalaburagi": "Karnataka",
  "Davanagere": "Karnataka", "Ballari": "Karnataka", "Vijayapura": "Karnataka",
  "Shivamogga": "Karnataka", "Tumakuru": "Karnataka", "Raichur": "Karnataka",
  "Bidar": "Karnataka", "Hospet": "Karnataka", "Gadag-Betageri": "Karnataka", "Udupi": "Karnataka",
  // Kerala
  "Thiruvananthapuram": "Kerala", "Kochi": "Kerala", "Kozhikode": "Kerala", "Thrissur": "Kerala",
  "Kollam": "Kerala", "Palakkad": "Kerala", "Alappuzha": "Kerala", "Malappuram": "Kerala",
  "Kannur": "Kerala", "Kottayam": "Kerala",
  // Madhya Pradesh
  "Bhopal": "Madhya Pradesh", "Indore": "Madhya Pradesh", "Jabalpur": "Madhya Pradesh",
  "Gwalior": "Madhya Pradesh", "Ujjain": "Madhya Pradesh", "Sagar": "Madhya Pradesh",
  "Dewas": "Madhya Pradesh", "Satna": "Madhya Pradesh", "Ratlam": "Madhya Pradesh",
  "Rewa": "Madhya Pradesh", "Katni": "Madhya Pradesh", "Singrauli": "Madhya Pradesh",
  "Burhanpur": "Madhya Pradesh", "Khandwa": "Madhya Pradesh", "Bhind": "Madhya Pradesh",
  "Chhindwara": "Madhya Pradesh", "Guna": "Madhya Pradesh",
  // Maharashtra
  "Mumbai": "Maharashtra", "Pune": "Maharashtra", "Nagpur": "Maharashtra", "Thane": "Maharashtra",
  "Nashik": "Maharashtra", "Chhatrapati Sambhajinagar (Aurangabad)": "Maharashtra",
  "Solapur": "Maharashtra", "Amravati": "Maharashtra", "Kolhapur": "Maharashtra",
  "Sangli": "Maharashtra", "Malegaon": "Maharashtra", "Akola": "Maharashtra",
  "Latur": "Maharashtra", "Dhule": "Maharashtra", "Ahmednagar": "Maharashtra",
  "Chandrapur": "Maharashtra", "Parbhani": "Maharashtra", "Jalgaon": "Maharashtra",
  "Bhiwandi": "Maharashtra", "Nanded": "Maharashtra", "Ichalkaranji": "Maharashtra",
  "Panvel": "Maharashtra", "Vasai-Virar": "Maharashtra", "Navi Mumbai": "Maharashtra",
  "Pimpri-Chinchwad": "Maharashtra",
  // Manipur
  "Imphal": "Manipur", "Thoubal": "Manipur",
  // Meghalaya
  "Shillong": "Meghalaya", "Tura": "Meghalaya",
  // Mizoram
  "Aizawl": "Mizoram", "Lunglei": "Mizoram",
  // Nagaland
  "Kohima": "Nagaland", "Dimapur": "Nagaland",
  // Odisha
  "Bhubaneswar": "Odisha", "Cuttack": "Odisha", "Rourkela": "Odisha", "Berhampur": "Odisha",
  "Sambalpur": "Odisha", "Puri": "Odisha", "Balasore": "Odisha", "Bhadrak": "Odisha",
  // Punjab
  "Ludhiana": "Punjab", "Amritsar": "Punjab", "Jalandhar": "Punjab", "Patiala": "Punjab",
  "Bathinda": "Punjab", "Mohali": "Punjab", "Hoshiarpur": "Punjab", "Batala": "Punjab",
  "Pathankot": "Punjab", "Moga": "Punjab", "Firozpur": "Punjab", "Kapurthala": "Punjab",
  // Rajasthan
  "Jaipur": "Rajasthan", "Jodhpur": "Rajasthan", "Kota": "Rajasthan", "Bikaner": "Rajasthan",
  "Ajmer": "Rajasthan", "Udaipur (Rajasthan)": "Rajasthan", "Bhilwara": "Rajasthan",
  "Alwar": "Rajasthan", "Bharatpur": "Rajasthan", "Sikar": "Rajasthan", "Pali": "Rajasthan",
  "Sri Ganganagar": "Rajasthan", "Kishangarh": "Rajasthan",
  // Sikkim
  "Gangtok": "Sikkim", "Namchi": "Sikkim",
  // Tamil Nadu
  "Chennai": "Tamil Nadu", "Coimbatore": "Tamil Nadu", "Madurai": "Tamil Nadu",
  "Tiruchirappalli": "Tamil Nadu", "Salem": "Tamil Nadu", "Tirunelveli": "Tamil Nadu",
  "Tiruppur": "Tamil Nadu", "Erode": "Tamil Nadu", "Vellore": "Tamil Nadu",
  "Thoothukudi": "Tamil Nadu", "Dindigul": "Tamil Nadu", "Thanjavur": "Tamil Nadu",
  "Nagercoil": "Tamil Nadu", "Hosur": "Tamil Nadu", "Karur": "Tamil Nadu", "Kanchipuram": "Tamil Nadu",
  // Telangana
  "Hyderabad": "Telangana", "Warangal": "Telangana", "Nizamabad": "Telangana",
  "Karimnagar": "Telangana", "Khammam": "Telangana", "Ramagundam": "Telangana",
  "Mahbubnagar": "Telangana", "Nalgonda": "Telangana",
  // Tripura
  "Agartala": "Tripura", "Udaipur (Tripura)": "Tripura",
  // Uttar Pradesh
  "Lucknow": "Uttar Pradesh", "Kanpur": "Uttar Pradesh", "Ghaziabad": "Uttar Pradesh",
  "Agra": "Uttar Pradesh", "Meerut": "Uttar Pradesh", "Varanasi": "Uttar Pradesh",
  "Prayagraj": "Uttar Pradesh", "Bareilly": "Uttar Pradesh", "Aligarh": "Uttar Pradesh",
  "Moradabad": "Uttar Pradesh", "Saharanpur": "Uttar Pradesh", "Gorakhpur": "Uttar Pradesh",
  "Noida": "Uttar Pradesh", "Firozabad": "Uttar Pradesh", "Jhansi": "Uttar Pradesh",
  "Muzaffarnagar": "Uttar Pradesh", "Mathura": "Uttar Pradesh", "Rampur": "Uttar Pradesh",
  "Shahjahanpur": "Uttar Pradesh", "Farrukhabad": "Uttar Pradesh", "Ayodhya": "Uttar Pradesh",
  "Mau": "Uttar Pradesh", "Hapur": "Uttar Pradesh", "Etawah": "Uttar Pradesh",
  "Mirzapur": "Uttar Pradesh", "Bulandshahr": "Uttar Pradesh", "Sambhal": "Uttar Pradesh",
  "Amroha": "Uttar Pradesh", "Hardoi": "Uttar Pradesh", "Fatehpur": "Uttar Pradesh",
  "Raebareli": "Uttar Pradesh", "Orai": "Uttar Pradesh", "Sitapur": "Uttar Pradesh",
  "Bahraich": "Uttar Pradesh", "Unnao": "Uttar Pradesh", "Jaunpur": "Uttar Pradesh",
  // Uttarakhand
  "Dehradun": "Uttarakhand", "Haridwar": "Uttarakhand", "Roorkee": "Uttarakhand",
  "Haldwani": "Uttarakhand", "Rudrapur": "Uttarakhand", "Kashipur": "Uttarakhand",
  "Rishikesh": "Uttarakhand", "Nainital": "Uttarakhand",
  // West Bengal
  "Kolkata": "West Bengal", "Howrah": "West Bengal", "Durgapur": "West Bengal",
  "Asansol": "West Bengal", "Siliguri": "West Bengal", "Bardhaman": "West Bengal",
  "Malda": "West Bengal", "Baharampur": "West Bengal", "Habra": "West Bengal",
  "Kharagpur": "West Bengal", "Shantipur": "West Bengal", "Dankuni": "West Bengal",
  "Jalpaiguri": "West Bengal", "Darjeeling": "West Bengal",
  // Union Territories
  "Delhi": "Delhi", "New Delhi": "Delhi",
  "Srinagar": "Jammu and Kashmir", "Jammu": "Jammu and Kashmir",
  "Anantnag": "Jammu and Kashmir", "Baramulla": "Jammu and Kashmir",
  "Leh": "Ladakh", "Kargil": "Ladakh",
  "Puducherry": "Puducherry", "Karaikal": "Puducherry",
  "Chandigarh": "Chandigarh",
  "Port Blair": "Andaman and Nicobar Islands",
  "Daman": "Dadra and Nagar Haveli and Daman and Diu", "Silvassa": "Dadra and Nagar Haveli and Daman and Diu",
  "Kavaratti": "Lakshadweep"
};

// ── Field Verification Badge Component ──
// Shown under fields that were auto-filled from the invoice: confirm or flag the value.
const FieldVerifyBadge = ({ fieldKey, verifications, onVerify }) => {
  const status = verifications[fieldKey];
  if (status === undefined) return null;
  const pill = (active, tone) => ({
    display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: '7px', cursor: 'pointer',
    fontSize: 12, fontWeight: 560, font: 'inherit', lineHeight: 1.6,
    border: `1px solid ${active ? tones[tone].border : tokens.border}`,
    bgcolor: active ? tones[tone].bg : 'transparent',
    color: active ? tones[tone].fg : 'text.secondary',
    '&:hover': { borderColor: tones[tone].border, color: tones[tone].fg },
    '&:focus-visible': { outline: 'none', boxShadow: tokens.focusRing },
  });
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75 }}>
      <Typography variant="caption" sx={{ color: 'text.disabled', mr: 0.25 }}>From invoice:</Typography>
      <Box component="button" type="button" aria-pressed={status === true} onClick={() => onVerify(fieldKey, true)} sx={pill(status === true, 'success')}>
        <CheckRounded sx={{ fontSize: 14 }} /> Correct
      </Box>
      <Box component="button" type="button" aria-pressed={status === false} onClick={() => onVerify(fieldKey, false)} sx={pill(status === false, 'danger')}>
        <CloseRounded sx={{ fontSize: 14 }} /> Needs fixing
      </Box>
    </Box>
  );
};

const SubmitRequest = () => {
  // OCR Scan States
  const [ocrData, setOcrData] = useState(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrApplied, setOcrApplied] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Per-field verification (null = not shown, true = verified, false = flagged incorrect)
  const [verifications, setVerifications] = useState({});

  // Verifier Selection
  const [selectedVerifier, setSelectedVerifier] = useState('');

  // Vendor Fields
  const [vendorName, setVendorName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');

  // Project Fields
  const [projectName, setProjectName] = useState('');
  const [department, setDepartment] = useState('');
  const [projectHead, setProjectHead] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Financial Fields
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [baseAmount, setBaseAmount] = useState('');
  const [isGst, setIsGst] = useState(false);
  const [gstNumber, setGstNumber] = useState('');
  const [gstPercentage] = useState(18); // Fixed to 18%

  // Derived Financials
  const [gstAmount, setGstAmount] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [gstType, setGstType] = useState('N/A');

  // Request Meta
  const [purpose, setPurpose] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [uploadMessage, setUploadMessage] = useState('');
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Bank & Cheque States
  const [bankName, setBankName] = useState('');
  const [branchName, setBranchName] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountType, setAccountType] = useState('Savings');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [chequeFileHash, setChequeFileHash] = useState('');
  const [chequeUploadMessage, setChequeUploadMessage] = useState('');
  const [chequeUploading, setChequeUploading] = useState(false);
  
  const navigate = useNavigate();
  const { apiFetch } = useApi();

  const [activeProjects, setActiveProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null); // Full project object
  const [partnerNameMismatch, setPartnerNameMismatch] = useState(false);
  
  // OTP Verification Disabled

  // Partners: the first project picked after logging in is locked for that login (the server
  // holds the lock, so a refresh or a second tab can't change it). Logging out clears it.
  const { user } = useSelector((state) => state.auth);
  const isPartner = user?.role === 'VND';
  const [lockedProject, setLockedProject] = useState(null);
  const [pendingLockProject, setPendingLockProject] = useState(null); // awaiting confirmation
  const [lockingProject, setLockingProject] = useState(false);
  const [checkingLock, setCheckingLock] = useState(isPartner);

  useEffect(() => {
    const fetchProj = async () => {
      try {
        const res = await apiFetch('/api/projects');
        if (res.ok) {
          const data = await res.json();
          setActiveProjects(data || []);
        }
      } catch (e) {
        console.error('Failed to fetch projects', e);
      }
    };
    fetchProj();
  }, [apiFetch]);

  // Fill the project fields from a chosen project (partner-name check + phone auto-fill)
  const applyProject = (project) => {
    setSelectedProject(project);
    setProjectName(project.code ? `${project.name} (${project.code})` : project.name);
    setPartnerNameMismatch(!!project.partner_name &&
      vendorName.trim().toLowerCase() !== project.partner_name.trim().toLowerCase());
    if (project.partner_phone) setPhone(project.partner_phone);
  };

  const applyLock = (project) => {
    setLockedProject(project);
    applyProject(project);
  };

  useEffect(() => {
    if (!isPartner) return;
    const loadLock = async () => {
      try {
        const res = await apiFetch('/api/partner/project-lock');
        if (res.ok) {
          const data = await res.json();
          if (data.project) applyLock(data.project);
        }
      } catch (e) {
        console.error('Failed to load project lock', e);
      } finally {
        setCheckingLock(false);
      }
    };
    loadLock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiFetch, isPartner]);

  const confirmProjectLock = async () => {
    const project = pendingLockProject;
    setPendingLockProject(null);
    if (!project) return;
    setLockingProject(true);
    setError(null);
    try {
      const res = await apiFetch('/api/partner/project-lock', { method: 'POST', body: { projectId: project.id } });
      const data = await res.json();
      if (data.project) applyLock(data.project);
      if (!res.ok) setError(data.error || 'Could not lock the project.');
    } catch {
      setError('Network error. Could not lock the project.');
    } finally {
      setLockingProject(false);
    }
  };

  // When partner selects a project, validate partner name
  const handleProjectSelect = (event, newInputValue) => {
    setProjectName(newInputValue || '');
    setPartnerNameMismatch(false);
    setSelectedProject(null);

    if (!newInputValue) {
      setPhone('');
      return;
    }

    // Find matching project from the active list
    const matchedProject = activeProjects.find(p => {
      const displayName = p.code ? `${p.name} (${p.code})` : p.name;
      return displayName === newInputValue;
    });

    if (matchedProject) {
      setSelectedProject(matchedProject);

      // Check partner name match (case-insensitive)
      if (matchedProject.partner_name) {
        const partnerOk = vendorName.trim().toLowerCase() === matchedProject.partner_name.trim().toLowerCase();
        if (!partnerOk) {
          setPartnerNameMismatch(true);
        }
      }

      // If project has a partner phone, auto-fill phone
      if (matchedProject.partner_phone) {
        setPhone(matchedProject.partner_phone);
      }
    }
  };

  // Re-validate partner name when vendorName changes and a project is selected
  useEffect(() => {
    if (selectedProject && selectedProject.partner_name) {
      const partnerOk = vendorName.trim().toLowerCase() === selectedProject.partner_name.trim().toLowerCase();
      setPartnerNameMismatch(!partnerOk);
    }
  }, [vendorName, selectedProject]);



  // Dynamic GST Calculation Logic
  // CGST + SGST when vendor is in the same state as company (Uttar Pradesh)
  // IGST when vendor is in any other state
  useEffect(() => {
    const base = parseFloat(baseAmount) || 0;
    if (isGst) {
      const gAmt = (base * gstPercentage) / 100;
      setGstAmount(gAmt);
      setTotalAmount(base + gAmt);
      if (state === OUR_COMPANY_STATE) {
        // Same state as our company (Uttar Pradesh) → CGST + SGST
        setGstType(`CGST (${gstPercentage/2}%) & SGST (${gstPercentage/2}%)`);
      } else if (state) {
        // Different state from our company → IGST (inter-state)
        setGstType(`IGST (${gstPercentage}%)`);
      } else {
        setGstType('Select State for GST breakdown');
      }
    } else {
      setGstAmount(0);
      setTotalAmount(base);
      setGstType('N/A');
    }
  }, [baseAmount, isGst, gstPercentage, state]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploadMessage('Uploading and analyzing invoice with AI...');
    setOcrScanning(true);
    setOcrData(null);
    setOcrApplied(false);
    setVerifications({});
    const formData = new FormData();
    formData.append('invoice', file);
    formData.append('invoice_kind', 'PARTNER'); // gets a unique invoice code from the server

    try {
      const res = await apiFetch('/api/invoices/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setFileHash(data.file_hash);
        setUploadMessage(`✅ Invoice uploaded and analyzed successfully!${data.invoice_code ? ` Invoice code: ${data.invoice_code}` : ''}`);
        setOcrData({
          extracted_amount: data.extracted_amount,
          vendor_name: data.vendor_name,
          invoice_date: data.invoice_date,
          gst_number: data.gst_number,
          purpose: data.purpose,
          ocr_confidence: data.ocr_confidence,
          ocr_engine: data.ocr_engine
        });
      } else {
        const errData = await res.json().catch(() => ({}));
        setUploadMessage(`❌ Failed to upload invoice. ${errData.error || ''}`);
      }
    } catch (err) {
      setUploadMessage('❌ Network error uploading invoice.');
    } finally {
      setOcrScanning(false);
    }
  };

  const handleChequeUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setChequeUploadMessage('Uploading bank document...');
    setChequeUploading(true);
    const formData = new FormData();
    formData.append('invoice', file); // Multer expects the field name "invoice"
    formData.append('skip_ocr', 'true'); // Skip AI OCR for cheque/bank docs — just store file

    try {
      const res = await apiFetch('/api/invoices/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setChequeFileHash(data.file_hash);
        setChequeUploadMessage('✅ Bank document uploaded successfully!');
      } else {
        const data = await res.json().catch(() => ({}));
        setChequeUploadMessage(`❌ ${data.error || 'Upload failed.'}`);
      }
    } catch (err) {
      console.error(err);
      setChequeUploadMessage('❌ Network error uploading bank document.');
    } finally {
      setChequeUploading(false);
    }
  };

  // For partners without a real invoice document — builds a simple PDF from whatever
  // they've already typed into the form and attaches it as the invoice file.
  const handleGenerateInvoice = async () => {
    if (!vendorName.trim() || !baseAmount || parseFloat(baseAmount) <= 0) {
      setUploadMessage('❌ Enter at least Partner Name and Base Invoice Amount before generating an invoice.');
      return;
    }
    setGeneratingInvoice(true);
    setUploadMessage('Generating invoice from your details...');
    try {
      // Reserve the unique invoice code first so it can be printed on the PDF
      const codeRes = await apiFetch('/api/invoices/reserve-code', { method: 'POST', body: { kind: 'PARTNER' } });
      const codeData = await codeRes.json().catch(() => ({}));
      if (!codeRes.ok || !codeData.invoice_code) {
        setUploadMessage(`❌ ${codeData.error || 'Could not get an invoice code. Please try again.'}`);
        return;
      }
      const invoiceCode = codeData.invoice_code;
      const base = parseFloat(baseAmount) || 0;
      const gstOn = isGst && gstAmount > 0;
      const pdfFile = generateInvoicePdf({
        invoiceNo: invoiceCode,
        title: gstOn && gstNumber ? 'Tax Invoice' : 'Invoice',
        from: {
          name: vendorName,
          company: companyName,
          address: [city, state].filter(Boolean).join(', '),
          phone,
          gstin: gstOn ? gstNumber : '',
        },
        toName: 'Ai Collective Finance',
        date: localToday(),
        project: {
          name: selectedProject?.name || projectName,
          code: selectedProject?.code || '',
        },
        baseAmount: base,
        gstAmount: gstOn ? gstAmount : 0,
        gstRate: gstOn ? gstPercentage : 0,
        gstMode: !gstOn ? undefined : state === OUR_COMPANY_STATE ? 'CGST_SGST' : state ? 'IGST' : undefined,
        amount: totalAmount || base,
        bank: { beneficiary: beneficiaryName, bankName, branch: branchName, accountNumber, ifsc: ifscCode, accountType },
        purpose: purpose || projectName || `Services by ${vendorName}`
      });
      const formData = new FormData();
      formData.append('invoice', pdfFile);
      formData.append('skip_ocr', 'true');
      formData.append('invoice_kind', 'PARTNER');
      formData.append('invoice_code', invoiceCode);
      const res = await apiFetch('/api/invoices/upload', { method: 'POST', body: formData });
      if (res.ok) {
        const data = await res.json();
        setFileHash(data.file_hash);
        setUploadMessage(`✅ Invoice ${data.invoice_code || invoiceCode} generated and attached from your details.`);
      } else {
        const data = await res.json().catch(() => ({}));
        setUploadMessage(`❌ ${data.error || 'Failed to generate invoice.'}`);
      }
    } catch (err) {
      setUploadMessage('❌ Network error generating invoice.');
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const applyOcrToForm = () => {
    if (!ocrData) return;
    const newVerifications = {};
    
    if (ocrData.vendor_name && !ocrData.vendor_name.includes('OCR Failed') && ocrData.vendor_name !== 'Unknown Vendor') {
      setVendorName(ocrData.vendor_name);
      setCompanyName(ocrData.vendor_name);
      newVerifications['vendorName'] = null;
      newVerifications['companyName'] = null;
    }
    if (ocrData.extracted_amount && ocrData.extracted_amount > 0) {
      setBaseAmount(ocrData.extracted_amount.toString());
      newVerifications['baseAmount'] = null;
    }
    if (ocrData.gst_number) {
      setGstNumber(ocrData.gst_number);
      setIsGst(true);
      newVerifications['gstNumber'] = null;
    }
    if (ocrData.purpose && !ocrData.purpose.includes('OCR Failed')) {
      setPurpose(ocrData.purpose);
      newVerifications['purpose'] = null;
    }
    if (ocrData.invoice_date) {
      setStartDate(ocrData.invoice_date);
      newVerifications['startDate'] = null;
    }

    // Set verifications to null (showing buttons but no status yet)
    setVerifications(newVerifications);
    setOcrApplied(true);
  };

  const handleVerify = (fieldKey, isCorrect) => {
    setVerifications(prev => ({ ...prev, [fieldKey]: isCorrect }));
  };

  // FLEXIBLE SUBMIT — only name, location (city), and amount are mandatory
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const missingFields = [];
    if (!fileHash) missingFields.push('Partner Invoice (Step 1): upload your invoice or use "Generate Invoice from Details" below');
    if (isPartner && !lockedProject) missingFields.push('Project: select your project from the list');
    if (!vendorName.trim()) missingFields.push('Partner Name');
    if (!companyName.trim()) missingFields.push('Company Name');
    if (!phone.trim()) missingFields.push('Phone Number');
    if (!city.trim()) missingFields.push('City / Location');
    if (!projectName.trim()) missingFields.push('Project Name');
    if (!department.trim()) missingFields.push('Job Description');
    if (!selectedVerifier) missingFields.push('Project Head');
    if (!startDate) missingFields.push('Start Date');
    if (!endDate) missingFields.push('End Date');
    if (advanceAmount.trim() === '') missingFields.push('Advance Amount (enter 0 if none)');
    if (!baseAmount || parseFloat(baseAmount) <= 0) missingFields.push('Base Invoice Amount');
    if (isGst && !gstNumber.trim()) missingFields.push('GST Number');
    if (!beneficiaryName.trim()) missingFields.push('Beneficiary Name');
    if (!bankName.trim()) missingFields.push('Bank Name');
    if (!branchName.trim()) missingFields.push('Branch Name');
    if (!ifscCode.trim() || ifscCode.length !== 11) missingFields.push('Valid 11-digit IFSC Code');
    if (!accountNumber.trim()) missingFields.push('Bank Account Number');
    if (!purpose.trim()) missingFields.push('Business Purpose / Remarks');

    if (missingFields.length > 0) {
      setError(`Please fill in all mandatory fields: ${missingFields.join(', ')}.`);
      return;
    }

    // Anti-fraud: Block if partner name doesn't match project's assigned partner
    if (selectedProject && selectedProject.partner_name && partnerNameMismatch) {
      setError(`Partner name "${vendorName}" does not match the authorized partner for this project. Please check your name or select a different project.`);
      return;
    }


    
    setLoading(true);
    setError(null);
    try {
      const metadata = JSON.stringify({
        vendorName, companyName, phone, city, state,
        projectName, department, projectHead, startDate, endDate,
        advanceAmount: parseFloat(advanceAmount) || 0,
        baseAmount: parseFloat(baseAmount) || 0,
        isGst, gstNumber, gstPercentage, gstAmount, totalAmount, gstType,
        fileHash,
        fieldVerifications: verifications,  // Save verification status
        bankName, branchName, ifscCode, accountNumber, accountType, beneficiaryName,
        chequeFileHash
      });

      const res = await apiFetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: totalAmount || parseFloat(baseAmount),
          purpose: purpose || `Invoice from ${vendorName || 'Partner'} — ₹${baseAmount}`,
          metadata,
          file_hash: fileHash,
          verifier: selectedVerifier
        })
      });
      if (res.ok) {
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

  // Count verified vs flagged fields
  const verifiedCount = Object.values(verifications).filter(v => v === true).length;
  const flaggedCount = Object.values(verifications).filter(v => v === false).length;
  const pendingCount = Object.values(verifications).filter(v => v === null).length;

  // Section completeness drives the step badges and the summary checklist
  const done = {
    invoice: !!fileHash,
    partner: !!(vendorName.trim() && companyName.trim() && phone.trim() && city.trim()),
    project: !!(projectName.trim() && department && selectedVerifier.trim() && startDate && endDate && (!isPartner || lockedProject)),
    amount: !!(parseFloat(baseAmount) > 0 && advanceAmount.trim() !== '' && (!isGst || gstNumber.trim())),
    bank: !!(beneficiaryName.trim() && bankName.trim() && branchName.trim() && ifscCode.length === 11 && accountNumber.trim()),
    remarks: !!purpose.trim(),
  };
  const checklist = [
    { key: 'invoice', label: 'Invoice', anchor: 'sec-invoice' },
    { key: 'partner', label: 'Your details', anchor: 'sec-partner' },
    { key: 'project', label: 'Project', anchor: 'sec-project' },
    { key: 'amount', label: 'Amount & GST', anchor: 'sec-amount' },
    { key: 'bank', label: 'Bank details', anchor: 'sec-bank' },
    { key: 'remarks', label: 'Description', anchor: 'sec-remarks' },
  ];
  const total = totalAmount || parseFloat(baseAmount) || 0;
  const upload = parseMsg(uploadMessage);
  const cheque = parseMsg(chequeUploadMessage);
  const resetInvoice = () => { setFileHash(''); setUploadMessage(''); setBaseAmount(''); setOcrData(null); setOcrApplied(false); setVerifications({}); };

  return (
    <Box sx={{ pb: 8 }}>
      <PageHeader
        eyebrow="Partner payout"
        title="Submit an invoice"
        subtitle="Attach your invoice, confirm your details and bank account, and we'll route it for approval. Every field is required unless marked optional."
      />

      {success && <Alert severity="success" sx={{ mb: 3 }}>Request submitted. Taking you back to the dashboard…</Alert>}
      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      <Box component="form" onSubmit={handleSubmit} noValidate sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 3, alignItems: 'start' }}>
        <Box sx={{ display: 'grid', gap: 2.5, minWidth: 0 }}>

          {/* ── 1. INVOICE ── */}
          <SectionCard
            id="sec-invoice" step={1} complete={done.invoice}
            title="Invoice"
            description="Upload your invoice and we'll read the key details for you. No invoice? Fill in the form and generate one from the summary panel."
            badge={fileHash && <ToneChip tone="success" label="Attached" icon={<CheckCircleRounded />} />}
          >
            {!fileHash && !ocrScanning && (
              <Box
                component="label"
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.[0]) handleFileUpload({ target: { files: e.dataTransfer.files } }); }}
                sx={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', cursor: 'pointer',
                  px: 3, py: 5, borderRadius: `${tokens.radius.lg}px`, border: '1.5px dashed',
                  borderColor: dragOver ? tokens.accent : tokens.borderStrong,
                  bgcolor: dragOver ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.015)',
                  transition: 'all .15s ease',
                  '&:hover': { borderColor: 'rgba(99,102,241,0.6)', bgcolor: 'rgba(99,102,241,0.05)' },
                  '&:focus-within': { boxShadow: tokens.focusRing },
                }}
              >
                <input type="file" hidden accept="image/*,.webp,.heic,.heif,.pdf" onChange={handleFileUpload} />
                <Box sx={{ width: 44, height: 44, borderRadius: '12px', display: 'grid', placeItems: 'center', mb: 1.5, bgcolor: 'rgba(99,102,241,0.14)', color: tokens.accentSoft }}>
                  <CloudUploadRounded />
                </Box>
                <Typography variant="subtitle2">Drop your invoice here, or <Box component="span" sx={{ color: tokens.accentSoft }}>browse</Box></Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled', mt: 0.5 }}>PDF, JPG, PNG, WEBP, HEIC and more · up to 10 MB</Typography>
              </Box>
            )}

            {ocrScanning && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2.5, borderRadius: `${tokens.radius.lg}px`, border: `1px solid ${tones.accent.border}`, bgcolor: tones.accent.bg }}>
                <CircularProgress size={26} thickness={5} />
                <Box>
                  <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <AutoAwesome sx={{ fontSize: 17, color: tones.violet.fg }} /> Reading your invoice
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'text.secondary' }}>Extracting partner name, amount, GST number and date…</Typography>
                </Box>
              </Box>
            )}

            {upload.text && !fileHash && !ocrScanning && (
              <Alert severity={upload.tone} sx={{ mt: 2 }}>{upload.text}</Alert>
            )}

            {fileHash && !ocrScanning && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: ocrData ? '5fr 7fr' : '1fr' }, gap: 2 }}>
                {/* Preview */}
                <Box sx={{ border: `1px solid ${tokens.border}`, borderRadius: `${tokens.radius.lg}px`, overflow: 'hidden', bgcolor: tokens.surfaceSunken }}>
                  <Box sx={{ px: 1.75, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${tokens.border}` }}>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <DescriptionRounded sx={{ fontSize: 16 }} /> Your invoice
                    </Typography>
                    <Button size="small" color="inherit" onClick={resetInvoice} startIcon={<SwapHorizRounded />} sx={{ color: 'text.secondary', minHeight: 28 }}>Replace</Button>
                  </Box>
                  <Box sx={{ p: 1.5, textAlign: 'center' }}>
                    <AuthedFile name={fileHash}>
                      {(fileUrl) => fileHash.toLowerCase().endsWith('.pdf') ? (
                        <Box>
                          <iframe src={fileUrl} title="Invoice PDF preview" width="100%" height="220px" style={{ border: 'none', backgroundColor: '#fff', borderRadius: 8 }} />
                          <Button size="small" variant="outlined" component="a" href={fileUrl} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRounded />} sx={{ mt: 1 }}>
                            Open PDF
                          </Button>
                        </Box>
                      ) : (
                        <img src={fileUrl} alt="Invoice preview" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, display: 'inline-block' }} onError={(e) => { e.target.style.display = 'none'; }} />
                      )}
                    </AuthedFile>
                  </Box>
                  {upload.text && (
                    <Typography variant="caption" sx={{ display: 'block', px: 1.75, pb: 1.5, color: upload.tone === 'success' ? tones.success.fg : upload.tone === 'error' ? tones.danger.fg : 'text.secondary' }}>
                      {upload.text}
                    </Typography>
                  )}
                </Box>

                {/* Detected data */}
                {ocrData && (
                  <Box sx={{ p: 2.25, borderRadius: `${tokens.radius.lg}px`, border: `1px solid ${tones.accent.border}`, background: 'linear-gradient(160deg, rgba(99,102,241,0.10), rgba(139,92,246,0.04))' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 2 }}>
                      <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <AutoAwesome sx={{ fontSize: 17, color: tones.violet.fg }} /> Details we found
                      </Typography>
                      <Tooltip title={`Read by ${ocrData.ocr_engine}`}>
                        <span><ToneChip tone={ocrData.ocr_confidence >= 80 ? 'success' : ocrData.ocr_confidence >= 50 ? 'warning' : 'danger'} label={`${ocrData.ocr_confidence}% confident`} /></span>
                      </Tooltip>
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                      <KeyValue label="Partner name" value={ocrData.vendor_name} strong />
                      <KeyValue label="Base amount" value={ocrData.extracted_amount ? formatINR(ocrData.extracted_amount) : null} strong />
                      <KeyValue label="Invoice date" value={ocrData.invoice_date} />
                      <KeyValue label="GST number" value={ocrData.gst_number} mono />
                    </Box>
                    {ocrData.ocr_confidence < 50 && (
                      <Alert severity="warning" sx={{ mb: 2, py: 0 }}>Low confidence — check every value before you submit.</Alert>
                    )}
                    <Button variant="contained" fullWidth onClick={applyOcrToForm} startIcon={<PlayForWork />} disabled={ocrApplied}>
                      {ocrApplied ? 'Applied to the form' : 'Fill the form with these'}
                    </Button>
                  </Box>
                )}
              </Box>
            )}

            {/* Review bar after auto-fill */}
            {ocrApplied && Object.keys(verifications).length > 0 && (
              <Box sx={{ mt: 2, p: 1.75, borderRadius: `${tokens.radius.md}px`, border: `1px solid ${tones.accent.border}`, bgcolor: tones.accent.bg, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                <VerifiedUser sx={{ color: tones.accent.fg, fontSize: 20 }} />
                <Typography variant="body2" sx={{ flex: 1, minWidth: 200 }}>
                  Check each auto-filled field below — confirm it, or flag it to fix.
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.75 }}>
                  {verifiedCount > 0 && <ToneChip tone="success" label={`${verifiedCount} confirmed`} />}
                  {flaggedCount > 0 && <ToneChip tone="danger" label={`${flaggedCount} flagged`} />}
                  {pendingCount > 0 && <ToneChip tone="warning" label={`${pendingCount} to check`} />}
                </Box>
              </Box>
            )}
          </SectionCard>

          {/* ── 2. PARTNER ── */}
          <SectionCard id="sec-partner" step={2} complete={done.partner} title="Your details" description="Who is being paid, and where you're based. Your state decides how GST is split.">
            <Grid container spacing={2.25}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth label="Partner name" value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)} required
                  error={verifications['vendorName'] === false}
                  helperText={verifications['vendorName'] === false ? 'Please correct this value' : undefined}
                />
                <FieldVerifyBadge fieldKey="vendorName" verifications={verifications} onVerify={handleVerify} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth label="Company name" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
                <FieldVerifyBadge fieldKey="companyName" verifications={verifications} onVerify={handleVerify} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} inputProps={{ inputMode: 'tel' }} />
              </Grid>
              <Grid item xs={12} sm={6} sx={{ display: { xs: 'none', sm: 'block' } }} />
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
                <TextField fullWidth label="State" value={state} placeholder="Filled from your city" InputProps={{ readOnly: true }} InputLabelProps={{ shrink: true }} helperText={state ? (state === OUR_COMPANY_STATE ? 'Same state as AI Collective — CGST + SGST' : 'Inter-state — IGST') : ' '} />
              </Grid>
            </Grid>
          </SectionCard>

          {/* ── 3. PROJECT ── */}
          <SectionCard id="sec-project" step={3} complete={done.project} title="Project" description="The project this work was for, and who's heading it.">
            <Grid container spacing={2.25}>
              <Grid item xs={12} sm={6}>
                {isPartner && lockedProject ? (
                  <TextField
                    fullWidth required label="Project" value={projectName}
                    InputProps={{ readOnly: true, startAdornment: <InputAdornment position="start"><Lock fontSize="small" sx={{ color: 'text.disabled' }} /></InputAdornment> }}
                    helperText="Locked for this sign-in. Sign out and back in to submit for another project."
                  />
                ) : isPartner ? (
                  <Autocomplete
                    options={activeProjects}
                    getOptionLabel={(p) => (p.code ? `${p.name} (${p.code})` : p.name)}
                    renderOption={(props, p) => (
                      <li {...props} key={p.id}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="body2" sx={{ fontWeight: 520 }}>{p.name}</Typography>
                          {p.code && <Code muted>{p.code}</Code>}
                        </Box>
                      </li>
                    )}
                    value={null}
                    onChange={(e, p) => { if (p) setPendingLockProject(p); }}
                    disabled={checkingLock || lockingProject}
                    renderInput={(params) => (
                      <TextField {...params} label="Project" required fullWidth helperText="Pick your project. It's locked once chosen." />
                    )}
                  />
                ) : (
                  <Autocomplete
                    freeSolo
                    options={activeProjects.map((option) => option.code ? `${option.name} (${option.code})` : option.name)}
                    value={projectName}
                    onInputChange={handleProjectSelect}
                    renderInput={(params) => <TextField {...params} label="Project" required fullWidth />}
                  />
                )}
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth required>
                  <InputLabel>Your role on the project</InputLabel>
                  <Select value={department} label="Your role on the project" onChange={(e) => setDepartment(e.target.value)}>
                    {JOB_DESCRIPTIONS.map(jd => <MenuItem key={jd} value={jd}>{jd}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth required label="Project head"
                  placeholder="Who is heading this project?"
                  value={selectedVerifier}
                  onChange={(e) => { setSelectedVerifier(e.target.value); setProjectHead(e.target.value); }}
                />
              </Grid>
              <Grid item xs={12} sm={6} sx={{ display: { xs: 'none', sm: 'block' } }} />
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required type="date" label="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
                <FieldVerifyBadge fieldKey="startDate" verifications={verifications} onVerify={handleVerify} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required type="date" label="End date" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true, }} inputProps={{ min: startDate || undefined }} />
              </Grid>
            </Grid>

            {/* Partner name check against the project's authorized partner */}
            {selectedProject && selectedProject.partner_name && (
              <Alert
                severity={partnerNameMismatch ? 'error' : 'success'}
                icon={partnerNameMismatch ? <Cancel /> : <CheckCircle />}
                sx={{ mt: 2.5 }}
              >
                {partnerNameMismatch
                  ? <>Your partner name must match <strong>{selectedProject.partner_name}</strong>, the authorized partner for this project.</>
                  : <>Partner name matches the authorized partner for this project.</>}
              </Alert>
            )}
          </SectionCard>

          {/* ── 4. AMOUNT ── */}
          <SectionCard id="sec-amount" step={4} complete={done.amount} title="Amount & GST" description="Enter the amount before tax. Turn on GST if you're registered — we'll calculate it at 18%.">
            <Grid container spacing={2.25}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth label="Base amount" type="number" value={baseAmount}
                  onChange={(e) => setBaseAmount(e.target.value)} required
                  error={verifications['baseAmount'] === false}
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  inputProps={{ min: 0, step: '0.01' }}
                />
                <FieldVerifyBadge fieldKey="baseAmount" verifications={verifications} onVerify={handleVerify} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth required label="Advance already received" type="number" value={advanceAmount}
                  onChange={(e) => setAdvanceAmount(e.target.value)}
                  helperText="Enter 0 if none"
                  InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                  inputProps={{ min: 0, step: '0.01' }}
                />
              </Grid>
            </Grid>

            <Box sx={{ mt: 2.5, p: 2, borderRadius: `${tokens.radius.md}px`, border: `1px solid ${isGst ? tones.accent.border : tokens.border}`, bgcolor: isGst ? 'rgba(99,102,241,0.05)' : 'transparent', transition: 'all .15s ease' }}>
              <FormControlLabel
                sx={{ m: 0, width: '100%', justifyContent: 'space-between' }}
                labelPlacement="start"
                control={<Switch checked={isGst} onChange={(e) => setIsGst(e.target.checked)} />}
                label={
                  <Box>
                    <Typography variant="subtitle2">I'm GST registered</Typography>
                    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                      18% — {state === OUR_COMPANY_STATE ? '9% CGST + 9% SGST' : 'IGST'}{!state && ' (pick your city to confirm)'}
                    </Typography>
                  </Box>
                }
              />
              {isGst && (
                <Grid container spacing={2.25} sx={{ mt: 0.5 }}>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth required label="GST number" value={gstNumber}
                      onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
                      placeholder="e.g. 09ABCDE1234F1Z5"
                      inputProps={{ maxLength: 15, style: { fontFamily: tokens.mono, letterSpacing: '0.02em' } }}
                    />
                    <FieldVerifyBadge fieldKey="gstNumber" verifications={verifications} onVerify={handleVerify} />
                  </Grid>
                  <Grid item xs={12} sm={6} sx={{ display: 'flex', alignItems: 'center' }}>
                    <KeyValue label={state === OUR_COMPANY_STATE ? 'CGST (9%) + SGST (9%)' : 'IGST (18%)'} value={formatINR(gstAmount)} strong />
                  </Grid>
                </Grid>
              )}
            </Box>
          </SectionCard>

          {/* ── 5. BANK ── */}
          <SectionCard id="sec-bank" step={5} complete={done.bank} title="Bank details" description="Where we'll send the payment. Double-check the account number and IFSC.">
            <Grid container spacing={2.25}>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required label="Account holder name" value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} placeholder="As shown on your bank account" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required label="Bank" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. HDFC Bank" />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required label="Account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\s/g, ''))} inputProps={{ inputMode: 'numeric', style: { fontFamily: tokens.mono } }} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth required label="IFSC code" value={ifscCode}
                  onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                  placeholder="e.g. HDFC0000123"
                  error={ifscCode.length > 0 && ifscCode.length !== 11}
                  helperText={ifscCode.length > 0 && ifscCode.length !== 11 ? `IFSC codes are 11 characters (${ifscCode.length}/11)` : ' '}
                  inputProps={{ maxLength: 11, style: { fontFamily: tokens.mono, letterSpacing: '0.02em' } }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField fullWidth required label="Branch" value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="e.g. Sector 18, Noida" />
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

            {/* Optional cancelled cheque */}
            <Box sx={{ mt: 2.5, p: 2, borderRadius: `${tokens.radius.md}px`, border: `1px dashed ${tokens.borderStrong}`, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ width: 36, height: 36, borderRadius: '10px', display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.04)', color: 'text.secondary' }}>
                <AccountBalanceRounded fontSize="small" />
              </Box>
              <Box sx={{ flex: 1, minWidth: 180 }}>
                <Typography variant="subtitle2">Cancelled cheque <Box component="span" sx={{ color: 'text.disabled', fontWeight: 400 }}>· optional</Box></Typography>
                <Typography variant="caption" sx={{ color: cheque.tone === 'error' ? tones.danger.fg : 'text.secondary' }}>
                  {cheque.text || 'Speeds up verification of your bank account.'}
                </Typography>
              </Box>
              {!chequeFileHash ? (
                <Button variant="outlined" component="label" disabled={chequeUploading} startIcon={chequeUploading ? <CircularProgress size={14} /> : <UploadFileRounded />}>
                  {chequeUploading ? 'Uploading…' : 'Upload'}
                  <input type="file" hidden accept="image/*,.webp,.heic,.heif,.pdf" onChange={handleChequeUpload} />
                </Button>
              ) : (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <AuthedFile name={chequeFileHash}>
                    {(chequeUrl) => (
                      <Button variant="outlined" href={chequeUrl} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewRounded />}>View</Button>
                    )}
                  </AuthedFile>
                  <Button color="inherit" sx={{ color: 'text.secondary' }} onClick={() => { setChequeFileHash(''); setChequeUploadMessage(''); }}>Remove</Button>
                </Box>
              )}
            </Box>
          </SectionCard>

          {/* ── 6. DESCRIPTION ── */}
          <SectionCard id="sec-remarks" step={6} complete={done.remarks} title="Description" description="A short note on the work delivered — this appears on the request your approvers see.">
            <TextField
              fullWidth required label="What was delivered?" multiline minRows={3}
              value={purpose} onChange={(e) => setPurpose(e.target.value)}
              placeholder="e.g. AI video edit for the Diwali campaign — 3 cutdowns (30s, 15s, 6s)"
              inputProps={{ maxLength: 500 }}
              helperText={`${purpose.length}/500`}
            />
            <FieldVerifyBadge fieldKey="purpose" verifications={verifications} onVerify={handleVerify} />
          </SectionCard>
        </Box>

        {/* ── SUMMARY (sticky on desktop) ── */}
        <Box sx={{ position: { lg: 'sticky' }, top: { lg: 80 }, display: 'grid', gap: 2 }}>
          <Paper sx={{ p: 2.75, overflow: 'hidden', position: 'relative' }}>
            <Box aria-hidden sx={{ position: 'absolute', inset: 0, background: 'radial-gradient(400px 180px at 100% 0%, rgba(99,102,241,0.16), transparent 70%)', pointerEvents: 'none' }} />
            <Box sx={{ position: 'relative' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Total payable</Typography>
              <Typography sx={{ fontSize: 34, fontWeight: 650, letterSpacing: '-0.035em', lineHeight: 1.15, mt: 0.25, fontFeatureSettings: '"tnum"' }}>
                {formatINR(total)}
              </Typography>
              <Box sx={{ display: 'grid', gap: 0.75, mt: 2, pt: 2, borderTop: `1px solid ${tokens.border}` }}>
                {[
                  ['Base amount', formatINR(parseFloat(baseAmount) || 0)],
                  [isGst ? (state === OUR_COMPANY_STATE ? 'CGST + SGST' : 'IGST') : 'GST', isGst ? formatINR(gstAmount) : 'Not applied'],
                  ['Advance received', formatINR(parseFloat(advanceAmount) || 0)],
                ].map(([k, v]) => (
                  <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                    <Typography variant="body2" sx={{ color: 'text.secondary' }}>{k}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 520, fontFeatureSettings: '"tnum"' }}>{v}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          </Paper>

          <ChecklistCard items={checklist} done={done} />

          {/* Generate an invoice when the partner has no document */}
          {!fileHash && (
            <Paper sx={{ p: 2.5, borderColor: tones.warning.border, bgcolor: 'rgba(245,158,11,0.04)' }}>
              <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <ReceiptLongRounded sx={{ fontSize: 18, color: tones.warning.fg }} /> No invoice document?
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.5, mb: 1.5 }}>
                Fill in your name and amount, then we'll generate a numbered invoice from this form and attach it.
              </Typography>
              <Button variant="outlined" color="warning" fullWidth onClick={handleGenerateInvoice} disabled={generatingInvoice} startIcon={generatingInvoice ? <CircularProgress size={14} color="inherit" /> : <AutoAwesome />}>
                {generatingInvoice ? 'Generating…' : 'Generate invoice'}
              </Button>
              {upload.text && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1.25, color: upload.tone === 'error' ? tones.danger.fg : 'text.secondary' }}>{upload.text}</Typography>
              )}
            </Paper>
          )}

          <Box>
            <Button
              type="submit" variant="contained" size="large" fullWidth
              disabled={loading || success || checkingLock || lockingProject || !fileHash}
              endIcon={!loading && <ArrowForwardRounded />}
              sx={{ minHeight: 50, fontSize: 15 }}
            >
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Submit for approval'}
            </Button>
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', mt: 1.25, color: !fileHash ? tones.warning.fg : 'text.disabled' }}>
              {!fileHash
                ? 'Attach or generate an invoice to submit.'
                : 'Next: owner approval → finance check → payment'}
            </Typography>
          </Box>
        </Box>
      </Box>

      <Dialog open={!!pendingLockProject} onClose={() => setPendingLockProject(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Lock fontSize="small" /> Use this project?</DialogTitle>
        <DialogContent>
          <Paper sx={{ p: 1.75, mb: 2, bgcolor: tokens.surfaceSunken }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{pendingLockProject?.name}</Typography>
            {pendingLockProject?.code && <Code muted>{pendingLockProject.code}</Code>}
          </Paper>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            The project is locked for this sign-in. To submit for a different project, sign out and sign in again.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button color="inherit" onClick={() => setPendingLockProject(null)}>Cancel</Button>
          <Button variant="contained" startIcon={<Lock />} onClick={confirmProjectLock}>Lock project</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default SubmitRequest;
