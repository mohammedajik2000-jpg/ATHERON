import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  Download,
  FileCheck2,
  FileSearch,
  FileText,
  Fingerprint,
  GitCompare,
  KeyRound,
  Lock,
  LogOut,
  Pause,
  Play,
  Printer,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SkipForward,
  Terminal,
  Upload,
  Users,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import { FingerprintScannerPanel } from './FingerprintScannerPanel';
import {
  CASE_METADATA,
  CORRELATED_REQUEST_IDS,
  E01_HISTORICAL_LOGS,
  E02_E05_AUDIT_RECORDS,
  E15_NETWORK_RECORDS,
  E17_IOCS,
  E18_API_LOGS,
  E19_BANK_CHANGES,
  EVIDENCE_CATALOG,
  MISSING_APPROVAL_CHANGE_IDS,
  SECURITY_ACTIONS,
  TIMELINE_STEPS,
  VENDOR_PERMISSIONS,
} from '../data/caseData';
import { buildActorIdentityProfiles } from '../engines/actorCorrelationEngine';
import { runCrossSystemCorrelation } from '../engines/correlationEngine';
import {
  buildEvidenceInventory,
  getUnlockedEvidenceCodes,
  parseEvidenceFile,
  ParsedUploadResult,
  runDataValidation,
} from '../engines/evidenceManager';
import {
  buildFingerprintSimulationFrames,
  buildVendorFingerprint,
} from '../engines/fingerprintingEngine';
import { buildInvestigationAssessment } from '../engines/investigationEngine';
import {
  generateIncidentResponseReport,
  generateStructuredReport,
  incidentReportToMarkdown,
  printIncidentResponsePdf,
  printReportAsPdf,
  reportToMarkdown,
} from '../engines/reportGenerator';
import { buildClockNormalizationReport } from '../engines/timeNormalizer';
import { buildAutoTimeline } from '../engines/timelineEngine';
import {
  buildSoftwareIntegrityLedger,
  buildTrustProfileSummary,
  verifyWithWebCryptoSha256,
} from '../engines/trustlockEngine';
import {
  EvidenceCode,
  FindingReviewDecision,
  InvestigationState,
  InvestigatorReviewStatus,
  TimelineStep,
} from '../types/game';

interface CyberquestOSProps {
  state: InvestigationState;
  onExit: () => void;
  onCompleteStep: (stepNum: number) => void;
  onToggleFlagRequest: (reqId: string) => void;
  onCorrelatePair: (reqId: string) => void;
  onRunMissingApprovalScan: (detectedChangeIds: string[]) => void;
  onMarkSimulationCompared: () => void;
  onVerifyTimeline: () => void;
  onReviewFinding: (findingId: string, decision: FindingReviewDecision) => void;
  onUploadEvidence: (parsed: ParsedUploadResult) => void;
  onUpdateSummaryNote: (note: string) => void;
  onToggleBlockIndicator: (indicator: string) => void;
  onToggleRevokeRole: (roleName: string) => void;
  onToggleRotateKey: (keyId: string) => void;
  onRollbackBankChange: (changeId: string) => void;
  onVerifyRecordIntegrity: (changeIds: string[]) => void;
  onTriggerTamperTest: (changeId: string | null) => void;
  onTogglePaymentHold: () => void;
  onFingerprintOutcome: (verified: boolean, matchPct: number, summary: string) => void;
  onResetDemo: () => Promise<void> | void;
  onRunAutoRecovery: (overrideUncertain?: boolean) => void;
  onApproveHumanHold: () => void;
  onToggleUncertainBackup: () => void;
  onRunRemediationVerification: () => void;
  onSubmitDecision: (accuracy: number, selectedActions: string[]) => void;
}

const WORKFLOW_STEPS = [
  { step: 1, short: 'Evidence Collection', icon: Database },
  { step: 2, short: 'Data Validation', icon: FileCheck2 },
  { step: 3, short: 'Time Normalisation', icon: Clock },
  { step: 4, short: 'Actor & Identity', icon: Users },
  { step: 5, short: 'Fingerprint Verification', icon: Fingerprint },
  { step: 6, short: 'Trust Profile', icon: ShieldCheck },
  { step: 7, short: 'Financial Change DNA', icon: KeyRound },
  { step: 8, short: 'Integrity & Baseline Sim', icon: Play },
  { step: 9, short: 'Detection Engine', icon: AlertTriangle },
  { step: 10, short: 'Evidence Correlation', icon: GitCompare },
  { step: 11, short: 'Incident Timeline', icon: Clock },
  { step: 12, short: 'Evidence Investigation', icon: FileSearch },
  { step: 13, short: 'Recovery Centre', icon: ShieldAlert },
  { step: 14, short: '14-Section Report', icon: FileText },
] as const;

const SHUFFLED_TIMELINE_INITIAL: TimelineStep[] = [
  TIMELINE_STEPS[2],
  TIMELINE_STEPS[0],
  TIMELINE_STEPS[4],
  TIMELINE_STEPS[1],
  TIMELINE_STEPS[3],
];

const SAMPLE_CSV_SNIPPET = `id,timestamp,request_id,vendor,api_key_id,service_account,source_ip,user_agent,method,endpoint,http_status,bytes_out,latency_ms
E18-UP-1,2026-11-19 02:49:10 UTC,req-9f4a-891a,TallyBridge,ak_tb_prod_0419,svc-tallybridge-sync,185.220.101.47,python-requests/2.31.0,GET,/api/v2/vendors/bank-details/audit,200,4120,145`;

export const CyberquestOS: React.FC<CyberquestOSProps> = ({
  state,
  onExit,
  onCompleteStep,
  onToggleFlagRequest,
  onCorrelatePair,
  onRunMissingApprovalScan,
  onMarkSimulationCompared,
  onVerifyTimeline,
  onReviewFinding,
  onUploadEvidence,
  onUpdateSummaryNote,
  onToggleBlockIndicator,
  onToggleRevokeRole,
  onToggleRotateKey,
  onRollbackBankChange,
  onVerifyRecordIntegrity,
  onTriggerTamperTest,
  onTogglePaymentHold,
  onFingerprintOutcome,
  onResetDemo,
  onRunAutoRecovery,
  onApproveHumanHold,
  onToggleUncertainBackup,
  onRunRemediationVerification,
  onSubmitDecision,
}) => {
  const [activeStep, setActiveStep] = useState<number>(() =>
    Math.min(14, Math.max(1, state.highestCompletedStep + 1))
  );
  const [selectedVendor, setSelectedVendor] = useState<'TallyBridge' | 'FinPay Core'>('TallyBridge');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEvidenceInspect, setSelectedEvidenceInspect] = useState<EvidenceCode>('E18');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 7 Web Crypto SHA-256 live digest badge
  const [webCryptoDigest, setWebCryptoDigest] = useState<string | null>(null);

  // Step 8 Interactive Simulation state
  const [simFrameIndex, setSimFrameIndex] = useState(0);
  const [simPlaying, setSimPlaying] = useState(false);

  // Step 10 Correlation selection
  const [selectedE18Req, setSelectedE18Req] = useState<string | null>(null);
  const [correlationFeedback, setCorrelationFeedback] = useState<string | null>(null);

  // Step 11 Timeline ordering
  const [orderedSteps, setOrderedSteps] = useState<TimelineStep[]>(SHUFFLED_TIMELINE_INITIAL);
  const [timelineFeedback, setTimelineFeedback] = useState<string | null>(null);

  // Step 12 Finding drafts
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});

  // Step 13 Security response & Automatic Recovery animation state
  const [chosenAccount, setChosenAccount] = useState('svc-tallybridge-sync');
  const [chosenIp, setChosenIp] = useState('185.220.101.47');
  const [chosenRootCause, setChosenRootCause] = useState('emergency_role_bypass');
  const [chosenActions, setChosenActions] = useState<string[]>(state.selectedActions);
  const [decisionFeedback, setDecisionFeedback] = useState<string | null>(null);
  const [activeReportView, setActiveReportView] = useState<'investigation' | 'incident_response'>(
    'investigation'
  );
  const [autoRecoverAnimating, setAutoRecoverAnimating] = useState(false);
  const [autoRecoverProgress, setAutoRecoverProgress] = useState(0);
  const [visibleRecoverySteps, setVisibleRecoverySteps] = useState(10);
  const recoveryTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (recoveryTimerRef.current) {
        window.clearInterval(recoveryTimerRef.current);
      }
    };
  }, []);

  // Computer RESET SYSTEM modal & progress state
  const [resetPhase, setResetPhase] = useState<'closed' | 'confirm' | 'running' | 'complete'>('closed');
  const [resetProgress, setResetProgress] = useState(0);
  const [resetStatusLabel, setResetStatusLabel] = useState('');

  const maxUnlockedStep = Math.min(14, state.highestCompletedStep + 1);

  const triggerAutoRecoverSequence = () => {
    soundEngine.playClick();
    if (recoveryTimerRef.current) {
      window.clearInterval(recoveryTimerRef.current);
    }
    setAutoRecoverAnimating(true);
    setAutoRecoverProgress(8);
    setVisibleRecoverySteps(1);
    onRunAutoRecovery();

    let tick = 1;
    recoveryTimerRef.current = window.setInterval(() => {
      tick += 1;
      setVisibleRecoverySteps(Math.min(10, tick));
      setAutoRecoverProgress(Math.min(100, tick * 10));
      if (tick >= 10) {
        if (recoveryTimerRef.current) {
          window.clearInterval(recoveryTimerRef.current);
          recoveryTimerRef.current = null;
        }
        setAutoRecoverAnimating(false);
        soundEngine.playSuccess();
      }
    }, 150);
  };

  const simulationFrames = useMemo(
    () =>
      buildFingerprintSimulationFrames(
        selectedVendor,
        state.discoveredClues,
        state.uploadedApiRecords,
        [...(getUnlockedEvidenceCodes(state.discoveredClues).has('E19') ? E19_BANK_CHANGES : []), ...state.uploadedBankChanges]
      ),
    [selectedVendor, state.discoveredClues, state.uploadedApiRecords, state.uploadedBankChanges]
  );

  useEffect(() => {
    if (simFrameIndex >= simulationFrames.length) {
      setSimFrameIndex(0);
    }
  }, [simulationFrames.length, simFrameIndex]);

  useEffect(() => {
    if (!simPlaying) return;
    const timer = window.setInterval(() => {
      setSimFrameIndex((prev) => {
        if (prev >= simulationFrames.length - 1) {
          setSimPlaying(false);
          onMarkSimulationCompared();
          return prev;
        }
        return prev + 1;
      });
    }, 1500);
    return () => window.clearInterval(timer);
  }, [simPlaying, simulationFrames.length, onMarkSimulationCompared]);

  const unlockedCodes = useMemo(
    () => getUnlockedEvidenceCodes(state.discoveredClues),
    [state.discoveredClues]
  );

  const inventory = useMemo(
    () =>
      buildEvidenceInventory(
        state.discoveredClues,
        state.uploadedApiRecords.length,
        state.uploadedBankChanges.length
      ),
    [state.discoveredClues, state.uploadedApiRecords.length, state.uploadedBankChanges.length]
  );

  const validationIssues = useMemo(
    () =>
      runDataValidation(
        state.discoveredClues,
        state.uploadedFiles,
        state.uploadedBankChanges
      ),
    [state.discoveredClues, state.uploadedFiles, state.uploadedBankChanges]
  );

  const clockNormalization = useMemo(
    () => buildClockNormalizationReport(state.discoveredClues),
    [state.discoveredClues]
  );

  const actorProfiles = useMemo(
    () => buildActorIdentityProfiles(state.discoveredClues, state.uploadedApiRecords),
    [state.discoveredClues, state.uploadedApiRecords]
  );

  const fingerprint = useMemo(
    () => buildVendorFingerprint(selectedVendor, state.discoveredClues, state.uploadedApiRecords),
    [selectedVendor, state.discoveredClues, state.uploadedApiRecords]
  );

  const tallyFingerprint = useMemo(
    () => buildVendorFingerprint('TallyBridge', state.discoveredClues, state.uploadedApiRecords),
    [state.discoveredClues, state.uploadedApiRecords]
  );

  const trustProfile = useMemo(
    () =>
      buildTrustProfileSummary(
        selectedVendor,
        state.discoveredClues,
        state.blockedIndicators,
        state.revokedRoles,
        state.rotatedKeys,
        state.rolledBackChangeIds,
        state.fingerprintVerified
      ),
    [
      selectedVendor,
      state.discoveredClues,
      state.blockedIndicators,
      state.revokedRoles,
      state.rotatedKeys,
      state.rolledBackChangeIds,
      state.fingerprintVerified,
    ]
  );

  const integrityLedger = useMemo(
    () =>
      buildSoftwareIntegrityLedger(
        state.discoveredClues,
        state.uploadedApiRecords,
        state.uploadedBankChanges,
        state.rolledBackChangeIds,
        state.revokedRoles,
        state.rotatedKeys,
        state.tamperTestChangeId
      ),
    [
      state.discoveredClues,
      state.uploadedApiRecords,
      state.uploadedBankChanges,
      state.rolledBackChangeIds,
      state.revokedRoles,
      state.rotatedKeys,
      state.tamperTestChangeId,
    ]
  );

  const handleRunCryptoIntegrityVerification = async () => {
    const targetIds = integrityLedger.map((r) => r.changeId);
    if (integrityLedger.length > 0) {
      const samplePayload = integrityLedger
        .map((r) => `${r.changeId}:${r.recordHash}:${r.digitalSignature}`)
        .join('|');
      const sha = await verifyWithWebCryptoSha256(samplePayload);
      setWebCryptoDigest(sha);
    }
    onVerifyRecordIntegrity(targetIds);
  };

  const correlations = useMemo(
    () =>
      runCrossSystemCorrelation(
        state.discoveredClues,
        state.uploadedApiRecords,
        state.uploadedBankChanges
      ),
    [state.discoveredClues, state.uploadedApiRecords, state.uploadedBankChanges]
  );

  const autoTimeline = useMemo(
    () =>
      buildAutoTimeline(
        state.discoveredClues,
        state.uploadedApiRecords,
        state.uploadedBankChanges
      ),
    [state.discoveredClues, state.uploadedApiRecords, state.uploadedBankChanges]
  );

  const assessment = useMemo(
    () =>
      buildInvestigationAssessment(
        state.discoveredClues,
        tallyFingerprint,
        correlations,
        state.uploadedApiRecords,
        state.uploadedBankChanges
      ),
    [
      state.discoveredClues,
      tallyFingerprint,
      correlations,
      state.uploadedApiRecords,
      state.uploadedBankChanges,
    ]
  );

  const report = useMemo(
    () =>
      generateStructuredReport(
        state,
        inventory.unlocked,
        tallyFingerprint,
        correlations,
        autoTimeline,
        assessment
      ),
    [state, inventory.unlocked, tallyFingerprint, correlations, autoTimeline, assessment]
  );

  const incidentReport = useMemo(
    () => generateIncidentResponseReport(state, correlations),
    [state, correlations]
  );

  const allApiRows = useMemo(() => {
    const list = [
      ...(unlockedCodes.has('E01') ? E01_HISTORICAL_LOGS : []),
      ...(unlockedCodes.has('E18') ? E18_API_LOGS : []),
      ...state.uploadedApiRecords,
    ];
    const q = searchQuery.trim().toLowerCase();
    return list.filter((row) => {
      if (!q) return true;
      return (
        row.request_id.toLowerCase().includes(q) ||
        row.endpoint.toLowerCase().includes(q) ||
        row.source_ip.toLowerCase().includes(q) ||
        row.user_agent.toLowerCase().includes(q)
      );
    });
  }, [unlockedCodes, state.uploadedApiRecords, searchQuery]);

  const allBankRows = useMemo(
    () => [
      ...(unlockedCodes.has('E19') ? E19_BANK_CHANGES : []),
      ...state.uploadedBankChanges,
    ],
    [unlockedCodes, state.uploadedBankChanges]
  );

  const goNextStep = (completedStep: number) => {
    soundEngine.playClick();
    onCompleteStep(completedStep);
    if (completedStep < 14) {
      setActiveStep(completedStep + 1);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? '');
        const parsed = parseEvidenceFile(file.name, text);
        if (parsed.fileSummary.totalRows === 0) {
          setUploadError('No valid rows detected in uploaded CSV/JSON file.');
          return;
        }
        soundEngine.playCluePickup();
        onUploadEvidence(parsed);
      } catch {
        setUploadError('Failed to parse file. Please upload valid CSV or JSON.');
      }
    };
    reader.readAsText(file);
  };

  const handleLoadSampleCsv = () => {
    const parsed = parseEvidenceFile('e18_supplementary_audit.csv', SAMPLE_CSV_SNIPPET);
    soundEngine.playCluePickup();
    onUploadEvidence(parsed);
  };

  const handleSelectE19ForCorrelation = (reqId: string) => {
    if (!selectedE18Req) {
      setCorrelationFeedback('Select an E18 API request on the left first, then click its matching E19 record.');
      return;
    }
    if (selectedE18Req === reqId && CORRELATED_REQUEST_IDS.includes(reqId)) {
      soundEngine.playSuccess();
      onCorrelatePair(reqId);
      setCorrelationFeedback(`Matched! ${reqId} links E18 POST call to unapproved E19 bank change.`);
      setSelectedE18Req(null);
    } else if (selectedE18Req === reqId) {
      soundEngine.playClick();
      onCorrelatePair(reqId);
      setCorrelationFeedback(`Matched valid transaction ${reqId}.`);
      setSelectedE18Req(null);
    } else {
      setCorrelationFeedback(`Mismatch: ${selectedE18Req} does not equal ${reqId}. Compare request_id tokens.`);
    }
  };

  const handleRunMissingScan = () => {
    const missing = allBankRows
      .filter((r) => !r.approval_ref || r.approval_ref.trim() === '')
      .map((r) => r.change_id);
    soundEngine.playSuccess();
    onRunMissingApprovalScan(missing);
  };

  const moveTimelineStep = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= orderedSteps.length) return;
    const copy = [...orderedSteps];
    const [item] = copy.splice(idx, 1);
    copy.splice(nextIdx, 0, item);
    setOrderedSteps(copy);
    soundEngine.playClick();
  };

  const handleVerifyTimelineOrder = () => {
    const isCorrect = orderedSteps.every((step, i) => step.orderIndex === i + 1);
    if (isCorrect) {
      soundEngine.playSuccess();
      onVerifyTimeline();
      setTimelineFeedback('Chronological sequence verified across E02, E05, E15, E18, and E19.');
    } else {
      setTimelineFeedback('Sequence out of order. Hint: Recon (02:14) -> CHG-401 (02:19) -> CHG-402/403 -> Export (02:44) -> Hold (03:00).');
    }
  };

  const handleFindingDecision = (findingId: string, status: InvestigatorReviewStatus) => {
    soundEngine.playClick();
    onReviewFinding(findingId, {
      status,
      note: noteDrafts[findingId] ?? state.findingReviews[findingId]?.note ?? '',
      updatedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
    });
  };

  const handleToggleAction = (actionId: string) => {
    setChosenActions((prev) =>
      prev.includes(actionId) ? prev.filter((id) => id !== actionId) : [...prev, actionId]
    );
  };

  const handleFinalSubmit = () => {
    if (chosenActions.includes('blame_rohan_menon')) {
      setDecisionFeedback(
        'Rejected: Attributing the incident to former clerk Rohan Menon contradicts E09/E02/E18 evidence. Do not blame a person without credential proof.'
      );
      return;
    }

    let score = 0;
    if (chosenAccount === 'svc-tallybridge-sync') score += 20;
    if (chosenIp === '185.220.101.47') score += 20;
    if (chosenRootCause === 'emergency_role_bypass') score += 20;
    if (state.correlatedRequestIds.length >= CORRELATED_REQUEST_IDS.length) score += 20;
    const recIds = SECURITY_ACTIONS.filter((a) => a.recommended).map((a) => a.id);
    const hitCount = recIds.filter((id) => chosenActions.includes(id)).length;
    score += Math.round((hitCount / recIds.length) * 20);

    if (hitCount < 3) {
      setDecisionFeedback('Select at least 3 valid containment actions to submit your response.');
      return;
    }

    soundEngine.playSuccess();
    onCompleteStep(13);
    onCompleteStep(14);
    onSubmitDecision(score, chosenActions);
    setActiveStep(14);
  };

  const handleDownloadMarkdown = () => {
    const isIncident = activeReportView === 'incident_response';
    const md = isIncident ? incidentReportToMarkdown(incidentReport) : reportToMarkdown(report);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = isIncident
      ? `CYBERQUEST_IncidentResponse_${CASE_METADATA.caseId}.md`
      : `CYBERQUEST_Report_${CASE_METADATA.caseId}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmSystemReset = () => {
    soundEngine.playClick();
    if (recoveryTimerRef.current) {
      window.clearInterval(recoveryTimerRef.current);
      recoveryTimerRef.current = null;
    }
    setAutoRecoverAnimating(false);
    setAutoRecoverProgress(0);
    setVisibleRecoverySteps(10);
    setResetPhase('running');
    setResetProgress(22);
    setResetStatusLabel('Clearing simulation alerts, fingerprint verification & recovery logs...');

    window.setTimeout(() => {
      setResetProgress(58);
      setResetStatusLabel('Resetting AES-256-GCM synthetic fingerprint vault & audit chain...');
    }, 380);

    window.setTimeout(async () => {
      setResetProgress(88);
      setResetStatusLabel('Restoring original Harbor & Finch CR-26-047 demo dataset...');
      await onResetDemo();
      setActiveStep(1);
      setSelectedE18Req(null);
      setCorrelationFeedback(null);
      setTimelineFeedback(null);
      setDecisionFeedback(null);
      setChosenActions([]);
      setWebCryptoDigest(null);
      setSimFrameIndex(0);
      setSimPlaying(false);

      window.setTimeout(() => {
        soundEngine.playSuccess();
        setResetProgress(100);
        setResetStatusLabel('Original simulation demo data restored cleanly.');
        setResetPhase('complete');
      }, 320);
    }, 820);
  };

  const currentSimFrame = simulationFrames[simFrameIndex] ?? simulationFrames[0];

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-2 sm:p-5 bg-[#020a06]/80 pointer-events-auto">
      {/* PHYSICAL 3D MONITOR BEZEL FRAME */}
      <div className="relative w-full max-w-[1380px] h-[93vh] flex flex-col rounded-2xl border-[10px] border-[#0a2419] bg-gradient-to-br from-[#04140d] via-[#061c13] to-[#030f0a] shadow-[0_0_90px_rgba(16,185,129,0.28)] ring-1 ring-emerald-500/45 overflow-hidden">
        {/* MONITOR TOP BAR */}
        <header className="flex items-center justify-between px-4 py-2.5 bg-[#071f15]/95 border-b border-emerald-500/25 shrink-0 gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-md bg-emerald-600/20 border border-[#d4af37]/50 flex items-center justify-center shadow-[0_0_16px_rgba(16,185,129,0.18)]">
              <Terminal className="w-4 h-4 text-emerald-300" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-bold text-sm tracking-wide text-[#f5f2e9]">
                  TRUSTLOCK // CYBERQUEST OS v4.5
                </span>
                <span className="text-[11px] font-mono-data px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/35">
                  CASE {CASE_METADATA.caseId}
                </span>
                <span className="text-[11px] font-mono-data px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-400/35">
                  STEP {activeStep}/14
                </span>
                {state.fingerprintVerified && (
                  <span className="text-[11px] font-mono-data px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-400/35">
                    VAULT VERIFIED ({state.fingerprintMatchPct}%)
                  </span>
                )}
              </div>
              <div className="text-[11px] text-[#d6d3c4]/80">
                {CASE_METADATA.company} · Automatic Recovery Engine &amp; 14-Step Forensic Security Pipeline
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden xl:inline text-xs font-mono-data text-[#d6d3c4]">
              Evidence: {inventory.unlocked.length}/20 · Clues: {state.discoveredClues.length}/8
            </span>
            <button
              onClick={() => {
                soundEngine.playClick();
                setActiveStep(13);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 border ${
                activeStep === 13
                  ? 'bg-emerald-500 text-[#04140d] border-emerald-300'
                  : 'bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-200 border-emerald-500/45'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Recovery Centre</span>
            </button>
            <button
              onClick={() => {
                soundEngine.playClick();
                setResetProgress(0);
                setResetStatusLabel('');
                setResetPhase('confirm');
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-rose-950/60 hover:bg-rose-900/75 text-rose-200 border border-rose-500/45 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
              <span>RESET SYSTEM</span>
            </button>
            <button
              onClick={() => {
                soundEngine.playClick();
                onExit();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0d2b1e] hover:bg-[#133b2a] text-[#f5f2e9] border border-amber-400/40 rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 text-amber-300" />
              <span>Stand Up (ESC)</span>
            </button>
          </div>
        </header>

        {/* COMPUTER RESET CONFIRMATION & PROGRESS OVERLAY */}
        {resetPhase !== 'closed' && (
          <div className="absolute inset-0 z-40 flex items-center justify-center p-4 bg-[#020a06]/85">
            <div className="w-full max-w-md rounded-xl bg-[#071f15] border border-emerald-500/50 p-5 shadow-2xl space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-rose-500/15 border border-rose-400/45 flex items-center justify-center shrink-0">
                  <RotateCcw className="w-4 h-4 text-rose-300" />
                </div>
                <div>
                  <h3 className="font-display text-sm font-bold text-[#f5f2e9]">
                    {resetPhase === 'confirm'
                      ? 'Confirm Simulation System Reset'
                      : resetPhase === 'running'
                      ? 'Resetting Simulated System...'
                      : 'System Reset Complete'}
                  </h3>
                  <p className="text-[11px] text-[#a3aa9c]">
                    Simulation Environment Only · Zero Real Data Affected
                  </p>
                </div>
              </div>

              {resetPhase === 'confirm' && (
                <>
                  <div className="p-3 rounded-lg bg-[#04140d] border border-emerald-500/25 text-xs text-[#d6d3c4] space-y-1.5">
                    <p>
                      This restores original Harbor &amp; Finch demo data and resets only simulated case state:
                    </p>
                    <ul className="list-disc pl-4 text-[11px] text-[#a3aa9c] space-y-0.5">
                      <li>Case alerts, findings &amp; pipeline step progression</li>
                      <li>Synthetic fingerprint vault verification &amp; tamper state</li>
                      <li>Vendor isolation, API credential rotation &amp; payment hold status</li>
                      <li>Automatic recovery history, vendor records &amp; verification probes</li>
                    </ul>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => {
                        soundEngine.playClick();
                        setResetPhase('closed');
                      }}
                      className="px-3.5 py-1.5 text-xs font-medium bg-[#0d2b1e] hover:bg-[#133b2a] text-[#f5f2e9] border border-emerald-500/35 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmSystemReset}
                      className="px-4 py-1.5 text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white rounded-md cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Confirm
                    </button>
                  </div>
                </>
              )}

              {resetPhase === 'running' && (
                <div className="space-y-2.5">
                  <div className="flex justify-between text-xs font-mono-data text-emerald-300">
                    <span>Reset Progress</span>
                    <span>{resetProgress}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#0d2b1e] overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-300"
                      style={{ width: `${resetProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-[#d6d3c4]">{resetStatusLabel}</p>
                </div>
              )}

              {resetPhase === 'complete' && (
                <div className="space-y-3">
                  <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/45 text-xs text-emerald-200 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{resetStatusLabel}</span>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        soundEngine.playClick();
                        setResetPhase('closed');
                      }}
                      className="px-4 py-1.5 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] rounded-md cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Return to Step 1
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* WORKSPACE BODY */}
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* LEFT SEQUENTIAL 14-STEP PIPELINE */}
          <aside className="w-56 sm:w-64 bg-[#051a11]/95 border-r border-emerald-500/20 p-2.5 flex flex-col gap-1 overflow-y-auto cyber-scroll shrink-0">
            <div className="px-2 py-1 text-[10px] font-mono-data uppercase tracking-wider text-amber-300/85">
              Sequential Pipeline (1–14)
            </div>
            {WORKFLOW_STEPS.map((item) => {
              const Icon = item.icon;
              const isUnlocked = item.step <= maxUnlockedStep || state.caseSolved || item.step === 13;
              const isCompleted = item.step <= state.highestCompletedStep || state.caseSolved;
              const isActive = activeStep === item.step;
              return (
                <button
                  key={item.step}
                  disabled={!isUnlocked}
                  onClick={() => {
                    if (!isUnlocked) return;
                    soundEngine.playClick();
                    setActiveStep(item.step);
                  }}
                  className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-xs font-medium text-left transition-colors ${
                    !isUnlocked
                      ? 'text-[#a3aa9c]/45 bg-[#04140d]/40 cursor-not-allowed'
                      : isActive
                      ? 'bg-gradient-to-r from-emerald-600/35 to-amber-500/20 text-[#f5f2e9] border border-emerald-400/50 shadow-[0_0_16px_rgba(16,185,129,0.22)] cursor-pointer'
                      : 'text-[#d6d3c4] hover:bg-emerald-500/15 hover:text-[#f5f2e9] border border-transparent cursor-pointer'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-data text-[10px] w-4 shrink-0 text-amber-300/80">
                      {String(item.step).padStart(2, '0')}
                    </span>
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.short}</span>
                  </div>
                  {!isUnlocked ? (
                    <Lock className="w-3 h-3 text-[#a3aa9c]/45 shrink-0" />
                  ) : isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  ) : item.step === 13 ? (
                    <span className="text-[9px] font-mono-data px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 shrink-0">
                      AUTO
                    </span>
                  ) : null}
                </button>
              );
            })}
          </aside>

          {/* RIGHT CONTENT PANEL */}
          <main className="flex-1 overflow-y-auto cyber-scroll p-4 sm:p-5 bg-gradient-to-b from-[#04140d] via-[#061c13] to-[#04140d] space-y-4">
            {/* STEP 1: CASE EVIDENCE COLLECTION */}
            {activeStep === 1 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                      Step 1 — Case Evidence Collection (E01–E20)
                    </h2>
                    <p className="text-xs text-[#a3aa9c]">
                      Inventory of recovered company files ({inventory.unlocked.length}/20 unlocked) plus real CSV/JSON evidence ingestion.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleLoadSampleCsv}
                      className="px-3 py-1.5 text-xs bg-[#0c2d20] hover:bg-[#13402e] text-emerald-300 border border-emerald-500/30 rounded-md cursor-pointer"
                    >
                      Load Sample Supplementary CSV
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-[#04140d] whitespace-nowrap shrink-0 font-semibold rounded-md cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Upload CSV / JSON
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,.json,text/csv,application/json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </div>
                </div>

                {uploadError && (
                  <div className="p-2.5 bg-red-950/40 border border-red-500/40 rounded text-xs text-red-200">
                    {uploadError}
                  </div>
                )}

                <div className="trustlock-glass rounded-lg overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#071f15]/95 text-[#a3aa9c] border-b border-emerald-500/20">
                      <tr>
                        <th className="p-2.5">Evidence ID</th>
                        <th className="p-2.5">Source System</th>
                        <th className="p-2.5">File Details</th>
                        <th className="p-2.5">Records</th>
                        <th className="p-2.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-500/15">
                      {(Object.keys(EVIDENCE_CATALOG) as EvidenceCode[]).map((code) => {
                        const meta = EVIDENCE_CATALOG[code];
                        const item = inventory.unlocked.find((u) => u.code === code);
                        return (
                          <tr key={code} className={item ? 'text-[#f5f2e9]' : 'text-[#a3aa9c]/60'}>
                            <td className="p-2.5 font-mono-data font-semibold text-amber-300">{code}</td>
                            <td className="p-2.5">{meta.sourceSystem}</td>
                            <td className="p-2.5 font-mono-data text-[11px]">{meta.fileName}</td>
                            <td className="p-2.5 font-mono-data">{item ? item.recordCount : '—'}</td>
                            <td className="p-2.5">
                              {item ? (
                                <span
                                  className={`text-[11px] px-2 py-0.5 rounded font-mono-data ${
                                    item.validationStatus === 'WARNINGS'
                                      ? 'bg-amber-500/20 text-amber-300'
                                      : 'bg-emerald-500/20 text-emerald-300'
                                  }`}
                                >
                                  {item.validationStatus}
                                </span>
                              ) : (
                                <span className="text-[11px] text-[#a3aa9c]/60">Recover in 3D Facility</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => goNextStep(1)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] whitespace-nowrap shrink-0 rounded-md cursor-pointer"
                  >
                    <span>Confirm Collection &amp; Proceed to Step 2</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: DATA VALIDATION */}
            {activeStep === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                    Step 2 — Data Validation &amp; Raw Record Integrity
                  </h2>
                  <p className="text-xs text-[#a3aa9c]">
                    Detects missing fields, duplicate rows, invalid/drifted timestamps, missing identifiers, and format mismatches while preserving raw records untouched.
                  </p>
                </div>

                <div className="space-y-2">
                  {validationIssues.length === 0 ? (
                    <div className="p-4 bg-[#071f15] border border-emerald-500/25 rounded-lg text-xs text-[#d6d3c4]">
                      No anomalies flagged in currently unlocked files. Recover Finance (E19) and IT (E05/E14) clues to inspect missing approval_ref and NTP drift warnings.
                    </div>
                  ) : (
                    validationIssues.map((issue) => (
                      <div
                        key={issue.id}
                        className={`p-3 rounded-lg border text-xs ${
                          issue.severity === 'ERROR'
                            ? 'bg-red-950/25 border-red-500/40 text-red-100'
                            : 'bg-amber-950/25 border-amber-500/40 text-amber-100'
                        }`}
                      >
                        <div className="flex items-center justify-between font-mono-data font-semibold">
                          <span>
                            [{issue.evidenceCode}] {issue.issueType} · {issue.recordRef}
                          </span>
                          <span>{issue.severity}</span>
                        </div>
                        <p className="mt-1 text-[#f5f2e9]">{issue.detail}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="trustlock-glass rounded-lg p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#f5f2e9]">
                      Raw Preserved Source Records Inspector
                    </span>
                    <div className="flex gap-1.5">
                      {(['E18', 'E19', 'E01', 'E15'] as EvidenceCode[]).map((c) => {
                        const isAvail = unlockedCodes.has(c);
                        return (
                          <button
                            key={c}
                            onClick={() => setSelectedEvidenceInspect(c)}
                            className={`px-2 py-1 text-[11px] font-mono-data rounded cursor-pointer ${
                              selectedEvidenceInspect === c
                                ? 'bg-emerald-500 text-[#04140d] font-semibold'
                                : isAvail
                                ? 'bg-[#0c2d20] text-[#f5f2e9]'
                                : 'bg-[#071f15] text-[#a3aa9c] border border-emerald-500/20'
                            }`}
                          >
                            {c} {isAvail ? '' : '(Locked)'}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {unlockedCodes.has(selectedEvidenceInspect) ? (
                    <pre className="p-2.5 bg-[#04140d] border border-emerald-500/20 rounded text-[11px] font-mono-data text-[#d6d3c4] max-h-48 overflow-auto cyber-scroll">
                      {JSON.stringify(
                        selectedEvidenceInspect === 'E18'
                          ? E18_API_LOGS.slice(0, 4)
                          : selectedEvidenceInspect === 'E19'
                          ? E19_BANK_CHANGES
                          : selectedEvidenceInspect === 'E01'
                          ? E01_HISTORICAL_LOGS.slice(0, 3)
                          : E15_NETWORK_RECORDS,
                        null,
                        2
                      )}
                    </pre>
                  ) : (
                    <div className="p-3 bg-[#04140d] border border-amber-500/30 rounded text-xs text-amber-200">
                      Dataset <span className="font-mono-data font-bold">{selectedEvidenceInspect}</span> is not unlocked yet. Explore the 3D company rooms (Reception for E01, Finance for E19, Server Room for E15/E18) and inspect clues or speak with department leads to ingest it.
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => goNextStep(2)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] whitespace-nowrap shrink-0 rounded-md cursor-pointer"
                  >
                    <span>Complete Validation &amp; Proceed to Step 3</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: TIME NORMALISATION */}
            {activeStep === 3 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                    Step 3 — Cross-System Time Normalisation (UTC / IST / Unix Drift)
                  </h2>
                  <p className="text-xs text-[#a3aa9c]">
                    Aligns IST (+05:30) and drifted Unix epoch clocks to E03 Gateway UTC anchors while flagging approximate offsets honestly.
                  </p>
                </div>

                <div className="trustlock-glass rounded-lg overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#071f15] text-[#a3aa9c] border-b border-emerald-500/20">
                      <tr>
                        <th className="p-2.5">Source</th>
                        <th className="p-2.5">Native Format</th>
                        <th className="p-2.5">Raw Sample</th>
                        <th className="p-2.5">Normalized UTC</th>
                        <th className="p-2.5">Offset / Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-500/15">
                      {clockNormalization.map((row) => (
                        <tr key={row.evidenceCode} className="text-[#f5f2e9] align-top">
                          <td className="p-2.5 font-semibold">{row.sourceSystem}</td>
                          <td className="p-2.5 text-[#d6d3c4]">{row.nativeClockFormat}</td>
                          <td className="p-2.5 font-mono-data text-[11px]">{row.rawSample}</td>
                          <td className="p-2.5 font-mono-data text-[11px] text-emerald-300">
                            {row.normalizedUtc}
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`inline-block px-2 py-0.5 rounded font-mono-data text-[10px] ${
                                row.confidence === 'ESTIMATED_DRIFT'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {row.offsetApplied}
                            </span>
                            <div className="mt-1 text-[11px] text-[#a3aa9c]">{row.uncertaintyNote}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => goNextStep(3)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] whitespace-nowrap shrink-0 rounded-md cursor-pointer"
                  >
                    <span>Confirm UTC Alignment &amp; Proceed to Step 4</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 4: ACTOR & IDENTITY CORRELATION */}
            {activeStep === 4 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                    Step 4 — Actor &amp; Identity Correlation
                  </h2>
                  <p className="text-xs text-[#a3aa9c]">
                    Groups API key IDs, service accounts, caller IPs, user agents, and request_id trails. Technical credentials do NOT identify a human operator.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {actorProfiles.map((prof) => (
                    <div
                      key={prof.actorKey}
                      className="p-3.5 trustlock-glass rounded-lg space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono-data font-bold text-emerald-300">{prof.actorKey}</span>
                        <span className="text-[10px] font-mono-data px-2 py-0.5 rounded bg-[#0c2d20] text-[#d6d3c4]">
                          {prof.actorType}
                        </span>
                      </div>
                      <div className="text-[#d6d3c4] space-y-1">
                        <div>
                          <span className="text-[#a3aa9c]">Caller IPs:</span>{' '}
                          <span className="font-mono-data">{prof.callerIps.join(', ')}</span>
                        </div>
                        <div>
                          <span className="text-[#a3aa9c]">User Agents:</span>{' '}
                          <span className="font-mono-data">{prof.userAgents.join(', ')}</span>
                        </div>
                        <div>
                          <span className="text-[#a3aa9c]">Network Labels:</span> {prof.networkLabels.join(', ')}
                        </div>
                        <div>
                          <span className="text-[#a3aa9c]">Linked request_ids:</span>{' '}
                          <span className="font-mono-data text-amber-300">
                            {prof.linkedRequestIds.slice(0, 5).join(', ') || 'None'}
                          </span>
                        </div>
                      </div>
                      <div className="p-2 rounded bg-amber-950/30 border border-amber-500/35 text-[11px] text-amber-200">
                        {prof.identityWarning}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => goNextStep(4)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] whitespace-nowrap shrink-0 rounded-md cursor-pointer"
                  >
                    <span>Confirm Actor Profiles &amp; Launch Step 5 Fingerprint Verification</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: INTERACTIVE SYNTHETIC FINGERPRINT SCANNING & AES-256-GCM VAULT */}
            {activeStep === 5 && (
              <FingerprintScannerPanel
                fingerprintVerified={state.fingerprintVerified}
                lastMatchPct={state.fingerprintMatchPct}
                onVerificationOutcome={onFingerprintOutcome}
                onProceedNext={() => goNextStep(5)}
                onResetAllDemo={onResetDemo}
              />
            )}

            {/* STEP 6: TRUST PROFILE & HISTORICAL BASELINE */}
            {activeStep === 6 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                      Step 6 — TRUSTLOCK Trust Profile &amp; E01 Operational Baseline
                    </h2>
                    <p className="text-xs text-[#a3aa9c]">
                      Combines Step 5 fingerprint authorization with RBAC access control, key management, cryptographic integrity, and historical baseline logs.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 bg-[#071f15] p-1 rounded-md border border-emerald-500/25">
                      {(['TallyBridge', 'FinPay Core'] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setSelectedVendor(v)}
                          className={`px-2.5 py-1 text-xs rounded font-medium cursor-pointer ${
                            selectedVendor === v ? 'bg-emerald-500 text-[#04140d] font-semibold' : 'text-[#d6d3c4]'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-[#a3aa9c] absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter request_id, IP, endpoint..."
                        className="pl-8 pr-3 py-1.5 text-xs bg-[#071f15] border border-emerald-500/30 rounded text-[#f5f2e9] focus:outline-none focus:border-emerald-400"
                      />
                    </div>
                  </div>
                </div>

                {/* TRUSTLOCK 4-Pillar Security Posture */}
                <div className="p-3.5 trustlock-glass rounded-lg space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs font-semibold text-amber-300">
                      Trust Profile: {trustProfile.vendor} ({trustProfile.serviceAccount} · Allowlisted {trustProfile.authorizedIp})
                    </div>
                    <span
                      className={`font-mono-data text-xs font-bold px-2.5 py-1 rounded ${
                        trustProfile.trustScore >= 85
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-red-500/20 text-red-300 border border-red-500/40'
                      }`}
                    >
                      TRUST SCORE: {trustProfile.trustScore}/100 · {trustProfile.integrityPosture}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
                    {trustProfile.pillars.map((p) => (
                      <div key={p.label} className="p-2.5 rounded bg-[#04140d]/90 border border-emerald-500/20 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-[#f5f2e9]">{p.label}</span>
                          <span
                            className={`text-[10px] font-mono-data px-1.5 py-0.5 rounded ${
                              p.status === 'PASS'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : p.status === 'WARN'
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-red-500/20 text-red-300'
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#a3aa9c] leading-snug">{p.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 trustlock-glass rounded-lg">
                    <div className="text-[#a3aa9c]">E01 Baseline Read Ratio</div>
                    <div className="mt-1 font-mono-data text-lg font-bold text-emerald-400">
                      {unlockedCodes.has('E01') && tallyFingerprint
                        ? `${tallyFingerprint.baselineReadPct}% GET`
                        : 'Pending E01'}
                    </div>
                  </div>
                  <div className="p-3 trustlock-glass rounded-lg">
                    <div className="text-[#a3aa9c]">Historical Window</div>
                    <div className="mt-1 font-mono-data text-sm font-bold text-amber-300">
                      {tallyFingerprint?.baselineHoursUtc ?? 'Pending E01'}
                    </div>
                  </div>
                  <div className="p-3 trustlock-glass rounded-lg">
                    <div className="text-[#a3aa9c]">Mean Batch Payload</div>
                    <div className="mt-1 font-mono-data text-lg font-bold text-[#f5f2e9]">
                      {unlockedCodes.has('E01') && tallyFingerprint
                        ? `${(tallyFingerprint.baselineAvgBytes / 1024).toFixed(1)} KB`
                        : 'Pending E01'}
                    </div>
                  </div>
                  <div className="p-3 trustlock-glass rounded-lg">
                    <div className="text-[#a3aa9c]">Authorized Endpoints</div>
                    <div className="mt-1 font-mono-data text-[11px] text-[#d6d3c4]">
                      {unlockedCodes.has('E01') && tallyFingerprint?.authorizedEndpoints.length
                        ? tallyFingerprint.authorizedEndpoints.join(', ')
                        : 'Recover E01 in Reception'}
                    </div>
                  </div>
                </div>

                <div className="trustlock-glass rounded-lg overflow-x-auto max-h-56 cyber-scroll">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#071f15] text-[#a3aa9c] border-b border-emerald-500/20 sticky top-0">
                      <tr>
                        <th className="p-2">Source</th>
                        <th className="p-2">Timestamp</th>
                        <th className="p-2">Method &amp; Endpoint</th>
                        <th className="p-2">Source IP / UA</th>
                        <th className="p-2">Bytes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-500/15">
                      {allApiRows.map((r) => (
                        <tr key={r.id} className="text-[#f5f2e9]">
                          <td className="p-2 font-mono-data text-amber-300">{r.sourceEvidence}</td>
                          <td className="p-2 font-mono-data text-[11px]">{r.timestamp}</td>
                          <td className="p-2 font-mono-data text-[11px]">
                            <span className={r.method === 'POST' ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                              {r.method}
                            </span>{' '}
                            {r.endpoint}
                          </td>
                          <td className="p-2 font-mono-data text-[11px]">
                            {r.source_ip} · {r.user_agent}
                          </td>
                          <td className="p-2 font-mono-data">{r.bytes_out.toLocaleString()} B</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => goNextStep(6)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Lock Trust Profile &amp; Proceed to Step 7 Financial Change DNA</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 7: FINANCIAL CHANGE DNA — SOFTWARE-BASED DATA INTEGRITY PROTECTION */}
            {activeStep === 7 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                      Step 7 — Financial Change DNA (Software-Based Data Integrity Protection)
                    </h2>
                    <p className="text-xs text-[#a3aa9c]">
                      Generates cryptographic SHA-256 hashes, hash-chained audit links, and digital signatures for every vendor-record change — comparing current values against trusted backup snapshots.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={handleRunCryptoIntegrityVerification}
                      className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] whitespace-nowrap shrink-0 rounded-md cursor-pointer"
                    >
                      Verify SHA-256 Ledger &amp; Signatures
                    </button>
                    <button
                      onClick={() =>
                        onTriggerTamperTest(state.tamperTestChangeId === 'CHG-404' ? null : 'CHG-404')
                      }
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer border ${
                        state.tamperTestChangeId === 'CHG-404'
                          ? 'bg-amber-500 text-[#04140d] border-amber-400'
                          : 'bg-[#071f15] hover:bg-[#0c2d20] text-amber-300 border-amber-500/40'
                      }`}
                    >
                      {state.tamperTestChangeId === 'CHG-404'
                        ? 'Clear Simulated Tamper (CHG-404)'
                        : 'Simulate Record Tamper (CHG-404)'}
                    </button>
                  </div>
                </div>

                {/* Security Principle Banner */}
                <div className="p-3 rounded-lg bg-emerald-950/35 border border-emerald-500/40 text-xs text-[#f5f2e9] space-y-1">
                  <div className="font-semibold text-amber-300">
                    Defense-in-Depth Architecture Principle: A Hash Alone Cannot Prevent Hacking
                  </div>
                  <p className="text-[#d6d3c4]">
                    Cryptographic hashing and digital signatures detect unauthorized modifications and bind every change to <span className="font-mono-data text-emerald-300">api_key_id</span>, <span className="font-mono-data text-emerald-300">service_account</span>, <span className="font-mono-data text-emerald-300">request_id</span>, <span className="font-mono-data text-emerald-300">timestamp</span>, and <span className="font-mono-data text-emerald-300">approval_ref</span>. Full protection requires combining integrity verification with RBAC access control, key rotation, approval governance, and protected audit logs.
                  </p>
                  {webCryptoDigest && (
                    <div className="pt-1 font-mono-data text-[11px] text-emerald-300 break-all">
                      Web Crypto SHA-256 Chain Seal: {webCryptoDigest}
                    </div>
                  )}
                </div>

                {/* Integrity Ledger vs Trusted Backups */}
                {integrityLedger.length > 0 ? (
                  <div className="space-y-2.5 max-h-72 overflow-y-auto cyber-scroll pr-1">
                    {integrityLedger.map((rec) => {
                      const verified = state.integrityVerifiedIds.includes(rec.changeId);
                      return (
                        <div
                          key={rec.changeId}
                          className={`p-3 rounded-lg border text-xs space-y-1.5 ${
                            rec.verificationStatus === 'RESTORED_SEALED' ||
                            rec.verificationStatus === 'VERIFIED_TRUSTED'
                              ? 'bg-emerald-950/25 border-emerald-500/40'
                              : 'bg-red-950/25 border-red-500/45'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-mono-data font-bold text-[#f5f2e9]">
                              {rec.changeId} · {rec.vendorPayee}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {verified && (
                                <span className="text-[10px] font-mono-data px-2 py-0.5 rounded bg-amber-500/20 text-amber-300">
                                  SHA-256 AUDITED
                                </span>
                              )}
                              <span
                                className={`text-[10px] font-mono-data px-2 py-0.5 rounded ${
                                  rec.verificationStatus === 'VERIFIED_TRUSTED' ||
                                  rec.verificationStatus === 'RESTORED_SEALED'
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-red-500/20 text-red-300'
                                }`}
                              >
                                {rec.verificationStatus}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 font-mono-data text-[11px]">
                            <div className="p-2 rounded bg-[#04140d]/85 border border-emerald-500/20 space-y-0.5">
                              <div className="text-[#a3aa9c]">
                                Hash: <span className="text-emerald-300">{rec.recordHash.slice(0, 28)}...</span>
                              </div>
                              <div className="text-[#a3aa9c]">
                                Chain Prev: <span className="text-[#d6d3c4]">{rec.prevChainHash.slice(0, 18)}...</span>
                              </div>
                              <div className="text-[#a3aa9c]">
                                Signature: <span className={rec.signatureTrusted ? 'text-emerald-300' : 'text-red-300'}>{rec.digitalSignature}</span>
                              </div>
                            </div>
                            <div className="p-2 rounded bg-[#04140d]/85 border border-emerald-500/20 space-y-0.5">
                              <div className="text-[#d6d3c4]">
                                Key/Svc: {rec.apiKeyId} / {rec.serviceAccount}
                              </div>
                              <div className="text-[#d6d3c4]">
                                Req/Time: {rec.requestId} · {rec.timestamp}
                              </div>
                              <div className="text-[#d6d3c4]">
                                Approval Ref:{' '}
                                <span className={rec.approvalValid ? 'text-emerald-300' : 'text-red-300'}>
                                  {rec.approvalRef ?? 'NULL (MISSING)'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {rec.originalBackup && (
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#d6d3c4] pt-0.5">
                              <span>
                                Trusted Backup ({rec.originalBackup.backupRef}):{' '}
                                <span className="font-mono-data text-emerald-300">
                                  {rec.originalBackup.verifiedBankAcct} ({rec.originalBackup.verifiedIfscSwift})
                                </span>{' '}
                                vs Current:{' '}
                                <span className="font-mono-data text-amber-300">
                                  {rec.currentBankAcct} ({rec.currentIfscSwift})
                                </span>
                              </span>
                            </div>
                          )}

                          {rec.mismatchedFields.length > 0 && (
                            <div className="text-[11px] font-mono-data text-red-300">
                              Mismatch Alert: {rec.mismatchedFields.join(' | ')}
                            </div>
                          )}
                          <div className="text-[11px] text-[#a3aa9c]">{rec.securityLesson}</div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 bg-[#04140d] border border-amber-500/35 rounded-lg text-xs text-amber-200">
                    ERP Bank Change dataset (E19) is not unlocked yet. Visit the Finance Department (Madhavi Sundar or Treasury Lockbox clue) to inspect and hash-verify vendor bank changes.
                  </div>
                )}

                {/* Contract & Permission Boundaries (E04 / E07 / E08) */}
                <div className="p-3.5 trustlock-glass rounded-lg space-y-2 text-xs">
                  <div className="font-display font-semibold text-amber-300">
                    Contract &amp; RBAC Governance Boundaries (E04 / E07 / E08)
                  </div>
                  {unlockedCodes.has('E04') || unlockedCodes.has('E07') ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {VENDOR_PERMISSIONS.map((perm) => (
                        <div
                          key={perm.scope}
                          className="flex items-center justify-between p-2 rounded bg-[#04140d] border border-emerald-500/20"
                        >
                          <span className="font-mono-data text-[#f5f2e9]">{perm.scope}</span>
                          <span
                            className={`text-[10px] font-mono-data px-2 py-0.5 rounded ${
                              perm.authorized
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-red-500/20 text-red-300'
                            }`}
                          >
                            {perm.authorized ? 'AUTHORIZED' : 'OVER-PRIVILEGED'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2.5 bg-[#04140d] border border-amber-500/30 rounded text-amber-200">
                      Permission matrix E04/E07 is locked. Visit Security Operations (Aditi Kapoor) or Vendor Management (Pradeep Shah) to inspect IAM scopes and contract policies.
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => goNextStep(7)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Seal Change DNA Audit &amp; Launch Step 8 Simulation</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 8: BASELINE & INTEGRITY SIMULATION */}
            {activeStep === 8 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                      Step 8 — Baseline vs Observed &amp; Integrity Verification Simulation ({selectedVendor})
                    </h2>
                    <p className="text-xs text-[#a3aa9c]">
                      Data-driven playback comparing authorized baseline traffic against live gateway telemetry and cryptographic record integrity.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSimPlaying((p) => !p);
                        onMarkSimulationCompared();
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] whitespace-nowrap shrink-0 rounded-md cursor-pointer"
                    >
                      {simPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      <span>{simPlaying ? 'Pause' : 'Play Stream'}</span>
                    </button>
                    <button
                      onClick={() => {
                        setSimPlaying(false);
                        setSimFrameIndex((prev) => {
                          const next = Math.min(simulationFrames.length - 1, prev + 1);
                          if (next > 0) onMarkSimulationCompared();
                          return next;
                        });
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[#0c2d20] hover:bg-[#13402e] text-[#f5f2e9] rounded-md cursor-pointer"
                    >
                      <SkipForward className="w-3.5 h-3.5" />
                      <span>Step</span>
                    </button>
                    <button
                      onClick={() => {
                        setSimPlaying(false);
                        setSimFrameIndex(0);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[#0c2d20] hover:bg-[#13402e] text-[#d6d3c4] rounded-md cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                  {simulationFrames.map((fr, idx) => (
                    <button
                      key={fr.idx}
                      onClick={() => {
                        setSimPlaying(false);
                        setSimFrameIndex(idx);
                        onMarkSimulationCompared();
                      }}
                      className={`p-2 rounded border text-left text-[11px] font-mono-data cursor-pointer transition-colors ${
                        idx === simFrameIndex
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                          : idx < simFrameIndex
                          ? 'bg-[#071f15] border-emerald-500/35 text-[#d6d3c4]'
                          : 'bg-[#04140d] border-emerald-500/15 text-[#a3aa9c]'
                      }`}
                    >
                      Frame {fr.idx}
                    </button>
                  ))}
                </div>

                {/* Dual Stream Visual Comparator */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-emerald-950/25 border border-emerald-500/40 space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-mono-data text-emerald-300">
                      <span>STREAM A — NORMAL TRUST PROFILE</span>
                      <span>{currentSimFrame.timeLabel}</span>
                    </div>
                    <div className="p-3 rounded bg-[#04140d]/90 border border-emerald-500/20 font-mono-data text-xs text-emerald-200">
                      {currentSimFrame.normalOp}
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between text-[#d6d3c4]">
                        <span>Baseline Read Share</span>
                        <span className="font-mono-data text-emerald-300">{currentSimFrame.normalReadPct}% GET</span>
                      </div>
                      <div className="h-1.5 bg-[#071f15] rounded overflow-hidden">
                        <div
                          className="h-full bg-emerald-400"
                          style={{ width: `${currentSimFrame.normalReadPct}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[#a3aa9c] pt-1">
                        <span>Reference Payload</span>
                        <span className="font-mono-data">{currentSimFrame.normalPayloadKb} KB</span>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`p-4 rounded-lg border space-y-2.5 ${
                      currentSimFrame.isCritical
                        ? 'bg-red-950/25 border-red-500/50'
                        : 'bg-[#071f15] border-amber-500/40'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-mono-data text-amber-300">
                      <span>STREAM B — OBSERVED ACTIVITY</span>
                      <span>{currentSimFrame.isCritical ? 'DEVIATION DETECTED' : 'NOMINAL'}</span>
                    </div>
                    <div className="p-3 rounded bg-[#04140d]/90 border border-emerald-500/20 font-mono-data text-xs text-[#f5f2e9]">
                      {currentSimFrame.observedOp}
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[10px] font-mono-data">
                      <span
                        className={`px-2 py-0.5 rounded ${
                          currentSimFrame.ipDeviation
                            ? 'bg-red-500/20 text-red-300'
                            : 'bg-emerald-500/15 text-emerald-300'
                        }`}
                      >
                        IP: {currentSimFrame.ipDeviation ? 'UNLISTED' : 'ALLOWLISTED'}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded ${
                          currentSimFrame.uaDeviation
                            ? 'bg-amber-500/20 text-amber-300'
                            : 'bg-emerald-500/15 text-emerald-300'
                        }`}
                      >
                        UA: {currentSimFrame.uaDeviation ? 'SCRIPTED PYTHON' : 'APPROVED WORKER'}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-[#0c2d20] text-[#f5f2e9]">
                        Payload: {currentSimFrame.observedPayloadKb} KB
                      </span>
                    </div>
                    <div className="text-[11px] font-medium text-amber-200">
                      {currentSimFrame.deviation}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      onMarkSimulationCompared();
                      goNextStep(8);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Confirm Deviations &amp; Proceed to Step 9 Detection Engine</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 9: DETECTION ENGINE */}
            {activeStep === 9 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                    Step 9 — Detection Engine (Behavioural &amp; Cryptographic Integrity Anomalies)
                  </h2>
                  <p className="text-xs text-[#a3aa9c]">
                    Detects multi-dimensional deviations (unexpected writes, sequence break, off-hours timing, egress spike, out-of-permission calls, and backup hash mismatches).
                  </p>
                </div>

                <div className="space-y-3">
                  {(tallyFingerprint?.deviations ?? []).map((dev) => (
                    <div
                      key={dev.id}
                      className={`p-3.5 rounded-lg border text-xs ${
                        dev.severity === 'CRITICAL'
                          ? 'bg-red-950/25 border-red-500/45'
                          : 'bg-amber-950/25 border-amber-500/45'
                      }`}
                    >
                      <div className="flex items-center justify-between font-semibold text-[#f5f2e9]">
                        <span>{dev.title}</span>
                        <span className="font-mono-data text-[11px] px-2 py-0.5 rounded bg-[#04140d] text-amber-300">
                          {dev.severity}
                        </span>
                      </div>
                      <p className="mt-1 text-[#d6d3c4]">{dev.explanation}</p>
                      <div className="mt-1.5 font-mono-data text-[11px] text-emerald-300">
                        Records: {dev.supportingRecordIds.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => goNextStep(9)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Confirm Detections &amp; Proceed to Step 10 Correlation</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 10: EVIDENCE CORRELATION */}
            {activeStep === 10 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                      Step 10 — Cross-System Evidence Correlation (E18 ↔ E19 via request_id)
                    </h2>
                    <p className="text-xs text-[#a3aa9c]">
                      Link E18 API writes to E19 bank-detail changes, inspect channel &amp; changed_by, and scan for missing approval_ref entries.
                    </p>
                  </div>
                  <button
                    onClick={handleRunMissingScan}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-[#04140d] rounded-md cursor-pointer"
                  >
                    {state.missingApprovalScanRun
                      ? `Missing approval_ref Found (${state.detectedMissingChangeIds.length})`
                      : 'Scan E19 Missing approval_ref'}
                  </button>
                </div>

                {correlationFeedback && (
                  <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/40 rounded text-xs text-emerald-200">
                    {correlationFeedback}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
                  <div className="trustlock-glass rounded-lg p-3 space-y-2">
                    <div className="font-semibold text-emerald-300">1. Select E18 API Write Call</div>
                    {allApiRows
                      .filter((r) => r.method === 'POST' || r.source_ip === '185.220.101.47')
                      .map((r) => {
                        const correlated = state.correlatedRequestIds.includes(r.request_id);
                        const flagged = state.flaggedRequestIds.includes(r.request_id);
                        return (
                          <div
                            key={r.id}
                            onClick={() => setSelectedE18Req(r.request_id)}
                            className={`p-2.5 rounded border cursor-pointer ${
                              correlated
                                ? 'bg-emerald-950/30 border-emerald-500/45'
                                : selectedE18Req === r.request_id
                                ? 'bg-amber-950/40 border-amber-400'
                                : 'bg-[#071f15]/75 border-emerald-500/20 hover:border-emerald-400/50'
                            }`}
                          >
                            <div className="flex items-center justify-between font-mono-data">
                              <span className="text-amber-300 font-semibold">{r.request_id}</span>
                              <button
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  onToggleFlagRequest(r.request_id);
                                }}
                                className="px-2 py-0.5 text-[10px] rounded bg-[#0c2d20] text-[#d6d3c4]"
                              >
                                {flagged ? 'Flagged' : 'Flag'}
                              </button>
                            </div>
                            <div className="text-[11px] text-[#d6d3c4] mt-0.5">
                              {r.method} {r.endpoint} · {r.source_ip} · {r.api_key_id}
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  <div className="trustlock-glass rounded-lg p-3 space-y-2">
                    <div className="font-semibold text-amber-400">2. Match E19 Bank-Detail Change</div>
                    {allBankRows.map((b) => {
                      const correlated = state.correlatedRequestIds.includes(b.request_id);
                      const missing = !b.approval_ref || b.approval_ref.trim() === '';
                      return (
                        <div
                          key={b.change_id}
                          onClick={() => handleSelectE19ForCorrelation(b.request_id)}
                          className={`p-2.5 rounded border cursor-pointer ${
                            correlated
                              ? 'bg-emerald-950/30 border-emerald-500/45'
                              : missing
                              ? 'bg-red-950/20 border-red-500/35 hover:border-red-400'
                              : 'bg-[#071f15]/75 border-emerald-500/20'
                          }`}
                        >
                          <div className="flex items-center justify-between font-mono-data">
                            <span className="font-semibold text-[#f5f2e9]">
                              {b.change_id} · {b.request_id}
                            </span>
                            <span className={missing ? 'text-red-300' : 'text-emerald-300'}>
                              {b.approval_ref || 'MISSING approval_ref'}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#d6d3c4] mt-0.5">
                            {b.vendor_payee} ({b.new_ifsc_swift}) · {b.channel} · {b.changed_by}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Automated Engine Results + E15/E17 */}
                <div className="p-3 trustlock-glass rounded-lg text-xs space-y-1.5">
                  <div className="font-semibold text-[#f5f2e9]">
                    Correlated E15 NetFlow &amp; E17 IOC Matches ({correlations.filter((c) => c.status === 'MATCHED_COMPLETE').length} complete pairs)
                  </div>
                  {unlockedCodes.has('E17') || unlockedCodes.has('E15') ? (
                    E17_IOCS.map((ioc) => (
                      <div key={ioc.ioc_id} className="text-[11px] text-[#d6d3c4] font-mono-data">
                        • {ioc.ioc_id} [{ioc.type}]: {ioc.indicator} — {ioc.description}
                      </div>
                    ))
                  ) : (
                    <div className="text-[11px] text-amber-200">
                      E15 NetFlow and E17 Threat-Intel IOCs are locked — inspect Server Room (Colin Lawson / rack drive) to unlock IOC matching.
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      CORRELATED_REQUEST_IDS.forEach((id) => {
                        if (!state.correlatedRequestIds.includes(id)) onCorrelatePair(id);
                      });
                      if (!state.missingApprovalScanRun) {
                        onRunMissingApprovalScan(MISSING_APPROVAL_CHANGE_IDS);
                      }
                      goNextStep(10);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Finalize E18/E19 Correlation &amp; Proceed to Step 11</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 11: INCIDENT TIMELINE */}
            {activeStep === 11 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                    Step 11 — Reconstructed Incident Timeline (Normalized UTC)
                  </h2>
                  <p className="text-xs text-[#a3aa9c]">
                    Unified chronology across E02, E05 (flagged with uncertain offset), E15, E18, and E19.
                  </p>
                </div>

                <div className="trustlock-glass rounded-lg p-3 max-h-60 overflow-y-auto cyber-scroll space-y-2">
                  {autoTimeline.map((ev) => (
                    <div key={ev.id} className="p-2.5 rounded bg-[#071f15]/80 border border-emerald-500/20 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2 font-mono-data">
                        <span className="text-amber-300">{ev.timestamp}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#0c2d20] text-[#d6d3c4]">
                          {ev.sourceCode} · {ev.sourceSystem} · {ev.confidence}
                        </span>
                      </div>
                      <div className="mt-1 font-semibold text-[#f5f2e9]">
                        {ev.actorOrCredential}: {ev.title}
                      </div>
                      <div className="text-[11px] text-[#d6d3c4]">{ev.detail}</div>
                      {ev.uncertaintyNote && (
                        <div className="mt-1 text-[11px] text-amber-300">{ev.uncertaintyNote}</div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="trustlock-glass rounded-lg p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#f5f2e9]">
                      Milestone Sequence Verification
                    </span>
                    <button
                      onClick={handleVerifyTimelineOrder}
                      className="px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] whitespace-nowrap shrink-0 rounded cursor-pointer"
                    >
                      Verify Sequence
                    </button>
                  </div>
                  {timelineFeedback && (
                    <div className="text-xs text-emerald-300">{timelineFeedback}</div>
                  )}
                  <div className="space-y-1.5">
                    {orderedSteps.map((step, idx) => (
                      <div
                        key={step.id}
                        className="flex items-center justify-between gap-2 p-2 rounded bg-[#071f15] border border-emerald-500/20 text-xs"
                      >
                        <div>
                          <span className="font-mono-data text-amber-300 mr-2">{step.timeLabel}</span>
                          <span className="text-[#f5f2e9] font-medium">{step.title}</span>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => moveTimelineStep(idx, -1)}
                            className="px-2 py-0.5 bg-[#0c2d20] rounded text-[#d6d3c4] cursor-pointer"
                          >
                            Up
                          </button>
                          <button
                            onClick={() => moveTimelineStep(idx, 1)}
                            className="px-2 py-0.5 bg-[#0c2d20] rounded text-[#d6d3c4] cursor-pointer"
                          >
                            Down
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      if (!state.timelineVerified) onVerifyTimeline();
                      goNextStep(11);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Confirm Timeline &amp; Proceed to Step 12 Detective Engine</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 12: DETECTIVE INVESTIGATION ENGINE */}
            {activeStep === 12 && (
              <div className="space-y-4">
                <div>
                  <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                    Step 12 — Detective Investigation Engine &amp; Alternative Explanation Testing
                  </h2>
                  <p className="text-xs text-[#a3aa9c]">
                    Separates Confirmed Facts, Suspicious Observations, Evidence-Supported Inferences, 4 explicit Alternative Hypotheses, and Unresolved Questions.
                  </p>
                </div>

                {/* 4 Alternative Explanations */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {assessment.alternativeTests.map((alt) => (
                    <div
                      key={alt.id}
                      className={`p-3 rounded-lg border space-y-1.5 ${
                        alt.status === 'SUPPORTED_BY_EVIDENCE'
                          ? 'bg-emerald-950/30 border-emerald-500/45'
                          : 'bg-[#071f15] border-emerald-500/20'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[#f5f2e9]">{alt.hypothesis}</span>
                        <span
                          className={`text-[10px] font-mono-data px-2 py-0.5 rounded shrink-0 ${
                            alt.status === 'SUPPORTED_BY_EVIDENCE'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-[#0c2d20] text-amber-300'
                          }`}
                        >
                          {alt.status}
                        </span>
                      </div>
                      <p className="text-[#d6d3c4]">{alt.assessment}</p>
                      <div className="text-[11px] text-[#a3aa9c]">
                        Contradictions: {alt.contradictingEvidence.join(' ')}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Human Investigator Finding Controls */}
                <div className="space-y-2.5">
                  <div className="text-xs font-semibold text-amber-300">
                    Human Investigator Review (Confirm / Dismiss / Follow-Up)
                  </div>
                  {assessment.findings.map((f) => {
                    const rev = state.findingReviews[f.id];
                    return (
                      <div
                        key={f.id}
                        className="p-3 trustlock-glass rounded-lg text-xs space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[#f5f2e9]">
                            {f.id} · {f.title} ({f.epistemicLayer})
                          </span>
                          <span className="font-mono-data text-[10px] px-2 py-0.5 rounded bg-[#0c2d20] text-emerald-300">
                            {rev ? rev.status : 'UNREVIEWED'}
                          </span>
                        </div>
                        <p className="text-[#d6d3c4]">{f.summary}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            value={noteDrafts[f.id] ?? rev?.note ?? ''}
                            onChange={(e) =>
                              setNoteDrafts((prev) => ({ ...prev, [f.id]: e.target.value }))
                            }
                            placeholder="Investigator note..."
                            className="flex-1 min-w-[180px] px-2.5 py-1 bg-[#04140d] border border-emerald-500/30 rounded text-[#f5f2e9] text-xs"
                          />
                          <button
                            onClick={() => handleFindingDecision(f.id, 'CONFIRMED')}
                            className="px-2.5 py-1 bg-emerald-600/85 hover:bg-emerald-500 text-white rounded cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => handleFindingDecision(f.id, 'NEEDS_FURTHER_INVESTIGATION')}
                            className="px-2.5 py-1 bg-amber-600/85 hover:bg-amber-500 text-white rounded cursor-pointer"
                          >
                            Follow-Up
                          </button>
                          <button
                            onClick={() => handleFindingDecision(f.id, 'DISMISSED')}
                            className="px-2.5 py-1 bg-[#0c2d20] hover:bg-[#13402e] text-[#d6d3c4] rounded cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={() => goNextStep(12)}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Finalize Findings &amp; Open Recovery Centre</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 13: RECOVERY CENTRE — FLAGSHIP FULLY AUTOMATIC RECOVERY ENGINE */}
            {activeStep === 13 && (
              <div className="space-y-4">
                {/* FLAGSHIP HERO HEADER */}
                <div className="p-4 rounded-xl bg-gradient-to-r from-[#072417] via-[#0a2f1e] to-[#072116] border border-emerald-500/45 shadow-[0_0_28px_rgba(16,185,129,0.16)] flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                        Step 13 — TRUSTLOCK Automatic Recovery Centre
                      </h2>
                      <span className="text-[10px] font-mono-data px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/35">
                        SIMULATION ENGINE · MAIN WORKFLOW
                      </span>
                    </div>
                    <p className="text-xs text-[#d6d3c4] mt-1">
                      Automatically detects unauthorized vendor modifications, correlates API identity &amp; request ID, preserves raw evidence, isolates affected vendor records, places payments ON HOLD, restricts suspicious API credentials, verifies trusted backups, restores original records safely, and confirms all checks before reporting success.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      onClick={onToggleUncertainBackup}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md border cursor-pointer whitespace-nowrap shrink-0 ${
                        state.simulateUncertainBackup
                          ? 'bg-amber-500/25 border-amber-400 text-amber-200'
                          : 'bg-[#071f15] border-emerald-500/35 text-[#d6d3c4] hover:border-amber-400/60'
                      }`}
                    >
                      {state.simulateUncertainBackup
                        ? 'Uncertain Backup Test: ON'
                        : 'Simulate Uncertain Backup'}
                    </button>
                    <button
                      disabled={autoRecoverAnimating}
                      onClick={triggerAutoRecoverSequence}
                      className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold bg-gradient-to-r from-emerald-500 to-amber-400 hover:from-emerald-400 hover:to-amber-300 text-[#04140d] rounded-md shadow-[0_0_22px_rgba(16,185,129,0.35)] cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-70"
                    >
                      <ShieldCheck className="w-4 h-4" />
                      <span>{autoRecoverAnimating ? 'RECOVERING...' : 'AUTO RECOVER'}</span>
                    </button>
                  </div>
                </div>

                {/* CONNECTED ROLE WORKFLOW PIPELINE */}
                <div className="p-3 trustlock-glass rounded-lg space-y-2">
                  <div className="text-[10px] font-mono-data uppercase tracking-wider text-amber-300">
                    Connected Incident-to-Recovery Role Workflow
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px]">
                    {[
                      { role: 'Security Analyst', stage: 'Detection', done: state.autoRecoverySteps.length >= 1 },
                      { role: 'Digital Investigator', stage: 'Evidence Analysis', done: state.autoRecoverySteps.length >= 3 },
                      { role: 'Network Engineer', stage: 'Network Isolation', done: state.blockedIndicators.includes('185.220.101.47') },
                      { role: 'System Administrator', stage: 'Credential Restriction', done: state.rotatedKeys.includes('ak_tb_prod_0419') },
                      { role: 'Financial Officer', stage: 'Payment Hold Verification', done: state.paymentHoldActive },
                      { role: 'Security Manager', stage: 'Recovery Approval', done: state.autoRecoveryStatus === 'AUTO_RECOVERY_SUCCESSFUL' || state.autoRecoveryApprovedByHuman },
                    ].map((wf) => (
                      <div
                        key={wf.role}
                        className={`p-2 rounded border ${
                          wf.done
                            ? 'bg-emerald-950/35 border-emerald-500/45 text-[#f5f2e9]'
                            : 'bg-[#04140d]/80 border-emerald-500/20 text-[#a3aa9c]'
                        }`}
                      >
                        <div className="font-semibold text-amber-300 truncate">{wf.role}</div>
                        <div className="text-[10px] text-[#d6d3c4] truncate">→ {wf.stage}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ANIMATED AUTOMATIC RECOVERY PROGRESS BAR */}
                {(autoRecoverAnimating || state.autoRecoverySteps.length > 0) && (
                  <div className="p-3.5 trustlock-glass rounded-lg space-y-2 text-xs">
                    <div className="flex items-center justify-between font-mono-data">
                      <span className="text-emerald-300 font-semibold">
                        {autoRecoverAnimating
                          ? 'Executing 10-Stage Automated Recovery Pipeline (Simulation)...'
                          : 'Automatic Recovery Pipeline Progress'}
                      </span>
                      <span className="text-amber-300">
                        {autoRecoverAnimating ? `${autoRecoverProgress}%` : '100%'}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-[#04140d] border border-emerald-500/25 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-amber-400 transition-all duration-150"
                        style={{ width: `${autoRecoverAnimating ? autoRecoverProgress : 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* RECOVERY CENTRE SUMMARY GRID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                  <div className="p-3 trustlock-glass rounded-lg space-y-1">
                    <div className="text-[11px] font-mono-data text-emerald-300">INCIDENT &amp; AFFECTED VENDOR</div>
                    <div className="font-semibold text-[#f5f2e9]">
                      Meridian Offshore &amp; Vanguard Transit
                    </div>
                    <div className="text-[11px] text-[#a3aa9c]">
                      Integration: TallyBridge (svc-tallybridge-sync) · Simulation
                    </div>
                  </div>
                  <div className="p-3 trustlock-glass rounded-lg space-y-1">
                    <div className="text-[11px] font-mono-data text-rose-300">DETECTED MODIFICATION</div>
                    <div className="font-semibold text-[#f5f2e9] font-mono-data">
                      CHG-401, CHG-402, CHG-403
                    </div>
                    <div className="text-[11px] text-[#a3aa9c]">
                      Offshore CYPRCY2NXXX · approval_ref NULL · IP 185.220.101.47
                    </div>
                  </div>
                  <div className="p-3 trustlock-glass rounded-lg space-y-1">
                    <div className="text-[11px] font-mono-data text-amber-300">RECOVERY SOURCE</div>
                    <div className="font-semibold text-[#f5f2e9] font-mono-data">
                      {state.simulateUncertainBackup || !unlockedCodes.has('E19')
                        ? 'UNCERTAIN / UNAVAILABLE'
                        : 'BK-2026-11-18-4481 / 5112 / 3318'}
                    </div>
                    <div className="text-[11px] text-[#a3aa9c]">
                      {state.simulateUncertainBackup || !unlockedCodes.has('E19')
                        ? 'Zero guessing policy — human approval enforced'
                        : 'SHA-256 verified Finance backup masters'}
                    </div>
                  </div>
                  <div className="p-3 trustlock-glass rounded-lg space-y-1">
                    <div className="text-[11px] font-mono-data text-amber-300">HOLD &amp; ISOLATION STATUS</div>
                    <div className="font-semibold text-[#f5f2e9]">
                      {state.paymentHoldActive ? 'PAYMENTS ON HOLD' : 'HOLD RELEASED'} ·{' '}
                      {state.blockedIndicators.includes('185.220.101.47') ? 'ISOLATED' : 'UNBLOCKED'}
                    </div>
                    <div className="text-[11px] text-[#a3aa9c]">
                      Simulated credential:{' '}
                      {state.rotatedKeys.includes('ak_tb_prod_0419') ? 'Restricted & Rotated' : 'Active'}
                    </div>
                  </div>
                </div>

                {/* FINAL RECOVERY STATUS BANNER (ONLY AFTER ANIMATION & ALL CHECKS PASS) */}
                {!autoRecoverAnimating && state.autoRecoveryStatus === 'AUTO_RECOVERY_SUCCESSFUL' && (
                  <div className="p-4 rounded-xl bg-emerald-950/45 border-2 border-emerald-400/65 flex flex-wrap items-center justify-between gap-3 text-xs shadow-[0_0_24px_rgba(16,185,129,0.2)]">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-6 h-6 text-emerald-300 shrink-0" />
                      <div>
                        <div className="font-display font-bold text-sm text-emerald-300">
                          RECOVERY SUCCESSFUL (Simulation Verified)
                        </div>
                        <div className="text-[#f5f2e9] mt-0.5">
                          Unauthorized modifications blocked, offshore payouts ON HOLD, suspicious API key restricted, original verified vendor backups restored cleanly, and all 5 post-recovery verification probes passed ({state.autoRecoveryExecutedAt}).
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {!autoRecoverAnimating && state.autoRecoveryStatus === 'HUMAN_APPROVAL_REQUIRED' && (
                  <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-400/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0" />
                      <div>
                        <div className="font-display font-bold text-sm text-amber-300">
                          ISOLATION MAINTAINED — HUMAN APPROVAL REQUIRED (Simulation)
                        </div>
                        <div className="text-[#f5f2e9] mt-0.5">
                          Trusted backup data is unavailable or uncertain. Refusing to guess financial account numbers — vendor records stay isolated and pending payments remain ON HOLD pending Security Manager sign-off.
                        </div>
                      </div>
                    </div>
                    <button
                      disabled={state.autoRecoveryApprovedByHuman}
                      onClick={onApproveHumanHold}
                      className={`px-3.5 py-2 text-xs font-semibold rounded-md whitespace-nowrap shrink-0 ${
                        state.autoRecoveryApprovedByHuman
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                          : 'bg-amber-500 hover:bg-amber-400 text-[#04140d] cursor-pointer'
                      }`}
                    >
                      {state.autoRecoveryApprovedByHuman
                        ? 'Security Manager Hold Approved'
                        : 'Security Manager: Approve Manual Hold'}
                    </button>
                  </div>
                )}

                {/* LIVE RECOVERY TIMELINE (1-10 STEPS) */}
                {state.autoRecoverySteps.length > 0 && (
                  <div className="p-3.5 trustlock-glass rounded-lg space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber-300">
                        Live Recovery Timeline (10-Step Automated Execution · Simulation)
                      </span>
                      <span className="font-mono-data text-[11px] text-[#a3aa9c]">
                        Executed: {state.autoRecoveryExecutedAt}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {state.autoRecoverySteps
                        .slice(0, autoRecoverAnimating ? visibleRecoverySteps : 10)
                        .map((st) => (
                          <div
                            key={st.stepNumber}
                            className={`p-2.5 rounded border text-[11px] flex items-start justify-between gap-2 ${
                              st.status === 'DONE'
                                ? 'bg-emerald-950/25 border-emerald-500/35 text-[#f5f2e9]'
                                : st.status === 'BLOCKED'
                                ? 'bg-amber-950/30 border-amber-500/45 text-amber-100'
                                : 'bg-[#04140d] border-emerald-500/20 text-[#a3aa9c]'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-[#f5f2e9]">
                                  {st.stepNumber}. {st.label}
                                </span>
                                <span className="text-[10px] font-mono-data text-amber-300">
                                  [{st.actorRole}]
                                </span>
                              </div>
                              <div className="text-[#d6d3c4] mt-0.5">{st.detail}</div>
                              <div className="text-[10px] font-mono-data text-[#a3aa9c] mt-0.5">
                                {st.timestamp}
                              </div>
                            </div>
                            <span
                              className={`font-mono-data text-[10px] px-1.5 py-0.5 rounded shrink-0 ${
                                st.status === 'DONE'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-amber-500/20 text-amber-300'
                              }`}
                            >
                              {st.status}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* LIVE VENDOR MASTER RECORDS (QUARANTINED vs VERIFIED RESTORED) */}
                <div className="p-3.5 trustlock-glass rounded-lg space-y-2.5 text-xs">
                  <div className="font-semibold text-emerald-300">
                    Application Vendor Master Records (Live Simulation State)
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                    {[
                      { id: 'CHG-401', vendor: 'Meridian Offshore Forwarding', badAcct: 'CYPR-9021 (CYPRCY2NXXX)', trustedAcct: '****4481', trustedSwift: 'HDFCINBBXXX', backup: 'BK-2026-11-18-4481' },
                      { id: 'CHG-402', vendor: 'Vanguard Transit Holdings', badAcct: 'CYPR-7744 (CYPRCY2NXXX)', trustedAcct: '****5112', trustedSwift: 'ICICINBBXXX', backup: 'BK-2026-11-18-5112' },
                      { id: 'CHG-403', vendor: 'Meridian Offshore Forwarding', badAcct: 'CYPR-9021 (CYPRCY2NXXX)', trustedAcct: '****3318', trustedSwift: 'SBININBBXXX', backup: 'BK-2026-11-18-3318' },
                    ].map((rec) => {
                      const restoredRec = state.restoredVendorRecords?.[rec.id];
                      const isRestored = Boolean(restoredRec) || state.rolledBackChangeIds.includes(rec.id);
                      return (
                        <div
                          key={rec.id}
                          className={`p-2.5 rounded border space-y-1 ${
                            isRestored
                              ? 'bg-emerald-950/25 border-emerald-500/40'
                              : 'bg-rose-950/20 border-rose-500/40'
                          }`}
                        >
                          <div className="flex items-center justify-between font-mono-data">
                            <span className="font-bold text-[#f5f2e9]">{rec.id}</span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                isRestored ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                              }`}
                            >
                              {isRestored ? 'RESTORED & VERIFIED' : 'ISOLATED / QUARANTINED'}
                            </span>
                          </div>
                          <div className="font-medium text-[#f5f2e9]">{rec.vendor}</div>
                          <div className="font-mono-data text-[11px] text-[#d6d3c4]">
                            Active Account:{' '}
                            <span className={isRestored ? 'text-emerald-300' : 'text-rose-300'}>
                              {isRestored
                                ? `${restoredRec?.bankAcct ?? rec.trustedAcct} (${restoredRec?.swift ?? rec.trustedSwift})`
                                : rec.badAcct}
                            </span>
                          </div>
                          <div className="text-[10px] font-mono-data text-[#a3aa9c]">
                            {isRestored
                              ? `Source: ${restoredRec?.restoredFrom ?? rec.backup} · ${restoredRec?.verifiedAt ?? 'Verified'}`
                              : `Backup Ref: ${rec.backup}`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {decisionFeedback && (
                  <div className="p-3 bg-red-950/35 border border-red-500/45 rounded text-xs text-red-200">
                    {decisionFeedback}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 trustlock-glass rounded-lg">
                    <label className="block text-[#a3aa9c] mb-1">Compromised Service Credential</label>
                    <select
                      value={chosenAccount}
                      onChange={(e) => setChosenAccount(e.target.value)}
                      className="w-full p-2 bg-[#04140d] border border-emerald-500/30 rounded text-[#f5f2e9]"
                    >
                      <option value="svc-tallybridge-sync">svc-tallybridge-sync (ak_tb_prod_0419)</option>
                      <option value="rohan.menon">rohan.menon (Former Clerk)</option>
                      <option value="svc-finpay-settlement">svc-finpay-settlement</option>
                    </select>
                  </div>
                  <div className="p-3 trustlock-glass rounded-lg">
                    <label className="block text-[#a3aa9c] mb-1">Suspicious External Caller IP</label>
                    <select
                      value={chosenIp}
                      onChange={(e) => setChosenIp(e.target.value)}
                      className="w-full p-2 bg-[#04140d] border border-emerald-500/30 rounded text-[#f5f2e9]"
                    >
                      <option value="185.220.101.47">185.220.101.47 (AS205100)</option>
                      <option value="203.0.113.42">203.0.113.42 (Allowlisted TallyBridge)</option>
                      <option value="198.51.100.18">198.51.100.18 (FinPay)</option>
                    </select>
                  </div>
                  <div className="p-3 trustlock-glass rounded-lg">
                    <label className="block text-[#a3aa9c] mb-1">Primary Technical Root Cause</label>
                    <select
                      value={chosenRootCause}
                      onChange={(e) => setChosenRootCause(e.target.value)}
                      className="w-full p-2 bg-[#04140d] border border-emerald-500/30 rounded text-[#f5f2e9]"
                    >
                      <option value="emergency_role_bypass">
                        Unrevoked Q2 Emergency Role + Absent approval_ref Check
                      </option>
                      <option value="former_employee_login">Former Employee Portal Login</option>
                      <option value="weekly_export_bug">Normal Weekly Export Script</option>
                    </select>
                  </div>
                </div>

                {/* Live Selective Isolation & Self-Healing Recovery */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 trustlock-glass rounded-lg space-y-2.5">
                    <div className="font-semibold text-amber-300">
                      1. Selective Isolation &amp; Payment Hold Controls (Simulation)
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded bg-[#04140d] border border-emerald-500/20">
                      <div>
                        <div className="font-mono-data text-[#f5f2e9]">Firewall / WAF Block: 185.220.101.47</div>
                        <div className="text-[11px] text-[#a3aa9c]">Enforce allowlist strictly to 203.0.113.42</div>
                      </div>
                      <button
                        onClick={() => onToggleBlockIndicator('185.220.101.47')}
                        className={`px-2.5 py-1 rounded font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                          state.blockedIndicators.includes('185.220.101.47')
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-red-500 hover:bg-red-400 text-[#04140d]'
                        }`}
                      >
                        {state.blockedIndicators.includes('185.220.101.47') ? 'IP Blocked' : 'Block IP'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded bg-[#04140d] border border-emerald-500/20">
                      <div>
                        <div className="font-mono-data text-[#f5f2e9]">Revoke ROLE_ERP_EMERGENCY_ADMIN</div>
                        <div className="text-[11px] text-[#a3aa9c]">Close Q2 ticket E14 on svc-tallybridge-sync</div>
                      </div>
                      <button
                        onClick={() => onToggleRevokeRole('ROLE_ERP_EMERGENCY_ADMIN')}
                        className={`px-2.5 py-1 rounded font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                          state.revokedRoles.includes('ROLE_ERP_EMERGENCY_ADMIN')
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-amber-500 hover:bg-amber-400 text-[#04140d]'
                        }`}
                      >
                        {state.revokedRoles.includes('ROLE_ERP_EMERGENCY_ADMIN') ? 'Role Revoked' : 'Revoke Role'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded bg-[#04140d] border border-emerald-500/20">
                      <div>
                        <div className="font-mono-data text-[#f5f2e9]">Rotate API Key ak_tb_prod_0419</div>
                        <div className="text-[11px] text-[#a3aa9c]">Invalidate exposed secret &amp; issue ak_tb_prod_0502</div>
                      </div>
                      <button
                        onClick={() => onToggleRotateKey('ak_tb_prod_0419')}
                        className={`px-2.5 py-1 rounded font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                          state.rotatedKeys.includes('ak_tb_prod_0419')
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d]'
                        }`}
                      >
                        {state.rotatedKeys.includes('ak_tb_prod_0419') ? 'Key Rotated' : 'Rotate Key'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded bg-[#04140d] border border-emerald-500/20">
                      <div>
                        <div className="font-mono-data text-[#f5f2e9]">Treasury Offshore Payment Hold</div>
                        <div className="text-[11px] text-[#a3aa9c]">Quarantine CYPRCY2NXXX batch payouts until verified</div>
                      </div>
                      <button
                        onClick={onTogglePaymentHold}
                        className={`px-2.5 py-1 rounded font-semibold cursor-pointer whitespace-nowrap shrink-0 ${
                          state.paymentHoldActive
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-amber-500 hover:bg-amber-400 text-[#04140d]'
                        }`}
                      >
                        {state.paymentHoldActive ? 'Hold Active' : 'Enable Hold'}
                      </button>
                    </div>
                  </div>

                  {/* Self-Healing Recovery & Trusted Backup Restoration */}
                  <div className="p-3.5 trustlock-glass rounded-lg space-y-2.5">
                    <div className="font-semibold text-emerald-300">
                      2. Trusted Backup Restoration (BK-2026-11-18-* · Simulation)
                    </div>
                    {[
                      { id: 'CHG-401', vendor: 'Meridian Offshore Forwarding', prev: '****4481', backup: 'BK-2026-11-18-4481', bad: 'CYPRCY2NXXX ****9021' },
                      { id: 'CHG-402', vendor: 'Vanguard Transit Holdings', prev: '****5112', backup: 'BK-2026-11-18-5112', bad: 'CYPRCY2NXXX ****7744' },
                      { id: 'CHG-403', vendor: 'Meridian Offshore Forwarding', prev: '****3318', backup: 'BK-2026-11-18-3318', bad: 'CYPRCY2NXXX ****9021' },
                    ].map((chg) => {
                      const restored = state.rolledBackChangeIds.includes(chg.id);
                      return (
                        <div
                          key={chg.id}
                          className="flex items-center justify-between gap-2 p-2.5 rounded bg-[#04140d] border border-emerald-500/20"
                        >
                          <div>
                            <div className="font-mono-data text-[#f5f2e9]">
                              {chg.id} · {chg.vendor}
                            </div>
                            <div className="text-[11px] text-[#a3aa9c]">
                              {restored
                                ? `Restored & SHA-256 Sealed from ${chg.backup} -> ${chg.prev}`
                                : `Quarantined: ${chg.bad} (Restore ${chg.backup} -> ${chg.prev})`}
                            </div>
                          </div>
                          <button
                            disabled={restored || state.simulateUncertainBackup}
                            onClick={() => onRollbackBankChange(chg.id)}
                            className={`px-2.5 py-1 rounded font-semibold shrink-0 whitespace-nowrap ${
                              restored
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                                : state.simulateUncertainBackup
                                ? 'bg-[#0c2d20] text-[#a3aa9c]/60 cursor-not-allowed'
                                : 'bg-amber-500 hover:bg-amber-400 text-[#04140d] cursor-pointer'
                            }`}
                          >
                            {restored ? 'Restored & Sealed' : 'Restore Backup'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Recovery Verification Suite */}
                <div className="p-3.5 trustlock-glass rounded-lg space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-emerald-300">
                        3. Verification Result &amp; Post-Remediation Probes (Simulation)
                      </div>
                      <div className="text-[11px] text-[#a3aa9c]">
                        Verifies attacker traffic &amp; old credentials fail while contracted TallyBridge freight sync succeeds.
                      </div>
                    </div>
                    <button
                      onClick={onRunRemediationVerification}
                      className="px-3 py-1.5 font-semibold bg-emerald-500 hover:bg-emerald-400 text-[#04140d] rounded-md cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Run Verification Probes
                    </button>
                  </div>
                  {state.remediationVerificationLog.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {state.remediationVerificationLog.map((chk) => (
                        <div
                          key={chk.id}
                          className={`p-2 rounded border font-mono-data text-[11px] flex flex-wrap items-center justify-between gap-2 ${
                            chk.status === 'PASS'
                              ? 'bg-emerald-950/25 border-emerald-500/35 text-emerald-200'
                              : 'bg-red-950/25 border-red-500/40 text-red-200'
                          }`}
                        >
                          <div>
                            <span className="font-bold">[{chk.status}]</span> {chk.id}: {chk.probe} — {chk.observed}
                          </div>
                          <span className="text-[10px] text-[#a3aa9c]">{chk.executedAt}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* COMPLETE AUTOMATIC RECOVERY AUDIT HISTORY */}
                <div className="p-3.5 trustlock-glass rounded-lg space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-300">
                      4. Complete Automatic Recovery Audit History (Simulation Ledger)
                    </span>
                    <span className="font-mono-data text-[10px] text-[#a3aa9c]">
                      {state.autoRecoveryAuditLog?.length ?? 0} Recorded Entries
                    </span>
                  </div>
                  {state.autoRecoveryAuditLog && state.autoRecoveryAuditLog.length > 0 ? (
                    <div className="overflow-x-auto max-h-48 cyber-scroll">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-[#04140d] text-[#a3aa9c] border-b border-emerald-500/20">
                          <tr>
                            <th className="p-2">Timestamp</th>
                            <th className="p-2">Workflow Role</th>
                            <th className="p-2">Action</th>
                            <th className="p-2">Target</th>
                            <th className="p-2">Outcome</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-emerald-500/15 font-mono-data">
                          {state.autoRecoveryAuditLog.map((entry) => (
                            <tr key={entry.id} className="text-[#f5f2e9]">
                              <td className="p-2 text-[#a3aa9c]">{entry.timestamp}</td>
                              <td className="p-2 text-amber-300">{entry.actorRole}</td>
                              <td className="p-2">{entry.action}</td>
                              <td className="p-2 text-[#d6d3c4]">{entry.target}</td>
                              <td className="p-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                                    entry.outcome === 'VERIFIED' || entry.outcome === 'EXECUTED'
                                      ? 'bg-emerald-500/20 text-emerald-300'
                                      : 'bg-amber-500/20 text-amber-300'
                                  }`}
                                >
                                  {entry.outcome}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded bg-[#04140d] border border-emerald-500/20 text-[#a3aa9c]">
                      Click <span className="text-emerald-300 font-semibold">AUTO RECOVER</span> above to execute and record the full 10-stage automated recovery audit trail.
                    </div>
                  )}
                </div>

                <div className="p-3.5 trustlock-glass rounded-lg space-y-2 text-xs">
                  <div className="font-semibold text-amber-300">Containment &amp; Hardening Recommendations Checklist</div>
                  {SECURITY_ACTIONS.map((act) => (
                    <label
                      key={act.id}
                      className="flex items-start gap-2.5 p-2 rounded bg-[#071f15]/75 border border-emerald-500/20 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={chosenActions.includes(act.id)}
                        onChange={() => handleToggleAction(act.id)}
                        className="mt-0.5"
                      />
                      <span className="text-[#f5f2e9]">{act.label}</span>
                    </label>
                  ))}
                </div>

                <div className="p-3.5 trustlock-glass rounded-lg space-y-2 text-xs">
                  <label className="block font-semibold text-[#f5f2e9]">
                    Investigator Closing Summary Note (Included in Step 14 Reports)
                  </label>
                  <textarea
                    rows={3}
                    value={state.investigatorSummaryNote}
                    onChange={(e) => onUpdateSummaryNote(e.target.value)}
                    placeholder="Summarize confirmed findings, containment status, and remaining vendor CI/CD questions..."
                    className="w-full p-2.5 bg-[#04140d] border border-emerald-500/35 rounded text-[#f5f2e9]"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleFinalSubmit}
                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-[#04140d] rounded-md cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    <span>Submit Security Response &amp; Generate Step 14 Reports</span>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 14: INVESTIGATION REPORT + INCIDENT RESPONSE & VERIFICATION REPORT */}
            {activeStep === 14 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                      Step 14 — Forensic Investigation &amp; Incident-Response Reports
                    </h2>
                    <p className="text-xs text-[#a3aa9c]">
                      Generated {activeReportView === 'investigation' ? report.generatedAt : incidentReport.generatedAt} · Export PDF or Markdown for both investigation and automatic recovery records.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => printReportAsPdf(report)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] whitespace-nowrap shrink-0 rounded-md cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Investigation PDF
                    </button>
                    <button
                      onClick={() => printIncidentResponsePdf(incidentReport)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-[#04140d] rounded-md cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Incident Response PDF
                    </button>
                    <button
                      onClick={handleDownloadMarkdown}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#0c2d20] hover:bg-[#13402e] text-[#f5f2e9] border border-emerald-500/30 rounded-md cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Markdown
                    </button>
                  </div>
                </div>

                <div className="flex gap-2 border-b border-emerald-500/20 pb-2">
                  <button
                    onClick={() => setActiveReportView('investigation')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                      activeReportView === 'investigation'
                        ? 'bg-amber-500 text-[#04140d]'
                        : 'bg-[#071f15] text-[#d6d3c4] border border-emerald-500/20'
                    }`}
                  >
                    14-Section Investigation Report
                  </button>
                  <button
                    onClick={() => setActiveReportView('incident_response')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                      activeReportView === 'incident_response'
                        ? 'bg-emerald-500 text-[#04140d]'
                        : 'bg-[#071f15] text-[#d6d3c4] border border-emerald-500/20'
                    }`}
                  >
                    Incident Response &amp; Verification Report
                  </button>
                </div>

                <div className="space-y-3">
                  {(activeReportView === 'investigation' ? report.sections : incidentReport.sections).map((sec) => (
                    <div
                      key={sec.number}
                      className="p-3.5 trustlock-glass rounded-lg space-y-1.5"
                    >
                      <h3
                        className={`font-display text-xs font-bold ${
                          activeReportView === 'investigation' ? 'text-amber-300' : 'text-emerald-400'
                        }`}
                      >
                        {sec.number}. {sec.title}
                      </h3>
                      <ul className="space-y-1 text-xs text-[#f5f2e9] leading-relaxed">
                        {sec.body.map((line, i) => (
                          <li key={i}>• {line}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};
