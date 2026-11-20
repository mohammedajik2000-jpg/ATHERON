import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';

const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = 5 * 60 * 1000; // 5-minute session timeout
const VAULT_DIR = path.resolve(process.cwd(), '.trustlock-vault');
const VAULT_FILE = path.join(VAULT_DIR, 'vault-state.json');

type RoleId =
  | 'ROLE_INVESTIGATOR'
  | 'ROLE_FINANCE_ADMIN'
  | 'ROLE_SOC_ANALYST'
  | 'ROLE_CONTRACTOR_READONLY';

interface DemoOperator {
  operatorId: string;
  displayName: string;
  role: RoleId;
  clearance: string;
  authorizedForVault: boolean;
}

interface EncryptedTemplateRecord {
  id: string;
  label: string;
  ownerName: string;
  roleRequired: RoleId;
  clearance: string;
  syntheticBadge: string;
  cipherAlgorithm: 'AES-256-GCM';
  dekId: string;
  wrappedDekHex: string;
  ivHex: string;
  authTagHex: string;
  ciphertextHex: string;
  plaintextSha256: string;
  ciphertextSha256: string;
  tampered: boolean;
  createdAt: string;
  updatedAt: string;
}

interface BackupSnapshot {
  backupId: string;
  createdAt: string;
  signatureHmac: string;
  templates: EncryptedTemplateRecord[];
}

interface AuditLogEntry {
  seq: number;
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  outcome: 'SUCCESS' | 'DENIED' | 'REJECTED' | 'TAMPER_ALERT' | 'INFO';
  detail: string;
  prevHash: string;
  entryHash: string;
}

interface ActiveSession {
  sessionId: string;
  token: string;
  operatorId: string;
  displayName: string;
  role: RoleId;
  clearance: string;
  issuedAt: number;
  expiresAt: number;
}

interface PersistedVaultState {
  keyId: string;
  keyRotatedAt: string;
  templates: EncryptedTemplateRecord[];
  backups: BackupSnapshot[];
  auditLog: AuditLogEntry[];
}

// Server-side master KEK (never exposed to client, logs, or API responses)
const MASTER_KEK: Buffer = (() => {
  const envKey = process.env.TRUSTLOCK_MASTER_KEY;
  if (envKey && envKey.length >= 16) {
    return crypto.createHash('sha256').update(envKey).digest();
  }
  fs.mkdirSync(VAULT_DIR, { recursive: true });
  const keyFile = path.join(VAULT_DIR, 'master.kek.bin');
  if (fs.existsSync(keyFile)) {
    const existing = fs.readFileSync(keyFile);
    if (existing.length === 32) return existing;
  }
  const generated = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, generated, { mode: 0o600 });
  return generated;
})();

const SESSION_SIGNING_SECRET = crypto
  .createHmac('sha256', MASTER_KEK)
  .update('trustlock-session-hmac-v1')
  .digest();

const DEMO_OPERATORS: Record<string, DemoOperator> = {
  investigator: {
    operatorId: 'op_investigator_01',
    displayName: 'Lead Digital Investigator',
    role: 'ROLE_INVESTIGATOR',
    clearance: 'L4-FORENSIC',
    authorizedForVault: true,
  },
  finance_officer: {
    operatorId: 'op_finance_02',
    displayName: 'Madhavi Sundar (Finance Officer)',
    role: 'ROLE_FINANCE_ADMIN',
    clearance: 'L3-TREASURY',
    authorizedForVault: true,
  },
  soc_analyst: {
    operatorId: 'op_soc_03',
    displayName: 'Aditi Kapoor (SOC Analyst)',
    role: 'ROLE_SOC_ANALYST',
    clearance: 'L3-SOC',
    authorizedForVault: true,
  },
  contractor: {
    operatorId: 'op_contractor_99',
    displayName: 'External Vendor Contractor',
    role: 'ROLE_CONTRACTOR_READONLY',
    clearance: 'L1-RESTRICTED',
    authorizedForVault: false,
  },
};

const AUTHORIZED_VAULT_ROLES: RoleId[] = [
  'ROLE_INVESTIGATOR',
  'ROLE_FINANCE_ADMIN',
  'ROLE_SOC_ANALYST',
];

function sha256Hex(input: string | Buffer): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function wrapDek(dek: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEK, iv);
  const enc = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function unwrapDek(wrapped: string): Buffer {
  const [ivHex, tagHex, encHex] = wrapped.split(':');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    MASTER_KEK,
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final(),
  ]);
}

function encryptTemplate(params: {
  id: string;
  label: string;
  ownerName: string;
  roleRequired: RoleId;
  clearance: string;
  syntheticPayload: Record<string, unknown>;
}): EncryptedTemplateRecord {
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const plaintext = Buffer.from(JSON.stringify(params.syntheticPayload), 'utf8');
  const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const now = new Date().toISOString();

  return {
    id: params.id,
    label: params.label,
    ownerName: params.ownerName,
    roleRequired: params.roleRequired,
    clearance: params.clearance,
    syntheticBadge: 'SYNTHETIC_DEMO_TEMPLATE_ONLY',
    cipherAlgorithm: 'AES-256-GCM',
    dekId: `dek-${params.id}-v1`,
    wrappedDekHex: wrapDek(dek),
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    ciphertextHex: ciphertext.toString('hex'),
    plaintextSha256: sha256Hex(plaintext),
    ciphertextSha256: sha256Hex(ciphertext),
    tampered: false,
    createdAt: now,
    updatedAt: now,
  };
}

function verifyAndDecryptTemplate(rec: EncryptedTemplateRecord): {
  ok: boolean;
  reason?: string;
  payload?: Record<string, unknown>;
} {
  // 1. Pre-decryption ciphertext SHA-256 integrity check
  const currentCipherHash = sha256Hex(Buffer.from(rec.ciphertextHex, 'hex'));
  if (currentCipherHash !== rec.ciphertextSha256 || rec.tampered) {
    return {
      ok: false,
      reason: 'Pre-decryption ciphertext SHA-256 mismatch — stored template altered.',
    };
  }
  try {
    const dek = unwrapDek(rec.wrappedDekHex);
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      dek,
      Buffer.from(rec.ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(rec.authTagHex, 'hex'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(rec.ciphertextHex, 'hex')),
      decipher.final(),
    ]);
    if (sha256Hex(plaintext) !== rec.plaintextSha256) {
      return {
        ok: false,
        reason: 'Decrypted template digest failed integrity verification.',
      };
    }
    return {
      ok: true,
      payload: JSON.parse(plaintext.toString('utf8')) as Record<string, unknown>,
    };
  } catch {
    return {
      ok: false,
      reason: 'AES-256-GCM authentication tag verification failed.',
    };
  }
}

function createInitialVaultState(): PersistedVaultState {
  const templates: EncryptedTemplateRecord[] = [
    encryptTemplate({
      id: 'tpl_investigator_valid',
      label: 'Synthetic Template — Lead Digital Investigator',
      ownerName: 'Digital Investigator (CR-26-047)',
      roleRequired: 'ROLE_INVESTIGATOR',
      clearance: 'L4-FORENSIC',
      syntheticPayload: {
        templateType: 'SYNTHETIC_DEMO_ONLY',
        ridgePattern: 'WHORL-SYNTH-48A',
        minutiaeVector: [0.91, 0.84, 0.77, 0.95, 0.88, 0.93, 0.79, 0.90],
        validForVerification: true,
        expectedScore: 96.4,
      },
    }),
    encryptTemplate({
      id: 'tpl_finance_valid',
      label: 'Synthetic Template — Financial Officer (Dual Control)',
      ownerName: 'Madhavi Sundar (Treasury Lead)',
      roleRequired: 'ROLE_FINANCE_ADMIN',
      clearance: 'L3-TREASURY',
      syntheticPayload: {
        templateType: 'SYNTHETIC_DEMO_ONLY',
        ridgePattern: 'LOOP-SYNTH-22C',
        minutiaeVector: [0.87, 0.92, 0.81, 0.89, 0.94, 0.85, 0.91, 0.86],
        validForVerification: true,
        expectedScore: 94.8,
      },
    }),
    encryptTemplate({
      id: 'tpl_invalid_spoof',
      label: 'Synthetic Negative Sample — Mismatched / Revoked Vector',
      ownerName: 'Unenrolled Synthetic Sample',
      roleRequired: 'ROLE_INVESTIGATOR',
      clearance: 'REVOKED',
      syntheticPayload: {
        templateType: 'SYNTHETIC_DEMO_ONLY',
        ridgePattern: 'ARCH-REJECT-00X',
        minutiaeVector: [0.18, 0.24, 0.12, 0.31, 0.19, 0.27, 0.15, 0.22],
        validForVerification: false,
        expectedScore: 31.4,
      },
    }),
  ];

  const backupId = 'VLT-BK-2026-11-19-01';
  const backupBody = JSON.stringify(templates);
  const backupSig = crypto
    .createHmac('sha256', MASTER_KEK)
    .update(`${backupId}:${backupBody}`)
    .digest('hex');

  const genesisEntry = appendAuditEntry([], {
    actor: 'TRUSTLOCK_VAULT_DAEMON',
    role: 'SYSTEM',
    action: 'VAULT_INITIALIZED',
    outcome: 'INFO',
    detail:
      'Encrypted synthetic template vault initialized (AES-256-GCM envelope encryption). Demo templates only; no real biometrics stored.',
  });

  return {
    keyId: 'kek-trustlock-vault-2026-v4',
    keyRotatedAt: new Date().toISOString(),
    templates,
    backups: [
      {
        backupId,
        createdAt: new Date().toISOString(),
        signatureHmac: backupSig,
        templates: JSON.parse(backupBody) as EncryptedTemplateRecord[],
      },
    ],
    auditLog: genesisEntry,
  };
}

function appendAuditEntry(
  existing: AuditLogEntry[],
  entry: Omit<AuditLogEntry, 'seq' | 'id' | 'timestamp' | 'prevHash' | 'entryHash'>
): AuditLogEntry[] {
  const prevHash =
    existing.length > 0
      ? existing[existing.length - 1].entryHash
      : '0000000000000000000000000000000000000000000000000000000000000000';
  const seq = existing.length + 1;
  const timestamp = new Date().toISOString();
  const id = `AUD-${String(seq).padStart(4, '0')}`;
  const entryHash = sha256Hex(
    `${seq}|${id}|${timestamp}|${entry.actor}|${entry.role}|${entry.action}|${entry.outcome}|${entry.detail}|${prevHash}`
  );
  return [
    ...existing,
    {
      seq,
      id,
      timestamp,
      ...entry,
      prevHash,
      entryHash,
    },
  ];
}

function verifyAuditChain(entries: AuditLogEntry[]): boolean {
  let expectedPrev =
    '0000000000000000000000000000000000000000000000000000000000000000';
  for (const e of entries) {
    if (e.prevHash !== expectedPrev) return false;
    const recomputed = sha256Hex(
      `${e.seq}|${e.id}|${e.timestamp}|${e.actor}|${e.role}|${e.action}|${e.outcome}|${e.detail}|${e.prevHash}`
    );
    if (recomputed !== e.entryHash) return false;
    expectedPrev = e.entryHash;
  }
  return true;
}

function loadVaultState(): PersistedVaultState {
  fs.mkdirSync(VAULT_DIR, { recursive: true });
  if (fs.existsSync(VAULT_FILE)) {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(VAULT_FILE, 'utf8')
      ) as PersistedVaultState;
      if (Array.isArray(parsed.templates) && Array.isArray(parsed.auditLog)) {
        return parsed;
      }
    } catch {
      // Fallback to clean init if unreadable
    }
  }
  const initial = createInitialVaultState();
  fs.writeFileSync(VAULT_FILE, JSON.stringify(initial, null, 2), {
    mode: 0o600,
  });
  return initial;
}

function saveVaultState(state: PersistedVaultState): void {
  fs.mkdirSync(VAULT_DIR, { recursive: true });
  fs.writeFileSync(VAULT_FILE, JSON.stringify(state, null, 2), {
    mode: 0o600,
  });
}

let vaultState: PersistedVaultState = loadVaultState();
const sessions = new Map<string, ActiveSession>();

function signSessionToken(sessionId: string, operatorId: string, role: RoleId): string {
  const sig = crypto
    .createHmac('sha256', SESSION_SIGNING_SECRET)
    .update(`${sessionId}|${operatorId}|${role}`)
    .digest('hex');
  return `${sessionId}.${sig}`;
}

function authenticateRequest(req: express.Request): {
  ok: boolean;
  code?: string;
  message?: string;
  session?: ActiveSession;
} {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return {
      ok: false,
      code: 'AUTH_REQUIRED',
      message: 'Authentication required. Start a verified operator session first.',
    };
  }
  const token = auth.slice(7).trim();
  const [sessionId] = token.split('.');
  const sess = sessions.get(sessionId);
  if (!sess || sess.token !== token) {
    return {
      ok: false,
      code: 'INVALID_SESSION',
      message: 'Session invalid or signed out.',
    };
  }
  const expectedToken = signSessionToken(sess.sessionId, sess.operatorId, sess.role);
  if (expectedToken !== token) {
    return {
      ok: false,
      code: 'SESSION_SIGNATURE_FAILED',
      message: 'Session signature verification failed.',
    };
  }
  if (Date.now() > sess.expiresAt) {
    sessions.delete(sessionId);
    vaultState.auditLog = appendAuditEntry(vaultState.auditLog, {
      actor: sess.displayName,
      role: sess.role,
      action: 'SESSION_TIMEOUT',
      outcome: 'DENIED',
      detail: `Session ${sess.sessionId} expired after idle timeout; access blocked until re-authentication.`,
    });
    saveVaultState(vaultState);
    return {
      ok: false,
      code: 'SESSION_EXPIRED',
      message: 'Session timed out. Please re-authenticate to continue.',
    };
  }
  return { ok: true, session: sess };
}

function sanitizeTemplateMetadata(rec: EncryptedTemplateRecord) {
  return {
    id: rec.id,
    label: rec.label,
    ownerName: rec.ownerName,
    roleRequired: rec.roleRequired,
    clearance: rec.clearance,
    syntheticBadge: rec.syntheticBadge,
    cipherAlgorithm: rec.cipherAlgorithm,
    dekId: rec.dekId,
    ivPreview: `${rec.ivHex.slice(0, 8)}...`,
    authTagPreview: `${rec.authTagHex.slice(0, 8)}...`,
    ciphertextHashPrefix: rec.ciphertextSha256.slice(0, 16),
    tampered: rec.tampered,
    updatedAt: rec.updatedAt,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. Create / switch authenticated operator session (RBAC + Expiry)
  app.post('/api/vault/auth/session', (req, res) => {
    const presetKey = String(req.body?.operatorKey || 'investigator');
    const op = DEMO_OPERATORS[presetKey];
    if (!op) {
      res.status(400).json({ error: 'Unknown operator preset.' });
      return;
    }

    const sessionId = `sess_${crypto.randomBytes(8).toString('hex')}`;
    const issuedAt = Date.now();
    const expiresAt = issuedAt + SESSION_TTL_MS;
    const token = signSessionToken(sessionId, op.operatorId, op.role);

    const session: ActiveSession = {
      sessionId,
      token,
      operatorId: op.operatorId,
      displayName: op.displayName,
      role: op.role,
      clearance: op.clearance,
      issuedAt,
      expiresAt,
    };
    sessions.set(sessionId, session);

    vaultState.auditLog = appendAuditEntry(vaultState.auditLog, {
      actor: op.displayName,
      role: op.role,
      action: 'SESSION_STARTED',
      outcome: op.authorizedForVault ? 'SUCCESS' : 'INFO',
      detail: `Authenticated session ${sessionId} issued (expires in 5m).`,
    });
    saveVaultState(vaultState);

    res.json({
      token,
      session: {
        sessionId,
        operatorId: op.operatorId,
        displayName: op.displayName,
        role: op.role,
        clearance: op.clearance,
        authorizedForVault: op.authorizedForVault,
        issuedAt,
        expiresAt,
      },
    });
  });

  // 2. Logout active session
  app.post('/api/vault/auth/logout', (req, res) => {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const token = auth.slice(7).trim();
      const [sessionId] = token.split('.');
      const sess = sessions.get(sessionId);
      if (sess) {
        sessions.delete(sessionId);
        vaultState.auditLog = appendAuditEntry(vaultState.auditLog, {
          actor: sess.displayName,
          role: sess.role,
          action: 'SESSION_LOGOUT',
          outcome: 'INFO',
          detail: `Operator signed out cleanly; session ${sessionId} revoked.`,
        });
        saveVaultState(vaultState);
      }
    }
    res.json({ ok: true });
  });

  // 3. Force session expiry simulation (for demonstrating timeout handling)
  app.post('/api/vault/auth/expire-now', (req, res) => {
    const check = authenticateRequest(req);
    if (!check.ok || !check.session) {
      res.status(401).json({ error: check.message, code: check.code });
      return;
    }
    check.session.expiresAt = Date.now() - 1000;
    const recheck = authenticateRequest(req);
    res.status(401).json({ error: recheck.message, code: recheck.code });
  });

  // 4. Security storage status (never leaks key material or plaintext templates)
  app.get('/api/vault/status', (req, res) => {
    const check = authenticateRequest(req);
    const auditChainValid = verifyAuditChain(vaultState.auditLog);
    const anyTampered = vaultState.templates.some((t) => t.tampered);
    const latestBackup = vaultState.backups[vaultState.backups.length - 1] ?? null;

    res.json({
      demoDisclaimer:
        'Backend-controlled prototype environment using synthetic fingerprint templates only. No security system is impossible to hack; security relies on layered controls (AES-256-GCM + RBAC + integrity verification + audit chaining).',
      encryption: {
        algorithm: 'AES-256-GCM (Authenticated Encryption)',
        keyManagement: `Server-managed KEK (${vaultState.keyId}) + per-template wrapped DEK`,
        keyExposedToFrontend: false,
        plaintextAtRest: false,
        keyRotatedAt: vaultState.keyRotatedAt,
      },
      integrity: {
        auditChainValid,
        auditEntriesCount: vaultState.auditLog.length,
        allTemplatesIntact: !anyTampered,
        tamperedTemplateIds: vaultState.templates.filter((t) => t.tampered).map((t) => t.id),
      },
      backup: latestBackup
        ? {
            backupId: latestBackup.backupId,
            createdAt: latestBackup.createdAt,
            hmacPrefix: latestBackup.signatureHmac.slice(0, 16),
            templateCount: latestBackup.templates.length,
          }
        : null,
      session: check.ok && check.session
        ? {
            active: true,
            displayName: check.session.displayName,
            role: check.session.role,
            clearance: check.session.clearance,
            authorizedForVault: AUTHORIZED_VAULT_ROLES.includes(check.session.role),
            expiresAt: check.session.expiresAt,
          }
        : {
            active: false,
            code: check.code || 'NO_SESSION',
          },
      templates: vaultState.templates.map(sanitizeTemplateMetadata),
    });
  });

  // 5. Run synthetic fingerprint verification against AES-256-GCM encrypted vault
  app.post('/api/vault/scan', (req, res) => {
    const check = authenticateRequest(req);
    if (!check.ok || !check.session) {
      res.status(401).json({ error: check.message, code: check.code });
      return;
    }

    const sess = check.session;
    const requestedTemplateId = String(req.body?.templateId || 'tpl_investigator_valid');

    // Enforce RBAC strictly on server
    if (!AUTHORIZED_VAULT_ROLES.includes(sess.role)) {
      vaultState.auditLog = appendAuditEntry(vaultState.auditLog, {
        actor: sess.displayName,
        role: sess.role,
        action: 'FINGERPRINT_VAULT_ACCESS',
        outcome: 'DENIED',
        detail: `Access Denied (HTTP 403): Role ${sess.role} lacks clearance to verify or decrypt TRUSTLOCK security templates.`,
      });
      saveVaultState(vaultState);
      res.status(403).json({
        status: 'ACCESS_DENIED',
        matchPercentage: 0,
        message: `Access Denied: Role ${sess.role} is unauthorized for TRUSTLOCK security verification.`,
        auditEntry: vaultState.auditLog[vaultState.auditLog.length - 1],
      });
      return;
    }

    const tpl = vaultState.templates.find((t) => t.id === requestedTemplateId);
    if (!tpl) {
      res.status(404).json({ error: 'Requested synthetic template not found.' });
      return;
    }

    // Verify integrity BEFORE using stored template
    const integrity = verifyAndDecryptTemplate(tpl);
    if (!integrity.ok || !integrity.payload) {
      vaultState.auditLog = appendAuditEntry(vaultState.auditLog, {
        actor: sess.displayName,
        role: sess.role,
        action: 'TEMPLATE_INTEGRITY_CHECK',
        outcome: 'TAMPER_ALERT',
        detail: `Blocked verification for ${tpl.id}: ${integrity.reason}`,
      });
      saveVaultState(vaultState);
      res.status(409).json({
        status: 'INTEGRITY_FAILED',
        matchPercentage: 0,
        message: `Integrity check failed before decryption: ${integrity.reason} Restore from encrypted backup to recover.`,
        auditEntry: vaultState.auditLog[vaultState.auditLog.length - 1],
      });
      return;
    }

    const validForVerification = Boolean(integrity.payload.validForVerification);
    const baseScore = Number(integrity.payload.expectedScore || 0);

    if (validForVerification) {
      vaultState.auditLog = appendAuditEntry(vaultState.auditLog, {
        actor: sess.displayName,
        role: sess.role,
        action: 'SYNTHETIC_FINGERPRINT_VERIFY',
        outcome: 'SUCCESS',
        detail: `Verified synthetic template ${tpl.id} (${tpl.ownerName}) after AES-256-GCM authTag + SHA-256 check. Match ${baseScore}%.`,
      });
      saveVaultState(vaultState);
      res.json({
        status: 'VERIFIED',
        templateId: tpl.id,
        matchPercentage: baseScore,
        cipherVerified: 'AES-256-GCM + SHA-256 PASS',
        message: `Synthetic template ${tpl.ownerName} verified (${baseScore}% ridge match). Session cleared for TRUSTLOCK Financial Change DNA inspection.`,
        auditEntry: vaultState.auditLog[vaultState.auditLog.length - 1],
      });
      return;
    }

    vaultState.auditLog = appendAuditEntry(vaultState.auditLog, {
      actor: sess.displayName,
      role: sess.role,
      action: 'SYNTHETIC_FINGERPRINT_VERIFY',
      outcome: 'REJECTED',
      detail: `Rejected synthetic negative sample ${tpl.id}: ridge minutiae match ${baseScore}% below 85% threshold.`,
    });
    saveVaultState(vaultState);
    res.json({
      status: 'REJECTED',
      templateId: tpl.id,
      matchPercentage: baseScore,
      cipherVerified: 'AES-256-GCM + SHA-256 PASS',
      message: `Synthetic fingerprint rejected (${baseScore}% ridge match, threshold >= 85%). Verification denied and logged.`,
      auditEntry: vaultState.auditLog[vaultState.auditLog.length - 1],
    });
  });

  // 6. Read tamper-evident audit log
  app.get('/api/vault/audit', (req, res) => {
    const check = authenticateRequest(req);
    if (!check.ok || !check.session) {
      res.status(401).json({ error: check.message, code: check.code });
      return;
    }
    res.json({
      chainValid: verifyAuditChain(vaultState.auditLog),
      entries: [...vaultState.auditLog].reverse().slice(0, 40),
    });
  });

  // 7. Simulate ciphertext tamper (to prove pre-use integrity verification blocks tampered records)
  app.post('/api/vault/simulate-tamper', (req, res) => {
    const check = authenticateRequest(req);
    if (!check.ok || !check.session) {
      res.status(401).json({ error: check.message, code: check.code });
      return;
    }
    if (!AUTHORIZED_VAULT_ROLES.includes(check.session.role)) {
      res.status(403).json({ error: 'Unauthorized role.' });
      return;
    }

    const targetId = String(req.body?.templateId || 'tpl_investigator_valid');
    const tpl = vaultState.templates.find((t) => t.id === targetId);
    if (!tpl) {
      res.status(404).json({ error: 'Template not found.' });
      return;
    }

    tpl.tampered = true;
    tpl.ciphertextHex =
      (tpl.ciphertextHex.startsWith('ff') ? '00' : 'ff') + tpl.ciphertextHex.slice(2);
    tpl.updatedAt = new Date().toISOString();

    vaultState.auditLog = appendAuditEntry(vaultState.auditLog, {
      actor: check.session.displayName,
      role: check.session.role,
      action: 'SIMULATE_CIPHERTEXT_TAMPER',
      outcome: 'TAMPER_ALERT',
      detail: `Simulated unauthorized ciphertext modification on ${tpl.id}; pre-use integrity verification will now reject it until restored.`,
    });
    saveVaultState(vaultState);

    res.json({ ok: true, templateId: tpl.id });
  });

  // 8. Create encrypted backup snapshot
  app.post('/api/vault/backup', (req, res) => {
    const check = authenticateRequest(req);
    if (!check.ok || !check.session) {
      res.status(401).json({ error: check.message, code: check.code });
      return;
    }
    if (!AUTHORIZED_VAULT_ROLES.includes(check.session.role)) {
      res.status(403).json({ error: 'Unauthorized role.' });
      return;
    }
    if (vaultState.templates.some((t) => t.tampered)) {
      res.status(409).json({
        error: 'Cannot create backup while a template has failed integrity verification. Restore clean state first.',
      });
      return;
    }

    const backupId = `VLT-BK-${Date.now()}`;
    const body = JSON.stringify(vaultState.templates);
    const sig = crypto
      .createHmac('sha256', MASTER_KEK)
      .update(`${backupId}:${body}`)
      .digest('hex');

    vaultState.backups.push({
      backupId,
      createdAt: new Date().toISOString(),
      signatureHmac: sig,
      templates: JSON.parse(body) as EncryptedTemplateRecord[],
    });
    vaultState.auditLog = appendAuditEntry(vaultState.auditLog, {
      actor: check.session.displayName,
      role: check.session.role,
      action: 'ENCRYPTED_VAULT_BACKUP',
      outcome: 'SUCCESS',
      detail: `Signed encrypted backup snapshot ${backupId} created (${vaultState.templates.length} templates).`,
    });
    saveVaultState(vaultState);

    res.json({ ok: true, backupId });
  });

  // 9. Restore from signed encrypted backup
  app.post('/api/vault/restore', (req, res) => {
    const check = authenticateRequest(req);
    if (!check.ok || !check.session) {
      res.status(401).json({ error: check.message, code: check.code });
      return;
    }
    if (!AUTHORIZED_VAULT_ROLES.includes(check.session.role)) {
      res.status(403).json({ error: 'Unauthorized role.' });
      return;
    }

    const latest = vaultState.backups[vaultState.backups.length - 1];
    if (!latest) {
      res.status(404).json({ error: 'No backup snapshot available.' });
      return;
    }

    const body = JSON.stringify(latest.templates);
    const expectedSig = crypto
      .createHmac('sha256', MASTER_KEK)
      .update(`${latest.backupId}:${body}`)
      .digest('hex');
    if (expectedSig !== latest.signatureHmac) {
      res.status(409).json({ error: 'Backup HMAC signature mismatch.' });
      return;
    }

    vaultState.templates = JSON.parse(body) as EncryptedTemplateRecord[];
    vaultState.auditLog = appendAuditEntry(vaultState.auditLog, {
      actor: check.session.displayName,
      role: check.session.role,
      action: 'ENCRYPTED_VAULT_RESTORE',
      outcome: 'SUCCESS',
      detail: `Restored clean AES-256-GCM templates from signed backup ${latest.backupId}.`,
    });
    saveVaultState(vaultState);

    res.json({ ok: true, backupId: latest.backupId });
  });

  // 10. Reset Demo Vault & Audit Trail
  app.post('/api/vault/reset', (_req, res) => {
    sessions.clear();
    vaultState = createInitialVaultState();
    saveVaultState(vaultState);
    res.json({ ok: true });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TRUSTLOCK server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start TRUSTLOCK server:', err);
  process.exit(1);
});
