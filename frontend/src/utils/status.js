import {
  HourglassTopRounded,
  FactCheckRounded,
  AccountBalanceRounded,
  PaymentsRounded,
  CheckCircleRounded,
  CancelRounded,
  VerifiedRounded,
  WorkspacePremiumRounded,
  SupervisorAccountRounded,
  PersonRounded,
  HandshakeRounded,
  CodeRounded,
  AdminPanelSettingsRounded,
} from '@mui/icons-material';

// One definition of every request status, used by every chip, filter and stepper in the app.
// Labels describe where the request is *now*, in plain words.
export const STATUS = {
  PND: { label: 'Awaiting owner', short: 'Pending', tone: 'warning', Icon: HourglassTopRounded, hint: 'Submitted — waiting for the owner to authorize' },
  VRF: { label: 'Verified (legacy)', short: 'Verified', tone: 'info', Icon: FactCheckRounded, hint: 'Verified under the old first-line step — waiting for the owner' },
  OWN: { label: 'With finance', short: 'Owner approved', tone: 'violet', Icon: AccountBalanceRounded, hint: 'Owner authorized — finance is reviewing' },
  FIN: { label: 'Ready to pay', short: 'Finance approved', tone: 'accent', Icon: PaymentsRounded, hint: 'Finance verified — ready for disbursement' },
  DSB: { label: 'Paid', short: 'Paid', tone: 'success', Icon: CheckCircleRounded, hint: 'Payment disbursed' },
  REJ: { label: 'Rejected', short: 'Rejected', tone: 'danger', Icon: CancelRounded, hint: 'Request was rejected' },
};

export const statusMeta = (s) => STATUS[s] || { label: s || 'Unknown', short: s || '—', tone: 'neutral', Icon: HourglassTopRounded, hint: '' };

// The approval pipeline, in order. A request's position is the index of its status.
export const PIPELINE = [
  { key: 'PND', label: 'Submitted' },
  { key: 'OWN', label: 'Owner approved' },
  { key: 'FIN', label: 'Finance approved' },
  { key: 'DSB', label: 'Paid' },
];

export const pipelineIndex = (s) => {
  if (s === 'VRF') return 0;
  const i = PIPELINE.findIndex((p) => p.key === s);
  return i < 0 ? 0 : i;
};

// Statuses that still need someone to act
export const OPEN_STATUSES = ['PND', 'VRF', 'OWN', 'FIN'];

export const ROLE = {
  OWN: { label: 'Owner', tone: 'violet', Icon: WorkspacePremiumRounded },
  FIN: { label: 'Finance', tone: 'success', Icon: AccountBalanceRounded },
  VRF: { label: 'Verifier', tone: 'warning', Icon: VerifiedRounded },
  ADM: { label: 'Admin', tone: 'danger', Icon: AdminPanelSettingsRounded },
  EMP: { label: 'Employee', tone: 'accent', Icon: PersonRounded },
  VND: { label: 'Partner', tone: 'info', Icon: HandshakeRounded },
  DEV: { label: 'Developer', tone: 'neutral', Icon: CodeRounded },
};

export const roleMeta = (r) => ROLE[r] || { label: r || 'Member', tone: 'neutral', Icon: SupervisorAccountRounded };
