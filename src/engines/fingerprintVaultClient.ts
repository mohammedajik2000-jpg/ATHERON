export type VaultOperatorPreset =
  | 'investigator'
  | 'finance_officer'
  | 'soc_analyst'
  | 'contractor';

export interface VaultSessionInfo {
  sessionId: string;
  operatorId: string;
  displayName: string;
  role: string;
  clearance: string;
  authorizedForVault: boolean;
  issuedAt: number;
  expiresAt: number;
}

export interface VaultTemplateMeta {
  id: string;
  label: string;
  ownerName: string;
  roleRequired: string;
  clearance: string;
  syntheticBadge: string;
  cipherAlgorithm: string;
  dekId: string;
  ivPreview: string;
  authTagPreview: string;
  ciphertextHashPrefix: string;
  tampered: boolean;
  updatedAt: string;
}

export interface VaultAuditEntry {
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

export interface VaultStatusResponse {
  demoDisclaimer: string;
  encryption: {
    algorithm: string;
    keyManagement: string;
    keyExposedToFrontend: boolean;
    plaintextAtRest: boolean;
    keyRotatedAt: string;
  };
  integrity: {
    auditChainValid: boolean;
    auditEntriesCount: number;
    allTemplatesIntact: boolean;
    tamperedTemplateIds: string[];
  };
  backup: {
    backupId: string;
    createdAt: string;
    hmacPrefix: string;
    templateCount: number;
  } | null;
  session: {
    active: boolean;
    displayName?: string;
    role?: string;
    clearance?: string;
    authorizedForVault?: boolean;
    expiresAt?: number;
    code?: string;
  };
  templates: VaultTemplateMeta[];
}

export interface VaultScanResponse {
  status: 'VERIFIED' | 'REJECTED' | 'ACCESS_DENIED' | 'INTEGRITY_FAILED';
  templateId?: string;
  matchPercentage: number;
  cipherVerified?: string;
  message: string;
  auditEntry?: VaultAuditEntry;
}

const TOKEN_KEY = 'trustlock_vault_session_token_v1';

export function getStoredVaultToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredVaultToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage restriction
  }
}

function authHeaders(token: string | null): HeadersInit {
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

export async function startVaultSession(
  operatorKey: VaultOperatorPreset
): Promise<{ token: string; session: VaultSessionInfo }> {
  const res = await fetch('/api/vault/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operatorKey }),
  });
  if (!res.ok) {
    throw new Error('Unable to start authenticated vault session.');
  }
  const data = (await res.json()) as { token: string; session: VaultSessionInfo };
  setStoredVaultToken(data.token);
  return data;
}

export async function logoutVaultSession(token: string | null): Promise<void> {
  await fetch('/api/vault/auth/logout', {
    method: 'POST',
    headers: authHeaders(token),
  });
  setStoredVaultToken(null);
}

export async function expireVaultSessionNow(token: string | null): Promise<string> {
  const res = await fetch('/api/vault/auth/expire-now', {
    method: 'POST',
    headers: authHeaders(token),
  });
  setStoredVaultToken(null);
  const data = (await res.json()) as { error?: string };
  return data.error || 'Session timed out.';
}

export async function fetchVaultStatus(token: string | null): Promise<VaultStatusResponse> {
  const res = await fetch('/api/vault/status', {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error('Failed to load security storage status.');
  }
  return (await res.json()) as VaultStatusResponse;
}

export async function runVaultScan(
  token: string | null,
  templateId: string
): Promise<{ httpStatus: number; data: VaultScanResponse }> {
  const res = await fetch('/api/vault/scan', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ templateId }),
  });
  const data = (await res.json()) as VaultScanResponse & { error?: string };
  if (res.status === 401) {
    setStoredVaultToken(null);
    return {
      httpStatus: 401,
      data: {
        status: 'ACCESS_DENIED',
        matchPercentage: 0,
        message: data.error || 'Session expired. Please sign in again.',
      },
    };
  }
  return { httpStatus: res.status, data };
}

export async function fetchVaultAuditLog(
  token: string | null
): Promise<{ chainValid: boolean; entries: VaultAuditEntry[] } | null> {
  const res = await fetch('/api/vault/audit', {
    headers: authHeaders(token),
  });
  if (!res.ok) return null;
  return (await res.json()) as { chainValid: boolean; entries: VaultAuditEntry[] };
}

export async function simulateVaultTamper(
  token: string | null,
  templateId = 'tpl_investigator_valid'
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch('/api/vault/simulate-tamper', {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ templateId }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  return { ok: res.ok && Boolean(data.ok), error: data.error };
}

export async function createVaultBackup(
  token: string | null
): Promise<{ ok: boolean; backupId?: string; error?: string }> {
  const res = await fetch('/api/vault/backup', {
    method: 'POST',
    headers: authHeaders(token),
  });
  const data = (await res.json()) as { ok?: boolean; backupId?: string; error?: string };
  return { ok: res.ok && Boolean(data.ok), backupId: data.backupId, error: data.error };
}

export async function restoreVaultBackup(
  token: string | null
): Promise<{ ok: boolean; backupId?: string; error?: string }> {
  const res = await fetch('/api/vault/restore', {
    method: 'POST',
    headers: authHeaders(token),
  });
  const data = (await res.json()) as { ok?: boolean; backupId?: string; error?: string };
  return { ok: res.ok && Boolean(data.ok), backupId: data.backupId, error: data.error };
}

export async function resetVaultDemo(): Promise<void> {
  await fetch('/api/vault/reset', { method: 'POST' });
  setStoredVaultToken(null);
}
