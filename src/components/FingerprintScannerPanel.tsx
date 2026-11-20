import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArchiveRestore,
  Ban,
  CheckCircle2,
  DatabaseBackup,
  KeyRound,
  Lock,
  LogOut,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  TimerOff,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { soundEngine } from '../audio/soundEngine';
import {
  createVaultBackup,
  expireVaultSessionNow,
  fetchVaultAuditLog,
  fetchVaultStatus,
  getStoredVaultToken,
  logoutVaultSession,
  resetVaultDemo,
  restoreVaultBackup,
  runVaultScan,
  simulateVaultTamper,
  startVaultSession,
  VaultAuditEntry,
  VaultOperatorPreset,
  VaultScanResponse,
  VaultStatusResponse,
} from '../engines/fingerprintVaultClient';

export type ScanStage =
  | 'IDLE'
  | 'INITIALIZING'
  | 'SCANNING'
  | 'COMPARING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'ACCESS_DENIED'
  | 'INTEGRITY_FAILED';

interface FingerprintScannerPanelProps {
  fingerprintVerified: boolean;
  lastMatchPct: number;
  onVerificationOutcome: (verified: boolean, matchPct: number, summary: string) => void;
  onProceedNext: () => void;
  onResetAllDemo?: () => void;
}

const OPERATOR_OPTIONS: { key: VaultOperatorPreset; label: string; roleTag: string; allowed: boolean }[] = [
  { key: 'investigator', label: 'Digital Investigator', roleTag: 'ROLE_INVESTIGATOR (L4)', allowed: true },
  { key: 'finance_officer', label: 'Finance Officer', roleTag: 'ROLE_FINANCE_ADMIN (L3)', allowed: true },
  { key: 'soc_analyst', label: 'SOC Analyst', roleTag: 'ROLE_SOC_ANALYST (L3)', allowed: true },
  { key: 'contractor', label: 'External Contractor', roleTag: 'ROLE_CONTRACTOR_READONLY (L1)', allowed: false },
];

const TEMPLATE_PRESETS = [
  {
    id: 'tpl_investigator_valid',
    title: 'Valid Investigator Template',
    subtitle: 'Synthetic Whorl-48A · Expected Match ~96%',
    kind: 'VALID' as const,
  },
  {
    id: 'tpl_finance_valid',
    title: 'Valid Finance Officer Template',
    subtitle: 'Synthetic Loop-22C · Expected Match ~95%',
    kind: 'VALID' as const,
  },
  {
    id: 'tpl_invalid_spoof',
    title: 'Invalid / Spoofed Synthetic Print',
    subtitle: 'Synthetic Arch-00X · Below Threshold (~31%)',
    kind: 'INVALID' as const,
  },
];

// Detailed multi-ridge concentric & whorl synthetic template (never real biometric data)
const SYNTHETIC_RIDGES = [
  'M 100 22 C 145 22, 178 58, 178 106 C 178 154, 143 188, 100 188 C 57 188, 22 154, 22 106 C 22 68, 43 34, 75 25',
  'M 100 32 C 139 32, 168 63, 168 105 C 168 147, 137 178, 100 178 C 63 178, 32 147, 32 105 C 32 72, 50 43, 79 34',
  'M 100 43 C 131 43, 157 70, 157 105 C 157 140, 131 167, 100 167 C 69 167, 43 140, 43 105 C 43 78, 59 54, 83 46',
  'M 100 54 C 125 54, 145 77, 145 105 C 145 133, 125 156, 100 156 C 75 156, 55 133, 55 105 C 55 83, 69 64, 88 57',
  'M 100 65 C 119 65, 134 83, 134 105 C 134 127, 119 145, 100 145 C 81 145, 66 127, 66 105 C 66 89, 77 73, 91 68',
  'M 100 76 C 113 76, 123 89, 123 105 C 123 121, 113 134, 100 134 C 87 134, 77 121, 77 105 C 77 94, 85 83, 95 78',
  'M 98 87 C 107 87, 113 95, 113 105 C 113 115, 106 123, 98 123 C 90 123, 86 113, 88 103 C 90 95, 94 90, 98 90',
  'M 97 98 C 102 97, 105 101, 104 106 C 103 111, 98 113, 95 109 C 93 106, 94 100, 97 98',
  'M 46 156 C 60 179, 80 192, 104 192 C 128 192, 148 177, 160 154',
  'M 36 135 C 39 166, 65 198, 102 198 C 138 198, 162 167, 166 134',
  'M 62 20 C 83 14, 117 14, 140 22',
  'M 24 82 C 17 107, 19 135, 30 158',
  'M 176 82 C 183 107, 181 135, 170 158',
];

const MINUTIAE_NODES = [
  { cx: 78, cy: 58 },
  { cx: 126, cy: 72 },
  { cx: 100, cy: 105 },
  { cx: 64, cy: 129 },
  { cx: 136, cy: 134 },
  { cx: 92, cy: 162 },
  { cx: 112, cy: 46 },
];

export const FingerprintScannerPanel: React.FC<FingerprintScannerPanelProps> = ({
  fingerprintVerified,
  lastMatchPct,
  onVerificationOutcome,
  onProceedNext,
  onResetAllDemo,
}) => {
  const [subTab, setSubTab] = useState<'scanner' | 'storage'>('scanner');
  const [token, setToken] = useState<string | null>(() => getStoredVaultToken());
  const [operatorKey, setOperatorKey] = useState<VaultOperatorPreset>('investigator');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('tpl_investigator_valid');

  const [stage, setStage] = useState<ScanStage>(() =>
    fingerprintVerified ? 'VERIFIED' : 'IDLE'
  );
  const [displayMatchPct, setDisplayMatchPct] = useState<number>(() =>
    fingerprintVerified ? lastMatchPct || 96.4 : 0
  );
  const [scanResult, setScanResult] = useState<VaultScanResponse | null>(null);
  const [vaultStatus, setVaultStatus] = useState<VaultStatusResponse | null>(null);
  const [auditEntries, setAuditEntries] = useState<VaultAuditEntry[]>([]);
  const [auditChainValid, setAuditChainValid] = useState<boolean>(true);
  const [actionBanner, setActionBanner] = useState<{ type: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const timersRef = useRef<number[]>([]);

  const clearAnimTimers = () => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
  };

  useEffect(() => () => clearAnimTimers(), []);

  useEffect(() => {
    const iv = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(iv);
  }, []);

  const refreshVault = useCallback(async (activeToken: string | null) => {
    try {
      const status = await fetchVaultStatus(activeToken);
      setVaultStatus(status);
      if (status.session.active && activeToken) {
        const audit = await fetchVaultAuditLog(activeToken);
        if (audit) {
          setAuditEntries(audit.entries);
          setAuditChainValid(audit.chainValid);
        }
      } else {
        setAuditEntries([]);
      }
    } catch {
      setActionBanner({
        type: 'err',
        text: 'Unable to reach TRUSTLOCK backend vault service.',
      });
    }
  }, []);

  // Ensure initial authenticated demo session on first mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      let currentToken = getStoredVaultToken();
      try {
        const st = await fetchVaultStatus(currentToken);
        if (!st.session.active) {
          const started = await startVaultSession('investigator');
          currentToken = started.token;
          if (mounted) setToken(currentToken);
        }
        if (mounted) await refreshVault(currentToken);
      } catch {
        // Handled cleanly in banner
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshVault]);

  const handleSwitchOperator = async (preset: VaultOperatorPreset) => {
    soundEngine.playClick();
    setOperatorKey(preset);
    setActionBanner(null);
    try {
      const started = await startVaultSession(preset);
      setToken(started.token);
      await refreshVault(started.token);
      setActionBanner({
        type: started.session.authorizedForVault ? 'ok' : 'warn',
        text: started.session.authorizedForVault
          ? `Authenticated as ${started.session.displayName} (${started.session.role}).`
          : `Signed in as ${started.session.displayName} (${started.session.role}) — Unauthorized for security vault access.`,
      });
    } catch {
      setActionBanner({ type: 'err', text: 'Failed to initialize operator session.' });
    }
  };

  const handleLogout = async () => {
    soundEngine.playClick();
    await logoutVaultSession(token);
    setToken(null);
    setStage('IDLE');
    setDisplayMatchPct(0);
    setScanResult(null);
    await refreshVault(null);
    setActionBanner({
      type: 'warn',
      text: 'Signed out cleanly. Session token revoked on backend; re-authenticate to run scans.',
    });
  };

  const handleSimulateTimeout = async () => {
    soundEngine.playClick();
    const msg = await expireVaultSessionNow(token);
    setToken(null);
    setStage('IDLE');
    await refreshVault(null);
    setActionBanner({
      type: 'err',
      text: msg,
    });
  };

  const handleCancelScan = () => {
    soundEngine.playClick();
    clearAnimTimers();
    setStage(fingerprintVerified ? 'VERIFIED' : 'IDLE');
    setDisplayMatchPct(fingerprintVerified ? lastMatchPct || 96.4 : 0);
    setScanResult(null);
    setActionBanner({
      type: 'warn',
      text: 'Synthetic fingerprint scan cancelled cleanly. No biometric sample was recorded.',
    });
  };

  const handleStartScan = async () => {
    clearAnimTimers();
    setActionBanner(null);
    setScanResult(null);

    if (!token || !vaultStatus?.session.active) {
      setActionBanner({
        type: 'err',
        text: 'Session inactive or timed out. Select an operator role above to sign in before scanning.',
      });
      return;
    }

    soundEngine.playTerminalBoot();
    setStage('INITIALIZING');
    setDisplayMatchPct(14);

    const t1 = window.setTimeout(() => {
      setStage('SCANNING');
      setDisplayMatchPct(52);
    }, 550);

    const t2 = window.setTimeout(() => {
      setStage('COMPARING');
      setDisplayMatchPct(79);
    }, 1450);

    const t3 = window.setTimeout(async () => {
      const { data } = await runVaultScan(token, selectedTemplateId);
      setScanResult(data);
      setDisplayMatchPct(data.matchPercentage);

      if (data.status === 'VERIFIED') {
        soundEngine.playSuccess();
        setStage('VERIFIED');
        onVerificationOutcome(true, data.matchPercentage, data.message);
      } else if (data.status === 'INTEGRITY_FAILED') {
        setStage('INTEGRITY_FAILED');
        onVerificationOutcome(false, 0, data.message);
      } else if (data.status === 'ACCESS_DENIED') {
        setStage('ACCESS_DENIED');
        onVerificationOutcome(false, 0, data.message);
      } else {
        setStage('REJECTED');
        onVerificationOutcome(false, data.matchPercentage, data.message);
      }
      await refreshVault(token);
    }, 2300);

    timersRef.current = [t1, t2, t3];
  };

  const handleSimulateTamper = async () => {
    soundEngine.playClick();
    const res = await simulateVaultTamper(token, 'tpl_investigator_valid');
    if (res.ok) {
      setActionBanner({
        type: 'warn',
        text: 'Simulated ciphertext tamper injected on tpl_investigator_valid. Next scan will block decryption during pre-use integrity verification.',
      });
    } else {
      setActionBanner({ type: 'err', text: res.error || 'Tamper simulation denied.' });
    }
    await refreshVault(token);
  };

  const handleCreateBackup = async () => {
    soundEngine.playClick();
    const res = await createVaultBackup(token);
    if (res.ok) {
      setActionBanner({
        type: 'ok',
        text: `Signed encrypted backup snapshot ${res.backupId} created.`,
      });
    } else {
      setActionBanner({ type: 'err', text: res.error || 'Backup failed.' });
    }
    await refreshVault(token);
  };

  const handleRestoreBackup = async () => {
    soundEngine.playSuccess();
    const res = await restoreVaultBackup(token);
    if (res.ok) {
      setActionBanner({
        type: 'ok',
        text: `Restored intact AES-256-GCM templates from signed backup ${res.backupId}.`,
      });
    } else {
      setActionBanner({ type: 'err', text: res.error || 'Restore failed.' });
    }
    await refreshVault(token);
  };

  const handleResetDemo = async () => {
    soundEngine.playClick();
    clearAnimTimers();
    await resetVaultDemo();
    const started = await startVaultSession('investigator');
    setToken(started.token);
    setOperatorKey('investigator');
    setSelectedTemplateId('tpl_investigator_valid');
    setStage('IDLE');
    setDisplayMatchPct(0);
    setScanResult(null);
    setActionBanner({
      type: 'ok',
      text: 'TRUSTLOCK encrypted vault, templates, and audit log reset to initial demo state.',
    });
    await refreshVault(started.token);
    if (onResetAllDemo) onResetAllDemo();
  };

  const sessionRemainingSec = useMemo(() => {
    if (!vaultStatus?.session.active || !vaultStatus.session.expiresAt) return 0;
    return Math.max(0, Math.floor((vaultStatus.session.expiresAt - nowMs) / 1000));
  }, [vaultStatus, nowMs]);

  const isScanningActive = stage === 'INITIALIZING' || stage === 'SCANNING' || stage === 'COMPARING';

  const stageStepIndex =
    stage === 'INITIALIZING'
      ? 0
      : stage === 'SCANNING'
      ? 1
      : stage === 'COMPARING'
      ? 2
      : stage === 'VERIFIED' || stage === 'REJECTED' || stage === 'ACCESS_DENIED' || stage === 'INTEGRITY_FAILED'
      ? 3
      : -1;

  const ridgeStroke =
    stage === 'VERIFIED'
      ? '#34d399'
      : stage === 'REJECTED' || stage === 'ACCESS_DENIED' || stage === 'INTEGRITY_FAILED'
      ? '#fb7185'
      : isScanningActive
      ? '#fbbf24'
      : '#10b981';

  return (
    <div className="space-y-4">
      {/* Header & Sub-view Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-[#f5f2e9]">
            Step 5 — Synthetic Fingerprint Verification &amp; Encrypted Security Storage
          </h2>
          <p className="text-xs text-[#d6d3c4]">
            Verify synthetic operator templates inside the backend AES-256-GCM vault to unlock Trust Profile and Financial Change DNA checks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 p-1 rounded-lg bg-[#051a11] border border-emerald-500/30">
            <button
              onClick={() => setSubTab('scanner')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === 'scanner'
                  ? 'bg-emerald-600 text-[#f5f2e9] shadow-sm'
                  : 'text-[#d6d3c4] hover:text-[#f5f2e9]'
              }`}
            >
              Fingerprint Scanner
            </button>
            <button
              onClick={() => setSubTab('storage')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                subTab === 'storage'
                  ? 'bg-emerald-600 text-[#f5f2e9] shadow-sm'
                  : 'text-[#d6d3c4] hover:text-[#f5f2e9]'
              }`}
            >
              Security Storage Status
            </button>
          </div>
          <button
            onClick={handleResetDemo}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0a261b] hover:bg-[#0f3627] text-[#f5f2e9] border border-emerald-500/35 rounded-md cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 text-amber-300" />
            <span>Reset Vault Demo</span>
          </button>
        </div>
      </div>

      {/* Synthetic Demo Notice + Session Auth Strip */}
      <div className="p-3 rounded-lg trustlock-glass flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="space-y-0.5">
          <div className="font-semibold text-emerald-300">
            Synthetic Demo Templates Only — No Real Human Biometrics Collected or Stored
          </div>
          <div className="text-[11px] text-[#d6d3c4]">
            Backend-controlled prototype environment · Master keys remain strictly server-side · No system is impossible to hack.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {vaultStatus?.session.active ? (
            <>
              <div className="text-[11px] font-mono-data text-[#f5f2e9]">
                {vaultStatus.session.displayName} ·{' '}
                <span className={vaultStatus.session.authorizedForVault ? 'text-emerald-300' : 'text-rose-300'}>
                  {vaultStatus.session.role}
                </span>{' '}
                · TTL {Math.floor(sessionRemainingSec / 60)}m {String(sessionRemainingSec % 60).padStart(2, '0')}s
              </div>
              <button
                onClick={handleSimulateTimeout}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-[#0c2d20] hover:bg-rose-950/50 text-amber-300 border border-amber-500/40 rounded cursor-pointer whitespace-nowrap shrink-0"
              >
                <TimerOff className="w-3 h-3" />
                <span>Simulate Timeout</span>
              </button>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium bg-[#0c2d20] hover:bg-[#123d2c] text-[#f5f2e9] border border-emerald-500/35 rounded cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3 h-3 text-rose-300" />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <span className="text-[11px] font-mono-data text-rose-300">
              Session Inactive / Signed Out — Select an Operator Role Below
            </span>
          )}
        </div>
      </div>

      {/* Operator Role Switcher (RBAC Testing) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
        {OPERATOR_OPTIONS.map((op) => {
          const isCurrent = vaultStatus?.session.active && operatorKey === op.key;
          return (
            <button
              key={op.key}
              onClick={() => handleSwitchOperator(op.key)}
              className={`p-2.5 rounded-lg border text-left transition-colors cursor-pointer ${
                isCurrent
                  ? 'bg-emerald-600/25 border-amber-400/75 text-[#f5f2e9]'
                  : 'bg-[#082117]/90 border-emerald-500/25 text-[#d6d3c4] hover:border-emerald-400/60'
              }`}
            >
              <div className="flex items-center justify-between gap-1 font-semibold">
                <span className="truncate">{op.label}</span>
                <UserCheck className={`w-3.5 h-3.5 shrink-0 ${op.allowed ? 'text-emerald-300' : 'text-rose-400'}`} />
              </div>
              <div className="mt-0.5 text-[10px] font-mono-data text-[#a3aa9c] truncate">
                {op.roleTag}
              </div>
            </button>
          );
        })}
      </div>

      {actionBanner && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            actionBanner.type === 'ok'
              ? 'bg-emerald-950/45 border-emerald-500/45 text-emerald-200'
              : actionBanner.type === 'warn'
              ? 'bg-amber-950/35 border-amber-500/45 text-amber-200'
              : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
          }`}
        >
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>{actionBanner.text}</span>
        </div>
      )}

      {subTab === 'scanner' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT: LARGE ANIMATED FINGERPRINT VISUALIZATION */}
          <div className="lg:col-span-5 p-5 rounded-xl trustlock-glass flex flex-col items-center justify-between gap-4">
            <div className="w-full flex items-center justify-between text-xs font-mono-data">
              <span className="text-amber-300">SYNTHETIC SCANNER PAD</span>
              <span
                className={
                  stage === 'VERIFIED'
                    ? 'text-emerald-300 font-bold'
                    : stage === 'REJECTED' || stage === 'ACCESS_DENIED' || stage === 'INTEGRITY_FAILED'
                    ? 'text-rose-300 font-bold'
                    : 'text-emerald-300'
                }
              >
                {stage}
              </span>
            </div>

            {/* Circular Orbital Biometric Reticle + Animated Ridge SVG */}
            <div className="relative w-60 h-60 flex items-center justify-center">
              <svg
                viewBox="0 0 240 240"
                className={`absolute inset-0 w-full h-full pointer-events-none ${
                  isScanningActive ? 'trustlock-orbit-spin' : ''
                }`}
                aria-hidden="true"
              >
                <circle
                  cx="120"
                  cy="120"
                  r="114"
                  fill="none"
                  stroke={ridgeStroke}
                  strokeWidth="1.5"
                  strokeDasharray="18 10 6 10"
                  strokeOpacity="0.65"
                />
                <circle
                  cx="120"
                  cy="120"
                  r="104"
                  fill="none"
                  stroke="#d4af37"
                  strokeWidth="1"
                  strokeDasharray="4 8"
                  strokeOpacity="0.6"
                />
              </svg>

              {/* Inner circular aperture */}
              <div
                className={`relative w-52 h-52 rounded-full bg-[#04140d] border-2 flex items-center justify-center overflow-hidden transition-colors duration-300 ${
                  stage === 'VERIFIED'
                    ? 'border-emerald-400/85 shadow-[0_0_45px_rgba(52,211,153,0.34)]'
                    : stage === 'REJECTED' || stage === 'ACCESS_DENIED' || stage === 'INTEGRITY_FAILED'
                    ? 'border-rose-400/80 shadow-[0_0_45px_rgba(251,113,133,0.32)]'
                    : isScanningActive
                    ? 'border-amber-400/85 shadow-[0_0_45px_rgba(245,158,11,0.36)]'
                    : 'border-emerald-500/55 shadow-[0_0_36px_rgba(16,185,129,0.22)]'
                }`}
              >
                {/* Radial depth aura */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      stage === 'VERIFIED'
                        ? 'radial-gradient(circle at 50% 48%, rgba(52,211,153,0.22), rgba(212,175,55,0.08) 58%, transparent 80%)'
                        : stage === 'REJECTED' || stage === 'ACCESS_DENIED' || stage === 'INTEGRITY_FAILED'
                        ? 'radial-gradient(circle at 50% 48%, rgba(251,113,133,0.2), rgba(16,185,129,0.06) 58%, transparent 80%)'
                        : 'radial-gradient(circle at 50% 48%, rgba(16,185,129,0.2), rgba(212,175,55,0.09) 58%, transparent 80%)',
                  }}
                />

                <svg
                  viewBox="0 0 200 210"
                  className="w-40 h-40 relative z-10"
                  aria-label="Synthetic Circular Fingerprint Visualization"
                >
                  {SYNTHETIC_RIDGES.map((d, idx) => (
                    <path
                      key={idx}
                      d={d}
                      fill="none"
                      stroke={ridgeStroke}
                      strokeWidth="3.1"
                      strokeLinecap="round"
                      strokeOpacity={isScanningActive ? 0.94 : stage === 'IDLE' ? 0.72 : 0.96}
                    />
                  ))}

                  {(isScanningActive || stage === 'VERIFIED') &&
                    MINUTIAE_NODES.map((n, idx) => (
                      <circle
                        key={idx}
                        cx={n.cx}
                        cy={n.cy}
                        r={stage === 'VERIFIED' ? 4 : 3.2}
                        fill={stage === 'VERIFIED' ? '#34d399' : '#fbbf24'}
                      />
                    ))}
                </svg>

                {/* Emerald/Gold Scanning Light Beam */}
                {isScanningActive && (
                  <div className="trustlock-scan-beam absolute inset-x-2 top-0 h-1.5 z-20 rounded-full bg-gradient-to-r from-transparent via-emerald-300 to-transparent shadow-[0_0_20px_rgba(52,211,153,0.95)]" />
                )}
              </div>
            </div>

            {/* Scanning Progress Stepper */}
            <div className="w-full space-y-2">
              <div className="grid grid-cols-4 gap-1 text-[10px] font-mono-data text-center">
                {[
                  'Initializing',
                  'Scanning',
                  'Comparing',
                  stage === 'REJECTED'
                    ? 'Rejected'
                    : stage === 'ACCESS_DENIED'
                    ? 'Denied'
                    : stage === 'INTEGRITY_FAILED'
                    ? 'Tamper Err'
                    : 'Verified',
                ].map((lbl, idx) => {
                  const active = stageStepIndex === idx;
                  const passed = stageStepIndex > idx;
                  const failedFinal =
                    idx === 3 &&
                    (stage === 'REJECTED' || stage === 'ACCESS_DENIED' || stage === 'INTEGRITY_FAILED');
                  return (
                    <div
                      key={lbl}
                      className={`py-1.5 px-1 rounded border ${
                        failedFinal
                          ? 'bg-rose-500/20 border-rose-400 text-rose-200 font-bold'
                          : active
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200 font-bold'
                          : passed
                          ? 'bg-emerald-600/25 border-emerald-500/50 text-emerald-200'
                          : 'bg-[#051a11] border-emerald-900/50 text-[#869289]'
                      }`}
                    >
                      {lbl}
                    </div>
                  );
                })}
              </div>

              {/* Match Percentage Meter */}
              <div className="p-2.5 rounded-lg bg-[#051a11] border border-emerald-500/30 space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono-data">
                  <span className="text-[#d6d3c4]">Template Match Score</span>
                  <span
                    className={`font-bold ${
                      displayMatchPct >= 85
                        ? 'text-emerald-300'
                        : displayMatchPct > 0
                        ? 'text-rose-300'
                        : 'text-[#a3aa9c]'
                    }`}
                  >
                    {displayMatchPct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#0d2d20] overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      displayMatchPct >= 85
                        ? 'bg-gradient-to-r from-emerald-500 to-amber-300'
                        : displayMatchPct > 0
                        ? 'bg-gradient-to-r from-amber-500 to-rose-500'
                        : 'bg-emerald-800'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, displayMatchPct))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: TEMPLATE SELECTION, SCAN CONTROLS & RESULT FEEDBACK */}
          <div className="lg:col-span-7 space-y-3 flex flex-col justify-between">
            <div className="p-4 rounded-xl trustlock-glass space-y-3">
              <div className="text-xs font-semibold text-amber-300">
                1. Select Synthetic Demo Template to Scan
              </div>
              <div className="space-y-2">
                {TEMPLATE_PRESETS.map((tpl) => {
                  const selected = selectedTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      onClick={() => {
                        soundEngine.playClick();
                        setSelectedTemplateId(tpl.id);
                      }}
                      className={`w-full p-3 rounded-lg border text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        selected
                          ? 'bg-emerald-600/25 border-amber-400/80 text-[#f5f2e9]'
                          : 'bg-[#051a11]/90 border-emerald-500/25 text-[#d6d3c4] hover:border-emerald-400/50'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-semibold text-[#f5f2e9]">{tpl.title}</div>
                        <div className="text-[11px] font-mono-data text-[#a3aa9c]">{tpl.subtitle}</div>
                      </div>
                      <span
                        className={`text-[10px] font-mono-data shrink-0 ${
                          tpl.kind === 'VALID' ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {tpl.kind === 'VALID' ? 'AUTHORIZED TEMPLATE' : 'NEGATIVE SAMPLE'}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  disabled={isScanningActive}
                  onClick={handleStartScan}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 disabled:opacity-50 text-[#04140d] rounded-lg shadow-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{isScanningActive ? 'Scanning...' : 'Start'}</span>
                </button>
                <button
                  disabled={isScanningActive}
                  onClick={handleStartScan}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#0c2d20] hover:bg-[#134230] disabled:opacity-50 text-[#f5f2e9] border border-emerald-500/35 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-300" />
                  <span>Retry</span>
                </button>
                <button
                  disabled={!isScanningActive && !scanResult && stage === 'IDLE'}
                  onClick={handleCancelScan}
                  className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium bg-[#18281e] hover:bg-rose-950/60 disabled:opacity-45 text-rose-200 border border-rose-500/35 rounded-lg cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Ban className="w-3.5 h-3.5 text-rose-300" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>

            {/* Outcome Banner */}
            {scanResult ? (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  scanResult.status === 'VERIFIED'
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-100'
                    : 'bg-rose-950/35 border-rose-500/50 text-rose-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    {scanResult.status === 'VERIFIED' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400" />
                    )}
                    <span>
                      {scanResult.status === 'VERIFIED'
                        ? 'Verification Succeeded'
                        : scanResult.status === 'ACCESS_DENIED'
                        ? 'Access Denied (RBAC)'
                        : scanResult.status === 'INTEGRITY_FAILED'
                        ? 'Tampered Template Blocked'
                        : 'Verification Rejected'}
                    </span>
                  </div>
                  <span className="font-mono-data text-xs">
                    Match: {scanResult.matchPercentage.toFixed(1)}%
                  </span>
                </div>
                <p className="text-[#f5f2e9] leading-relaxed">{scanResult.message}</p>
                {scanResult.auditEntry && (
                  <div className="pt-1 font-mono-data text-[11px] text-amber-300 break-all">
                    Audit Logged: {scanResult.auditEntry.id} · Hash {scanResult.auditEntry.entryHash.slice(0, 24)}...
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-xl trustlock-glass text-xs text-[#d6d3c4] space-y-1">
                <div className="font-semibold text-emerald-300">
                  Workflow Connection: Fingerprint Verification → Trust Profile → Financial Change DNA
                </div>
                <p>
                  Run a valid synthetic scan to unlock operator Trust Profile authorization, or test an invalid sample / unauthorized contractor role to observe rejection and hash-chained audit logging.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-[11px] font-mono-data text-[#a3aa9c]">
                {fingerprintVerified
                  ? 'Operator verification cleared for TRUSTLOCK workflow.'
                  : 'Verify a valid template or continue to inspect Trust Profile.'}
              </span>
              <button
                onClick={onProceedNext}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] rounded-lg cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Proceed to Step 6 Trust Profile</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* SECURITY STORAGE STATUS SCREEN */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-xl trustlock-glass space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                <Lock className="w-3.5 h-3.5" />
                <span>Encryption at Rest</span>
              </div>
              <div className="font-mono-data text-[#f5f2e9]">
                {vaultStatus?.encryption.algorithm ?? 'AES-256-GCM'}
              </div>
              <div className="text-[11px] text-emerald-300">
                Plaintext Stored: NO (Ciphertext + AuthTag)
              </div>
            </div>

            <div className="p-3.5 rounded-xl trustlock-glass space-y-1">
              <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                <KeyRound className="w-3.5 h-3.5" />
                <span>Key Management</span>
              </div>
              <div className="font-mono-data text-[#f5f2e9] truncate">
                Server KEK + Wrapped DEK
              </div>
              <div className="text-[11px] text-emerald-300">
                Frontend Keys Exposed: NO
              </div>
            </div>

            <div className="p-3.5 rounded-xl trustlock-glass space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-300 font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Pre-Use Integrity</span>
              </div>
              <div
                className={`font-mono-data font-bold ${
                  vaultStatus?.integrity.allTemplatesIntact ? 'text-emerald-300' : 'text-rose-300'
                }`}
              >
                {vaultStatus?.integrity.allTemplatesIntact
                  ? 'ALL TEMPLATES INTACT'
                  : 'TAMPER DETECTED'}
              </div>
              <div className="text-[11px] text-[#d6d3c4]">
                Audit Chain: {auditChainValid ? 'SHA-256 VERIFIED' : 'BROKEN'}
              </div>
            </div>

            <div className="p-3.5 rounded-xl trustlock-glass space-y-1">
              <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                <DatabaseBackup className="w-3.5 h-3.5" />
                <span>Encrypted Backup</span>
              </div>
              <div className="font-mono-data text-[#f5f2e9] truncate">
                {vaultStatus?.backup?.backupId ?? 'None'}
              </div>
              <div className="text-[11px] text-[#d6d3c4]">
                HMAC: {vaultStatus?.backup?.hmacPrefix ?? '—'}...
              </div>
            </div>
          </div>

          {/* Backup, Tamper Simulation & Recovery Controls */}
          <div className="p-3.5 rounded-xl trustlock-glass flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="text-[#d6d3c4]">
              Test pre-use integrity verification &amp; recovery using backend-controlled encrypted vault operations:
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleSimulateTamper}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 border border-rose-500/45 rounded-md cursor-pointer whitespace-nowrap shrink-0"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Simulate Ciphertext Tamper</span>
              </button>
              <button
                onClick={handleCreateBackup}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#0c2d20] hover:bg-[#134230] text-amber-200 border border-amber-500/35 rounded-md cursor-pointer whitespace-nowrap shrink-0"
              >
                <DatabaseBackup className="w-3.5 h-3.5" />
                <span>Create Encrypted Backup</span>
              </button>
              <button
                onClick={handleRestoreBackup}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-[#f5f2e9] rounded-md cursor-pointer whitespace-nowrap shrink-0"
              >
                <ArchiveRestore className="w-3.5 h-3.5" />
                <span>Restore Verified Backup</span>
              </button>
            </div>
          </div>

          {/* Encrypted Templates Metadata Table (No Plaintext!) */}
          <div className="rounded-xl trustlock-glass overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#051a11] text-[#d6d3c4] border-b border-emerald-500/25">
                <tr>
                  <th className="p-2.5">Template ID</th>
                  <th className="p-2.5">Synthetic Owner</th>
                  <th className="p-2.5">Cipher / IV / Tag</th>
                  <th className="p-2.5">Ciphertext SHA-256</th>
                  <th className="p-2.5">Integrity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-emerald-900/40">
                {(vaultStatus?.templates ?? []).map((t) => (
                  <tr key={t.id} className="text-[#f5f2e9]">
                    <td className="p-2.5 font-mono-data text-emerald-300">{t.id}</td>
                    <td className="p-2.5">{t.ownerName}</td>
                    <td className="p-2.5 font-mono-data text-[11px] text-[#d6d3c4]">
                      {t.cipherAlgorithm} · IV {t.ivPreview} · Tag {t.authTagPreview}
                    </td>
                    <td className="p-2.5 font-mono-data text-[11px] text-amber-300">
                      {t.ciphertextHashPrefix}...
                    </td>
                    <td className="p-2.5 font-mono-data text-[11px]">
                      <span className={t.tampered ? 'text-rose-300 font-bold' : 'text-emerald-300'}>
                        {t.tampered ? 'TAMPERED (BLOCKED)' : 'INTACT'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Tamper-Evident Audit Log */}
          <div className="p-3.5 rounded-xl trustlock-glass space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-emerald-300">
                Tamper-Evident Hash-Chained Audit Log ({auditEntries.length} events shown)
              </span>
              <span className={`font-mono-data text-[11px] ${auditChainValid ? 'text-emerald-300' : 'text-rose-300'}`}>
                Chain Integrity: {auditChainValid ? 'VALID' : 'BROKEN'}
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto cyber-scroll space-y-1.5 pr-1">
              {auditEntries.length === 0 ? (
                <div className="text-xs text-[#a3aa9c] p-2">
                  Authenticate an operator session above to inspect backend audit log entries.
                </div>
              ) : (
                auditEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-2 rounded bg-[#051a11]/90 border border-emerald-500/20 text-[11px] space-y-0.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 font-mono-data">
                      <span className="text-amber-300">
                        {entry.id} · {entry.action} · {entry.actor}
                      </span>
                      <span
                        className={
                          entry.outcome === 'SUCCESS'
                            ? 'text-emerald-300'
                            : entry.outcome === 'INFO'
                            ? 'text-amber-200'
                            : 'text-rose-300 font-bold'
                        }
                      >
                        {entry.outcome}
                      </span>
                    </div>
                    <div className="text-[#d6d3c4]">{entry.detail}</div>
                    <div className="font-mono-data text-[10px] text-[#869289]">
                      {entry.timestamp} · Hash {entry.entryHash.slice(0, 20)}...
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Honest Security Limitations Banner */}
          <div className="p-3 rounded-lg bg-[#082117] border border-emerald-500/35 text-[11px] text-[#d6d3c4]">
            <span className="font-semibold text-amber-300">Prototype Security Limitations: </span>
            {vaultStatus?.demoDisclaimer ??
              'This prototype uses a backend-controlled demo environment and synthetic templates. No system is impossible to hack; real production deployments require HSM/KMS hardware backing, mTLS, MFA, and external immutable SIEM forwarding.'}
          </div>
        </div>
      )}
    </div>
  );
};
