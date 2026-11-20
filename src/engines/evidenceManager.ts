import {
  E01_HISTORICAL_LOGS,
  E02_E05_AUDIT_RECORDS,
  E15_NETWORK_RECORDS,
  E17_IOCS,
  E18_API_LOGS,
  E19_BANK_CHANGES,
  EVIDENCE_CATALOG,
  VENDOR_PERMISSIONS,
  WORLD_CLUES,
} from '../data/caseData';
import {
  ApiActivityRecord,
  BankChangeRecord,
  ClueId,
  DataValidationIssue,
  EvidenceCode,
  EvidencePackageItem,
  UploadedEvidenceFile,
} from '../types/game';

export function getUnlockedEvidenceCodes(discoveredClues: ClueId[]): Set<EvidenceCode> {
  const unlocked = new Set<EvidenceCode>();
  WORLD_CLUES.forEach((clue) => {
    if (discoveredClues.includes(clue.id)) {
      clue.unlocksCodes.forEach((c) => unlocked.add(c));
    }
  });
  return unlocked;
}

export function normalizeTimestamp(raw: unknown): { isoLabel: string; epochMs: number; valid: boolean } {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return { isoLabel: 'INVALID_TIMESTAMP', epochMs: 0, valid: false };
  }
  const str = String(raw).trim();
  if (!str) return { isoLabel: 'MISSING_TIMESTAMP', epochMs: 0, valid: false };

  const cleaned = str.replace(' UTC', 'Z').replace(' ', 'T');
  const parsed = Date.parse(cleaned.endsWith('Z') || cleaned.includes('+') ? cleaned : `${cleaned}Z`);
  if (Number.isNaN(parsed)) {
    const fallback = Date.parse(str);
    if (Number.isNaN(fallback)) {
      return { isoLabel: str, epochMs: 0, valid: false };
    }
    const d = new Date(fallback);
    return {
      isoLabel: d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      epochMs: fallback,
      valid: true,
    };
  }
  const d = new Date(parsed);
  return {
    isoLabel: d.toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
    epochMs: parsed,
    valid: true,
  };
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export interface ParsedUploadResult {
  fileSummary: UploadedEvidenceFile;
  apiRecords: ApiActivityRecord[];
  bankChanges: BankChangeRecord[];
}

export function parseEvidenceFile(filename: string, rawContent: string): ParsedUploadResult {
  const lowerName = filename.toLowerCase();
  const isJson =
    lowerName.endsWith('.json') || rawContent.trim().startsWith('[') || rawContent.trim().startsWith('{');
  const format: 'CSV' | 'JSON' = isJson ? 'JSON' : 'CSV';

  let rows: Record<string, unknown>[] = [];
  const missingWarnings: string[] = [];

  if (format === 'JSON') {
    const parsed = JSON.parse(rawContent);
    if (Array.isArray(parsed)) {
      rows = parsed.filter((r) => r && typeof r === 'object') as Record<string, unknown>[];
    } else if (parsed && typeof parsed === 'object') {
      const candidateArr = Object.values(parsed).find((v) => Array.isArray(v));
      if (Array.isArray(candidateArr)) {
        rows = candidateArr.filter((r) => r && typeof r === 'object') as Record<string, unknown>[];
      } else {
        rows = [parsed as Record<string, unknown>];
      }
    }
  } else {
    const lines = rawContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length >= 2) {
      const headers = parseCsvLine(lines[0]);
      for (let i = 1; i < lines.length; i++) {
        const vals = parseCsvLine(lines[i]);
        const obj: Record<string, unknown> = {};
        headers.forEach((h, idx) => {
          obj[h] = vals[idx] ?? '';
        });
        rows.push(obj);
      }
    }
  }

  const seen = new Set<string>();
  let duplicateCount = 0;
  const dedupedRows: Record<string, unknown>[] = [];
  rows.forEach((row, idx) => {
    const sig = JSON.stringify(row);
    if (seen.has(sig)) {
      duplicateCount++;
    } else {
      seen.add(sig);
      dedupedRows.push(row);
    }
    if (!row.timestamp && !row.ts && !row.time) {
      missingWarnings.push(`Row ${idx + 1}: missing timestamp field`);
    }
  });

  const sampleKeys = new Set<string>(dedupedRows.flatMap((r) => Object.keys(r).map((k) => k.toLowerCase())));
  let detectedType: EvidenceCode | 'GENERIC' = 'GENERIC';
  if (sampleKeys.has('new_bank_acct') || sampleKeys.has('approval_ref') || sampleKeys.has('change_id')) {
    detectedType = 'E19';
  } else if (sampleKeys.has('endpoint') && sampleKeys.has('request_id')) {
    detectedType = lowerName.includes('e01') || lowerName.includes('hist') ? 'E01' : 'E18';
  } else if (sampleKeys.has('src_ip') && sampleKeys.has('tls_ja3')) {
    detectedType = 'E15';
  } else if (sampleKeys.has('indicator') && sampleKeys.has('ioc_id')) {
    detectedType = 'E17';
  }

  const apiRecords: ApiActivityRecord[] = [];
  const bankChanges: BankChangeRecord[] = [];

  dedupedRows.forEach((row, idx) => {
    const tsInfo = normalizeTimestamp(row.timestamp ?? row.ts ?? row.time ?? '');
    if (!tsInfo.valid) {
      missingWarnings.push(`Row ${idx + 1}: invalid or unparseable timestamp`);
    }

    if (detectedType === 'E19') {
      const approvalRaw = row.approval_ref;
      const approvalStr =
        approvalRaw === null || approvalRaw === undefined || String(approvalRaw).trim() === ''
          ? null
          : String(approvalRaw).trim();
      if (!approvalStr) {
        missingWarnings.push(
          `Row ${idx + 1} (${String(row.change_id ?? row.request_id ?? 'N/A')}): missing approval_ref`
        );
      }
      const channelRaw = String(row.channel ?? 'API_GATEWAY').toUpperCase();
      const channel: BankChangeRecord['channel'] =
        channelRaw === 'ERP_PORTAL' ? 'ERP_PORTAL' : channelRaw === 'API_GATEWAY' ? 'API_GATEWAY' : 'UNKNOWN';

      bankChanges.push({
        change_id: String(row.change_id ?? `UP-CHG-${idx + 1}`),
        sourceEvidence: 'UPLOADED',
        timestamp: tsInfo.isoLabel,
        normalizedTs: tsInfo.epochMs,
        request_id: String(row.request_id ?? ''),
        vendor_payee: String(row.vendor_payee ?? row.vendor ?? 'Unknown Vendor'),
        previous_bank_acct: String(row.previous_bank_acct ?? 'N/A'),
        new_bank_acct: String(row.new_bank_acct ?? 'N/A'),
        new_ifsc_swift: String(row.new_ifsc_swift ?? 'N/A'),
        changed_by: String(row.changed_by ?? row.initiated_by ?? row.actor ?? 'unknown'),
        channel,
        approval_ref: approvalStr,
        change_status: approvalStr ? 'APPLIED' : 'FLAGGED',
        notes: String(row.notes ?? 'Imported via CYBERQUEST Evidence Collector'),
        rawRecord: row,
      });
    } else if (detectedType === 'E18' || detectedType === 'E01') {
      const methodRaw = String(row.method ?? 'GET').toUpperCase();
      const method = (['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(methodRaw)
        ? methodRaw
        : 'GET') as ApiActivityRecord['method'];
      apiRecords.push({
        id: String(row.id ?? `UP-API-${idx + 1}`),
        sourceEvidence: 'UPLOADED',
        timestamp: tsInfo.isoLabel,
        normalizedTs: tsInfo.epochMs,
        request_id: String(row.request_id ?? `up-req-${idx + 1}`),
        vendor: String(row.vendor ?? 'TallyBridge'),
        api_key_id: String(row.api_key_id ?? 'ak_tb_prod_0419'),
        service_account: String(row.service_account ?? 'svc-tallybridge-sync'),
        source_ip: String(row.source_ip ?? '0.0.0.0'),
        user_agent: String(row.user_agent ?? 'unknown-client'),
        method,
        endpoint: String(row.endpoint ?? '/'),
        http_status: Number(row.http_status ?? 200),
        bytes_out: Number(row.bytes_out ?? 0),
        latency_ms: Number(row.latency_ms ?? 0),
        rawRecord: row,
      });
    }
  });

  const fileSummary: UploadedEvidenceFile = {
    id: `file-${Date.now()}`,
    filename,
    format,
    detectedType,
    totalRows: rows.length,
    validRows: dedupedRows.length,
    duplicateCount,
    missingFieldWarnings: missingWarnings.slice(0, 12),
    uploadedAt: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
    rawPreview: dedupedRows.slice(0, 20),
  };

  return { fileSummary, apiRecords, bankChanges };
}

export function runDataValidation(
  discoveredClues: ClueId[],
  uploadedFiles: UploadedEvidenceFile[],
  uploadedBankChanges: BankChangeRecord[]
): DataValidationIssue[] {
  const unlocked = getUnlockedEvidenceCodes(discoveredClues);
  const issues: DataValidationIssue[] = [];

  if (unlocked.has('E19')) {
    E19_BANK_CHANGES.forEach((chg) => {
      if (!chg.approval_ref || chg.approval_ref.trim() === '') {
        issues.push({
          id: `val-${chg.change_id}-approval`,
          evidenceCode: 'E19',
          issueType: 'MISSING_FIELD',
          recordRef: `${chg.change_id} (${chg.request_id})`,
          detail: `approval_ref is ${chg.approval_ref === null ? 'NULL' : 'blank string'} on ${chg.vendor_payee} (${chg.channel}); raw record preserved without silent imputation.`,
          severity: 'ERROR',
        });
      }
    });
  }

  if (unlocked.has('E02')) {
    issues.push({
      id: 'val-e02-tz',
      evidenceCode: 'E02',
      issueType: 'FORMAT_MISMATCH',
      recordRef: 'AUD-814..AUD-905',
      detail: 'Facility & portal logs use local IST (+05:30) strings rather than ISO UTC; requires Step 3 timezone conversion.',
      severity: 'WARNING',
    });
  }

  if (unlocked.has('E05')) {
    issues.push({
      id: 'val-e05-epoch-drift',
      evidenceCode: 'E05',
      issueType: 'INVALID_TIMESTAMP',
      recordRef: 'IAM-501 (1795054481)',
      detail: 'IAM auth daemon emits raw Unix epoch seconds with ~+42s NTP drift relative to E03 UTC anchors; exact second offset uncertain.',
      severity: 'WARNING',
    });
  }

  if (unlocked.has('E04') && unlocked.has('E14')) {
    issues.push({
      id: 'val-e04-unclosed-role',
      evidenceCode: 'E04',
      issueType: 'MISSING_IDENTIFIER',
      recordRef: 'ROLE_ERP_EMERGENCY_ADMIN',
      detail: 'Q2 emergency ticket E14 lacks a closure sign-off timestamp, leaving elevated payment_instructions:write scope bound.',
      severity: 'WARNING',
    });
  }

  uploadedFiles.forEach((uf) => {
    if (uf.duplicateCount > 0) {
      issues.push({
        id: `val-up-dup-${uf.id}`,
        evidenceCode: 'UPLOADED',
        issueType: 'DUPLICATE',
        recordRef: uf.filename,
        detail: `Detected and deduplicated ${uf.duplicateCount} exact duplicate row(s) during ingestion.`,
        severity: 'WARNING',
      });
    }
    uf.missingFieldWarnings.forEach((w, idx) => {
      issues.push({
        id: `val-up-warn-${uf.id}-${idx}`,
        evidenceCode: 'UPLOADED',
        issueType: 'MISSING_FIELD',
        recordRef: uf.filename,
        detail: w,
        severity: 'WARNING',
      });
    });
  });

  uploadedBankChanges.forEach((chg) => {
    if (!chg.approval_ref) {
      issues.push({
        id: `val-up-bank-${chg.change_id}`,
        evidenceCode: 'UPLOADED',
        issueType: 'MISSING_FIELD',
        recordRef: chg.change_id,
        detail: `Uploaded bank change ${chg.change_id} lacks approval_ref.`,
        severity: 'ERROR',
      });
    }
  });

  return issues;
}

export function buildEvidenceInventory(
  discoveredClues: ClueId[],
  uploadedApiCount: number,
  uploadedBankCount: number
): { unlocked: EvidencePackageItem[]; lockedCodes: EvidenceCode[] } {
  const unlockedCodes = getUnlockedEvidenceCodes(discoveredClues);
  const allCodes = Object.keys(EVIDENCE_CATALOG) as EvidenceCode[];
  const unlocked: EvidencePackageItem[] = [];
  const lockedCodes: EvidenceCode[] = [];

  const counts: Record<EvidenceCode, { count: number; missing: number }> = {
    E01: { count: E01_HISTORICAL_LOGS.length, missing: 0 },
    E02: { count: E02_E05_AUDIT_RECORDS.filter((r) => r.source === 'E02').length, missing: 0 },
    E03: { count: 4, missing: 0 },
    E04: { count: VENDOR_PERMISSIONS.length, missing: 0 },
    E05: { count: E02_E05_AUDIT_RECORDS.filter((r) => r.source === 'E05').length, missing: 1 },
    E06: { count: 6, missing: 0 },
    E07: { count: 1, missing: 0 },
    E08: { count: 2, missing: 0 },
    E09: { count: 1, missing: 0 },
    E10: { count: 3, missing: 0 },
    E11: { count: 2, missing: 0 },
    E12: { count: 1, missing: 0 },
    E13: { count: 4, missing: 0 },
    E14: { count: 1, missing: 1 },
    E15: { count: E15_NETWORK_RECORDS.length, missing: 0 },
    E16: { count: 1, missing: 0 },
    E17: { count: E17_IOCS.length, missing: 0 },
    E18: { count: E18_API_LOGS.length + uploadedApiCount, missing: 0 },
    E19: {
      count: E19_BANK_CHANGES.length + uploadedBankCount,
      missing: E19_BANK_CHANGES.filter((r) => !r.approval_ref).length,
    },
    E20: { count: 1, missing: 0 },
  };

  allCodes.forEach((code) => {
    if (unlockedCodes.has(code)) {
      const meta = EVIDENCE_CATALOG[code];
      const missingCount = counts[code].missing;
      unlocked.push({
        code,
        name: meta.name,
        sourceSystem: meta.sourceSystem,
        fileName: meta.fileName,
        category: meta.category,
        description: meta.description,
        recordCount: counts[code].count,
        missingFieldsCount: missingCount,
        duplicateCount: 0,
        validationStatus: missingCount > 0 ? 'WARNINGS' : 'VALID',
        sourceFormat: meta.format,
      });
    } else {
      lockedCodes.push(code);
    }
  });

  return { unlocked, lockedCodes };
}
