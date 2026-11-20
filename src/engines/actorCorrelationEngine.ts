import { E15_NETWORK_RECORDS, E18_API_LOGS, E19_BANK_CHANGES } from '../data/caseData';
import { ActorIdentityProfile, ApiActivityRecord, ClueId } from '../types/game';
import { getUnlockedEvidenceCodes } from './evidenceManager';

export function buildActorIdentityProfiles(
  discoveredClues: ClueId[],
  uploadedApiRecords: ApiActivityRecord[]
): ActorIdentityProfile[] {
  const unlocked = getUnlockedEvidenceCodes(discoveredClues);
  const apiRecords = [
    ...(unlocked.has('E18') ? E18_API_LOGS : []),
    ...uploadedApiRecords,
  ];
  const netRecords = unlocked.has('E15') ? E15_NETWORK_RECORDS : [];
  const bankRecords = unlocked.has('E19') ? E19_BANK_CHANGES : [];

  const profiles: ActorIdentityProfile[] = [];

  // 1. Machine Credential: TallyBridge Production API Key & Service Account
  const tbLogs = apiRecords.filter((r) => r.vendor === 'TallyBridge');
  if (tbLogs.length > 0 || unlocked.has('E04') || unlocked.has('E07')) {
    const ips = Array.from(new Set(tbLogs.map((r) => r.source_ip)));
    const uas = Array.from(new Set(tbLogs.map((r) => r.user_agent)));
    const reqs = tbLogs.map((r) => r.request_id);
    const labels = Array.from(
      new Set(
        netRecords
          .filter((n) => ips.includes(n.src_ip))
          .map((n) => n.network_label)
      )
    );
    profiles.push({
      actorKey: 'svc-tallybridge-sync / ak_tb_prod_0419',
      actorType: 'MACHINE_CREDENTIAL',
      apiKeyIds: ['ak_tb_prod_0419'],
      serviceAccountNames: ['svc-tallybridge-sync'],
      callerIps: ips.length ? ips : ['203.0.113.42 (allowlisted baseline)'],
      userAgents: uas.length ? uas : ['TallyBridge-Worker/4.2.1 (NodeJS)'],
      networkLabels: labels.length ? labels : ['Pending E15 NetFlow'],
      linkedRequestIds: reqs,
      identityWarning:
        'MACHINE CREDENTIAL ≠ HUMAN IDENTITY: This credential is shared by automated workflows and potentially compromised CI artifacts (E12/E16). Logs prove the credential was used from 185.220.101.47 with python-requests/2.31.0, NOT which human operator executed it.',
    });
  }

  // 2. Machine Credential: FinPay Core
  const fpLogs = apiRecords.filter((r) => r.vendor === 'FinPay Core');
  if (fpLogs.length > 0) {
    profiles.push({
      actorKey: 'svc-finpay-settlement / ak_fp_prod_0102',
      actorType: 'MACHINE_CREDENTIAL',
      apiKeyIds: ['ak_fp_prod_0102'],
      serviceAccountNames: ['svc-finpay-settlement'],
      callerIps: Array.from(new Set(fpLogs.map((r) => r.source_ip))),
      userAgents: Array.from(new Set(fpLogs.map((r) => r.user_agent))),
      networkLabels: ['FinPay Approved Clearing Relay'],
      linkedRequestIds: fpLogs.map((r) => r.request_id),
      identityWarning:
        'Authorized automated settlement service account operating exclusively during scheduled clearing windows with valid APR-2026 approvals.',
    });
  }

  // 3. Internal Finance ERP Portal Actors (E11 / E19)
  if (unlocked.has('E19') || unlocked.has('E11')) {
    const portalChanges = bankRecords.filter((b) => b.channel === 'ERP_PORTAL');
    if (portalChanges.length > 0) {
      profiles.push({
        actorKey: 'Finance ERP Portal Staff (E11 / E19)',
        actorType: 'INTERNAL_PORTAL',
        apiKeyIds: ['SSO-SESSION-ERP'],
        serviceAccountNames: Array.from(new Set(portalChanges.map((p) => p.changed_by))),
        callerIps: ['10.24.12.0/24 (Internal Finance VLAN)'],
        userAgents: ['HarborFinch-ERP-Web/9.4'],
        networkLabels: ['Internal Corporate Finance Subnet'],
        linkedRequestIds: portalChanges.map((p) => p.request_id),
        identityWarning:
          'Authenticated corporate SSO sessions during daytime business hours; every entry holds a verified APR-2026 Finance approval reference.',
      });
    }
  }

  // 4. External Network Source Highlight (E15)
  const rogueFlows = netRecords.filter((n) => n.src_ip === '185.220.101.47');
  if (rogueFlows.length > 0) {
    profiles.push({
      actorKey: '185.220.101.47 (AS205100 Relay)',
      actorType: 'NETWORK_SOURCE',
      apiKeyIds: ['ak_tb_prod_0419 (presented over TLS)'],
      serviceAccountNames: ['svc-tallybridge-sync'],
      callerIps: ['185.220.101.47'],
      userAgents: ['python-requests/2.31.0'],
      networkLabels: ['Unlisted External Relay (AS205100) · JA3 72a589da586844d7f0818ce684948eea'],
      linkedRequestIds: tbLogs.filter((t) => t.source_ip === '185.220.101.47').map((t) => t.request_id),
      identityWarning:
        'External exit node observed only during 02:14–02:44 UTC. Network telemetry links the IP to a scripted Python TLS client, not an internal employee workstation.',
    });
  }

  return profiles;
}
