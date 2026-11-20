import { CASE_METADATA, E01_HISTORICAL_LOGS, E18_API_LOGS } from '../data/caseData';
import { ApiActivityRecord, ClueId, VendorFingerprint } from '../types/game';
import { getUnlockedEvidenceCodes } from './evidenceManager';

export function buildVendorFingerprint(
  vendorName: string,
  discoveredClues: ClueId[],
  uploadedApiRecords: ApiActivityRecord[]
): VendorFingerprint | null {
  const unlocked = getUnlockedEvidenceCodes(discoveredClues);
  if (!unlocked.has('E01') && !unlocked.has('E18') && uploadedApiRecords.length === 0) {
    return null;
  }

  const baselineRecords = unlocked.has('E01')
    ? E01_HISTORICAL_LOGS.filter((r) => r.vendor === vendorName)
    : [];

  const currentRecords = [
    ...(unlocked.has('E18') ? E18_API_LOGS.filter((r) => r.vendor === vendorName) : []),
    ...uploadedApiRecords.filter((r) => r.vendor === vendorName),
  ];

  const baseReads = baselineRecords.filter((r) => r.method === 'GET').length;
  const baseWrites = baselineRecords.length - baseReads;
  const baselineReadPct = baselineRecords.length
    ? Math.round((baseReads / baselineRecords.length) * 100)
    : 0;
  const baselineWritePct = baselineRecords.length ? 100 - baselineReadPct : 0;

  const obsReads = currentRecords.filter((r) => r.method === 'GET').length;
  const observedReadPct = currentRecords.length
    ? Math.round((obsReads / currentRecords.length) * 100)
    : 0;
  const observedWritePct = currentRecords.length ? 100 - observedReadPct : 0;

  const authorizedEndpoints = Array.from(
    new Set(baselineRecords.map((r) => r.endpoint.split('?')[0]))
  );
  const observedEndpoints = Array.from(
    new Set(currentRecords.map((r) => r.endpoint.split('?')[0]))
  );
  const unseenEndpoints = observedEndpoints.filter(
    (ep) => !authorizedEndpoints.includes(ep) && currentRecords.length > 0
  );

  const authorizedIps =
    unlocked.has('E07') || unlocked.has('E08')
      ? [CASE_METADATA.authorizedIp]
      : Array.from(new Set(baselineRecords.map((r) => r.source_ip)));
  const observedIps = Array.from(new Set(currentRecords.map((r) => r.source_ip)));
  const unseenIps = observedIps.filter((ip) => !authorizedIps.includes(ip));

  const baselineAvgBytes = baselineRecords.length
    ? Math.round(
        baselineRecords.reduce((sum, r) => sum + r.bytes_out, 0) / baselineRecords.length
      )
    : 0;
  const observedMaxBytes = currentRecords.length
    ? Math.max(...currentRecords.map((r) => r.bytes_out))
    : 0;

  const offHoursRecords = currentRecords.filter((r) => {
    const d = new Date(r.normalizedTs);
    const utcHour = d.getUTCHours();
    return utcHour >= 1 && utcHour <= 5;
  });

  const deviations: VendorFingerprint['deviations'] = [];

  const writeRecords = currentRecords.filter(
    (r) => r.method === 'POST' || r.method === 'DELETE' || r.endpoint.includes('bank-details')
  );
  if (writeRecords.length > 0) {
    deviations.push({
      id: 'dev_unexpected_writes',
      title: 'Unexpected Payment-Instruction Write Operations',
      severity: 'CRITICAL',
      explanation: `${vendorName} baseline shows ${baselineReadPct}% GET operations (${baseWrites} heartbeat PUTs only). Observed activity contains ${writeRecords.length} POST calls to /api/v2/vendors/bank-details/update.`,
      supportingRecordIds: writeRecords.map((r) => `${r.id} (${r.request_id})`),
    });
  }

  const unseenIpRecords = currentRecords.filter((r) => unseenIps.includes(r.source_ip));
  if (unseenIpRecords.length > 0) {
    deviations.push({
      id: 'dev_unseen_ip',
      title: 'Requests Originating Outside Approved IP Allowlist',
      severity: 'CRITICAL',
      explanation: `Observed ${unseenIpRecords.length} API calls from unlisted IP(s) [${unseenIps.join(', ')}], deviating from baseline IP [${authorizedIps.join(', ') || '203.0.113.42'}].`,
      supportingRecordIds: unseenIpRecords.map((r) => `${r.id} (${r.source_ip})`),
    });
  }

  const scriptedUaRecords = currentRecords.filter(
    (r) => r.user_agent.includes('python-requests')
  );
  if (scriptedUaRecords.length > 0) {
    deviations.push({
      id: 'dev_unseen_ua',
      title: 'Anomalous HTTP Client User-Agent (python-requests)',
      severity: 'SUSPICIOUS',
      explanation: `Observed ${scriptedUaRecords.length} calls using python-requests/2.31.0 instead of contracted TallyBridge-Worker/4.2.1 (NodeJS).`,
      supportingRecordIds: scriptedUaRecords.map((r) => `${r.id} (${r.user_agent})`),
    });
  }

  if (offHoursRecords.length > 0) {
    deviations.push({
      id: 'dev_off_hours',
      title: 'Off-Hours Execution Burst (02:14–02:44 UTC)',
      severity: 'SUSPICIOUS',
      explanation: `Detected ${offHoursRecords.length} API requests during 02:14–02:44 UTC, outside the historical 04:10–12:05 UTC operational cadence.`,
      supportingRecordIds: offHoursRecords.map((r) => `${r.id} (${r.timestamp.slice(11)})`),
    });
  }

  const bulkRecords = currentRecords.filter(
    (r) => baselineAvgBytes > 0 && r.bytes_out > baselineAvgBytes * 10
  );
  if (bulkRecords.length > 0) {
    deviations.push({
      id: 'dev_bulk_transfer',
      title: 'Anomalous Payload Egress Spike (1.84 MB)',
      severity: 'SUSPICIOUS',
      explanation: `Observed transfer of ${(observedMaxBytes / 1024 / 1024).toFixed(2)} MB vs. baseline mean of ${(baselineAvgBytes / 1024).toFixed(1)} KB (${Math.round(observedMaxBytes / Math.max(1, baselineAvgBytes))}x baseline).`,
      supportingRecordIds: bulkRecords.map((r) => `${r.id} (${r.endpoint})`),
    });
  }

  const normalSeq =
    vendorName === 'TallyBridge'
      ? ['GET /invoices', 'GET /freight-orders', 'PUT /sync/heartbeat']
      : ['GET /settlements/status', 'POST /settlements/ack'];

  const observedSeq =
    currentRecords.length > 0
      ? currentRecords.slice(0, 6).map((r) => `${r.method} ${r.endpoint.split('?')[0]}`)
      : ['Pending E18 capture'];

  const normalSummary =
    baselineRecords.length > 0
      ? [
          `Regular daily invoice and freight-order synchronization (${baselineReadPct}% GET / ${baselineWritePct}% heartbeat PUT).`,
          `Consistent source IP ${authorizedIps.join(', ')} during business sync hours (04:10–12:05 UTC).`,
          `Predictable response payload size averaging ${(baselineAvgBytes / 1024).toFixed(1)} KB per batch.`,
        ]
      : ['Historical E01 baseline not yet unlocked — inspect Reception (E01/E02/E09) to compute full baseline comparison.'];

  return {
    vendor: vendorName,
    serviceAccount:
      currentRecords[0]?.service_account ??
      baselineRecords[0]?.service_account ??
      CASE_METADATA.serviceAccount,
    baselineRecordCount: baselineRecords.length,
    observedRecordCount: currentRecords.length,
    baselineReadPct,
    observedReadPct,
    baselineWritePct,
    observedWritePct,
    baselineReqPerHour: baselineRecords.length ? 0.5 : 0,
    observedPeakReqPerHour: offHoursRecords.length ? offHoursRecords.length * 2 : 1,
    baselineHoursUtc: baselineRecords.length ? '04:10–12:05 UTC' : 'Pending E01',
    observedAnomalyHoursUtc: offHoursRecords.length ? '02:14–02:44 UTC' : 'None observed',
    baselineAvgBytes,
    observedMaxBytes,
    authorizedIps,
    observedIps,
    unseenIps,
    authorizedEndpoints,
    unseenEndpoints,
    endpointSequences: {
      normal: normalSeq,
      observed: observedSeq,
    },
    normalSummary,
    deviations,
    scopeDisclaimer:
      'Behavioural Scope Notice: This fingerprint models automated service-account API patterns (endpoints, sequences, timing, volume, IP, User-Agent). It does NOT identify or attribute actions to a specific human individual.',
  };
}

export interface SimulationFrame {
  idx: number;
  timeLabel: string;
  normalOp: string;
  observedOp: string;
  deviation: string;
  normalReadPct: number;
  observedReadPct: number;
  normalPayloadKb: number;
  observedPayloadKb: number;
  ipDeviation: boolean;
  uaDeviation: boolean;
  isCritical: boolean;
  evidenceRefs: string[];
}

export function buildFingerprintSimulationFrames(
  vendorName: string,
  discoveredClues: ClueId[],
  uploadedApiRecords: ApiActivityRecord[],
  uploadedBankChanges: { change_id: string; request_id: string; new_ifsc_swift: string; approval_ref: string | null }[] = []
): SimulationFrame[] {
  const unlocked = getUnlockedEvidenceCodes(discoveredClues);
  const baselinePool = unlocked.has('E01')
    ? E01_HISTORICAL_LOGS.filter((r) => r.vendor === vendorName)
    : [];
  const observedPool = [
    ...(unlocked.has('E18') ? E18_API_LOGS.filter((r) => r.vendor === vendorName) : []),
    ...uploadedApiRecords.filter((r) => r.vendor === vendorName),
  ].sort((a, b) => a.normalizedTs - b.normalizedTs);

  const authorizedIp = CASE_METADATA.authorizedIp;
  const baselineMeanKb = baselinePool.length
    ? Math.round(
        (baselinePool.reduce((sum, r) => sum + r.bytes_out, 0) / baselinePool.length / 1024) * 10
      ) / 10
    : 0;
  const baselineReadPct = baselinePool.length
    ? Math.round((baselinePool.filter((r) => r.method === 'GET').length / baselinePool.length) * 100)
    : 0;

  if (baselinePool.length === 0 && observedPool.length === 0) {
    return [
      {
        idx: 1,
        timeLabel: 'Awaiting Evidence',
        normalOp: 'E01 historical baseline locked — inspect Reception audit logs to unlock.',
        observedOp: 'E18 API Gateway drive locked — inspect Server Room rack shelf to unlock.',
        deviation: 'Recover E01 and E18 in the 3D facility (or upload CSV/JSON in Step 1) to run live behavioural playback.',
        normalReadPct: 0,
        observedReadPct: 0,
        normalPayloadKb: 0,
        observedPayloadKb: 0,
        ipDeviation: false,
        uaDeviation: false,
        isCritical: false,
        evidenceRefs: [],
      },
    ];
  }

  const obsSamples =
    observedPool.length > 0
      ? observedPool.slice(0, 6)
      : baselinePool.slice(0, 4);

  return obsSamples.map((obs, i) => {
    const base = baselinePool[i % Math.max(1, baselinePool.length)];
    const obsKb = Math.round((obs.bytes_out / 1024) * 10) / 10;
    const baseKb = base ? Math.round((base.bytes_out / 1024) * 10) / 10 : baselineMeanKb;
    const isOffHours = new Date(obs.normalizedTs).getUTCHours() < 4;
    const ipMismatch = obs.source_ip !== authorizedIp && obs.vendor === 'TallyBridge';
    const uaMismatch = obs.user_agent.includes('python-requests');
    const isWriteBank = obs.method === 'POST' && obs.endpoint.includes('bank-details');
    const isBulkExport = baseKb > 0 && obsKb > baseKb * 10;
    const linkedBank = unlocked.has('E19')
      ? uploadedBankChanges.find((b) => b.request_id === obs.request_id)
      : undefined;

    const deviationNotes: string[] = [];
    if (isWriteBank) {
      deviationNotes.push(
        `CRITICAL WRITE: ${obs.method} ${obs.endpoint} (${obs.request_id})${
          linkedBank ? ` -> ${linkedBank.change_id} (${linkedBank.new_ifsc_swift})` : ''
        }`
      );
    }
    if (isBulkExport) {
      deviationNotes.push(`EGRESS SPIKE: ${obsKb} KB (~${Math.round(obsKb / Math.max(1, baseKb))}x baseline)`);
    }
    if (ipMismatch) deviationNotes.push(`Unlisted IP ${obs.source_ip} vs ${authorizedIp}`);
    if (uaMismatch) deviationNotes.push(`Anomalous UA ${obs.user_agent}`);
    if (isOffHours) deviationNotes.push('Off-hours execution window');

    const observedReadPct = obs.method === 'GET' ? 100 : 0;

    return {
      idx: i + 1,
      timeLabel: `Frame ${i + 1} (${obs.timestamp.slice(11, 19)} UTC)`,
      normalOp: base
        ? `${base.timestamp.slice(11)} · ${base.method} ${base.endpoint} · ${base.source_ip} · ${base.user_agent} · ${baseKb} KB`
        : 'Baseline E01 not yet unlocked — inspect Reception to load normal reference operation.',
      observedOp: `${obs.timestamp.slice(11)} · ${obs.method} ${obs.endpoint} · ${obs.source_ip} · ${obs.user_agent} · ${obsKb} KB (${obs.request_id})`,
      deviation:
        deviationNotes.length > 0
          ? deviationNotes.join(' | ')
          : 'Matches contracted operational baseline (authorized IP, User-Agent, timing, and read scope).',
      normalReadPct: baselinePool.length ? baselineReadPct : 100,
      observedReadPct,
      normalPayloadKb: baseKb || 48,
      observedPayloadKb: obsKb,
      ipDeviation: ipMismatch,
      uaDeviation: uaMismatch,
      isCritical: isWriteBank || isBulkExport || ipMismatch,
      evidenceRefs: [obs.sourceEvidence, obs.id, ...(base ? ['E01', base.id] : [])],
    };
  });
}
