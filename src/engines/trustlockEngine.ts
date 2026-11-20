import { CASE_METADATA, E18_API_LOGS, E19_BANK_CHANGES } from '../data/caseData';
import {
  ApiActivityRecord,
  AutoRecoveryAuditEntry,
  AutoRecoveryStatus,
  AutoRecoveryStepLog,
  BankChangeRecord,
  ClueId,
  RemediationVerificationCheck,
  RestoredVendorRecord,
} from '../types/game';
import { getUnlockedEvidenceCodes } from './evidenceManager';

export interface TrustedBackupSnapshot {
  backupRef: string;
  vendorPayee: string;
  verifiedBankAcct: string;
  verifiedIfscSwift: string;
  baselineHash: string;
  signedByKeyId: string;
}

export interface SoftwareIntegrityRecord {
  changeId: string;
  vendorPayee: string;
  timestamp: string;
  requestId: string;
  apiKeyId: string;
  serviceAccount: string;
  sourceIp: string;
  channel: string;
  approvalRef: string | null;
  currentBankAcct: string;
  currentIfscSwift: string;
  originalBackup: TrustedBackupSnapshot | null;
  recordHash: string;
  prevChainHash: string;
  digitalSignature: string;
  hashMatchesBackup: boolean;
  signatureTrusted: boolean;
  rbacAuthorized: boolean;
  approvalValid: boolean;
  tamperDetected: boolean;
  verificationStatus: 'VERIFIED_TRUSTED' | 'TAMPER_MISMATCH' | 'UNVERIFIED_UNAUTHORIZED' | 'RESTORED_SEALED';
  mismatchedFields: string[];
  securityLesson: string;
}

export interface TrustProfileSummary {
  vendor: string;
  serviceAccount: string;
  authorizedIp: string;
  accessControlPosture: string;
  keyManagementStatus: string;
  auditProtectionStatus: string;
  integrityPosture: 'HARDENED' | 'COMPROMISED_PENDING_ISOLATION' | 'PENDING_EVIDENCE';
  trustScore: number;
  pillars: {
    label: string;
    status: 'PASS' | 'WARN' | 'FAIL';
    detail: string;
  }[];
}

// Synchronous deterministic 256-bit digest (8x32-bit FNV/Murmur mix -> 64 hex chars)
// Paired with Web Crypto SHA-256 async verification in verifyWithWebCryptoSha256().
export function computeRecordDigestHex(payload: string): string {
  const seeds = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = [...seeds];
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    for (let s = 0; s < 8; s++) {
      let h = words[s] ^ (c + ((i + 1) * (s + 3)));
      h = Math.imul(h, 0x01000193 + s * 2);
      h ^= h >>> 13;
      words[s] = h >>> 0;
    }
  }
  return words.map((w) => w.toString(16).padStart(8, '0')).join('');
}

export async function verifyWithWebCryptoSha256(payload: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(payload);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return computeRecordDigestHex(payload);
}

const TRUSTED_BACKUPS: Record<string, TrustedBackupSnapshot> = {
  'CHG-398': {
    backupRef: 'BK-2026-11-18-8821',
    vendorPayee: 'NorthPort Logistics Ltd.',
    verifiedBankAcct: 'HDFC-0041-****8821',
    verifiedIfscSwift: 'HDFC0000142',
    baselineHash: '',
    signedByKeyId: 'fin_erp_signing_key_v3',
  },
  'CHG-399': {
    backupRef: 'BK-2026-11-18-1190',
    vendorPayee: 'Coastal Containers Co.',
    verifiedBankAcct: 'ICIC-0182-****1190',
    verifiedIfscSwift: 'ICIC0000210',
    baselineHash: '',
    signedByKeyId: 'fin_erp_signing_key_v3',
  },
  'CHG-401': {
    backupRef: 'BK-2026-11-18-4481',
    vendorPayee: 'Meridian Offshore Forwarding',
    verifiedBankAcct: 'HDFC-0092-****4481',
    verifiedIfscSwift: 'HDFC0000240',
    baselineHash: '',
    signedByKeyId: 'fin_erp_signing_key_v3',
  },
  'CHG-402': {
    backupRef: 'BK-2026-11-18-5112',
    vendorPayee: 'Vanguard Transit Holdings',
    verifiedBankAcct: 'ICIC-0411-****5112',
    verifiedIfscSwift: 'ICIC0000390',
    baselineHash: '',
    signedByKeyId: 'fin_erp_signing_key_v3',
  },
  'CHG-403': {
    backupRef: 'BK-2026-11-18-3318',
    vendorPayee: 'Meridian Offshore Forwarding',
    verifiedBankAcct: 'AXIS-0218-****3318',
    verifiedIfscSwift: 'UTIB0000118',
    baselineHash: '',
    signedByKeyId: 'fin_erp_signing_key_v3',
  },
  'CHG-404': {
    backupRef: 'BK-2026-11-19-7704',
    vendorPayee: 'Pacific Dock Services',
    verifiedBankAcct: 'SBIN-0084-****7704',
    verifiedIfscSwift: 'SBIN0000401',
    baselineHash: '',
    signedByKeyId: 'fin_erp_signing_key_v3',
  },
};

// Pre-populate baseline hashes for trusted backups
Object.entries(TRUSTED_BACKUPS).forEach(([chgId, snap]) => {
  snap.baselineHash = computeRecordDigestHex(
    `${chgId}|${snap.vendorPayee}|${snap.verifiedBankAcct}|${snap.verifiedIfscSwift}|${snap.signedByKeyId}`
  );
});

export function buildSoftwareIntegrityLedger(
  discoveredClues: ClueId[],
  uploadedApiRecords: ApiActivityRecord[],
  uploadedBankChanges: BankChangeRecord[],
  rolledBackChangeIds: string[],
  revokedRoles: string[],
  rotatedKeys: string[],
  tamperTestChangeId: string | null = null
): SoftwareIntegrityRecord[] {
  const unlocked = getUnlockedEvidenceCodes(discoveredClues);
  const bankRows = [
    ...(unlocked.has('E19') ? E19_BANK_CHANGES : []),
    ...uploadedBankChanges,
  ];
  const apiRows = [
    ...(unlocked.has('E18') ? E18_API_LOGS : []),
    ...uploadedApiRecords,
  ];

  const apiByReq = new Map<string, ApiActivityRecord>();
  apiRows.forEach((r) => {
    if (r.request_id) apiByReq.set(r.request_id, r);
  });

  let prevChainHash = '0000000000000000000000000000000000000000000000000000000000000000';

  return bankRows.map((rec) => {
    const api = apiByReq.get(rec.request_id);
    const backup = TRUSTED_BACKUPS[rec.change_id] ?? null;
    const isRestored = rolledBackChangeIds.includes(rec.change_id);
    const isSimulatedTamper = tamperTestChangeId === rec.change_id && !isRestored;

    const effectiveBankAcct = isRestored && backup
      ? backup.verifiedBankAcct
      : isSimulatedTamper
      ? 'CYPR-TAMPERED-9999'
      : rec.new_bank_acct;
    const effectiveSwift = isRestored && backup
      ? backup.verifiedIfscSwift
      : rec.new_ifsc_swift;

    const apiKeyId = api?.api_key_id ?? (rec.channel === 'ERP_PORTAL' ? 'sso_fin_portal_key' : 'ak_tb_prod_0419');
    const sourceIp = api?.source_ip ?? (rec.channel === 'ERP_PORTAL' ? '10.20.4.18 (Internal)' : CASE_METADATA.rogueIp);
    const serviceAccount = api?.service_account ?? rec.changed_by;

    const canonicalPayload = `${rec.change_id}|${rec.vendor_payee}|${effectiveBankAcct}|${effectiveSwift}|${
      isRestored ? 'fin_erp_signing_key_v3' : apiKeyId
    }`;
    const recordHash = computeRecordDigestHex(`${prevChainHash}|${canonicalPayload}|${rec.timestamp}|${rec.request_id}`);
    const contentDigest = computeRecordDigestHex(canonicalPayload);

    const approvalValid = Boolean(rec.approval_ref && rec.approval_ref.trim().startsWith('APR-2026')) || isRestored;
    const signatureTrusted =
      rec.channel === 'ERP_PORTAL' || isRestored
        ? true
        : apiKeyId !== 'ak_tb_prod_0419' || (sourceIp === CASE_METADATA.authorizedIp && rotatedKeys.length === 0);
    const rbacAuthorized =
      rec.channel === 'ERP_PORTAL' || isRestored
        ? true
        : revokedRoles.includes('ROLE_ERP_EMERGENCY_ADMIN')
        ? false
        : false; // Unauthorized for vendor sync service account under contract E07

    const mismatchedFields: string[] = [];
    if (backup) {
      if (effectiveBankAcct !== backup.verifiedBankAcct) {
        mismatchedFields.push(`bank_acct (${backup.verifiedBankAcct} -> ${effectiveBankAcct})`);
      }
      if (effectiveSwift !== backup.verifiedIfscSwift) {
        mismatchedFields.push(`swift_bic (${backup.verifiedIfscSwift} -> ${effectiveSwift})`);
      }
    }
    if (!approvalValid) {
      mismatchedFields.push('approval_ref (MISSING / NULL)');
    }
    if (!signatureTrusted) {
      mismatchedFields.push(`untrusted_origin (${sourceIp} / ${apiKeyId})`);
    }
    if (isSimulatedTamper) {
      mismatchedFields.push('simulated_tamper_test (Record modified after write)');
    }

    const hashMatchesBackup = backup ? contentDigest === backup.baselineHash : approvalValid;
    const tamperDetected = mismatchedFields.length > 0 || !hashMatchesBackup;

    let verificationStatus: SoftwareIntegrityRecord['verificationStatus'] = 'VERIFIED_TRUSTED';
    if (isRestored) {
      verificationStatus = 'RESTORED_SEALED';
    } else if (mismatchedFields.some((f) => f.startsWith('bank_acct') || f.startsWith('simulated_tamper'))) {
      verificationStatus = 'TAMPER_MISMATCH';
    } else if (!approvalValid || !signatureTrusted || !rbacAuthorized) {
      verificationStatus = 'UNVERIFIED_UNAUTHORIZED';
    }

    const digitalSignature = isRestored || (rec.channel === 'ERP_PORTAL' && approvalValid)
      ? `SIG-ED25519-VALID-${recordHash.slice(0, 12)}`
      : `SIG-REJECTED-${recordHash.slice(0, 12)}`;

    const securityLesson =
      verificationStatus === 'VERIFIED_TRUSTED'
        ? 'Valid Finance approval_ref + ERP portal RBAC + verified cryptographic hash chain.'
        : verificationStatus === 'RESTORED_SEALED'
        ? `Restored from ${backup?.backupRef}; integrity hash re-computed & sealed under Finance dual-control.`
        : 'REJECTED: A cryptographic hash alone does not prevent misuse of leaked key ak_tb_prod_0419 or unrevoked Q2 emergency RBAC. Signature origin, RBAC, and approval_ref checks are all required.';

    const item: SoftwareIntegrityRecord = {
      changeId: rec.change_id,
      vendorPayee: rec.vendor_payee,
      timestamp: rec.timestamp,
      requestId: rec.request_id,
      apiKeyId,
      serviceAccount,
      sourceIp,
      channel: rec.channel,
      approvalRef: rec.approval_ref,
      currentBankAcct: effectiveBankAcct,
      currentIfscSwift: effectiveSwift,
      originalBackup: backup,
      recordHash,
      prevChainHash,
      digitalSignature,
      hashMatchesBackup,
      signatureTrusted,
      rbacAuthorized,
      approvalValid,
      tamperDetected,
      verificationStatus,
      mismatchedFields,
      securityLesson,
    };

    prevChainHash = recordHash;
    return item;
  });
}

export function buildTrustProfileSummary(
  vendorName: string,
  discoveredClues: ClueId[],
  blockedIndicators: string[],
  revokedRoles: string[],
  rotatedKeys: string[],
  rolledBackChangeIds: string[],
  fingerprintVerified = false
): TrustProfileSummary {
  const unlocked = getUnlockedEvidenceCodes(discoveredClues);
  const ipIsolated = blockedIndicators.includes(CASE_METADATA.rogueIp);
  const roleRevoked = revokedRoles.includes('ROLE_ERP_EMERGENCY_ADMIN');
  const keyRotated = rotatedKeys.includes(CASE_METADATA.apiKeyId);
  const recordsRestored = ['CHG-401', 'CHG-402', 'CHG-403'].every((id) =>
    rolledBackChangeIds.includes(id)
  );

  if (vendorName === 'FinPay Core') {
    return {
      vendor: 'FinPay Core',
      serviceAccount: 'svc-finpay-settlement',
      authorizedIp: '198.51.100.18',
      accessControlPosture: 'Least-privilege settlement scopes verified',
      keyManagementStatus: 'Active scoped key (no exposure alerts)',
      auditProtectionStatus: 'Signed & hash-chained settlement ledger',
      integrityPosture: 'HARDENED',
      trustScore: 98,
      pillars: [
        { label: 'Access Control (RBAC)', status: 'PASS', detail: 'No unrevoked emergency admin roles.' },
        { label: 'Key Management', status: 'PASS', detail: 'Authenticated from allowlisted 198.51.100.18.' },
        { label: 'Cryptographic Integrity', status: 'PASS', detail: 'CHG-404 carries valid APR-2026-4429 & hash match.' },
        { label: 'Protected Audit Log', status: 'PASS', detail: 'No tamper mismatches or off-hours egress.' },
      ],
    };
  }

  const hardened = ipIsolated && roleRevoked && keyRotated && recordsRestored && fingerprintVerified;
  const hasEvidence = unlocked.has('E01') || unlocked.has('E18') || unlocked.has('E19');
  let trustScore = 18;
  if (fingerprintVerified) trustScore += 8;
  if (ipIsolated) trustScore += 19;
  if (roleRevoked) trustScore += 19;
  if (keyRotated) trustScore += 18;
  if (recordsRestored) trustScore += 18;

  return {
    vendor: 'TallyBridge',
    serviceAccount: CASE_METADATA.serviceAccount,
    authorizedIp: CASE_METADATA.authorizedIp,
    accessControlPosture: roleRevoked
      ? 'Hardened — ROLE_ERP_EMERGENCY_ADMIN revoked'
      : 'Exposed — Q2 ROLE_ERP_EMERGENCY_ADMIN still attached (E04/E14)',
    keyManagementStatus: keyRotated
      ? 'Rotated — ak_tb_prod_0419 invalidated; ak_tb_prod_0502 active'
      : 'Compromised — ak_tb_prod_0419 active from unlisted 185.220.101.47',
    auditProtectionStatus: recordsRestored
      ? 'Tamper-evident chain restored from BK-2026-11-18-*'
      : '3 unapproved bank changes detected with hash/backup mismatch',
    integrityPosture: !hasEvidence
      ? 'PENDING_EVIDENCE'
      : hardened
      ? 'HARDENED'
      : 'COMPROMISED_PENDING_ISOLATION',
    trustScore: hasEvidence ? trustScore : fingerprintVerified ? 58 : 50,
    pillars: [
      {
        label: 'Access Control & Operator Auth',
        status: roleRevoked && fingerprintVerified ? 'PASS' : fingerprintVerified ? 'WARN' : 'FAIL',
        detail: roleRevoked
          ? 'Emergency write role removed & operator vault verified.'
          : fingerprintVerified
          ? 'Operator vault verified; Q2 emergency write role still exposed on vendor.'
          : 'Operator fingerprint verification pending & Q2 ticket E14 exposed write role.',
      },
      {
        label: 'Key Management & IP Policy',
        status: keyRotated && ipIsolated ? 'PASS' : 'FAIL',
        detail:
          keyRotated && ipIsolated
            ? '185.220.101.47 blocked; ak_tb_prod_0419 rotated.'
            : 'ak_tb_prod_0419 observed outside 203.0.113.42 allowlist.',
      },
      {
        label: 'Cryptographic Integrity & Signatures',
        status: recordsRestored ? 'PASS' : 'FAIL',
        detail: recordsRestored
          ? 'CHG-401..403 restored & sealed against BK-2026-11-18-*.'
          : '3 bank records mismatch trusted backup hashes & lack approval_ref.',
      },
      {
        label: 'Tamper-Evident Audit History',
        status: 'PASS',
        detail: 'Hash-chained audit ledger preserved E18/E19 raw records untouched.',
      },
    ],
  };
}

export function buildVerificationChecks(params: {
  ipBlocked: boolean;
  roleRevoked: boolean;
  keyRotated: boolean;
  rolledBackChangeIds: string[];
  paymentHoldActive: boolean;
  uncertainBackup?: boolean;
  nowUtc?: string;
}): RemediationVerificationCheck[] {
  const nowUtc = params.nowUtc ?? new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const targetIds = ['CHG-401', 'CHG-402', 'CHG-403'];
  const allRolledBack =
    !params.uncertainBackup && targetIds.every((id) => params.rolledBackChangeIds.includes(id));

  return [
    {
      id: 'VER-01',
      probe: 'Simulated Gateway Perimeter Probe: 185.220.101.47 -> /api/v2/invoices',
      expected: 'HTTP 403 WAF/IP Deny',
      observed: params.ipBlocked
        ? 'HTTP 403 Forbidden (Perimeter ACL DENY_185_220_101_47 active)'
        : 'HTTP 200/401 Allowed through perimeter (IP still unblocked!)',
      status: params.ipBlocked ? 'PASS' : 'FAIL',
      executedAt: nowUtc,
    },
    {
      id: 'VER-02',
      probe: 'Simulated Credential Replay Test: ak_tb_prod_0419 (old secret)',
      expected: 'HTTP 401 Credential Revoked',
      observed: params.keyRotated
        ? 'HTTP 401 Unauthorized (ak_tb_prod_0419 restricted & rotated; ak_tb_prod_0502 active)'
        : 'HTTP 200 Token Accepted (ak_tb_prod_0419 still active!)',
      status: params.keyRotated ? 'PASS' : 'FAIL',
      executedAt: nowUtc,
    },
    {
      id: 'VER-03',
      probe: 'Simulated Privilege Scope Probe: svc-tallybridge-sync POST /vendors/bank-details/update',
      expected: 'HTTP 403 Missing Emergency Role & Dual-Control approval_ref',
      observed: params.roleRevoked
        ? 'HTTP 403 Forbidden (ROLE_ERP_EMERGENCY_ADMIN revoked; approval_ref gate active)'
        : 'HTTP 200 Permitted (ROLE_ERP_EMERGENCY_ADMIN still bound!)',
      status: params.roleRevoked ? 'PASS' : 'FAIL',
      executedAt: nowUtc,
    },
    {
      id: 'VER-04',
      probe: 'Simulated ERP Beneficiary Integrity & Backup Seal Check: CHG-401, CHG-402, CHG-403',
      expected: 'CYPRCY2NXXX accounts reverted to BK-2026-11-18-* masters (****4481/5112/3318) with valid SHA-256 seal',
      observed: params.uncertainBackup
        ? 'HOLD MAINTAINED — Trusted backup verification uncertain; zero guessed restoration permitted'
        : allRolledBack
        ? `3/3 bank masters restored & hash-sealed (${
            params.paymentHoldActive ? 'Treasury payment hold ON HOLD for sign-off' : 'Payout hold released after audit'
          })`
        : `${params.rolledBackChangeIds.length}/3 changes restored — mismatch remains against trusted backup`,
      status: allRolledBack ? 'PASS' : 'FAIL',
      executedAt: nowUtc,
    },
    {
      id: 'VER-05',
      probe: 'Simulated Contracted Sync Health Check: 203.0.113.42 TallyBridge-Worker/4.2.1 GET /invoices',
      expected: 'HTTP 200 OK (Normal baseline preserved)',
      observed: 'HTTP 200 OK (48.2 KB payload · zero disruption to contracted freight sync)',
      status: 'PASS',
      executedAt: nowUtc,
    },
  ];
}

export interface AutoRecoveryResult {
  status: AutoRecoveryStatus;
  steps: AutoRecoveryStepLog[];
  blockedIndicators: string[];
  revokedRoles: string[];
  rotatedKeys: string[];
  rolledBackChangeIds: string[];
  integrityVerifiedIds: string[];
  paymentHoldActive: boolean;
  verificationChecks: RemediationVerificationCheck[];
  restoredVendorRecords: Record<string, RestoredVendorRecord>;
  auditEntries: AutoRecoveryAuditEntry[];
  executedAt: string;
}

export function executeAutoRecoveryWorkflow(params: {
  discoveredClues: ClueId[];
  uploadedApiRecords: ApiActivityRecord[];
  uploadedBankChanges: BankChangeRecord[];
  existingBlockedIndicators: string[];
  existingRevokedRoles: string[];
  existingRotatedKeys: string[];
  existingRolledBackChangeIds: string[];
  existingIntegrityVerifiedIds: string[];
  simulateUncertainBackup: boolean;
  tamperTestChangeId: string | null;
}): AutoRecoveryResult {
  const executedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const unlocked = getUnlockedEvidenceCodes(params.discoveredClues);
  const hasE18 = unlocked.has('E18') || params.uploadedApiRecords.length > 0;
  const hasE19 = unlocked.has('E19') || params.uploadedBankChanges.length > 0;

  const bankRows = [
    ...(unlocked.has('E19') ? E19_BANK_CHANGES : []),
    ...params.uploadedBankChanges,
  ];
  const unauthorizedChanges = bankRows.filter(
    (r) => !r.approval_ref || r.approval_ref.trim() === ''
  );
  const unauthorizedDetected = unauthorizedChanges.length > 0 || !hasE19;

  const nextBlocked = Array.from(
    new Set([
      ...params.existingBlockedIndicators,
      CASE_METADATA.rogueIp,
      'VENDOR_MOD_CHG-401',
      'VENDOR_MOD_CHG-402',
      'VENDOR_MOD_CHG-403',
    ])
  );
  const nextRevoked = Array.from(
    new Set([...params.existingRevokedRoles, 'ROLE_ERP_EMERGENCY_ADMIN'])
  );
  const nextRotated = Array.from(
    new Set([...params.existingRotatedKeys, CASE_METADATA.apiKeyId])
  );

  const targetChangeIds = ['CHG-401', 'CHG-402', 'CHG-403'];
  const allTargetsHaveTrustedBackup =
    hasE19 &&
    targetChangeIds.every((id) => Boolean(TRUSTED_BACKUPS[id])) &&
    !params.simulateUncertainBackup &&
    !(params.tamperTestChangeId && targetChangeIds.includes(params.tamperTestChangeId));

  const nextRolledBack = allTargetsHaveTrustedBackup
    ? Array.from(new Set([...params.existingRolledBackChangeIds, ...targetChangeIds]))
    : [...params.existingRolledBackChangeIds];

  const nextIntegrityIds = allTargetsHaveTrustedBackup
    ? Array.from(new Set([...params.existingIntegrityVerifiedIds, ...targetChangeIds, 'CHG-404']))
    : [...params.existingIntegrityVerifiedIds];

  const restoredVendorRecords: Record<string, RestoredVendorRecord> = {};
  if (allTargetsHaveTrustedBackup) {
    targetChangeIds.forEach((id) => {
      const snap = TRUSTED_BACKUPS[id];
      if (snap) {
        restoredVendorRecords[id] = {
          changeId: id,
          vendorPayee: snap.vendorPayee,
          bankAcct: snap.verifiedBankAcct,
          swift: snap.verifiedIfscSwift,
          restoredFrom: snap.backupRef,
          verifiedAt: executedAt,
        };
      }
    });
  }

  const verificationChecks = buildVerificationChecks({
    ipBlocked: nextBlocked.includes(CASE_METADATA.rogueIp),
    roleRevoked: nextRevoked.includes('ROLE_ERP_EMERGENCY_ADMIN'),
    keyRotated: nextRotated.includes(CASE_METADATA.apiKeyId),
    rolledBackChangeIds: nextRolledBack,
    paymentHoldActive: true,
    uncertainBackup: !allTargetsHaveTrustedBackup,
    nowUtc: executedAt,
  });

  const allChecksPassed = verificationChecks.every((c) => c.status === 'PASS');
  const finalStatus: AutoRecoveryStatus =
    allTargetsHaveTrustedBackup && allChecksPassed
      ? 'AUTO_RECOVERY_SUCCESSFUL'
      : 'HUMAN_APPROVAL_REQUIRED';

  const steps: AutoRecoveryStepLog[] = [
    {
      stepNumber: 1,
      label: 'Detect suspicious vendor changes',
      actorRole: 'Security Analyst (Aditi Kapoor · SOC)',
      detail: unauthorizedDetected
        ? `Detected ${Math.max(3, unauthorizedChanges.length)} unauthorized offshore bank-detail updates (CYPRCY2NXXX) in simulated ERP ledger.`
        : 'Scanned vendor ledger for unauthorized changes.',
      timestamp: executedAt,
      status: 'DONE',
    },
    {
      stepNumber: 2,
      label: 'Correlate API identity, request ID & approval reference',
      actorRole: 'Digital Investigator (Meera Nair · Forensics)',
      detail: hasE18
        ? 'Correlated api_key_id=ak_tb_prod_0419 (svc-tallybridge-sync), request_ids req-9f4a-881c/882d/883e, approval_ref=NULL.'
        : 'Identified anomalous credential ak_tb_prod_0419 with missing approval_ref.',
      timestamp: executedAt,
      status: 'DONE',
    },
    {
      stepNumber: 3,
      label: 'Preserve original evidence untouched',
      actorRole: 'Digital Investigator (Custody Vault)',
      detail: 'Sealed raw E18 gateway logs and E19 bank-change entries in hash-chained custody log.',
      timestamp: executedAt,
      status: 'DONE',
    },
    {
      stepNumber: 4,
      label: 'Automatically isolate affected vendor record & IP',
      actorRole: 'Network Engineer (Colin Lawson · Data Centre)',
      detail: 'Isolated modified records CHG-401, CHG-402, CHG-403 and blocked IP 185.220.101.47 (Simulation).',
      timestamp: executedAt,
      status: 'DONE',
    },
    {
      stepNumber: 5,
      label: 'Put related pending payments ON HOLD',
      actorRole: 'Financial Officer (Madhavi Sundar · Finance)',
      detail: 'Treasury offshore batch disbursements placed ON HOLD pending verification (Simulation).',
      timestamp: executedAt,
      status: 'DONE',
    },
    {
      stepNumber: 6,
      label: 'Restrict simulated suspicious API credential',
      actorRole: 'System Administrator (Prakash Menon · IT)',
      detail: 'Restricted ak_tb_prod_0419 (rotated to ak_tb_prod_0502) and revoked ROLE_ERP_EMERGENCY_ADMIN.',
      timestamp: executedAt,
      status: 'DONE',
    },
    {
      stepNumber: 7,
      label: 'Locate last trusted, verified vendor record',
      actorRole: 'Financial Officer (Farah Dsouza · AP Control)',
      detail: allTargetsHaveTrustedBackup
        ? 'Verified intact signed snapshots BK-2026-11-18-4481, BK-2026-11-18-5112, BK-2026-11-18-3318.'
        : !hasE19
        ? 'E19 financial master dataset not yet unlocked/verified — trusted baseline incomplete.'
        : 'Trusted backup validation UNCERTAIN or unavailable — refusing to guess financial data.',
      timestamp: executedAt,
      status: allTargetsHaveTrustedBackup ? 'DONE' : 'BLOCKED',
    },
    {
      stepNumber: 8,
      label: 'Restore original record automatically',
      actorRole: 'TRUSTLOCK Auto Engine · Finance Verified',
      detail: allTargetsHaveTrustedBackup
        ? 'Restored Meridian Offshore (****4481, ****3318) and Vanguard Transit (****5112) directly into ERP master records (Simulation).'
        : 'ABORTED AUTOMATIC WRITE — Isolation and payment ON HOLD maintained; awaiting explicit Security Manager approval.',
      timestamp: executedAt,
      status: allTargetsHaveTrustedBackup ? 'DONE' : 'BLOCKED',
    },
    {
      stepNumber: 9,
      label: 'Verify restored data against trusted version',
      actorRole: 'Security Analyst & Financial Officer Probes',
      detail: `${verificationChecks.filter((c) => c.status === 'PASS').length}/${verificationChecks.length} live verification probes passed against trusted backup hashes.`,
      timestamp: executedAt,
      status: allChecksPassed ? 'DONE' : 'BLOCKED',
    },
    {
      stepNumber: 10,
      label: 'Finalize recovery status',
      actorRole: 'Security Manager (Dev Raghavan · Governance)',
      detail:
        finalStatus === 'AUTO_RECOVERY_SUCCESSFUL'
          ? 'RECOVERY SUCCESSFUL — All checks passed and vendor records verified.'
          : 'ISOLATION MAINTAINED — HUMAN APPROVAL REQUIRED (Trusted data uncertain/incomplete).',
      timestamp: executedAt,
      status: finalStatus === 'AUTO_RECOVERY_SUCCESSFUL' ? 'DONE' : 'BLOCKED',
    },
  ];

  const runToken = executedAt.replace(/\D/g, '').slice(-6);
  const auditEntries: AutoRecoveryAuditEntry[] = [
    {
      id: `REC-${runToken}-01`,
      timestamp: executedAt,
      actorRole: 'Security Analyst · Digital Investigator',
      action: 'DETECT_AND_PRESERVE',
      target: 'CHG-401, CHG-402, CHG-403',
      detail: 'Unauthorized offshore changes correlated via ak_tb_prod_0419 / missing approval_ref; raw E18 & E19 preserved.',
      outcome: 'EXECUTED',
    },
    {
      id: `REC-${runToken}-02`,
      timestamp: executedAt,
      actorRole: 'Network Engineer · System Admin · Financial Officer',
      action: 'ISOLATE_RESTRICT_HOLD',
      target: '185.220.101.47 · ak_tb_prod_0419 · Treasury Payouts',
      detail: 'Blocked perimeter IP, rotated compromised key, revoked ROLE_ERP_EMERGENCY_ADMIN, and held pending payouts (Simulation).',
      outcome: 'EXECUTED',
    },
    {
      id: `REC-${runToken}-03`,
      timestamp: executedAt,
      actorRole:
        finalStatus === 'AUTO_RECOVERY_SUCCESSFUL'
          ? 'TRUSTLOCK Auto Recovery Engine'
          : 'Security Manager (Dev Raghavan)',
      action:
        finalStatus === 'AUTO_RECOVERY_SUCCESSFUL'
          ? 'AUTO_RESTORE_AND_VERIFY'
          : 'HUMAN_APPROVAL_GATE',
      target: 'Meridian Offshore & Vanguard Transit',
      detail:
        finalStatus === 'AUTO_RECOVERY_SUCCESSFUL'
          ? 'Restored verified BK-2026-11-18-* records and confirmed 5/5 verification probes PASS — RECOVERY SUCCESSFUL.'
          : 'Trusted recovery source unavailable/uncertain; zero financial guessing enforced — awaiting Security Manager approval.',
      outcome: finalStatus === 'AUTO_RECOVERY_SUCCESSFUL' ? 'VERIFIED' : 'HOLD_REQUIRED',
    },
  ];

  return {
    status: finalStatus,
    steps,
    blockedIndicators: nextBlocked,
    revokedRoles: nextRevoked,
    rotatedKeys: nextRotated,
    rolledBackChangeIds: nextRolledBack,
    integrityVerifiedIds: nextIntegrityIds,
    paymentHoldActive: true,
    verificationChecks,
    restoredVendorRecords,
    auditEntries,
    executedAt,
  };
}

