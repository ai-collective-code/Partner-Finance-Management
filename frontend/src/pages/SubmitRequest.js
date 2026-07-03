import React, { useState, useEffect } from 'react';
import { 
  Box, Typography, TextField, Button, Paper, InputAdornment, 
  Alert, Grid, CircularProgress, Switch, FormControlLabel, 
  Select, MenuItem, InputLabel, FormControl, Divider, Avatar, Chip,
  Tooltip, IconButton, Autocomplete, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../hooks/useApi';
import { generateInvoicePdf } from '../utils/generateInvoicePdf';
import {
  CheckCircle, Cancel, Palette,
  AutoAwesome, PlayForWork, VerifiedUser, HelpOutline, TaskAlt
} from '@mui/icons-material';

const STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Other'
];

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

const API_BASE_URL = process.env.REACT_APP_API_URL || '';

// ── Field Verification Badge Component ──
const FieldVerifyBadge = ({ fieldKey, verifications, onVerify }) => {
  const status = verifications[fieldKey];
  if (status === undefined) return null;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
      <Tooltip title="Confirm this value is correct">
        <IconButton 
          size="small" 
          onClick={() => onVerify(fieldKey, true)}
          sx={{ 
            color: status === true ? '#10b981' : 'rgba(255,255,255,0.3)', 
            p: 0.4,
            bgcolor: status === true ? 'rgba(16,185,129,0.12)' : 'transparent',
            border: status === true ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 1,
            transition: 'all 0.2s'
          }}
        >
          <TaskAlt sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      <Tooltip title="Mark as incorrect or uncertain">
        <IconButton 
          size="small" 
          onClick={() => onVerify(fieldKey, false)}
          sx={{ 
            color: status === false ? '#ef4444' : 'rgba(255,255,255,0.3)', 
            p: 0.4,
            bgcolor: status === false ? 'rgba(239,68,68,0.12)' : 'transparent',
            border: status === false ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: 1,
            transition: 'all 0.2s'
          }}
        >
          <Cancel sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>
      {status === true && (
        <Typography variant="caption" sx={{ color: '#10b981', fontWeight: 600, fontSize: 10 }}>Verified ✓</Typography>
      )}
      {status === false && (
        <Typography variant="caption" sx={{ color: '#ef4444', fontWeight: 600, fontSize: 10 }}>Please correct ✗</Typography>
      )}
    </Box>
  );
};

const SubmitRequest = () => {
  // OCR Scan States
  const [ocrData, setOcrData] = useState(null);
  const [ocrScanning, setOcrScanning] = useState(false);
  const [ocrApplied, setOcrApplied] = useState(false);

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
  const [gstPercentage, setGstPercentage] = useState(18); // Fixed to 18%

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
  
  // OTP Verification State
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpError, setOtpError] = useState('');
  const [otpDialogOpen, setOtpDialogOpen] = useState(false);

  // An invoice document is only mandatory on this partner's very first submission —
  // after that it's optional (they can still generate/attach one via the button below).
  const [isFirstSubmission, setIsFirstSubmission] = useState(true);
  const [checkingHistory, setCheckingHistory] = useState(true);

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

  // When partner selects a project, validate partner name
  const handleProjectSelect = (event, newInputValue) => {
    setProjectName(newInputValue || '');
    setPartnerNameMismatch(false);
    setOtpRequired(false);
    setOtpSent(false);
    setOtpVerified(false);
    setOtpCode('');
    setOtpError('');
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

      // If project has a partner phone, OTP is required
      if (matchedProject.partner_phone) {
        setOtpRequired(false);
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

  const handleSendOtp = async () => {
    if (!selectedProject?.partner_phone || !selectedProject?.code) return;
    setOtpLoading(true);
    setOtpError('');
    setOtpCode('');
    try {
      const res = await apiFetch('/api/projects/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selectedProject.partner_phone, projectCode: selectedProject.code })
      });
      const data = await res.json();
      if (res.ok) {
        setOtpSent(true);
        setOtpDialogOpen(true);
        if (data.debug_otp) {
          // Simulate phone SMS for testing
          window.alert(`📱 SIMULATED SMS to ${selectedProject.partner_phone}:\n\nYour Ai Collective Finance OTP is: ${data.debug_otp}`);
        }
      } else {
        setOtpError(data.error || 'Failed to send OTP');
      }
    } catch (e) {
      console.error(e);
      setOtpError('Network error sending OTP');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otpCode || !selectedProject?.partner_phone || !selectedProject?.code) return;
    setOtpLoading(true);
    setOtpError('');
    try {
      const res = await apiFetch('/api/projects/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selectedProject.partner_phone, otp: otpCode, projectCode: selectedProject.code })
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        setOtpVerified(true);
        setOtpDialogOpen(false);
        setOtpError('');
      } else {
        setOtpError(data.error || 'OTP verification failed');
      }
    } catch {
      setOtpError('Network error verifying OTP');
    } finally {
      setOtpLoading(false);
    }
  };

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
    
    try {
      const res = await apiFetch('/api/invoices/upload', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setFileHash(data.file_hash);
        setUploadMessage('✅ Invoice uploaded and analyzed successfully!');
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
        setChequeUploadMessage(data.error || '❌ Upload failed.');
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
      const pdfFile = generateInvoicePdf({
        title: 'Invoice',
        fromName: vendorName,
        fromDetail: companyName,
        toName: 'Ai Collective Finance',
        date: new Date().toISOString().slice(0, 10),
        amount: totalAmount || parseFloat(baseAmount),
        purpose: purpose || `Invoice from ${vendorName}`
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
    if (isFirstSubmission && !fileHash) missingFields.push('Partner Invoice File (Step 1) — required for your first submission; upload one or use "Generate Invoice" below');
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

    // Anti-fraud: Block if OTP required but not verified
    if (otpRequired && !otpVerified) {
      setError('Phone OTP verification is required for this project. Please verify your phone number before submitting.');
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

  return (
    <Box sx={{ maxWidth: 960, mx: 'auto', mt: 2, mb: 10 }}>
      <Typography variant="h4" mb={0.5} fontWeight={700}>Partner & Project Disbursement Form</Typography>
      <Typography variant="body1" color="text.secondary" mb={1}>
        Initialize a secure financial request. <strong style={{ color: '#f59e0b' }}>★ All form fields and documents are strictly mandatory.</strong>
      </Typography>
      <Paper sx={{ p: 4, borderRadius: 2 }}>
        {success && <Alert severity="success" sx={{ mb: 3 }}>Request submitted successfully! Redirecting to Dashboard...</Alert>}
        {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
        
        <form onSubmit={handleSubmit}>
          
          {/* ── STEP 1: UPLOAD INVOICE ── */}
          <Typography variant="h6" color="primary" mb={1}>
            1. Upload Partner Invoice (AI OCR) {isFirstSubmission ? '★ Required (first submission)' : '(Optional)'}
          </Typography>
          {!isFirstSubmission && (
            <Typography variant="caption" color="text.secondary" display="block" mb={1}>
              You've submitted before, so an invoice document isn't required this time — but you can still attach one, or use "Generate Invoice from Details" near the bottom of the form.
            </Typography>
          )}
          <Box sx={{ mb: 4, p: 3, border: '1px dashed rgba(99,102,241,0.5)', borderRadius: 2, bgcolor: 'rgba(99,102,241,0.05)' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1.5 }}>
              {!fileHash ? (
                <Button variant="outlined" component="label" sx={{ mr: 2, background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))', borderColor: 'primary.main' }} disabled={ocrScanning}>
                  📁 Upload Invoice (Image/PDF)
                  <input type="file" hidden accept="image/*,.webp,.heic,.heif,.pdf" onChange={handleFileUpload} />
                </Button>
              ) : (
                <Button variant="outlined" color="error" onClick={() => { setFileHash(''); setUploadMessage(''); setBaseAmount(''); setOcrData(null); setOcrApplied(false); setVerifications({}); }} disabled={ocrScanning}>
                  ❌ Remove & Change Invoice
                </Button>
              )}
              {uploadMessage && <Typography variant="body2" sx={{ display: 'inline-block', color: uploadMessage.startsWith('✅') ? 'success.main' : uploadMessage.startsWith('❌') ? 'error.main' : 'text.secondary' }}>{uploadMessage}</Typography>}
              {fileHash && <Chip label="Document Attached" size="small" color="success" />}
            </Box>
            <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1 }}>
              Supports: JPG, PNG, WEBP, GIF, BMP, TIFF, HEIC, PDF — Max 10MB
            </Typography>

            {ocrScanning && (
              <Paper sx={{ p: 3, mt: 2, display: 'flex', alignItems: 'center', gap: 3, borderRadius: 2, border: '1px solid rgba(99,102,241,0.2)', background: 'linear-gradient(135deg, rgba(99,102,241,0.03) 0%, rgba(139,92,246,0.03) 100%)' }}>
                <CircularProgress size={30} thickness={5} sx={{ color: '#6366f1' }} />
                <Box>
                  <Typography variant="subtitle2" fontWeight={700} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AutoAwesome sx={{ color: '#8b5cf6', fontSize: 18 }} /> High-Class AI OCR Scanning Active
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Extracting partner name, base amount, tax breakdowns, and handwriting...
                  </Typography>
                </Box>
              </Paper>
            )}

            {fileHash && !ocrScanning && (
              <Grid container spacing={3} mt={0.5}>
                {/* Left side: Preview */}
                <Grid item xs={12} md={5}>
                  <Box sx={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                    <Typography variant="caption" sx={{ p: 1, display: 'block', borderBottom: '1px solid rgba(255,255,255,0.08)', fontWeight: 600, color: 'text.secondary', bgcolor: 'rgba(255,255,255,0.02)' }}>
                      📄 Uploaded Invoice Preview
                    </Typography>
                    <Box sx={{ p: 1.5, backgroundColor: 'rgba(0,0,0,0.2)', textAlign: 'center' }}>
                      {fileHash.toLowerCase().endsWith('.pdf') ? (
                        <Box>
                          <iframe src={`${API_BASE_URL}/uploads/${fileHash}`} title="Invoice PDF Preview" width="100%" height="200px" style={{ border: 'none', backgroundColor: '#fff', borderRadius: 4 }} />
                          <Button variant="outlined" size="small" component="a" href={`${API_BASE_URL}/uploads/${fileHash}`} target="_blank" rel="noopener noreferrer" sx={{ mt: 1 }}>
                            📂 Open PDF in New Tab
                          </Button>
                        </Box>
                      ) : (
                        <img 
                          src={`${API_BASE_URL}/uploads/${fileHash}`} 
                          alt="Invoice Preview"
                          style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 4, display: 'inline-block' }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      )}
                    </Box>
                  </Box>
                </Grid>

                {/* Right side: OCR Results Panel */}
                {ocrData && (
                  <Grid item xs={12} md={7}>
                    <Paper sx={{ p: 2.5, borderRadius: 3, border: '1px solid rgba(99,102,241,0.25)', background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(139,92,246,0.08) 100%)', position: 'relative', overflow: 'hidden' }}>
                      <style>{`
                        @keyframes scan-line { 0% { top: 0%; } 50% { top: 100%; } 100% { top: 0%; } }
                      `}</style>
                      <Box sx={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: 'linear-gradient(90deg, transparent, #8b5cf6, transparent)', animation: 'scan-line 3s infinite linear' }} />
                      
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: 'primary.main', display: 'flex', alignItems: 'center', gap: 1 }}>
                          <AutoAwesome /> Auto-Detected Invoice Data
                        </Typography>
                        <Chip 
                          label={ocrData.ocr_engine} 
                          size="small" 
                          sx={{ 
                            background: ocrData.ocr_engine?.includes('Gemini') 
                              ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' 
                              : 'rgba(255,255,255,0.08)',
                            color: 'white', fontWeight: 700, fontSize: 10
                          }} 
                        />
                      </Box>

                      <Grid container spacing={2} mb={2.5}>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary" display="block">🤝 Partner Name</Typography>
                          <Typography variant="body2" fontWeight={600} noWrap>{ocrData.vendor_name || 'Not detected'}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary" display="block">💰 Amount (Base)</Typography>
                          <Typography variant="body2" fontWeight={600} sx={{ color: 'success.main' }}>
                            ₹{ocrData.extracted_amount ? ocrData.extracted_amount.toLocaleString('en-IN') : '0.00'}
                          </Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary" display="block">📅 Invoice Date</Typography>
                          <Typography variant="body2" fontWeight={600}>{ocrData.invoice_date || 'Not detected'}</Typography>
                        </Grid>
                        <Grid item xs={6}>
                          <Typography variant="caption" color="text.secondary" display="block">🔢 GST Number</Typography>
                          <Typography variant="body2" fontWeight={600} sx={{ color: ocrData.gst_number ? 'primary.light' : 'text.disabled' }}>
                            {ocrData.gst_number || 'No GST found'}
                          </Typography>
                        </Grid>
                      </Grid>

                      {/* Confidence Score */}
                      <Box sx={{ mb: 2.5 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Typography variant="caption" color="text.secondary">OCR Scan Confidence</Typography>
                          <Typography variant="caption" fontWeight={700} sx={{ color: ocrData.ocr_confidence >= 80 ? 'success.main' : ocrData.ocr_confidence >= 50 ? 'warning.main' : 'error.main' }}>
                            {ocrData.ocr_confidence}%
                          </Typography>
                        </Box>
                        <Box sx={{ width: '100%', height: 6, bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                          <Box sx={{ 
                            width: `${ocrData.ocr_confidence}%`, height: '100%', borderRadius: 3,
                            background: ocrData.ocr_confidence >= 80 
                              ? 'linear-gradient(90deg, #10b981, #059669)' 
                              : ocrData.ocr_confidence >= 50 
                                ? 'linear-gradient(90deg, #f59e0b, #d97706)' 
                                : 'linear-gradient(90deg, #ef4444, #dc2626)',
                            transition: 'width 1s ease-out'
                          }} />
                        </Box>
                      </Box>

                      <Button 
                        variant="contained" fullWidth onClick={applyOcrToForm}
                        startIcon={<PlayForWork />}
                        sx={{ py: 1, background: 'linear-gradient(135deg, #10b981, #059669)', fontWeight: 700, '&:hover': { background: 'linear-gradient(135deg, #059669, #047857)' } }}
                      >
                        ✨ Auto-fill Disbursement Form
                      </Button>
                    </Paper>
                  </Grid>
                )}
              </Grid>
            )}
          </Box>

          {/* ── OCR VERIFICATION STATUS BAR ── */}
          {ocrApplied && Object.keys(verifications).length > 0 && (
            <Paper sx={{ p: 2, mb: 3, borderRadius: 2, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)', display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <VerifiedUser sx={{ color: '#6366f1' }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" fontWeight={700} sx={{ color: 'primary.main' }}>
                  🔍 Second-Line Partner Verification Active
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Review each auto-filled field below — click ✓ to confirm accuracy or ✗ to flag for correction.
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {verifiedCount > 0 && <Chip label={`✓ ${verifiedCount} Confirmed`} size="small" sx={{ bgcolor: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 700, border: '1px solid rgba(16,185,129,0.3)' }} />}
                {flaggedCount > 0 && <Chip label={`✗ ${flaggedCount} Flagged`} size="small" sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700, border: '1px solid rgba(239,68,68,0.3)' }} />}
                {pendingCount > 0 && <Chip label={`? ${pendingCount} Pending`} size="small" sx={{ bgcolor: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700, border: '1px solid rgba(245,158,11,0.3)' }} />}
              </Box>
            </Paper>
          )}

          {/* ── STEP 2: VENDOR DETAILS ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6" color="primary">2. Partner Details</Typography>
            <Chip label="All Fields Mandatory ★" size="small" sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700, fontSize: 10, border: '1px solid rgba(239,68,68,0.3)' }} />
          </Box>
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth label="Partner Name" value={vendorName} 
                onChange={(e) => setVendorName(e.target.value)} required
                helperText={verifications['vendorName'] === false ? '⚠ Please correct this value' : verifications['vendorName'] === true ? '✓ Confirmed by partner' : ''}
                FormHelperTextProps={{ sx: { color: verifications['vendorName'] === false ? '#ef4444' : '#10b981' } }}
              />
              <FieldVerifyBadge fieldKey="vendorName" verifications={verifications} onVerify={handleVerify} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth label="Company Name" value={companyName} 
                onChange={(e) => setCompanyName(e.target.value)} required
              />
              <FieldVerifyBadge fieldKey="companyName" verifications={verifications} onVerify={handleVerify} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth 
                required
                label="Phone Number" 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)}
                InputProps={{
                  endAdornment: selectedProject?.partner_phone ? (
                    <InputAdornment position="end">
                      {otpVerified ? (
                        <Chip 
                          label="Verified ✅" 
                          size="small" 
                          sx={{ 
                            fontWeight: 700, 
                            bgcolor: 'rgba(16,185,129,0.15)', 
                            color: '#10b981', 
                            border: '1px solid rgba(16,185,129,0.4)',
                            height: 28
                          }} 
                        />
                      ) : (
                        <Button 
                          variant="contained" 
                          size="small" 
                          onClick={handleSendOtp} 
                          disabled={otpLoading || partnerNameMismatch}
                          sx={{ 
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', 
                            fontWeight: 700,
                            textTransform: 'none',
                            fontSize: '0.72rem',
                            py: 0.4,
                            px: 1.2,
                            boxShadow: 'none',
                            borderRadius: '6px',
                            '&:hover': {
                              background: 'linear-gradient(135deg, #5052d9, #7c4dff)',
                              boxShadow: 'none'
                            }
                          }}
                        >
                          {otpLoading ? 'Sending...' : otpSent ? 'Resend' : 'Verify'}
                        </Button>
                      )}
                    </InputAdornment>
                  ) : null
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}></Grid>
            
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

          {/* ── STEP 3: PROJECT DETAILS ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6" color="primary">3. Project Details</Typography>
            <Chip label="All Fields Mandatory ★" size="small" sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700, fontSize: 10, border: '1px solid rgba(239,68,68,0.3)' }} />
          </Box>
          <Grid container spacing={3} mb={2}>
            <Grid item xs={12} sm={6}>
              <Autocomplete
                freeSolo
                options={activeProjects.map((option) => option.code ? `${option.name} (${option.code})` : option.name)}
                value={projectName}
                onInputChange={handleProjectSelect}
                renderInput={(params) => (
                  <TextField {...params} label="Project Name" required fullWidth />
                )}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth required>
                <InputLabel>Job Description</InputLabel>
                <Select value={department} label="Job Description" onChange={(e) => setDepartment(e.target.value)}>
                  {JOB_DESCRIPTIONS.map(jd => <MenuItem key={jd} value={jd}>{jd}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                label="Project Head"
                placeholder="Type the name of the person heading this project"
                value={selectedVerifier}
                onChange={(e) => {
                  setSelectedVerifier(e.target.value);
                  setProjectHead(e.target.value);
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}></Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required type="date" label="Start Date" value={startDate} onChange={(e) => setStartDate(e.target.value)} InputLabelProps={{ shrink: true }} />
              <FieldVerifyBadge fieldKey="startDate" verifications={verifications} onVerify={handleVerify} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth required type="date" label="End Date" value={endDate} onChange={(e) => setEndDate(e.target.value)} InputLabelProps={{ shrink: true }} />
            </Grid>
          </Grid>

          {/* ── PARTNER VERIFICATION STATUS ── */}
          {selectedProject && (selectedProject.partner_name || selectedProject.partner_phone) && (
            <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2, border: '1px solid', borderColor: partnerNameMismatch ? 'error.main' : otpRequired && !otpVerified ? 'warning.main' : 'success.main', background: partnerNameMismatch ? 'rgba(239,68,68,0.05)' : otpRequired && !otpVerified ? 'rgba(245,158,11,0.05)' : 'rgba(16,185,129,0.05)' }}>
              <Typography variant="subtitle2" fontWeight={700} mb={1.5} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                🔒 Partner Verification
              </Typography>

              {/* Partner Name Check */}
              {selectedProject.partner_name && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {partnerNameMismatch ? (
                    <Cancel sx={{ color: 'error.main', fontSize: 20 }} />
                  ) : (
                    <CheckCircle sx={{ color: 'success.main', fontSize: 20 }} />
                  )}
                  <Typography variant="body2">
                    <strong>Name Match:</strong> Expected "{selectedProject.partner_name}"
                    {partnerNameMismatch 
                      ? <Chip label="MISMATCH" size="small" color="error" sx={{ ml: 1, fontWeight: 700, fontSize: 10 }} />
                      : <Chip label="MATCHED" size="small" color="success" sx={{ ml: 1, fontWeight: 700, fontSize: 10 }} />
                    }
                  </Typography>
                </Box>
              )}

              {/* Phone OTP Check */}
              {selectedProject.partner_phone && otpRequired && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  {otpVerified ? (
                    <CheckCircle sx={{ color: 'success.main', fontSize: 20 }} />
                  ) : (
                    <Cancel sx={{ color: 'warning.main', fontSize: 20 }} />
                  )}
                  <Typography variant="body2">
                    <strong>Phone OTP:</strong> {selectedProject.partner_phone.replace(/\d(?=\d{4})/g, '*')}
                    {otpVerified 
                      ? <Chip label="VERIFIED ✅" size="small" color="success" sx={{ ml: 1, fontWeight: 700, fontSize: 10 }} />
                      : <Button 
                          variant="contained" size="small" 
                          onClick={handleSendOtp} 
                          disabled={otpLoading || partnerNameMismatch}
                          sx={{ ml: 1, py: 0.3, px: 1.5, fontSize: 11, fontWeight: 700, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                        >
                          {otpLoading ? 'Sending...' : otpSent ? 'Resend OTP' : 'Send OTP'}
                        </Button>
                    }
                  </Typography>
                </Box>
              )}

              {otpError && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>{otpError}</Typography>}

              {partnerNameMismatch && (
                <Typography variant="caption" color="error" sx={{ mt: 1.5, display: 'block', fontWeight: 600 }}>
                  ⚠️ Your Partner Name must match "{selectedProject.partner_name}" to submit this invoice. This is an anti-fraud measure.
                </Typography>
              )}
            </Paper>
          )}

          {/* OTP Input Dialog */}
          <Dialog open={otpDialogOpen} onClose={() => setOtpDialogOpen(false)} maxWidth="xs" fullWidth>
            <DialogTitle sx={{ fontWeight: 700 }}>🔑 Enter OTP Verification Code</DialogTitle>
            <DialogContent>
              <Typography variant="body2" color="text.secondary" mb={2}>
                A 6-digit OTP has been sent to {selectedProject?.partner_phone?.replace(/\d(?=\d{4})/g, '*')}. 
                Enter it below to verify your identity.
              </Typography>
              <TextField
                fullWidth
                label="Enter 6-digit OTP"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputProps={{ maxLength: 6, style: { letterSpacing: 8, fontSize: 24, textAlign: 'center', fontWeight: 700 } }}
                placeholder="000000"
                autoFocus
              />
              {otpError && <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>{otpError}</Typography>}
            </DialogContent>
            <DialogActions sx={{ px: 3, pb: 2 }}>
              <Button onClick={() => setOtpDialogOpen(false)}>Cancel</Button>
              <Button 
                variant="contained" 
                onClick={handleVerifyOtp} 
                disabled={otpCode.length !== 6 || otpLoading}
                sx={{ background: 'linear-gradient(135deg, #10b981, #059669)', fontWeight: 700 }}
              >
                {otpLoading ? 'Verifying...' : 'Verify OTP'}
              </Button>
            </DialogActions>
          </Dialog>
          <Divider sx={{ mb: 4 }} />

          {/* ── STEP 4: FINANCIAL DETAILS ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h6" color="primary">4. Financial & GST Details</Typography>
            <Chip label="All Fields Mandatory ★" size="small" sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700, fontSize: 10, border: '1px solid rgba(239,68,68,0.3)' }} />
          </Box>
          <Grid container spacing={3} mb={2}>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth required label="Advance Amount (enter 0 if none)" type="number" value={advanceAmount} 
                onChange={(e) => setAdvanceAmount(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth label="Base Invoice Amount" type="number" value={baseAmount} 
                onChange={(e) => setBaseAmount(e.target.value)} required
                InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              />
              <FieldVerifyBadge fieldKey="baseAmount" verifications={verifications} onVerify={handleVerify} />
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel 
                control={<Switch checked={isGst} onChange={(e) => setIsGst(e.target.checked)} color="primary" />} 
                label={`Apply GST (Fixed 18%: ${state === OUR_COMPANY_STATE ? '9% CGST + 9% SGST' : state ? '18% IGST' : '18% IGST'})`} 
              />
            </Grid>
          </Grid>

          {isGst && (
            <Box sx={{ p: 3, mb: 3, bgcolor: 'background.default', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <TextField 
                    fullWidth label="GST Number" value={gstNumber} 
                    onChange={(e) => setGstNumber(e.target.value)} 
                  />
                  <FieldVerifyBadge fieldKey="gstNumber" verifications={verifications} onVerify={handleVerify} />
                </Grid>
                  <Grid item xs={12}>
                    <Typography variant="body2" color="text.secondary">
                      <strong>Calculated Tax:</strong> {state === OUR_COMPANY_STATE ? 'CGST (9%) + SGST (9%)' : 'IGST (18%)'} = ₹{gstAmount.toFixed(2)}
                    </Typography>
                  </Grid>
              </Grid>
            </Box>
          )}

          <Divider sx={{ mb: 4 }} />

          {/* ── STEP 5: BANK & CANCELLED CHEQUE DETAILS ── */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <Typography variant="h6" color="primary">5. Bank Details & Cancelled Cheque Upload</Typography>
            <Chip label="Bank Fields Mandatory ★" size="small" sx={{ bgcolor: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700, fontSize: 10, border: '1px solid rgba(239,68,68,0.3)' }} />
            <Chip label="Cheque Upload Optional" size="small" sx={{ bgcolor: 'rgba(16,185,129,0.15)', color: '#10b981', fontWeight: 700, fontSize: 10, border: '1px solid rgba(16,185,129,0.3)' }} />
          </Box>
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth required label="Beneficiary / Account Holder Name" value={beneficiaryName} 
                onChange={(e) => setBeneficiaryName(e.target.value)} 
                placeholder="Name as in Bank Account"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth required label="Bank Name" value={bankName} 
                onChange={(e) => setBankName(e.target.value)} 
                placeholder="e.g. HDFC Bank, SBI, ICICI"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth required label="Branch Name" value={branchName} 
                onChange={(e) => setBranchName(e.target.value)} 
                placeholder="e.g. Connaught Place, Mumbai Main"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth required label="IFSC Code" value={ifscCode} 
                onChange={(e) => setIfscCode(e.target.value.toUpperCase())} 
                placeholder="e.g. HDFC0000123"
                inputProps={{ maxLength: 11 }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField 
                fullWidth required label="Bank Account Number" value={accountNumber} 
                onChange={(e) => setAccountNumber(e.target.value)} 
                placeholder="e.g. 50100234567890"
              />
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
            <Grid item xs={12}>
              <Box sx={{ p: 2.5, border: '1px dashed rgba(16,185,129,0.4)', borderRadius: 2, bgcolor: 'rgba(16,185,129,0.02)' }}>
                <Typography variant="subtitle2" color="success.main" mb={1.5} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  📸 Upload Cancelled Cheque / Any Bank Document (Image/PDF) — Optional
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
                  {!chequeFileHash ? (
                    <Button variant="outlined" color="success" component="label" disabled={chequeUploading}>
                      📁 Select Cheque Image/PDF
                      <input type="file" hidden accept="image/*,.webp,.heic,.heif,.pdf" onChange={handleChequeUpload} />
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="outlined"
                        color="primary"
                        href={`${API_BASE_URL}/uploads/${chequeFileHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        👁️ Preview Document
                      </Button>
                      <Button variant="outlined" color="error" onClick={() => { setChequeFileHash(''); setChequeUploadMessage(''); }}>
                        ❌ Remove Cancelled Cheque
                      </Button>
                    </>
                  )}
                  {chequeUploadMessage && (
                    <Typography variant="body2" sx={{ color: chequeUploadMessage.startsWith('✅') ? 'success.main' : 'text.secondary' }}>
                      {chequeUploadMessage}
                    </Typography>
                  )}
                  {chequeFileHash && <Chip label="Cheque Scan Attached" size="small" color="success" />}
                </Box>
              </Box>
            </Grid>
          </Grid>

          <Divider sx={{ mb: 4 }} />

          {/* TOTALS DISPLAY */}
          <Box sx={{ p: 3, mb: 4, bgcolor: 'primary.dark', color: 'white', borderRadius: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="body2" sx={{ opacity: 0.8 }}>GST Amount: ₹{gstAmount.toFixed(2)}</Typography>
              <Typography variant="h5" fontWeight={700}>Total Amount: ₹{(totalAmount || parseFloat(baseAmount) || 0).toFixed(2)}</Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
               <Typography variant="body2" sx={{ opacity: 0.8 }}>State: {state || 'Not specified'}</Typography>
               {selectedVerifier && (
                <Chip
                  label={`Verifier: ${selectedVerifier}`}
                  size="small"
                  sx={{ mt: 0.5, bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }}
                />
               )}
            </Box>
          </Box>

          {/* BUSINESS PURPOSE */}
          <Grid container spacing={3} mb={4}>
            <Grid item xs={12}>
              <TextField 
                fullWidth required label="Business Purpose / Remarks" multiline rows={3}
                value={purpose} onChange={(e) => setPurpose(e.target.value)}
                placeholder="Brief description of the service rendered or items delivered."
              />
              <FieldVerifyBadge fieldKey="purpose" verifications={verifications} onVerify={handleVerify} />
            </Grid>
          </Grid>

          {/* VERIFIER SUMMARY */}
          {selectedVerifier && (
            <Box sx={{ mb: 3, p: 2.5, borderRadius: 2, border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.05)', display: 'flex', alignItems: 'center', gap: 2 }}>
              <CheckCircle sx={{ color: '#6366f1' }} />
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  Assigned to: {selectedVerifier}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  After verification → Finance (Yash) → Owner (Debojit) → Payment
                </Typography>
              </Box>
            </Box>
          )}

          {/* REQUIRED FIELDS SUMMARY */}
          <Paper sx={{ p: 2.5, mb: 3, borderRadius: 2, bgcolor: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 800, display: 'block', mb: 1.5, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              📋 Form Completion Checklist (All Mandatory)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                label={`1. Invoice File: ${fileHash ? '✓ Attached' : isFirstSubmission ? 'Missing' : 'Optional — not attached'}`} size="small"
                sx={{ bgcolor: fileHash || !isFirstSubmission ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: fileHash || !isFirstSubmission ? '#10b981' : '#ef4444', fontWeight: 700 }}
              />
              <Chip 
                label={`2. Partner Details: ${vendorName && companyName && phone && city ? '✓ Complete' : 'Incomplete'}`} size="small"
                sx={{ bgcolor: (vendorName && companyName && phone && city) ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: (vendorName && companyName && phone && city) ? '#10b981' : '#ef4444', fontWeight: 700 }}
              />
              <Chip 
                label={`3. Project Details: ${projectName && department && selectedVerifier && startDate && endDate ? '✓ Complete' : 'Incomplete'}`} size="small"
                sx={{ bgcolor: (projectName && department && selectedVerifier && startDate && endDate) ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: (projectName && department && selectedVerifier && startDate && endDate) ? '#10b981' : '#ef4444', fontWeight: 700 }}
              />
              <Chip 
                label={`4. Financials: ${baseAmount && advanceAmount ? '✓ Complete' : 'Incomplete'}`} size="small"
                sx={{ bgcolor: (baseAmount && advanceAmount) ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: (baseAmount && advanceAmount) ? '#10b981' : '#ef4444', fontWeight: 700 }}
              />
              <Chip
                label={`5. Bank Details: ${beneficiaryName && bankName && branchName && ifscCode && accountNumber ? '✓ Complete' : 'Incomplete'}`} size="small"
                sx={{ bgcolor: (beneficiaryName && bankName && branchName && ifscCode && accountNumber) ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: (beneficiaryName && bankName && branchName && ifscCode && accountNumber) ? '#10b981' : '#ef4444', fontWeight: 700 }}
              />
              <Chip 
                label={`6. Remarks: ${purpose.trim() ? '✓ Added' : 'Missing'}`} size="small"
                sx={{ bgcolor: purpose.trim() ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: purpose.trim() ? '#10b981' : '#ef4444', fontWeight: 700 }}
              />
            </Box>
          </Paper>

          {/* GENERATE INVOICE FROM TYPED DETAILS — for partners without a real invoice document */}
          <Paper sx={{
            p: 2.5, mb: 3, borderRadius: 2,
            bgcolor: fileHash ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
            border: `1px dashed ${fileHash ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}`
          }}>
            {fileHash ? (
              <>
                <Typography variant="subtitle2" fontWeight={700} color="success.main" mb={0.5}>
                  ✅ Invoice attached to this request
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                  See the preview in "1. Upload Partner Invoice" above. Remove it there if you'd like to attach a different one.
                </Typography>
                <Button
                  variant="outlined" size="small" color="primary"
                  href={`${API_BASE_URL}/uploads/${fileHash}`} target="_blank" rel="noopener noreferrer"
                >
                  👁️ Preview Attached Invoice
                </Button>
              </>
            ) : (
              <>
                <Typography variant="subtitle2" fontWeight={700} mb={0.5}>
                  🧾 Don't have an invoice document?
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                  Not everyone has the means to produce a formal invoice. Fill in your Partner Name and Base Amount above, then generate one automatically from the details you've typed into this form.
                </Typography>
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={handleGenerateInvoice}
                  disabled={generatingInvoice}
                >
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
            {loading ? <CircularProgress size={24} color="inherit" /> : '🚀 Submit Disbursement Request'}
          </Button>
        </form>
      </Paper>
    </Box>
  );
};

export default SubmitRequest;
