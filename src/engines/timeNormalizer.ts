import { E02_E05_AUDIT_RECORDS, E18_API_LOGS, E19_BANK_CHANGES } from '../data/caseData';
import { ClockNormalizationEntry, ClueId } from '../types/game';
import { getUnlockedEvidenceCodes } from './evidenceManager';

export function buildClockNormalizationReport(discoveredClues: ClueId[]): ClockNormalizationEntry[] {
  const unlocked = getUnlockedEvidenceCodes(discoveredClues);
  const rows: ClockNormalizationEntry[] = [];

  if (unlocked.has('E03') || unlocked.has('E18')) {
    const sample18 = E18_API_LOGS.find((r) => r.id === 'E18-104') ?? E18_API_LOGS[0];
    rows.push({
      evidenceCode: 'E03',
      sourceSystem: 'API Gateway NTP Anchor (E03 / E18)',
      nativeClockFormat: 'ISO UTC (Stratum-2 NTP synced)',
      rawSample: sample18.timestamp,
      normalizedUtc: sample18.timestamp,
      offsetApplied: '0s (Authoritative Reference)',
      confidence: 'EXACT',
      uncertaintyNote: 'Verified against E03 NTP anchor pulses.',
    });
  }

  if (unlocked.has('E02')) {
    const sampleIst = E02_E05_AUDIT_RECORDS.find((r) => r.audit_id === 'AUD-905');
    if (sampleIst) {
      rows.push({
        evidenceCode: 'E02',
        sourceSystem: 'Reception & ERP Portal Audit (E02)',
        nativeClockFormat: 'IST (+05:30 Local)',
        rawSample: sampleIst.timestamp,
        normalizedUtc: '2026-11-19 03:00:00 UTC',
        offsetApplied: '-05:30:00 (Exact Fixed Zone)',
        confidence: 'EXACT',
        uncertaintyNote: 'Fixed UTC+05:30 conversion; matches E20 08:30 IST treasury alert.',
      });
    }
  }

  if (unlocked.has('E05')) {
    const sampleIam = E02_E05_AUDIT_RECORDS.find((r) => r.audit_id === 'IAM-501');
    if (sampleIam) {
      rows.push({
        evidenceCode: 'E05',
        sourceSystem: 'IAM Auth Daemon (E05)',
        nativeClockFormat: 'Unix Epoch Seconds (Drifted)',
        rawSample: sampleIam.timestamp,
        normalizedUtc: '~2026-11-19 02:13:59 UTC (+/- 5s)',
        offsetApplied: '~ -42s estimated NTP drift vs E03',
        confidence: 'ESTIMATED_DRIFT',
        uncertaintyNote:
          'UNCERTAIN OFFSET: Auth daemon lacked active NTP sync; ~42s drift estimated by comparing adjacent E03 Gateway handshakes. Do not treat sub-minute ordering as exact.',
      });
    }
  }

  if (unlocked.has('E15')) {
    rows.push({
      evidenceCode: 'E15',
      sourceSystem: 'Edge Perimeter NetFlow (E15)',
      nativeClockFormat: 'UTC Epoch',
      rawSample: '2026-11-19 02:14:21 UTC',
      normalizedUtc: '2026-11-19 02:14:21 UTC',
      offsetApplied: '0s (NTP synced)',
      confidence: 'EXACT',
      uncertaintyNote: 'Matches E18-103 request timestamp within 1 second.',
    });
  }

  if (unlocked.has('E19')) {
    const sample19 = E19_BANK_CHANGES.find((r) => r.change_id === 'CHG-401') ?? E19_BANK_CHANGES[0];
    rows.push({
      evidenceCode: 'E19',
      sourceSystem: 'Finance ERP Ledger (E19)',
      nativeClockFormat: 'UTC Database Commit Time',
      rawSample: sample19.timestamp,
      normalizedUtc: sample19.timestamp,
      offsetApplied: '0s (Database UTC)',
      confidence: 'EXACT',
      uncertaintyNote: 'Commits ~1s after corresponding E18 API Gateway request.',
    });
  }

  return rows;
}
