import {
  E15_NETWORK_RECORDS,
  E17_IOCS,
  E18_API_LOGS,
  E19_BANK_CHANGES,
} from '../data/caseData';
import {
  ApiActivityRecord,
  BankChangeRecord,
  ClueId,
  CorrelationMatch,
} from '../types/game';
import { getUnlockedEvidenceCodes } from './evidenceManager';

export function runCrossSystemCorrelation(
  discoveredClues: ClueId[],
  uploadedApiRecords: ApiActivityRecord[],
  uploadedBankChanges: BankChangeRecord[]
): CorrelationMatch[] {
  const unlocked = getUnlockedEvidenceCodes(discoveredClues);
  const e18List: ApiActivityRecord[] = [
    ...(unlocked.has('E18') ? E18_API_LOGS : []),
    ...uploadedApiRecords,
  ];
  const e19List: BankChangeRecord[] = [
    ...(unlocked.has('E19') ? E19_BANK_CHANGES : []),
    ...uploadedBankChanges,
  ];

  const e15List = unlocked.has('E15') ? E15_NETWORK_RECORDS : [];
  const e17List = unlocked.has('E17') ? E17_IOCS : [];

  const e18ByReq = new Map<string, ApiActivityRecord>();
  e18List.forEach((rec) => {
    if (rec.request_id) e18ByReq.set(rec.request_id, rec);
  });

  const e19ByReq = new Map<string, BankChangeRecord>();
  e19List.forEach((rec) => {
    if (rec.request_id) e19ByReq.set(rec.request_id, rec);
  });

  const allReqIds = Array.from(new Set([...e18ByReq.keys(), ...e19ByReq.keys()]));
  const matches: CorrelationMatch[] = [];

  allReqIds.forEach((reqId) => {
    const e18 = e18ByReq.get(reqId) ?? null;
    const e19 = e19ByReq.get(reqId) ?? null;

    const isRelevant =
      (e18 && e19) ||
      (e19 && !e19.approval_ref) ||
      (e18 && (e18.method === 'POST' || e18.source_ip === '185.220.101.47'));

    if (!isRelevant) return;

    const e15Matches = e18
      ? e15List.filter((flow) => flow.src_ip === e18.source_ip)
      : [];
    const iocMatches = e17List.filter(
      (ioc) =>
        (e18 && (ioc.indicator === e18.source_ip || ioc.indicator === e18.user_agent)) ||
        (e19 && ioc.indicator === e19.new_ifsc_swift) ||
        e15Matches.some((f) => f.tls_ja3 === ioc.indicator)
    );

    const missingApprovalRef = Boolean(e19 && (!e19.approval_ref || e19.approval_ref.trim() === ''));

    let status: CorrelationMatch['status'] = 'MATCHED_COMPLETE';
    let explanation = '';
    if (e18 && e19) {
      status = 'MATCHED_COMPLETE';
      explanation = `API Gateway call ${e18.id} (${e18.method} ${e18.endpoint}, key=${e18.api_key_id}, IP=${e18.source_ip}) matches Finance Bank-Detail Change ${e19.change_id} (${e19.vendor_payee} -> ${e19.new_bank_acct}, channel=${e19.channel}, changed_by=${e19.changed_by}) via request_id=${reqId}. ${
        missingApprovalRef
          ? 'CRITICAL: approval_ref is missing/blank.'
          : `Authorized under ${e19.approval_ref}.`
      }`;
    } else if (e18 && !e19) {
      status = 'PARTIAL_E18_ONLY';
      explanation = `API request ${e18.id} (${e18.endpoint}) observed in E18 with no corresponding E19 bank-detail change record.`;
    } else if (e19 && !e18) {
      status = 'PARTIAL_E19_ONLY';
      explanation = `Finance record ${e19.change_id} (changed_by=${e19.changed_by}, channel=${e19.channel}) has no matching E18 API call${
        unlocked.has('E18')
          ? ' (originated through internal ERP_PORTAL rather than API_GATEWAY).'
          : ' (E18 Gateway Dump not yet recovered).'
      }`;
    }

    matches.push({
      request_id: reqId,
      e18Record: e18,
      e19Record: e19,
      e15Matches,
      iocMatches,
      missingApprovalRef,
      status,
      explanation,
    });
  });

  return matches;
}
