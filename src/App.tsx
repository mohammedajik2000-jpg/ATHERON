import { useCallback, useEffect, useMemo, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { CyberquestOS } from './components/CyberquestOS';
import { CyberScene, NearbyPrompt } from './components/CyberScene';
import { GameHUD } from './components/GameHUD';
import { CORRELATED_REQUEST_IDS, WORLD_CLUES } from './data/caseData';
import { ParsedUploadResult } from './engines/evidenceManager';
import { resetVaultDemo } from './engines/fingerprintVaultClient';
import {
  buildVerificationChecks,
  executeAutoRecoveryWorkflow,
} from './engines/trustlockEngine';
import {
  ClueDefinition,
  ComputerMode,
  FindingReviewDecision,
  InvestigationState,
  NpcDefinition,
  NpcDialogueTopic,
  RoomId,
} from './types/game';

const STORAGE_KEY = 'cyberquest_cr_26_047_state_v3';

const INITIAL_STATE: InvestigationState = {
  introCompleted: false,
  discoveredClues: [],
  talkedToNpcs: [],
  askedNpcTopics: [],
  visitedRooms: ['exterior'],
  highestCompletedStep: 0,
  flaggedRequestIds: [],
  correlatedRequestIds: [],
  missingApprovalScanRun: false,
  detectedMissingChangeIds: [],
  simulationCompared: false,
  timelineVerified: false,
  findingReviews: {},
  uploadedFiles: [],
  uploadedApiRecords: [],
  uploadedBankChanges: [],
  caseSolved: false,
  finalScore: 0,
  finalAccuracy: 0,
  unlockedAchievements: [],
  selectedActions: [],
  investigatorSummaryNote: '',
  blockedIndicators: [],
  revokedRoles: [],
  rotatedKeys: [],
  rolledBackChangeIds: [],
  remediationVerificationRun: false,
  remediationVerificationLog: [],
  integrityVerifiedIds: [],
  tamperTestChangeId: null,
  paymentHoldActive: true,
  fingerprintVerified: false,
  fingerprintMatchPct: 0,
  fingerprintVerificationNote: '',
  autoRecoveryStatus: 'IDLE',
  autoRecoverySteps: [],
  autoRecoveryExecutedAt: null,
  autoRecoveryApprovedByHuman: false,
  simulateUncertainBackup: false,
  autoRecoveryAuditLog: [],
  restoredVendorRecords: {},
};

function loadInitialState(): InvestigationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return INITIAL_STATE;
    const parsed = JSON.parse(raw) as Partial<InvestigationState>;
    return {
      ...INITIAL_STATE,
      ...parsed,
      blockedIndicators: Array.isArray(parsed.blockedIndicators) ? parsed.blockedIndicators : [],
      revokedRoles: Array.isArray(parsed.revokedRoles) ? parsed.revokedRoles : [],
      rotatedKeys: Array.isArray(parsed.rotatedKeys) ? parsed.rotatedKeys : [],
      rolledBackChangeIds: Array.isArray(parsed.rolledBackChangeIds)
        ? parsed.rolledBackChangeIds
        : [],
      remediationVerificationLog: Array.isArray(parsed.remediationVerificationLog)
        ? parsed.remediationVerificationLog
        : [],
      integrityVerifiedIds: Array.isArray(parsed.integrityVerifiedIds)
        ? parsed.integrityVerifiedIds
        : [],
      tamperTestChangeId:
        typeof parsed.tamperTestChangeId === 'string' ? parsed.tamperTestChangeId : null,
      paymentHoldActive:
        typeof parsed.paymentHoldActive === 'boolean' ? parsed.paymentHoldActive : true,
      fingerprintVerified:
        typeof parsed.fingerprintVerified === 'boolean' ? parsed.fingerprintVerified : false,
      fingerprintMatchPct:
        typeof parsed.fingerprintMatchPct === 'number' ? parsed.fingerprintMatchPct : 0,
      fingerprintVerificationNote:
        typeof parsed.fingerprintVerificationNote === 'string'
          ? parsed.fingerprintVerificationNote
          : '',
      autoRecoveryStatus:
        parsed.autoRecoveryStatus === 'AUTO_RECOVERY_SUCCESSFUL' ||
        parsed.autoRecoveryStatus === 'HUMAN_APPROVAL_REQUIRED' ||
        parsed.autoRecoveryStatus === 'RUNNING'
          ? parsed.autoRecoveryStatus
          : 'IDLE',
      autoRecoverySteps: Array.isArray(parsed.autoRecoverySteps) ? parsed.autoRecoverySteps : [],
      autoRecoveryExecutedAt:
        typeof parsed.autoRecoveryExecutedAt === 'string' ? parsed.autoRecoveryExecutedAt : null,
      autoRecoveryApprovedByHuman:
        typeof parsed.autoRecoveryApprovedByHuman === 'boolean'
          ? parsed.autoRecoveryApprovedByHuman
          : false,
      simulateUncertainBackup:
        typeof parsed.simulateUncertainBackup === 'boolean'
          ? parsed.simulateUncertainBackup
          : false,
      autoRecoveryAuditLog: Array.isArray(parsed.autoRecoveryAuditLog)
        ? parsed.autoRecoveryAuditLog
        : [],
      restoredVendorRecords:
        parsed.restoredVendorRecords && typeof parsed.restoredVendorRecords === 'object'
          ? parsed.restoredVendorRecords
          : {},
    };
  } catch {
    return INITIAL_STATE;
  }
}

export default function App() {
  const [state, setState] = useState<InvestigationState>(loadInitialState);
  const [currentRoom, setCurrentRoom] = useState<RoomId>(() =>
    state.introCompleted ? 'reception' : 'exterior'
  );
  const [computerMode, setComputerMode] = useState<ComputerMode>(() =>
    state.introCompleted ? 'walking' : 'intro_cinematic'
  );
  const [nearbyPrompt, setNearbyPrompt] = useState<NearbyPrompt | null>(null);
  const [activeNpc, setActiveNpc] = useState<NpcDefinition | null>(null);
  const [interactSignal, setInteractSignal] = useState(0);
  const [teleportTarget, setTeleportTarget] = useState<RoomId | null>(null);
  const [muted, setMuted] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [recentClue, setRecentClue] = useState<ClueDefinition | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota errors
    }
  }, [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (e.code === 'KeyM' && computerMode === 'walking' && !activeNpc) {
        setShowDrawer((prev) => !prev);
      } else if (e.code === 'Escape' && activeNpc) {
        setActiveNpc(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [computerMode, activeNpc]);

  useEffect(() => {
    if (!recentClue) return;
    const timer = window.setTimeout(() => setRecentClue(null), 6000);
    return () => window.clearTimeout(timer);
  }, [recentClue]);

  const handleFinishIntro = useCallback(() => {
    soundEngine.playClick();
    setState((prev) => ({
      ...prev,
      introCompleted: true,
      visitedRooms: prev.visitedRooms.includes('reception')
        ? prev.visitedRooms
        : [...prev.visitedRooms, 'reception'],
    }));
    setCurrentRoom('reception');
    setComputerMode('walking');
  }, []);

  const handleRoomChange = useCallback((room: RoomId) => {
    setCurrentRoom(room);
    setState((prev) => {
      const visited = prev.visitedRooms.includes(room)
        ? prev.visitedRooms
        : [...prev.visitedRooms, room];
      const achievements = [...prev.unlockedAchievements];
      let bonus = 0;
      if (room === 'main_office' && !achievements.includes('ach_first_step')) {
        achievements.push('ach_first_step');
        bonus += 50;
      }
      return {
        ...prev,
        visitedRooms: visited,
        unlockedAchievements: achievements,
        finalScore: prev.finalScore + bonus,
      };
    });
  }, []);

  const handleClueDiscover = useCallback((clue: ClueDefinition) => {
    setRecentClue(clue);
    setState((prev) => {
      if (prev.discoveredClues.includes(clue.id)) return prev;
      const nextClues = [...prev.discoveredClues, clue.id];
      const achievements = [...prev.unlockedAchievements];
      let bonus = 0;
      if (nextClues.length === WORLD_CLUES.length && !achievements.includes('ach_full_sweep')) {
        achievements.push('ach_full_sweep');
        bonus += 150;
      }
      return {
        ...prev,
        discoveredClues: nextClues,
        unlockedAchievements: achievements,
        finalScore: prev.finalScore + clue.points + bonus,
      };
    });
  }, []);

  const handleNpcInteract = useCallback((npc: NpcDefinition) => {
    setActiveNpc(npc);
    setState((prev) => {
      const talked = prev.talkedToNpcs.includes(npc.id)
        ? prev.talkedToNpcs
        : [...prev.talkedToNpcs, npc.id];
      const achievements = [...prev.unlockedAchievements];
      let bonus = prev.talkedToNpcs.includes(npc.id) ? 0 : 25;
      if (talked.length >= 5 && !achievements.includes('ach_witness_interviewer')) {
        achievements.push('ach_witness_interviewer');
        bonus += 120;
      }
      return {
        ...prev,
        talkedToNpcs: talked,
        unlockedAchievements: achievements,
        finalScore: prev.finalScore + bonus,
      };
    });
  }, []);

  const handleAskNpcTopic = useCallback((_npc: NpcDefinition, topic: NpcDialogueTopic) => {
    soundEngine.playClick();
    const unlockedClue = topic.unlocksClueId
      ? WORLD_CLUES.find((c) => c.id === topic.unlocksClueId)
      : undefined;

    if (unlockedClue) {
      setRecentClue(unlockedClue);
    }

    setState((prev) => {
      const asked = prev.askedNpcTopics.includes(topic.id)
        ? prev.askedNpcTopics
        : [...prev.askedNpcTopics, topic.id];
      let nextClues = prev.discoveredClues;
      let bonus = prev.askedNpcTopics.includes(topic.id) ? 0 : 15;
      const achievements = [...prev.unlockedAchievements];

      if (unlockedClue && !prev.discoveredClues.includes(unlockedClue.id)) {
        nextClues = [...prev.discoveredClues, unlockedClue.id];
        bonus += unlockedClue.points;
        if (nextClues.length === WORLD_CLUES.length && !achievements.includes('ach_full_sweep')) {
          achievements.push('ach_full_sweep');
          bonus += 150;
        }
      }

      return {
        ...prev,
        askedNpcTopics: asked,
        discoveredClues: nextClues,
        unlockedAchievements: achievements,
        finalScore: prev.finalScore + bonus,
      };
    });
  }, []);

  const handleStartSitting = useCallback(() => {
    setShowDrawer(false);
    setActiveNpc(null);
    setComputerMode('sitting_transition');
  }, []);

  const handleComputerReady = useCallback(() => {
    setComputerMode('using_computer');
  }, []);

  const handleExitComputer = useCallback(() => {
    setComputerMode('standing_transition');
  }, []);

  const handleStandComplete = useCallback(() => {
    setComputerMode('walking');
  }, []);

  const handleCompleteStep = useCallback((stepNum: number) => {
    setState((prev) => ({
      ...prev,
      highestCompletedStep: Math.max(prev.highestCompletedStep, stepNum),
    }));
  }, []);

  const handleToggleFlagRequest = useCallback((reqId: string) => {
    setState((prev) => ({
      ...prev,
      flaggedRequestIds: prev.flaggedRequestIds.includes(reqId)
        ? prev.flaggedRequestIds.filter((id) => id !== reqId)
        : [...prev.flaggedRequestIds, reqId],
    }));
  }, []);

  const handleCorrelatePair = useCallback((reqId: string) => {
    setState((prev) => {
      if (prev.correlatedRequestIds.includes(reqId)) return prev;
      const next = [...prev.correlatedRequestIds, reqId];
      const achievements = [...prev.unlockedAchievements];
      let bonus = 50;
      if (
        CORRELATED_REQUEST_IDS.every((id) => next.includes(id)) &&
        !achievements.includes('ach_correlator')
      ) {
        achievements.push('ach_correlator');
        bonus += 150;
      }
      return {
        ...prev,
        correlatedRequestIds: next,
        unlockedAchievements: achievements,
        finalScore: prev.finalScore + bonus,
      };
    });
  }, []);

  const handleRunMissingApprovalScan = useCallback((detectedChangeIds: string[]) => {
    setState((prev) => {
      const achievements = [...prev.unlockedAchievements];
      let bonus = prev.missingApprovalScanRun ? 0 : 100;
      if (!achievements.includes('ach_null_hunter')) {
        achievements.push('ach_null_hunter');
        bonus += 100;
      }
      return {
        ...prev,
        missingApprovalScanRun: true,
        detectedMissingChangeIds: detectedChangeIds,
        unlockedAchievements: achievements,
        finalScore: prev.finalScore + bonus,
      };
    });
  }, []);

  const handleMarkSimulationCompared = useCallback(() => {
    setState((prev) =>
      prev.simulationCompared
        ? prev
        : { ...prev, simulationCompared: true, finalScore: prev.finalScore + 80 }
    );
  }, []);

  const handleVerifyTimeline = useCallback(() => {
    setState((prev) => {
      if (prev.timelineVerified) return prev;
      const achievements = [...prev.unlockedAchievements];
      let bonus = 150;
      if (!achievements.includes('ach_chronologist')) {
        achievements.push('ach_chronologist');
        bonus += 150;
      }
      return {
        ...prev,
        timelineVerified: true,
        unlockedAchievements: achievements,
        finalScore: prev.finalScore + bonus,
      };
    });
  }, []);

  const handleReviewFinding = useCallback((findingId: string, decision: FindingReviewDecision) => {
    setState((prev) => ({
      ...prev,
      findingReviews: { ...prev.findingReviews, [findingId]: decision },
      finalScore: prev.findingReviews[findingId] ? prev.finalScore : prev.finalScore + 35,
    }));
  }, []);

  const handleUploadEvidence = useCallback((parsed: ParsedUploadResult) => {
    setState((prev) => ({
      ...prev,
      uploadedFiles: [parsed.fileSummary, ...prev.uploadedFiles],
      uploadedApiRecords: [...prev.uploadedApiRecords, ...parsed.apiRecords],
      uploadedBankChanges: [...prev.uploadedBankChanges, ...parsed.bankChanges],
      finalScore: prev.finalScore + 60,
    }));
  }, []);

  const handleUpdateSummaryNote = useCallback((note: string) => {
    setState((prev) => ({ ...prev, investigatorSummaryNote: note }));
  }, []);

  const handleToggleBlockIndicator = useCallback((indicator: string) => {
    soundEngine.playClick();
    setState((prev) => {
      const exists = prev.blockedIndicators.includes(indicator);
      const next = exists
        ? prev.blockedIndicators.filter((i) => i !== indicator)
        : [...prev.blockedIndicators, indicator];
      return {
        ...prev,
        blockedIndicators: next,
        finalScore: prev.finalScore + (exists ? 0 : 40),
      };
    });
  }, []);

  const handleToggleRevokeRole = useCallback((roleName: string) => {
    soundEngine.playClick();
    setState((prev) => {
      const exists = prev.revokedRoles.includes(roleName);
      const next = exists
        ? prev.revokedRoles.filter((r) => r !== roleName)
        : [...prev.revokedRoles, roleName];
      return {
        ...prev,
        revokedRoles: next,
        finalScore: prev.finalScore + (exists ? 0 : 40),
      };
    });
  }, []);

  const handleToggleRotateKey = useCallback((keyId: string) => {
    soundEngine.playClick();
    setState((prev) => {
      const exists = prev.rotatedKeys.includes(keyId);
      const next = exists
        ? prev.rotatedKeys.filter((k) => k !== keyId)
        : [...prev.rotatedKeys, keyId];
      return {
        ...prev,
        rotatedKeys: next,
        finalScore: prev.finalScore + (exists ? 0 : 40),
      };
    });
  }, []);

  const handleRollbackBankChange = useCallback((changeId: string) => {
    soundEngine.playClick();
    setState((prev) => {
      if (prev.rolledBackChangeIds.includes(changeId)) return prev;
      return {
        ...prev,
        rolledBackChangeIds: [...prev.rolledBackChangeIds, changeId],
        tamperTestChangeId: prev.tamperTestChangeId === changeId ? null : prev.tamperTestChangeId,
        finalScore: prev.finalScore + 35,
      };
    });
  }, []);

  const handleVerifyRecordIntegrity = useCallback((changeIds: string[]) => {
    soundEngine.playSuccess();
    setState((prev) => {
      const merged = Array.from(new Set([...prev.integrityVerifiedIds, ...changeIds]));
      const newlyAdded = merged.length - prev.integrityVerifiedIds.length;
      return {
        ...prev,
        integrityVerifiedIds: merged,
        finalScore: prev.finalScore + (newlyAdded > 0 ? 45 : 0),
      };
    });
  }, []);

  const handleTriggerTamperTest = useCallback((changeId: string | null) => {
    soundEngine.playClick();
    setState((prev) => ({
      ...prev,
      tamperTestChangeId: changeId,
    }));
  }, []);

  const handleTogglePaymentHold = useCallback(() => {
    soundEngine.playClick();
    setState((prev) => ({
      ...prev,
      paymentHoldActive: !prev.paymentHoldActive,
    }));
  }, []);

  const handleFingerprintOutcome = useCallback(
    (verified: boolean, matchPct: number, summary: string) => {
      setState((prev) => ({
        ...prev,
        fingerprintVerified: verified || prev.fingerprintVerified,
        fingerprintMatchPct: matchPct,
        fingerprintVerificationNote: summary,
        finalScore: prev.finalScore + (verified && !prev.fingerprintVerified ? 60 : 0),
      }));
    },
    []
  );

  const handleRunRemediationVerification = useCallback(() => {
    soundEngine.playClick();
    setState((prev) => {
      const checks = buildVerificationChecks({
        ipBlocked: prev.blockedIndicators.includes('185.220.101.47'),
        roleRevoked: prev.revokedRoles.includes('ROLE_ERP_EMERGENCY_ADMIN'),
        keyRotated: prev.rotatedKeys.includes('ak_tb_prod_0419'),
        rolledBackChangeIds: prev.rolledBackChangeIds,
        paymentHoldActive: prev.paymentHoldActive,
        uncertainBackup: prev.simulateUncertainBackup,
      });
      const allPassed = checks.every((c) => c.status === 'PASS');
      return {
        ...prev,
        remediationVerificationRun: true,
        remediationVerificationLog: checks,
        finalScore: prev.finalScore + (allPassed && !prev.remediationVerificationRun ? 100 : 0),
      };
    });
  }, []);

  const handleToggleUncertainBackup = useCallback(() => {
    soundEngine.playClick();
    setState((prev) => ({
      ...prev,
      simulateUncertainBackup: !prev.simulateUncertainBackup,
      autoRecoveryApprovedByHuman: false,
    }));
  }, []);

  const handleRunAutoRecovery = useCallback((overrideUncertain?: boolean) => {
    soundEngine.playTerminalBoot();
    setState((prev) => {
      const uncertain =
        typeof overrideUncertain === 'boolean' ? overrideUncertain : prev.simulateUncertainBackup;
      const result = executeAutoRecoveryWorkflow({
        discoveredClues: prev.discoveredClues,
        uploadedApiRecords: prev.uploadedApiRecords,
        uploadedBankChanges: prev.uploadedBankChanges,
        existingBlockedIndicators: prev.blockedIndicators,
        existingRevokedRoles: prev.revokedRoles,
        existingRotatedKeys: prev.rotatedKeys,
        existingRolledBackChangeIds: prev.rolledBackChangeIds,
        existingIntegrityVerifiedIds: prev.integrityVerifiedIds,
        simulateUncertainBackup: uncertain,
        tamperTestChangeId: prev.tamperTestChangeId,
      });

      if (result.status === 'AUTO_RECOVERY_SUCCESSFUL') {
        soundEngine.playSuccess();
      }

      const bonus =
        result.status === 'AUTO_RECOVERY_SUCCESSFUL' &&
        prev.autoRecoveryStatus !== 'AUTO_RECOVERY_SUCCESSFUL'
          ? 120
          : 0;

      return {
        ...prev,
        blockedIndicators: result.blockedIndicators,
        revokedRoles: result.revokedRoles,
        rotatedKeys: result.rotatedKeys,
        rolledBackChangeIds: result.rolledBackChangeIds,
        integrityVerifiedIds: result.integrityVerifiedIds,
        paymentHoldActive: result.paymentHoldActive,
        remediationVerificationRun: true,
        remediationVerificationLog: result.verificationChecks,
        autoRecoveryStatus: result.status,
        autoRecoverySteps: result.steps,
        autoRecoveryExecutedAt: result.executedAt,
        autoRecoveryApprovedByHuman: false,
        restoredVendorRecords: {
          ...prev.restoredVendorRecords,
          ...result.restoredVendorRecords,
        },
        autoRecoveryAuditLog: [...result.auditEntries, ...prev.autoRecoveryAuditLog].slice(0, 60),
        finalScore: prev.finalScore + bonus,
      };
    });
  }, []);

  const handleApproveHumanHold = useCallback(() => {
    soundEngine.playSuccess();
    const ts = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    setState((prev) => ({
      ...prev,
      autoRecoveryApprovedByHuman: true,
      paymentHoldActive: true,
      autoRecoveryAuditLog: [
        {
          id: `REC-MGR-${Date.now().toString().slice(-4)}`,
          timestamp: ts,
          actorRole: 'Security Manager',
          action: 'MANUAL_HOLD_APPROVED',
          target: 'CHG-401..403',
          detail: 'Security Manager Dev Raghavan approved sustained vendor isolation and manual treasury hold.',
          outcome: 'HOLD_REQUIRED' as const,
        },
        ...prev.autoRecoveryAuditLog,
      ].slice(0, 60),
    }));
  }, []);

  const handleSubmitDecision = useCallback((accuracy: number, selectedActions: string[]) => {
    setState((prev) => {
      const achievements = [...prev.unlockedAchievements];
      let bonus = 250;
      if (!achievements.includes('ach_case_closed')) {
        achievements.push('ach_case_closed');
        bonus += 250;
      }
      return {
        ...prev,
        caseSolved: true,
        highestCompletedStep: 14,
        finalAccuracy: accuracy,
        selectedActions,
        unlockedAchievements: achievements,
        finalScore: prev.finalScore + bonus,
      };
    });
    setShowCompletionModal(true);
  }, []);

  const handleResetSystemInComputer = useCallback(async () => {
    try {
      await resetVaultDemo();
    } catch {
      // Non-fatal if vault was already clean
    }
    localStorage.removeItem(STORAGE_KEY);
    setState({
      ...INITIAL_STATE,
      introCompleted: true,
      visitedRooms: ['exterior', 'reception', 'investigation_room'],
    });
    setShowCompletionModal(false);
    setRecentClue(null);
  }, []);

  const handleResetCase = useCallback(() => {
    void resetVaultDemo().catch(() => {});
    localStorage.removeItem(STORAGE_KEY);
    setState(INITIAL_STATE);
    setActiveNpc(null);
    setCurrentRoom('exterior');
    setComputerMode('intro_cinematic');
    setTeleportTarget('exterior');
    setShowCompletionModal(false);
    setRecentClue(null);
  }, []);

  const activeMissionIndex = useMemo(() => {
    if (state.talkedToNpcs.length === 0 && !state.visitedRooms.includes('main_office')) return 0;
    if (state.discoveredClues.length < 4) return 1;
    if (!state.discoveredClues.includes('CLUE_SERVER_API_E18')) return 2;
    if (state.highestCompletedStep < 8) return 3;
    if (state.highestCompletedStep < 12) return 4;
    return 5;
  }, [state]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#04140d]">
      <CyberScene
        discoveredClues={state.discoveredClues}
        askedNpcTopics={state.askedNpcTopics}
        activeNpcId={activeNpc?.id ?? null}
        computerMode={computerMode}
        interactSignal={interactSignal}
        teleportTarget={teleportTarget}
        onTeleportHandled={() => setTeleportTarget(null)}
        onRoomChange={handleRoomChange}
        onNearbyChange={setNearbyPrompt}
        onClueDiscover={handleClueDiscover}
        onNpcInteract={handleNpcInteract}
        onStartSitting={handleStartSitting}
        onComputerReady={handleComputerReady}
        onExitComputer={handleExitComputer}
        onStandComplete={handleStandComplete}
      />

      <GameHUD
        currentRoom={currentRoom}
        activeMissionIndex={activeMissionIndex}
        state={state}
        nearbyPrompt={nearbyPrompt}
        activeNpc={activeNpc}
        computerMode={computerMode}
        muted={muted}
        showDrawer={showDrawer}
        recentClue={recentClue}
        showCompletionModal={showCompletionModal}
        onFinishIntro={handleFinishIntro}
        onToggleMute={() => {
          const next = !muted;
          setMuted(next);
          soundEngine.setMuted(next);
        }}
        onToggleDrawer={() => setShowDrawer((p) => !p)}
        onInteractClick={() => setInteractSignal((s) => s + 1)}
        onAskNpcTopic={handleAskNpcTopic}
        onCloseNpc={() => setActiveNpc(null)}
        onDismissClueBanner={() => setRecentClue(null)}
        onDismissCompletion={() => setShowCompletionModal(false)}
        onTeleportRoom={(room) => setTeleportTarget(room)}
        onResetCase={handleResetCase}
      />

      {computerMode === 'using_computer' && (
        <CyberquestOS
          state={state}
          onExit={handleExitComputer}
          onCompleteStep={handleCompleteStep}
          onToggleFlagRequest={handleToggleFlagRequest}
          onCorrelatePair={handleCorrelatePair}
          onRunMissingApprovalScan={handleRunMissingApprovalScan}
          onMarkSimulationCompared={handleMarkSimulationCompared}
          onVerifyTimeline={handleVerifyTimeline}
          onReviewFinding={handleReviewFinding}
          onUploadEvidence={handleUploadEvidence}
          onUpdateSummaryNote={handleUpdateSummaryNote}
          onToggleBlockIndicator={handleToggleBlockIndicator}
          onToggleRevokeRole={handleToggleRevokeRole}
          onToggleRotateKey={handleToggleRotateKey}
          onRollbackBankChange={handleRollbackBankChange}
          onVerifyRecordIntegrity={handleVerifyRecordIntegrity}
          onTriggerTamperTest={handleTriggerTamperTest}
          onTogglePaymentHold={handleTogglePaymentHold}
          onFingerprintOutcome={handleFingerprintOutcome}
          onResetDemo={handleResetSystemInComputer}
          onRunAutoRecovery={handleRunAutoRecovery}
          onApproveHumanHold={handleApproveHumanHold}
          onToggleUncertainBackup={handleToggleUncertainBackup}
          onRunRemediationVerification={handleRunRemediationVerification}
          onSubmitDecision={handleSubmitDecision}
        />
      )}
    </div>
  );
}
