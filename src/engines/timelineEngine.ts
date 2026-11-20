import {
  E02_E05_AUDIT_RECORDS,
  E15_NETWORK_RECORDS,
  E18_API_LOGS,
  E19_BANK_CHANGES,
} from '../data/caseData';
import {
  ApiActivityRecord,
  BankChangeRecord,
  ClueId,
  TimelineEvent,
} from '../types/game';
import { getUnlockedEvidenceCodes } from './evidenceManager';

export function buildAutoTimeline(
  discoveredClues: ClueId[],
  uploadedApiRecords: ApiActivityRecord[],
  uploadedBankChanges: BankChangeRecord[]
): TimelineEvent[] {
  const unlocked = getUnlockedEvidenceCodes(discoveredClues);
  const events: TimelineEvent[] = [];

  E02_E05_AUDIT_RECORDS.forEach((aud) => {
    if (!unlocked.has(aud.source)) return;
    const isDrift = aud.timezoneSource === 'UNIX_DRIFT';
    events.push({
      id: `tl-${aud.audit_id}`,
      timestamp: aud.timestamp,
      normalizedTs: aud.normalizedTs,
      sourceCode: aud.source,
      sourceSystem:
        aud.source === 'E05'
          ? 'IAM Auth Daemon (Unix Drift)'
          : aud.source === 'E09'
          ? 'HR Offboarding Register'
          : aud.source === 'E14'
          ? 'IT Change Management'
          : 'Reception & ERP Audit (IST)',
      actorOrCredential: aud.actor,
      title: `${aud.action}`,
      detail: `${aud.target} — Outcome: ${aud.outcome}`,
      severity:
        aud.action === 'OAUTH_TOKEN_ISSUED' || aud.action === 'BANK_MASTER_DIFF_ALERT'
          ? 'SUSPICIOUS'
          : 'NORMAL',
      confidence: isDrift ? 'UNCERTAIN_OFFSET' : 'HIGH',
      uncertaintyNote: isDrift
        ? 'E05 Unix epoch clock exhibits ~+42s NTP drift vs E03; sub-minute ordering is approximate.'
        : undefined,
      linkedIds: [aud.audit_id],
    });
  });

  if (unlocked.has('E15')) {
    E15_NETWORK_RECORDS.forEach((net) => {
      const isAnom = net.src_ip !== '203.0.113.42';
      events.push({
        id: `tl-${net.flow_id}`,
        timestamp: net.timestamp,
        normalizedTs: net.normalizedTs,
        sourceCode: 'E15',
        sourceSystem: 'Edge Perimeter NetFlow',
        actorOrCredential: `${net.src_ip} (${net.network_label})`,
        title: `TLS 1.3 Flow from ${net.src_ip}`,
        detail: `Port ${net.dst_port} · JA3 ${net.tls_ja3.slice(0, 12)}... · RX ${(net.bytes_rx / 1024).toFixed(1)} KB`,
        severity: isAnom ? 'SUSPICIOUS' : 'NORMAL',
        confidence: 'HIGH',
        linkedIds: [net.flow_id, net.src_ip],
      });
    });
  }

  const apiRecords = [
    ...(unlocked.has('E18') ? E18_API_LOGS : []),
    ...uploadedApiRecords,
  ];
  apiRecords.forEach((api) => {
    const isCrit = api.method === 'POST' && api.vendor === 'TallyBridge';
    const isSusp = api.source_ip === '185.220.101.47' || api.bytes_out > 500000;
    events.push({
      id: `tl-${api.id}`,
      timestamp: api.timestamp,
      normalizedTs: api.normalizedTs,
      sourceCode: api.sourceEvidence === 'UPLOADED' ? 'UPLOADED' : 'E18',
      sourceSystem: 'API Gateway Live Capture',
      actorOrCredential: `${api.service_account} (${api.api_key_id})`,
      title: `API ${api.method} ${api.endpoint}`,
      detail: `request_id=${api.request_id} · IP ${api.source_ip} · UA ${api.user_agent} · ${api.bytes_out.toLocaleString()} bytes`,
      severity: isCrit ? 'CRITICAL' : isSusp ? 'SUSPICIOUS' : 'NORMAL',
      confidence: 'HIGH',
      linkedIds: [api.id, api.request_id],
    });
  });

  const bankRecords = [
    ...(unlocked.has('E19') ? E19_BANK_CHANGES : []),
    ...uploadedBankChanges,
  ];
  bankRecords.forEach((chg) => {
    const missingRef = !chg.approval_ref || chg.approval_ref.trim() === '';
    events.push({
      id: `tl-${chg.change_id}`,
      timestamp: chg.timestamp,
      normalizedTs: chg.normalizedTs,
      sourceCode: chg.sourceEvidence === 'UPLOADED' ? 'UPLOADED' : 'E19',
      sourceSystem: `Finance ERP (${chg.channel})`,
      actorOrCredential: chg.changed_by,
      title: `Bank Change ${chg.change_id}: ${chg.vendor_payee}`,
      detail: `${chg.previous_bank_acct} -> ${chg.new_bank_acct} (${chg.new_ifsc_swift}) · request_id=${chg.request_id} · approval_ref=${chg.approval_ref ?? 'MISSING'}`,
      severity: missingRef ? 'CRITICAL' : 'NORMAL',
      confidence: 'HIGH',
      linkedIds: [chg.change_id, chg.request_id],
    });
  });

  return events.sort((a, b) => a.normalizedTs - b.normalizedTs);
}
