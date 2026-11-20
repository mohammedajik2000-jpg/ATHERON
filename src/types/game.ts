export type RoomId =
  | 'exterior'
  | 'reception'
  | 'main_office'
  | 'finance'
  | 'support_dept'
  | 'it_dept'
  | 'server_room'
  | 'vendor_dept'
  | 'investigation_room';

export type EvidenceCode =
  | 'E01'
  | 'E02'
  | 'E03'
  | 'E04'
  | 'E05'
  | 'E06'
  | 'E07'
  | 'E08'
  | 'E09'
  | 'E10'
  | 'E11'
  | 'E12'
  | 'E13'
  | 'E14'
  | 'E15'
  | 'E16'
  | 'E17'
  | 'E18'
  | 'E19'
  | 'E20';

export type ClueId =
  | 'CLUE_RECEPTION_AUDIT'
  | 'CLUE_SUPPORT_EXPORTS'
  | 'CLUE_FINANCE_BANK_CHANGES'
  | 'CLUE_IT_IAM_DRIFT'
  | 'CLUE_VENDOR_ONBOARDING_PERMS'
  | 'CLUE_SERVER_NETWORK_IOC'
  | 'CLUE_SERVER_API_E18'
  | 'CLUE_OFFICE_BRIEF_ADVISORY';

export type NpcId =
  | 'dev_raghavan'
  | 'madhavi_sundar'
  | 'farah_dsouza'
  | 'sunita_iyer'
  | 'aditi_kapoor'
  | 'pradeep_shah'
  | 'prakash_menon'
  | 'colin_lawson'
  | 'rohan_menon'
  | 'meera_nair';

export type ComputerMode =
  | 'intro_cinematic'
  | 'walking'
  | 'sitting_transition'
  | 'using_computer'
  | 'standing_transition';

export interface ClueDefinition {
  id: ClueId;
  code: string;
  unlocksCodes: EvidenceCode[];
  title: string;
  room: RoomId;
  roomLabel: string;
  summary: string;
  fullText: string;
  unlocksModule: string;
  points: number;
  position: [number, number, number];
  propType: 'tablet' | 'folder' | 'binder' | 'terminal' | 'drive' | 'clipboard';
}

export interface NpcDialogueTopic {
  id: string;
  question: string;
  answer: string;
  evidenceTag?: string;
  unlocksClueId?: ClueId;
  unlocksCodes?: EvidenceCode[];
}

export interface NpcAppearance {
  skinColor: number;
  suitColor: number;
  shirtColor: number;
  hairColor: number;
  hairStyle: 'short' | 'bob' | 'bun' | 'parted';
  hasGlasses?: boolean;
  hasHeadset?: boolean;
  hasBadge?: boolean;
  badgeColor?: number;
  hasTie?: boolean;
  hasVest?: boolean;
  hasClipboard?: boolean;
  heightScale?: number;
}

export interface NpcDefinition {
  id: NpcId;
  name: string;
  role: string;
  roleCategory:
    | 'security_analyst'
    | 'system_admin'
    | 'financial_officer'
    | 'digital_investigator'
    | 'network_engineer'
    | 'security_manager'
    | 'company_manager'
    | 'vendor_manager'
    | 'visitor';
  responsibility: string;
  workflowStage?: string;
  idleAction: 'typing' | 'clipboard' | 'inspecting' | 'executive';
  department: string;
  room: RoomId;
  position: [number, number, number];
  yaw: number;
  greeting: string;
  appearance: NpcAppearance;
  topics: NpcDialogueTopic[];
}

export interface ApiActivityRecord {
  id: string;
  sourceEvidence: 'E01' | 'E18' | 'UPLOADED';
  timestamp: string;
  normalizedTs: number;
  request_id: string;
  vendor: string;
  api_key_id: string;
  service_account: string;
  source_ip: string;
  user_agent: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  http_status: number;
  bytes_out: number;
  latency_ms: number;
  rawRecord: Record<string, unknown>;
}

export interface BankChangeRecord {
  change_id: string;
  sourceEvidence: 'E19' | 'UPLOADED';
  timestamp: string;
  normalizedTs: number;
  request_id: string;
  vendor_payee: string;
  previous_bank_acct: string;
  new_bank_acct: string;
  new_ifsc_swift: string;
  changed_by: string;
  channel: 'API_GATEWAY' | 'ERP_PORTAL' | 'UNKNOWN';
  approval_ref: string | null;
  change_status: 'APPLIED' | 'PENDING_REVIEW' | 'FLAGGED';
  notes: string;
  rawRecord: Record<string, unknown>;
}

export interface AuditActivityRecord {
  audit_id: string;
  timestamp: string;
  timezoneSource: 'IST' | 'UTC' | 'UNIX_DRIFT';
  normalizedTs: number;
  actor: string;
  action: string;
  target: string;
  outcome: string;
  source: EvidenceCode;
}

export interface NetworkActivityRecord {
  flow_id: string;
  timestamp: string;
  normalizedTs: number;
  src_ip: string;
  network_label: string;
  dst_service: string;
  dst_port: number;
  protocol: string;
  bytes_tx: number;
  bytes_rx: number;
  geo_asn: string;
  tls_ja3: string;
}

export interface IocRecord {
  ioc_id: string;
  indicator: string;
  type: 'IP' | 'JA3' | 'USER_AGENT' | 'BENEFICIARY_ACCT';
  confidence: 'HIGH' | 'MEDIUM';
  source: string;
  description: string;
}

export interface VendorPermissionItem {
  scope: string;
  category: string;
  authorized: boolean;
  granted: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'CRITICAL';
  sourcePolicy: string;
  notes: string;
}

export interface EvidencePackageItem {
  code: EvidenceCode;
  name: string;
  sourceSystem: string;
  fileName: string;
  category: string;
  description: string;
  recordCount: number;
  missingFieldsCount: number;
  duplicateCount: number;
  validationStatus: 'VALID' | 'WARNINGS' | 'PENDING';
  sourceFormat: 'CSV' | 'JSON' | 'UPLOADED';
}

export interface DataValidationIssue {
  id: string;
  evidenceCode: EvidenceCode | 'UPLOADED';
  issueType: 'MISSING_FIELD' | 'DUPLICATE' | 'INVALID_TIMESTAMP' | 'MISSING_IDENTIFIER' | 'FORMAT_MISMATCH';
  recordRef: string;
  detail: string;
  severity: 'WARNING' | 'ERROR';
}

export interface ClockNormalizationEntry {
  evidenceCode: EvidenceCode;
  sourceSystem: string;
  nativeClockFormat: string;
  rawSample: string;
  normalizedUtc: string;
  offsetApplied: string;
  confidence: 'EXACT' | 'ESTIMATED_DRIFT';
  uncertaintyNote: string;
}

export interface ActorIdentityProfile {
  actorKey: string;
  actorType: 'MACHINE_CREDENTIAL' | 'INTERNAL_PORTAL' | 'NETWORK_SOURCE';
  apiKeyIds: string[];
  serviceAccountNames: string[];
  callerIps: string[];
  userAgents: string[];
  networkLabels: string[];
  linkedRequestIds: string[];
  identityWarning: string;
}

export interface UploadedEvidenceFile {
  id: string;
  filename: string;
  format: 'CSV' | 'JSON';
  detectedType: EvidenceCode | 'GENERIC';
  totalRows: number;
  validRows: number;
  duplicateCount: number;
  missingFieldWarnings: string[];
  uploadedAt: string;
  rawPreview: Record<string, unknown>[];
}

export interface VendorFingerprint {
  vendor: string;
  serviceAccount: string;
  baselineRecordCount: number;
  observedRecordCount: number;
  baselineReadPct: number;
  observedReadPct: number;
  baselineWritePct: number;
  observedWritePct: number;
  baselineReqPerHour: number;
  observedPeakReqPerHour: number;
  baselineHoursUtc: string;
  observedAnomalyHoursUtc: string;
  baselineAvgBytes: number;
  observedMaxBytes: number;
  authorizedIps: string[];
  observedIps: string[];
  unseenIps: string[];
  authorizedEndpoints: string[];
  unseenEndpoints: string[];
  endpointSequences: {
    normal: string[];
    observed: string[];
  };
  normalSummary: string[];
  deviations: {
    id: string;
    title: string;
    severity: 'SUSPICIOUS' | 'CRITICAL';
    explanation: string;
    supportingRecordIds: string[];
  }[];
  scopeDisclaimer: string;
}

export interface CorrelationMatch {
  request_id: string;
  e18Record: ApiActivityRecord | null;
  e19Record: BankChangeRecord | null;
  e15Matches: NetworkActivityRecord[];
  iocMatches: IocRecord[];
  missingApprovalRef: boolean;
  status: 'MATCHED_COMPLETE' | 'PARTIAL_E18_ONLY' | 'PARTIAL_E19_ONLY';
  explanation: string;
}

export type FindingSeverity = 'NORMAL' | 'SUSPICIOUS' | 'CRITICAL';
export type InvestigatorReviewStatus =
  | 'UNREVIEWED'
  | 'CONFIRMED'
  | 'DISMISSED'
  | 'NEEDS_FURTHER_INVESTIGATION';

export interface InvestigationFinding {
  id: string;
  title: string;
  severity: FindingSeverity;
  category: 'Behavioural' | 'Correlation' | 'Governance' | 'Permissions' | 'Network';
  epistemicLayer: 'Confirmed Fact' | 'Suspicious Observation' | 'Reasonable Inference';
  summary: string;
  supportingEvidence: string[];
  recommendedAction: string;
}

export interface AlternativeExplanationTest {
  id: string;
  hypothesis: string;
  status: 'REFUTED_BY_EVIDENCE' | 'UNLIKELY_PARTIAL' | 'SUPPORTED_BY_EVIDENCE' | 'NEEDS_CHECK';
  supportingEvidence: string[];
  contradictingEvidence: string[];
  assessment: string;
}

export interface FindingReviewDecision {
  status: InvestigatorReviewStatus;
  note: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  timestamp: string;
  normalizedTs: number;
  sourceCode: EvidenceCode | 'UPLOADED';
  sourceSystem: string;
  actorOrCredential: string;
  title: string;
  detail: string;
  severity: FindingSeverity;
  confidence: 'HIGH' | 'MEDIUM' | 'UNCERTAIN_OFFSET';
  uncertaintyNote?: string;
  linkedIds: string[];
}

export interface TimelineStep {
  id: string;
  orderIndex: number;
  timeLabel: string;
  title: string;
  evidenceRef: string;
  detail: string;
}

export interface MissionDefinition {
  id: number;
  title: string;
  objective: string;
  hint: string;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  points: number;
}

export interface RemediationVerificationCheck {
  id: string;
  probe: string;
  expected: string;
  observed: string;
  status: 'PASS' | 'FAIL';
  executedAt: string;
}

export type AutoRecoveryStatus =
  | 'IDLE'
  | 'RUNNING'
  | 'AUTO_RECOVERY_SUCCESSFUL'
  | 'HUMAN_APPROVAL_REQUIRED';

export interface AutoRecoveryStepLog {
  stepNumber: number;
  label: string;
  actorRole: string;
  detail: string;
  timestamp: string;
  status: 'PENDING' | 'DONE' | 'BLOCKED' | 'SKIPPED';
}

export interface AutoRecoveryAuditEntry {
  id: string;
  timestamp: string;
  actorRole: string;
  action: string;
  target: string;
  detail: string;
  outcome: 'EXECUTED' | 'VERIFIED' | 'HOLD_REQUIRED';
}

export interface RestoredVendorRecord {
  changeId: string;
  vendorPayee: string;
  bankAcct: string;
  swift: string;
  restoredFrom: string;
  verifiedAt: string;
}

export interface InvestigationState {
  introCompleted: boolean;
  discoveredClues: ClueId[];
  talkedToNpcs: NpcId[];
  askedNpcTopics: string[];
  visitedRooms: RoomId[];
  highestCompletedStep: number; // 0..14 sequential software workflow progress
  flaggedRequestIds: string[];
  correlatedRequestIds: string[];
  missingApprovalScanRun: boolean;
  detectedMissingChangeIds: string[];
  simulationCompared: boolean;
  timelineVerified: boolean;
  findingReviews: Record<string, FindingReviewDecision>;
  uploadedFiles: UploadedEvidenceFile[];
  uploadedApiRecords: ApiActivityRecord[];
  uploadedBankChanges: BankChangeRecord[];
  caseSolved: boolean;
  finalScore: number;
  finalAccuracy: number;
  unlockedAchievements: string[];
  selectedActions: string[];
  investigatorSummaryNote: string;
  blockedIndicators: string[];
  revokedRoles: string[];
  rotatedKeys: string[];
  rolledBackChangeIds: string[];
  remediationVerificationRun: boolean;
  remediationVerificationLog: RemediationVerificationCheck[];
  integrityVerifiedIds: string[];
  tamperTestChangeId: string | null;
  paymentHoldActive: boolean;
  fingerprintVerified: boolean;
  fingerprintMatchPct: number;
  fingerprintVerificationNote: string;
  autoRecoveryStatus: AutoRecoveryStatus;
  autoRecoverySteps: AutoRecoveryStepLog[];
  autoRecoveryExecutedAt: string | null;
  autoRecoveryApprovedByHuman: boolean;
  simulateUncertainBackup: boolean;
  autoRecoveryAuditLog: AutoRecoveryAuditEntry[];
  restoredVendorRecords: Record<string, RestoredVendorRecord>;
}
