import { CASE_METADATA, SECURITY_ACTIONS } from '../data/caseData';
import {
  CorrelationMatch,
  EvidencePackageItem,
  InvestigationState,
  TimelineEvent,
  VendorFingerprint,
} from '../types/game';
import { EpistemicAssessment } from './investigationEngine';

export interface StructuredReport {
  generatedAt: string;
  sections: {
    number: number;
    title: string;
    body: string[];
  }[];
}

export function generateStructuredReport(
  state: InvestigationState,
  inventory: EvidencePackageItem[],
  fingerprint: VendorFingerprint | null,
  correlations: CorrelationMatch[],
  timeline: TimelineEvent[],
  assessment: EpistemicAssessment
): StructuredReport {
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const matchedComplete = correlations.filter((c) => c.status === 'MATCHED_COMPLETE');
  const missingApprovalCount = matchedComplete.filter((c) => c.missingApprovalRef).length;

  const reviewedCount = Object.keys(state.findingReviews).length;
  const confirmedFindings = assessment.findings.filter(
    (f) => state.findingReviews[f.id]?.status === 'CONFIRMED'
  );
  const dismissedFindings = assessment.findings.filter(
    (f) => state.findingReviews[f.id]?.status === 'DISMISSED'
  );

  const selectedActionLabels = SECURITY_ACTIONS.filter((a) =>
    state.selectedActions.includes(a.id)
  ).map((a) => a.label);

  const riskLevel =
    matchedComplete.some((c) => c.missingApprovalRef) &&
    assessment.findings.some((f) => f.severity === 'CRITICAL')
      ? 'HIGH / CRITICAL — Requires immediate credential rotation, role removal, and payment-instruction quarantine'
      : 'ELEVATED — Pending complete evidence correlation';

  const sections: StructuredReport['sections'] = [
    {
      number: 1,
      title: 'Case Overview',
      body: [
        `Organization: ${CASE_METADATA.company}`,
        `Case Identifier: ${CASE_METADATA.caseId}`,
        `Subject Vendor Integration: ${CASE_METADATA.vendorName} (${CASE_METADATA.vendorId} · ${CASE_METADATA.serviceAccount} · ${CASE_METADATA.apiKeyId})`,
        `Incident Window: 2026-11-19 02:14–03:00 UTC (07:44–08:30 IST)`,
        `Report Generated: ${generatedAt}`,
      ],
    },
    {
      number: 2,
      title: 'Executive Summary',
      body: [
        `Central Question: ${CASE_METADATA.centralQuestion}`,
        matchedComplete.length > 0
          ? `Key Outcome: Cross-system request_id correlation linked ${matchedComplete.length} E18 API Gateway calls to E19 vendor bank-detail changes, of which ${missingApprovalCount} (CHG-401, CHG-402, CHG-403) lacked mandatory approval_ref sign-off.`
          : 'Key Outcome: Cross-system E18/E19 correlation is currently incomplete.',
        `Human Investigator Note: ${state.investigatorSummaryNote || 'No closing investigator note recorded.'}`,
      ],
    },
    {
      number: 3,
      title: 'Evidence Examined',
      body:
        inventory.length > 0
          ? [
              `Packages Examined: ${inventory.length}/20 facility evidence datasets plus ${state.uploadedFiles.length} uploaded file(s).`,
              ...inventory.map(
                (item) =>
                  `${item.code} (${item.sourceSystem} / ${item.fileName}) — ${item.recordCount} records [${item.validationStatus}]`
              ),
            ]
          : ['No evidence packages unlocked yet.'],
    },
    {
      number: 4,
      title: 'TRUSTLOCK Trust Profile, Synthetic Fingerprint Vault & Integrity',
      body: fingerprint
        ? [
            `Service Account: ${fingerprint.serviceAccount} · Security Architecture: AES-256-GCM encrypted synthetic template vault + SHA-256 hash chain + Ed25519 signature verification + RBAC + approval_ref enforcement.`,
            `Synthetic Fingerprint Verification (Step 5): ${
              state.fingerprintVerified
                ? `VERIFIED (${state.fingerprintMatchPct}% similarity against AES-256-GCM envelope-encrypted synthetic demo template; SHA-256 pre-use integrity confirmed).`
                : 'PENDING / UNVERIFIED — Operator biometric simulation test incomplete.'
            }${state.fingerprintVerificationNote ? ` Note: ${state.fingerprintVerificationNote}` : ''}`,
            `Approved Baseline (E01/E07/E08): ${fingerprint.baselineReadPct}% Read (GET) / ${fingerprint.baselineWritePct}% Heartbeat · Window ${fingerprint.baselineHoursUtc} · IP ${fingerprint.authorizedIps.join(', ') || '203.0.113.42'} · Avg ${(fingerprint.baselineAvgBytes / 1024).toFixed(1)} KB`,
            `Software Integrity Finding: A cryptographic hash alone cannot prevent misuse of leaked credentials (ak_tb_prod_0419) or unrevoked emergency RBAC; CHG-401..403 failed signature origin, approval_ref, and trusted backup (BK-2026-11-18-*) hash checks.`,
            fingerprint.scopeDisclaimer,
          ]
        : ['Insufficient baseline records unlocked to compute TallyBridge Trust Profile.'],
    },
    {
      number: 5,
      title: 'Normal vs Observed Activity & Integrity Comparison',
      body: fingerprint
        ? [
            `Read/Write Shift: Baseline ${fingerprint.baselineReadPct}% GET / ${fingerprint.baselineWritePct}% PUT -> Observed ${fingerprint.observedReadPct}% GET / ${fingerprint.observedWritePct}% Write (3 POST bank-detail updates).`,
            `Source Network & Client Shift: Approved 203.0.113.42 (TallyBridge-Worker/4.2.1) -> Observed 185.220.101.47 (python-requests/2.31.0).`,
            `Timing & Payload Shift: Business hours 04:10–12:05 UTC (~48 KB avg) -> Off-hours 02:14–02:44 UTC (up to ${(fingerprint.observedMaxBytes / 1024 / 1024).toFixed(2)} MB export).`,
            `Trusted Backup Comparison: 3 offshore CYPRCY2NXXX changes mismatched pre-incident domestic backups BK-2026-11-18-4481 / 5112 / 3318.`,
          ]
        : ['Baseline & integrity comparison awaits E01 and E18 evidence.'],
    },
    {
      number: 6,
      title: 'Detected Anomalies',
      body:
        fingerprint && fingerprint.deviations.length > 0
          ? fingerprint.deviations.map(
              (d) =>
                `[${d.severity}] ${d.title}: ${d.explanation} | Records: ${d.supportingRecordIds.join(', ')}`
            )
          : ['No behavioural anomalies detected from currently loaded records.'],
    },
    {
      number: 7,
      title: 'Evidence Correlation',
      body:
        correlations.length > 0
          ? correlations.map(
              (c) =>
                `request_id=${c.request_id} [${c.status}]: ${c.explanation}${
                  c.iocMatches.length > 0
                    ? ` | IOC Matches: ${c.iocMatches.map((i) => `${i.ioc_id} (${i.indicator})`).join(', ')}`
                    : ''
                }`
            )
          : ['No E18/E19 correlation pairs evaluated yet.'],
    },
    {
      number: 8,
      title: 'Incident Timeline',
      body:
        timeline.length > 0
          ? timeline.map(
              (ev) =>
                `${ev.timestamp} [${ev.sourceCode} · ${ev.confidence} · ${ev.severity}] ${ev.actorOrCredential}: ${ev.title} — ${ev.detail}${
                  ev.uncertaintyNote ? ` (${ev.uncertaintyNote})` : ''
                }`
            )
          : ['Timeline reconstruction awaits evidence unlocking.'],
    },
    {
      number: 9,
      title: 'Investigation Findings',
      body: [
        ...assessment.confirmedFacts.map((f) => `[Confirmed Fact] ${f}`),
        ...assessment.suspiciousObservations.map((s) => `[Suspicious Observation] ${s}`),
        ...assessment.reasonableInferences.map((r) => `[Evidence-Supported Inference] ${r}`),
        ...assessment.findings.map((f) => {
          const rev = state.findingReviews[f.id];
          return `${f.id} (${f.severity}) ${f.title} — Human Review: ${
            rev ? `${rev.status}${rev.note ? ` — "${rev.note}"` : ''}` : 'UNREVIEWED'
          } | Evidence: ${f.supportingEvidence.join(', ')}`;
        }),
        `Human Review Summary: ${reviewedCount} reviewed (${confirmedFindings.length} Confirmed, ${dismissedFindings.length} Dismissed).`,
      ],
    },
    {
      number: 10,
      title: 'Alternative Explanations',
      body: assessment.alternativeTests.map(
        (alt) =>
          `${alt.hypothesis} [${alt.status}]: ${alt.assessment} (Contradicting: ${alt.contradictingEvidence.join(' ')})`
      ),
    },
    {
      number: 11,
      title: 'Unresolved Questions',
      body: assessment.unresolvedQuestions,
    },
    {
      number: 12,
      title: 'Risk Assessment',
      body: [
        `Residual Risk Rating: ${riskLevel}`,
        'Root Vulnerability: Unclosed Q2 ticket (E14) left ROLE_ERP_EMERGENCY_ADMIN attached to svc-tallybridge-sync (E04), while API Gateway / ERP lacked server-side approval_ref enforcement.',
        'Impact Scope: 3 offshore CYPRCY2NXXX payment-instruction changes (quarantined before settlement) plus 1.84 MB invoice data egress.',
      ],
    },
    {
      number: 13,
      title: 'Security Recommendations',
      body:
        selectedActionLabels.length > 0
          ? selectedActionLabels.map((lbl, idx) => `${idx + 1}. ${lbl}`)
          : assessment.findings.map((f) => `- ${f.recommendedAction}`),
    },
    {
      number: 14,
      title: 'Final Conclusion',
      body: [
        state.caseSolved
          ? `Case ${CASE_METADATA.caseId} concluded by investigator (Accuracy ${state.finalAccuracy}%). Correlated E18/E19 evidence establishes that TallyBridge machine credential ak_tb_prod_0419 (svc-tallybridge-sync) was misused from unlisted IP 185.220.101.47 to execute unapproved vendor bank-detail changes (CHG-401, CHG-402, CHG-403) and an abnormal 1.84 MB invoice export. No evidence implicates former employee Rohan Menon or internal Finance staff; individual human attribution remains unresolved pending vendor CI/CD audit.`
          : `Case ${CASE_METADATA.caseId} remains open until all 14 sequential CYBERQUEST steps and containment decisions are finalized.`,
      ],
    },
  ];

  return { generatedAt, sections };
}

export function reportToMarkdown(report: StructuredReport): string {
  const lines: string[] = [
    `# CYBERQUEST FORENSIC INVESTIGATION REPORT — ${CASE_METADATA.caseId}`,
    `Company: ${CASE_METADATA.company}`,
    `Generated: ${report.generatedAt}`,
    '',
  ];
  report.sections.forEach((sec) => {
    lines.push(`## ${sec.number}. ${sec.title}`);
    sec.body.forEach((p) => lines.push(`- ${p}`));
    lines.push('');
  });
  return lines.join('\n');
}

export function printReportAsPdf(report: StructuredReport): void {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CYBERQUEST Report - ${CASE_METADATA.caseId}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #0b1f16; margin: 30px; line-height: 1.5; }
    h1 { font-size: 20px; border-bottom: 2px solid #059669; padding-bottom: 8px; color: #064e3b; }
    .meta { color: #3f584c; font-size: 12px; margin-bottom: 20px; }
    h2 { font-size: 14.5px; color: #065f46; margin-top: 20px; margin-bottom: 6px; border-bottom: 1px solid #d4af37; padding-bottom: 3px; }
    ul { margin: 6px 0 0 18px; padding: 0; }
    li { font-size: 12.2px; margin-bottom: 4.5px; }
    @media print { body { margin: 15mm; } }
  </style>
</head>
<body>
  <h1>CYBERQUEST Digital Forensics Report — ${CASE_METADATA.company} (${CASE_METADATA.caseId})</h1>
  <div class="meta">Generated: ${report.generatedAt} | Subject: ${CASE_METADATA.vendorName} (${CASE_METADATA.serviceAccount})</div>
  ${report.sections
    .map(
      (s) =>
        `<h2>${s.number}. ${s.title}</h2><ul>${s.body
          .map((item) => `<li>${item.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`)
          .join('')}</ul>`
    )
    .join('')}
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }
  window.setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, 2000);
}

export function generateIncidentResponseReport(
  state: InvestigationState,
  correlations: CorrelationMatch[]
): StructuredReport {
  const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
  const ipBlocked = state.blockedIndicators.includes('185.220.101.47');
  const roleRevoked = state.revokedRoles.includes('ROLE_ERP_EMERGENCY_ADMIN');
  const keyRotated = state.rotatedKeys.includes('ak_tb_prod_0419');
  const rollbackIds = ['CHG-401', 'CHG-402', 'CHG-403'];
  const restoredCount = rollbackIds.filter((id) => state.rolledBackChangeIds.includes(id)).length;
  const passedChecks = state.remediationVerificationLog.filter((c) => c.status === 'PASS').length;

  const sections: StructuredReport['sections'] = [
    {
      number: 1,
      title: 'Incident Containment & Attribution Boundaries',
      body: [
        `Organization / Case: ${CASE_METADATA.company} (${CASE_METADATA.caseId})`,
        `Operator Vault Verification: ${
          state.fingerprintVerified
            ? `VERIFIED (${state.fingerprintMatchPct}% synthetic template match via AES-256-GCM protected storage + RBAC session)`
            : 'Pending synthetic fingerprint vault verification'
        }`,
        `Compromised Service Credential: ${CASE_METADATA.serviceAccount} (${CASE_METADATA.apiKeyId})`,
        `Blocked External Source: 185.220.101.47 (AS205100 · python-requests/2.31.0)`,
        `Attribution Safeguard: Technical remediation targets machine credentials and API permissions only; zero evidence implicates former employee Rohan Menon or internal Finance staff.`,
        `Report Generated: ${generatedAt}`,
      ],
    },
    {
      number: 2,
      title: 'Network & Perimeter Blocking Execution',
      body: [
        `Perimeter WAF / Gateway ACL (185.220.101.47): ${
          ipBlocked
            ? 'BLOCKED — Ingress rule DENY_185_220_101_47 deployed across API Gateway edge.'
            : 'PENDING — IP 185.220.101.47 not yet blocked in perimeter console.'
        }`,
        `Allowlist Enforcement: Contracted TallyBridge traffic restricted strictly to ${CASE_METADATA.authorizedIp} (TallyBridge-Worker/4.2.1).`,
      ],
    },
    {
      number: 3,
      title: 'Selective Isolation, Credential Rotation & Payment Hold',
      body: [
        `API Key Rotation (${CASE_METADATA.apiKeyId}): ${
          keyRotated
            ? 'ROTATED — ak_tb_prod_0419 invalidated; replacement scoped key ak_tb_prod_0502 issued.'
            : 'PENDING — Legacy key ak_tb_prod_0419 remains active.'
        }`,
        `RBAC Privilege Remediation (ROLE_ERP_EMERGENCY_ADMIN): ${
          roleRevoked
            ? 'REVOKED — Emergency Q2 write role removed from svc-tallybridge-sync; payment_instructions:write disabled.'
            : 'PENDING — ROLE_ERP_EMERGENCY_ADMIN still attached to svc-tallybridge-sync.'
        }`,
        `Treasury Payment Hold Status: ${
          state.paymentHoldActive
            ? 'ACTIVE — All outbound offshore disbursements quarantined pending dual-control Finance sign-off.'
            : 'RELEASED — Standard verified disbursements resumed post-restoration.'
        }`,
        `Matched Unapproved Requests Quarantined: ${correlations.filter((c) => c.missingApprovalRef).length} (req-9f4a-881c, req-9f4a-882d, req-9f4a-883e).`,
      ],
    },
    {
      number: 4,
      title: 'Automatic Recovery Engine & Trusted Backup Restoration (Simulation)',
      body: [
        `Auto Recovery Status: ${
          state.autoRecoveryStatus === 'AUTO_RECOVERY_SUCCESSFUL'
            ? `RECOVERY SUCCESSFUL (${state.autoRecoveryExecutedAt ?? generatedAt})`
            : state.autoRecoveryStatus === 'HUMAN_APPROVAL_REQUIRED'
            ? `ISOLATION MAINTAINED — HUMAN APPROVAL REQUIRED (${
                state.autoRecoveryApprovedByHuman ? 'Manual hold approved by Security Manager' : 'Pending Security Manager sign-off'
              })`
            : 'Pending Step 13 AUTO RECOVER execution'
        }`,
        `Restoration Progress: ${restoredCount}/3 unauthorized CYPRCY2NXXX changes reverted & SHA-256 re-sealed from BK-2026-11-18-*.`,
        ...(['CHG-401', 'CHG-402', 'CHG-403'] as const).map((chgId) => {
          const restored = state.restoredVendorRecords[chgId];
          if (restored) {
            return `${chgId} (${restored.vendorPayee}): RESTORED & VERIFIED -> ${restored.bankAcct} (${restored.swift}) from ${restored.restoredFrom} at ${restored.verifiedAt}`;
          }
          if (state.rolledBackChangeIds.includes(chgId)) {
            return `${chgId}: RESTORED & SEALED from pre-incident domestic backup`;
          }
          return `${chgId}: ISOLATED & QUARANTINED (Pending verified backup restore)`;
        }),
      ],
    },
    {
      number: 5,
      title: 'Recovery Verification & Audit History',
      body:
        state.remediationVerificationLog.length > 0
          ? [
              `Suite Outcome: ${passedChecks}/${state.remediationVerificationLog.length} simulated gateway & ERP integrity probes passed.`,
              ...state.remediationVerificationLog.map(
                (chk) =>
                  `[${chk.status}] ${chk.id} ${chk.probe} -> Observed: ${chk.observed} (${chk.executedAt})`
              ),
              ...(state.autoRecoveryAuditLog.length > 0
                ? state.autoRecoveryAuditLog
                    .slice(0, 6)
                    .map(
                      (a) =>
                        `[AUDIT ${a.outcome}] ${a.timestamp} · ${a.actorRole} · ${a.action} (${a.target}) — ${a.detail}`
                    )
                : []),
            ]
          : ['Recovery verification suite has not been executed yet in Step 13.'],
    },
    {
      number: 6,
      title: 'Governance Follow-Up & Closure Notes',
      body: [
        `Investigator Note: ${state.investigatorSummaryNote || 'Pending final investigator note.'}`,
        'Mandatory Follow-Up: Obtain TallyBridge CI/CD secret-vault audit confirming how ak_tb_prod_0419 was exposed prior to 2026-11-19 02:14 UTC.',
        'Dual-Control Policy: Enforce mandatory server-side APR-2026 approval_ref validation and NTP skew alerts (< 5s) across IAM/ERP services.',
      ],
    },
  ];

  return { generatedAt, sections };
}

export function incidentReportToMarkdown(report: StructuredReport): string {
  const lines: string[] = [
    `# CYBERQUEST INCIDENT RESPONSE & VERIFICATION REPORT — ${CASE_METADATA.caseId}`,
    `Company: ${CASE_METADATA.company}`,
    `Generated: ${report.generatedAt}`,
    '',
  ];
  report.sections.forEach((sec) => {
    lines.push(`## ${sec.number}. ${sec.title}`);
    sec.body.forEach((p) => lines.push(`- ${p}`));
    lines.push('');
  });
  return lines.join('\n');
}

export function printIncidentResponsePdf(report: StructuredReport): void {
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>CYBERQUEST Incident Response & Verification - ${CASE_METADATA.caseId}</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; color: #0b1f16; margin: 30px; line-height: 1.5; }
    h1 { font-size: 20px; border-bottom: 2px solid #059669; padding-bottom: 8px; color: #064e3b; }
    .meta { color: #3f584c; font-size: 12px; margin-bottom: 20px; }
    h2 { font-size: 14.5px; color: #065f46; margin-top: 20px; margin-bottom: 6px; border-bottom: 1px solid #d4af37; padding-bottom: 3px; }
    ul { margin: 6px 0 0 18px; padding: 0; }
    li { font-size: 12.2px; margin-bottom: 4.5px; }
    @media print { body { margin: 15mm; } }
  </style>
</head>
<body>
  <h1>CYBERQUEST Incident Response, Recovery &amp; Verification Report — ${CASE_METADATA.company} (${CASE_METADATA.caseId})</h1>
  <div class="meta">Generated: ${report.generatedAt} | Credential: ${CASE_METADATA.serviceAccount} (${CASE_METADATA.apiKeyId})</div>
  ${report.sections
    .map(
      (s) =>
        `<h2>${s.number}. ${s.title}</h2><ul>${s.body
          .map((item) => `<li>${item.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>`)
          .join('')}</ul>`
    )
    .join('')}
</body>
</html>`;

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  }
  window.setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  }, 2000);
}
