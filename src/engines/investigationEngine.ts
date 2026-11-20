import {
  CASE_METADATA,
  E19_BANK_CHANGES,
  VENDOR_PERMISSIONS,
} from '../data/caseData';
import {
  AlternativeExplanationTest,
  ApiActivityRecord,
  BankChangeRecord,
  ClueId,
  CorrelationMatch,
  InvestigationFinding,
  VendorFingerprint,
} from '../types/game';
import { getUnlockedEvidenceCodes } from './evidenceManager';

export interface EpistemicAssessment {
  reasoningChain: { step: string; status: 'READY' | 'PENDING'; evidence: string }[];
  findings: InvestigationFinding[];
  confirmedFacts: string[];
  suspiciousObservations: string[];
  reasonableInferences: string[];
  alternativeTests: AlternativeExplanationTest[];
  unresolvedQuestions: string[];
}

export function buildInvestigationAssessment(
  discoveredClues: ClueId[],
  fingerprint: VendorFingerprint | null,
  correlations: CorrelationMatch[],
  uploadedApiRecords: ApiActivityRecord[],
  uploadedBankChanges: BankChangeRecord[]
): EpistemicAssessment {
  const unlocked = getUnlockedEvidenceCodes(discoveredClues);
  const findings: InvestigationFinding[] = [];

  const bankRecords = [
    ...(unlocked.has('E19') ? E19_BANK_CHANGES : []),
    ...uploadedBankChanges,
  ];
  const missingApprovalChanges = bankRecords.filter(
    (b) => !b.approval_ref || b.approval_ref.trim() === ''
  );
  const completeAnomalousCorrelations = correlations.filter(
    (c) => c.status === 'MATCHED_COMPLETE' && c.missingApprovalRef
  );
  const excessivePerms = unlocked.has('E04')
    ? VENDOR_PERMISSIONS.filter((p) => !p.authorized && p.granted)
    : [];

  if (unlocked.has('E01')) {
    findings.push({
      id: 'FND-01',
      title: 'TallyBridge Historical Baseline Synchronisation Pattern',
      severity: 'NORMAL',
      category: 'Behavioural',
      epistemicLayer: 'Confirmed Fact',
      summary:
        'Historical logs (E01) show svc-tallybridge-sync consistently operates via GET /invoices and GET /freight-orders from IP 203.0.113.42 between 04:10 and 12:05 UTC.',
      supportingEvidence: ['E01-001..E01-008'],
      recommendedAction: 'Retain baseline profile as approved operational benchmark.',
    });
  }

  if (excessivePerms.length > 0) {
    findings.push({
      id: 'FND-02',
      title: 'Over-Privileged Legacy Role Bound to TallyBridge Account',
      severity: 'CRITICAL',
      category: 'Permissions',
      epistemicLayer: 'Confirmed Fact',
      summary: `E04 & E14 reveal ROLE_ERP_EMERGENCY_ADMIN remained attached to svc-tallybridge-sync, granting unauthorized scopes (${excessivePerms.map((p) => p.scope).join(', ')}) outside E07/E08 contract terms.`,
      supportingEvidence: ['E04', 'E07', 'E08', 'E14 (AUD-814)'],
      recommendedAction:
        'Strip ROLE_ERP_EMERGENCY_ADMIN immediately and enforce least-privilege read scopes.',
    });
  }

  if (fingerprint && fingerprint.deviations.some((d) => d.id === 'dev_unseen_ip')) {
    findings.push({
      id: 'FND-03',
      title: 'Off-Hours API Activity from Unlisted External IP Matching E17 IOC',
      severity: 'SUSPICIOUS',
      category: 'Network',
      epistemicLayer: 'Suspicious Observation',
      summary: `Between 02:14 and 02:44 UTC, ak_tb_prod_0419 authenticated from unlisted IP ${CASE_METADATA.rogueIp} (AS205100) using python-requests/2.31.0, matching E17 Threat Intelligence indicators.`,
      supportingEvidence: ['E15 (NET-502, NET-503)', 'E17 (IOC-01..03)', 'E18-103..E18-107'],
      recommendedAction: 'Block 185.220.101.47 at the API Gateway and rotate ak_tb_prod_0419.',
    });
  }

  if (completeAnomalousCorrelations.length > 0) {
    findings.push({
      id: 'FND-04',
      title: 'Correlated API Write Calls & Unapproved Vendor Bank-Detail Changes',
      severity: 'CRITICAL',
      category: 'Correlation',
      epistemicLayer: 'Confirmed Fact',
      summary: `Cross-system request_id correlation directly links ${completeAnomalousCorrelations.length} E18 POST /vendors/bank-details/update calls to E19 vendor payment-instruction changes (${completeAnomalousCorrelations.map((c) => c.e19Record?.change_id).join(', ')}) where approval_ref is missing/blank.`,
      supportingEvidence: completeAnomalousCorrelations.map(
        (c) => `${c.e18Record?.id} <-> ${c.e19Record?.change_id} (${c.request_id})`
      ),
      recommendedAction:
        'Quarantine CHG-401, CHG-402, and CHG-403, freeze settlements to CYPRCY2NXXX, and enforce mandatory approval_ref validation.',
    });
  } else if (missingApprovalChanges.length > 0) {
    findings.push({
      id: 'FND-04B',
      title: 'Vendor Bank-Detail Changes Applied Without approval_ref',
      severity: 'CRITICAL',
      category: 'Governance',
      epistemicLayer: 'Confirmed Fact',
      summary: `Finance E19 contains ${missingApprovalChanges.length} bank-detail changes (${missingApprovalChanges.map((m) => m.change_id).join(', ')}) with NULL or blank approval_ref.`,
      supportingEvidence: missingApprovalChanges.map((m) => `${m.change_id} (${m.request_id})`),
      recommendedAction: 'Correlate against E18 API Gateway records to identify initiation channel.',
    });
  }

  if (fingerprint && fingerprint.deviations.some((d) => d.id === 'dev_bulk_transfer')) {
    findings.push({
      id: 'FND-05',
      title: 'Off-Hours Full Invoice Archive Export (1.84 MB)',
      severity: 'SUSPICIOUS',
      category: 'Behavioural',
      epistemicLayer: 'Suspicious Observation',
      summary:
        'E18-107 / E06 records a 1.84 MB full invoice export at 02:44 UTC from 185.220.101.47 — roughly 40x the normal Friday 11:00 UTC ~50 KB scheduled export.',
      supportingEvidence: ['E18-107 (req-9f4a-889f)', 'E06', 'NET-503 (E15)'],
      recommendedAction: 'Assess invoice data exposure scope and notify compliance teams.',
    });
  }

  if (unlocked.has('E19') && (unlocked.has('E11') || unlocked.has('E18'))) {
    findings.push({
      id: 'FND-06',
      title: 'Legitimate Daytime Finance Cleanup Properly Authorized',
      severity: 'NORMAL',
      category: 'Governance',
      epistemicLayer: 'Confirmed Fact',
      summary:
        'Daytime E11 changes CHG-398, CHG-399, and CHG-404 include valid APR-2026 approval references and originated via internal ERP_PORTAL or FinPay clearing.',
      supportingEvidence: ['CHG-398 (APR-2026-4418)', 'CHG-399 (APR-2026-4421)', 'CHG-404 (APR-2026-4429)'],
      recommendedAction: 'No containment needed on verified APR-2026-approved entries.',
    });
  }

  const reasoningChain: EpistemicAssessment['reasoningChain'] = [
    {
      step: '1. Unusual API Activity (Off-Hours, Unlisted IP & Scripted User-Agent)',
      status: fingerprint && fingerprint.deviations.length > 0 ? 'READY' : 'PENDING',
      evidence: unlocked.has('E18') ? 'E01 vs E18 (req-9f4a-880f..889f)' : 'Requires E18 in Server Room',
    },
    {
      step: '2. Unauthorized Vendor Bank Write Operations',
      status:
        (unlocked.has('E18') || uploadedApiRecords.length > 0) && unlocked.has('E04')
          ? 'READY'
          : 'PENDING',
      evidence: unlocked.has('E04') ? 'E04/E14 (ROLE_ERP_EMERGENCY_ADMIN) + E18 POST calls' : 'Requires E04 & E18',
    },
    {
      step: '3. Matching request_id in Vendor Bank-Detail Change Record (E19)',
      status: completeAnomalousCorrelations.length > 0 ? 'READY' : 'PENDING',
      evidence:
        completeAnomalousCorrelations.length > 0
          ? completeAnomalousCorrelations.map((c) => c.request_id).join(', ')
          : 'Requires E18 & E19 correlation',
    },
    {
      step: '4. Missing / Blank approval_ref Governance Bypass',
      status: missingApprovalChanges.length > 0 ? 'READY' : 'PENDING',
      evidence:
        missingApprovalChanges.length > 0
          ? missingApprovalChanges.map((m) => m.change_id).join(', ')
          : 'Requires E19 Finance Ledger',
    },
    {
      step: '5. Related Network Activity & IOC Match (E15 / E17 / E12-E16)',
      status: unlocked.has('E15') && unlocked.has('E17') ? 'READY' : 'PENDING',
      evidence: unlocked.has('E15') ? '185.220.101.47 · JA3 72a589da...' : 'Requires E15 & E17 in Server Room',
    },
    {
      step: '6. Alternative Explanations Tested & Human Investigator Review',
      status: completeAnomalousCorrelations.length > 0 ? 'READY' : 'PENDING',
      evidence: '4 hypotheses evaluated against E02/E06/E09/E10/E11/E13/E18/E19',
    },
  ];

  const confirmedFacts: string[] = [];
  if (unlocked.has('E02') && unlocked.has('E09')) {
    confirmedFacts.push(
      'E02 & E09 confirm Rohan Menon’s physical badge and corporate SSO credentials were deactivated on Oct 14, with zero overnight building entries.'
    );
  }
  if (unlocked.has('E04') && (unlocked.has('E07') || unlocked.has('E08'))) {
    confirmedFacts.push(
      'E07/E08 restricts TallyBridge to read/sync scopes from 203.0.113.42, while E04/E14 confirm ROLE_ERP_EMERGENCY_ADMIN remained bound to svc-tallybridge-sync.'
    );
  }
  if (completeAnomalousCorrelations.length > 0) {
    confirmedFacts.push(
      `E18 and E19 share exact request_id keys (${completeAnomalousCorrelations.map((c) => c.request_id).join(', ')}) linking API Gateway calls from 185.220.101.47 to CHG-401, CHG-402, and CHG-403.`
    );
  }
  if (missingApprovalChanges.length > 0) {
    confirmedFacts.push(
      `E19 records ${missingApprovalChanges.map((m) => m.change_id).join(', ')} contain NULL or blank approval_ref fields and point to SWIFT BIC CYPRCY2NXXX.`
    );
  }

  const suspiciousObservations: string[] = [];
  if (unlocked.has('E15') && unlocked.has('E17')) {
    suspiciousObservations.push(
      'External IP 185.220.101.47 (AS205100), TLS JA3 72a589da586844d7f0818ce684948eea, and python-requests/2.31.0 match E17 Threat Intelligence indicators.'
    );
  }
  if (unlocked.has('E06') || unlocked.has('E18')) {
    suspiciousObservations.push(
      'Off-hours 02:44 UTC session exported 1.84 MB of invoice archive data (~40x the normal Friday 11:00 UTC ~50 KB scheduled export).'
    );
  }
  if (unlocked.has('E05')) {
    suspiciousObservations.push(
      'E05 IAM logs show an OAuth token issued for ak_tb_prod_0419 near 02:14 UTC (subject to ~+42s uncertain auth daemon clock drift).'
    );
  }

  const reasonableInferences: string[] = [];
  if ((unlocked.has('E12') || unlocked.has('E16')) && completeAnomalousCorrelations.length > 0) {
    reasonableInferences.push(
      'Combined with E12/E16 vendor advisories on exposed TallyBridge CI runner secrets, an external party or unauthorized script likely reused ak_tb_prod_0419 over 185.220.101.47 and leveraged the unrevoked Q2 emergency role to execute CHG-401..403.'
    );
  }

  const alternativeTests: AlternativeExplanationTest[] = [
    {
      id: 'alt_former_employee',
      hypothesis: 'Hypothesis 1: Former Employee Activity (Rohan Menon)',
      status: unlocked.has('E09') && unlocked.has('E02') ? 'REFUTED_BY_EVIDENCE' : 'NEEDS_CHECK',
      supportingEvidence: ['Rohan Menon was physically seated in Reception on the morning of Nov 19 for HR exit clearance.'],
      contradictingEvidence: [
        'E09 & AUD-880 confirm Rohan’s badge and corporate SSO were revoked Oct 14.',
        'E02 confirms zero overnight badge entries; E13 confirms zero MFA resets or remote sessions.',
        'E18/E19 prove changes came via API_GATEWAY using ak_tb_prod_0419 from external AS205100 IP 185.220.101.47.',
      ],
      assessment:
        'Presence in Reception for clearance paperwork does not imply guilt. No evidence links Rohan Menon to the TallyBridge API token or overnight external IP.',
    },
    {
      id: 'alt_finance_cleanup',
      hypothesis: 'Hypothesis 2: Legitimate Finance Data Cleanup Batch',
      status: unlocked.has('E11') && unlocked.has('E19') ? 'REFUTED_BY_EVIDENCE' : 'NEEDS_CHECK',
      supportingEvidence: ['E11 shows Finance did perform vendor master cleanup entries on Nov 18–19 (CHG-398, CHG-404).'],
      contradictingEvidence: [
        'E11 entries ran during daytime hours via ERP_PORTAL by named Finance staff with valid APR-2026-4418 / 4429 references.',
        'CHG-401..403 ran at 02:19–02:38 UTC via API_GATEWAY with NULL/blank approval_ref and offshore CYPRCY2NXXX routing.',
      ],
      assessment:
        'Legitimate Finance cleanup entries are clearly separated from CHG-401..403 by channel, timestamp, approval_ref, and request_id.',
    },
    {
      id: 'alt_weekly_export',
      hypothesis: 'Hypothesis 3: Normal Weekly Support Billing Export',
      status: unlocked.has('E06') && unlocked.has('E10') ? 'REFUTED_BY_EVIDENCE' : 'NEEDS_CHECK',
      supportingEvidence: ['Support does operate a scheduled weekly invoice export (E06).'],
      contradictingEvidence: [
        'E06 exports run exclusively Fridays at 11:00 UTC (~50 KB slices) from internal workers.',
        'E18-107 ran Thursday 02:44 UTC from 185.220.101.47 pulling 1.84 MB (~40x normal) with zero tickets in E10.',
      ],
      assessment:
        'The 02:44 UTC 1.84 MB archive download does not match normal Support export schedule, size, or network origin.',
    },
    {
      id: 'alt_vendor_misuse',
      hypothesis: 'Hypothesis 4: Third-Party Vendor Integration Credential Misuse',
      status:
        completeAnomalousCorrelations.length > 0 && unlocked.has('E04')
          ? 'SUPPORTED_BY_EVIDENCE'
          : 'NEEDS_CHECK',
      supportingEvidence: [
        'E18 & E19 correlate req-9f4a-881c/882d/883e directly across API_GATEWAY and Finance ERP.',
        'E04/E14 explain how svc-tallybridge-sync held payment_instructions:write.',
        'E12/E16 document TallyBridge CI credential exposure; E15/E17 flag 185.220.101.47 & python-requests JA3.',
      ],
      contradictingEvidence: ['Does not identify which specific human operator controlled 185.220.101.47.'],
      assessment:
        'Strongly supported across all correlated technical records while preserving strict distinction between machine credential misuse and human attribution.',
    },
  ];

  const unresolvedQuestions: string[] = [
    'Which specific human operator or external host controlled 185.220.101.47 during 02:14–02:44 UTC? (Machine credentials ak_tb_prod_0419 / svc-tallybridge-sync cannot identify an individual.)',
    'What is the exact NTP offset of the E05 IAM daemon at 02:14 UTC beyond the ~42s estimated drift relative to E03?',
    'Have TallyBridge CI/CD runner #04 audit logs been acquired to pinpoint when the token artifact was accessed?',
    'Did any downstream banking batch queue CYPRCY2NXXX instructions prior to the 08:30 IST (03:00 UTC) treasury freeze?',
  ];

  return {
    reasoningChain,
    findings,
    confirmedFacts,
    suspiciousObservations,
    reasonableInferences,
    alternativeTests,
    unresolvedQuestions,
  };
}
