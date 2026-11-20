import { NpcDefinition } from '../types/game';

export const CASE_NPCS: NpcDefinition[] = [
  {
    id: 'dev_raghavan',
    name: 'Dev Raghavan',
    role: 'Security Manager',
    roleCategory: 'security_manager',
    workflowStage: 'Security Manager → Recovery Approval',
    responsibility:
      'Oversees corporate security governance, authorizes incident containment, and grants manual recovery approval when automated confidence checks pause.',
    idleAction: 'executive',
    department: 'Corporate Office / Executive Reception',
    room: 'reception',
    position: [-1.2, 0, 8.6],
    yaw: 0.35,
    greeting:
      'Thank you for coming in so quickly. Three vendor bank-detail changes appeared overnight without Finance approval. Please inspect each department and coordinate automatic recovery from our Digital Investigation Room.',
    appearance: {
      skinColor: 0xc68b67,
      suitColor: 0x0d2118,
      shirtColor: 0xf5f2e9,
      hairColor: 0x1c1917,
      hairStyle: 'parted',
      hasGlasses: true,
      hasBadge: true,
      badgeColor: 0xd4af37,
      hasTie: true,
      hasClipboard: true,
      heightScale: 1.03,
    },
    topics: [
      {
        id: 'dev_brief',
        question: 'What triggered Case CR-26-047 this morning?',
        answer:
          'Our 08:30 IST reconciliation flagged three vendor settlement account updates applied between 02:19 and 02:38 UTC. None carried an APR-2026 Finance approval reference.',
        evidenceTag: 'E20 Case Summary',
      },
      {
        id: 'dev_vendor',
        question: 'Why is TallyBridge under review?',
        answer:
          'The ERP audit trail lists svc-tallybridge-sync as the actor, and our vendor advisory inbox received a third-party CI token exposure warning. Verify all logs and trigger safe recovery when ready.',
        unlocksClueId: 'CLUE_OFFICE_BRIEF_ADVISORY',
      },
    ],
  },
  {
    id: 'rohan_menon',
    name: 'Rohan Menon',
    role: 'Former Accounts Payable Clerk',
    roleCategory: 'visitor',
    workflowStage: 'HR Clearance Verification',
    responsibility: 'Offboarded Oct 14; visiting Reception solely to sign final HR clearance documents.',
    idleAction: 'executive',
    department: 'Visitor / Reception Lounge',
    room: 'reception',
    position: [0.4, 0, 10.6],
    yaw: -2.1,
    greeting:
      'I am here signing my final clearance paperwork with HR. Reception asked me to wait because of an overnight Finance alert—I left the company a month ago.',
    appearance: {
      skinColor: 0xd29978,
      suitColor: 0x26332c,
      shirtColor: 0xe7e3d6,
      hairColor: 0x171717,
      hairStyle: 'short',
      heightScale: 0.98,
    },
    topics: [
      {
        id: 'rohan_access',
        question: 'Did you retain any ERP portal or VPN access after leaving?',
        answer:
          'No. My badge and SSO credentials were deactivated on October 14 when I handed over my laptop. You can verify that in the HR offboarding register and reception badge logs.',
        evidenceTag: 'E09 HR Offboarding',
        unlocksClueId: 'CLUE_RECEPTION_AUDIT',
      },
      {
        id: 'rohan_process',
        question: 'How were vendor bank-detail changes handled while you worked in AP?',
        answer:
          'Every payment-instruction change required a signed APR reference from Madhavi or Farah in Finance. No clerk could save a bank change with a blank approval field.',
      },
    ],
  },
  {
    id: 'madhavi_sundar',
    name: 'Madhavi Sundar',
    role: 'Financial Officer (Lead)',
    roleCategory: 'financial_officer',
    workflowStage: 'Financial Officer → Payment Hold Verification',
    responsibility:
      'Approves vendor master updates (APR-2026), enforces payment holds on flagged beneficiaries, and verifies trusted domestic treasury backups.',
    idleAction: 'clipboard',
    department: 'Finance Department',
    room: 'finance',
    position: [-12.6, 0, 1.8],
    yaw: 1.4,
    greeting:
      'We put outbound treasury settlements ON HOLD as soon as the 08:30 IST diff report landed. No one in Finance authorized offshore CYPRCY2NXXX bank updates overnight.',
    appearance: {
      skinColor: 0xc08462,
      suitColor: 0x1a2a23,
      shirtColor: 0xf5f2e9,
      hairColor: 0x18181b,
      hairStyle: 'bun',
      hasGlasses: true,
      hasBadge: true,
      badgeColor: 0x10b981,
      hasClipboard: true,
      heightScale: 0.96,
    },
    topics: [
      {
        id: 'madhavi_changes',
        question: 'Which records in E19 are suspicious?',
        answer:
          'Changes CHG-401, CHG-402, and CHG-403 updated Meridian Offshore Forwarding and Vanguard Transit Holdings to CYPRCY2NXXX accounts, and all three have NULL or blank approval_ref fields.',
        unlocksClueId: 'CLUE_FINANCE_BANK_CHANGES',
      },
      {
        id: 'madhavi_cleanup',
        question: 'Could this be part of yesterday’s Finance data cleanup?',
        answer:
          'No. Our legitimate cleanup entries—like CHG-398 and CHG-404—were done during daytime hours via ERP_PORTAL and carry valid APR-2026-XXXX approval references.',
        evidenceTag: 'E11 Finance Cleanup',
      },
    ],
  },
  {
    id: 'farah_dsouza',
    name: 'Farah Dsouza',
    role: 'Financial Officer (AP Control)',
    roleCategory: 'financial_officer',
    workflowStage: 'Financial Officer → Payment Hold Verification',
    responsibility:
      'Reconciles ERP bank-master ledgers, verifies pre-incident domestic backups (BK-2026-11-18-*), and traces API request IDs.',
    idleAction: 'typing',
    department: 'Finance Department',
    room: 'finance',
    position: [-15.8, 0, 3.2],
    yaw: 0.6,
    greeting:
      'I prepared the daytime vendor migration batch yesterday. Whatever ran at 02:19 UTC came through the API Gateway, not our Finance portal.',
    appearance: {
      skinColor: 0xd9a788,
      suitColor: 0x123026,
      shirtColor: 0xf5f2e9,
      hairColor: 0x292524,
      hairStyle: 'bob',
      hasBadge: true,
      badgeColor: 0x10b981,
      heightScale: 0.95,
    },
    topics: [
      {
        id: 'farah_request_id',
        question: 'How can we prove those E19 changes came from the API Gateway?',
        answer:
          'Every API-driven bank update stores a request_id token in E19. Compare req-9f4a-881c, req-9f4a-882d, and req-9f4a-883e against the Server Room API Gateway logs (E18).',
        evidenceTag: 'E19 request_id trace',
      },
    ],
  },
  {
    id: 'sunita_iyer',
    name: 'Sunita Iyer',
    role: 'Network Engineer (NOC)',
    roleCategory: 'network_engineer',
    workflowStage: 'Network Engineer → Network Isolation',
    responsibility:
      'Monitors NOC egress telemetry, isolates rogue external endpoints, and tracks scheduled billing exports and partner SLA windows.',
    idleAction: 'typing',
    department: 'Network Operations Room (NOC)',
    room: 'support_dept',
    position: [-12.4, 0, 8.6],
    yaw: 1.5,
    greeting:
      'Network Operations tracks scheduled Friday billing exports and perimeter traffic anomalies. Let me share what looks normal versus abnormal in our export logs.',
    appearance: {
      skinColor: 0xc58c69,
      suitColor: 0x122b21,
      shirtColor: 0xe6efe9,
      hairColor: 0x1c1917,
      hairStyle: 'bun',
      hasHeadset: true,
      hasBadge: true,
      badgeColor: 0xd4af37,
      hasVest: true,
      heightScale: 0.96,
    },
    topics: [
      {
        id: 'sunita_exports',
        question: 'Did Support run a large invoice export overnight?',
        answer:
          'No. Our weekly billing exports (E06) only run on Fridays at 11:00 UTC and average ~50 KB per slice. The 02:44 UTC 1.84 MB full invoice archive download is completely unscheduled.',
        unlocksClueId: 'CLUE_SUPPORT_EXPORTS',
      },
      {
        id: 'sunita_tickets',
        question: 'Were any TallyBridge maintenance tickets opened for last night?',
        answer:
          'Zero tickets in E10 or E13. No vendor notified Support of any emergency patch or IP change.',
      },
    ],
  },
  {
    id: 'prakash_menon',
    name: 'Prakash Menon',
    role: 'System Administrator',
    roleCategory: 'system_admin',
    workflowStage: 'System Administrator → Credential Restriction',
    responsibility:
      'Administers IAM directories, restricts compromised API credentials, revokes over-privileged roles, and audits remote support health.',
    idleAction: 'typing',
    department: 'Network Operations & IT Systems',
    room: 'support_dept',
    position: [-16.0, 0, 11.4],
    yaw: -0.4,
    greeting:
      'Systems Admin checked overnight password-reset and MFA alerts—none of our Finance staff triggered lockouts, and we are ready to restrict compromised API keys.',
    appearance: {
      skinColor: 0xd69f7d,
      suitColor: 0x162e24,
      shirtColor: 0xf5f2e9,
      hairColor: 0x171717,
      hairStyle: 'short',
      hasHeadset: true,
      hasBadge: true,
      badgeColor: 0x10b981,
      heightScale: 1.0,
    },
    topics: [
      {
        id: 'prakash_mfa',
        question: 'Could an employee workstation have been hijacked over Helpdesk remote support?',
        answer:
          'No remote support sessions were active overnight (E13), and no MFA prompts were issued to Finance laptops.',
        evidenceTag: 'E13 Helpdesk Notes',
      },
    ],
  },
  {
    id: 'aditi_kapoor',
    name: 'Aditi Kapoor',
    role: 'Security Analyst',
    roleCategory: 'security_analyst',
    workflowStage: 'Security Analyst → Detection',
    responsibility:
      'Monitors SOC SIEM detections, flags unauthorized vendor modifications, tracks IAM permission drift, and preserves cryptographic audit logs.',
    idleAction: 'inspecting',
    department: 'Security Operations Centre (SOC)',
    room: 'it_dept',
    position: [-12.2, 0, -7.8],
    yaw: 1.2,
    greeting:
      'I pulled the SOC IAM token logs and change detection alerts. Notice two critical clues: clock drift on the auth daemon and an unclosed Q2 emergency permission ticket.',
    appearance: {
      skinColor: 0xdab092,
      suitColor: 0x0b1f16,
      shirtColor: 0x163326,
      hairColor: 0x1e1b18,
      hairStyle: 'bob',
      hasGlasses: true,
      hasBadge: true,
      badgeColor: 0xd4af37,
      heightScale: 0.97,
    },
    topics: [
      {
        id: 'aditi_iam',
        question: 'Why did TallyBridge have permission to edit bank details?',
        answer:
          'During Q2 ERP migration, ticket E14 temporarily attached ROLE_ERP_EMERGENCY_ADMIN to svc-tallybridge-sync. The ticket was never closed, leaving payment_instructions:write active.',
        unlocksClueId: 'CLUE_IT_IAM_DRIFT',
      },
      {
        id: 'aditi_clock',
        question: 'Why do E05 IAM timestamps look slightly ahead of Gateway UTC logs?',
        answer:
          'Our auth daemon logs raw Unix epoch seconds and has roughly +42 seconds of NTP drift compared to E03 Gateway UTC anchors. Treat the offset as approximate, not exact.',
        evidenceTag: 'E05 Clock Drift',
      },
    ],
  },
  {
    id: 'pradeep_shah',
    name: 'Pradeep Shah',
    role: 'Vendor Management Officer',
    roleCategory: 'vendor_manager',
    workflowStage: 'Vendor Governance → Contract Allowlist',
    responsibility: 'Maintains vendor onboarding specifications, API contract scopes, and IP allowlist compliance.',
    idleAction: 'clipboard',
    department: 'Vendor Management Department',
    room: 'vendor_dept',
    position: [8.4, 0, 5.4],
    yaw: -1.6,
    greeting:
      'I manage vendor integration specs here. TallyBridge is only supposed to poll invoices and freight orders during daytime business hours from 203.0.113.42.',
    appearance: {
      skinColor: 0xc88d69,
      suitColor: 0x1a2e25,
      shirtColor: 0xf5f2e9,
      hairColor: 0x1c1917,
      hairStyle: 'parted',
      hasGlasses: true,
      hasBadge: true,
      badgeColor: 0xd4af37,
      hasTie: true,
      hasClipboard: true,
      heightScale: 1.01,
    },
    topics: [
      {
        id: 'pradeep_onboarding',
        question: 'What is TallyBridge’s authorized behavioural profile?',
        answer:
          'Contract E07/E08 restricts ak_tb_prod_0419 to read-only GET /invoices, GET /freight-orders, and PUT /sync/heartbeat from 203.0.113.42 between 00:30 and 14:30 UTC.',
        unlocksClueId: 'CLUE_VENDOR_ONBOARDING_PERMS',
      },
    ],
  },
  {
    id: 'colin_lawson',
    name: 'Colin Lawson',
    role: 'Network Engineer',
    roleCategory: 'network_engineer',
    workflowStage: 'Network Engineer → Network Isolation',
    responsibility:
      'Operates perimeter firewalls, NetFlow telemetry, TLS inspection, and immediate network isolation for unauthorized endpoints.',
    idleAction: 'inspecting',
    department: 'Server Room & Data Centre',
    room: 'server_room',
    position: [9.0, 0, -7.2],
    yaw: -1.4,
    greeting:
      'I pulled the perimeter NetFlow captures and isolated the encrypted API Gateway drive on the racks here. Watch the source IP 185.220.101.47.',
    appearance: {
      skinColor: 0xe6baa0,
      suitColor: 0x142920,
      shirtColor: 0xdfe8e2,
      hairColor: 0x57534e,
      hairStyle: 'short',
      hasBadge: true,
      badgeColor: 0x10b981,
      hasVest: true,
      hasClipboard: true,
      heightScale: 1.02,
    },
    topics: [
      {
        id: 'colin_net',
        question: 'What did perimeter NetFlow (E15) reveal?',
        answer:
          'Between 02:14 and 02:44 UTC, external IP 185.220.101.47 (AS205100) connected over TLS 1.3 with a python-style JA3 hash matching our E17 threat feed—not TallyBridge’s normal worker.',
        unlocksClueId: 'CLUE_SERVER_NETWORK_IOC',
      },
      {
        id: 'colin_e18',
        question: 'Where are the full HTTP request_id logs stored?',
        answer:
          'I staged the E18 API Gateway drive right on the rack shelf behind me. Pick it up and analyze E18 against E19 inside the Investigation Room.',
        unlocksClueId: 'CLUE_SERVER_API_E18',
      },
    ],
  },
  {
    id: 'meera_nair',
    name: 'Meera Nair',
    role: 'Digital Investigator',
    roleCategory: 'digital_investigator',
    workflowStage: 'Digital Investigator → Evidence Analysis',
    responsibility:
      'Correlates E18/E19 request_id trails, preserves immutable forensic evidence, and orchestrates the TRUSTLOCK Automatic Recovery Engine.',
    idleAction: 'clipboard',
    department: 'Digital Investigation Room',
    room: 'investigation_room',
    position: [1.35, 0, -10.2],
    yaw: -0.9,
    greeting:
      'Welcome to the Digital Investigation Room. Once you review the evidence, sit at the main TRUSTLOCK terminal to verify records and trigger one-click AUTO RECOVER.',
    appearance: {
      skinColor: 0xd49d7a,
      suitColor: 0x1e3328,
      shirtColor: 0xf5f2e9,
      hairColor: 0x1c1917,
      hairStyle: 'bob',
      hasBadge: true,
      badgeColor: 0xd4af37,
      hasClipboard: true,
      heightScale: 0.97,
    },
    topics: [
      {
        id: 'meera_evidence',
        question: 'How does evidence analysis connect to Automatic Recovery?',
        answer:
          'TRUSTLOCK correlates API identity (ak_tb_prod_0419), request_id tokens, and missing approval_ref entries while preserving E18/E19 unmodified, then safely restores only verified BK-2026-11-18-* backups.',
      },
      {
        id: 'meera_safeguard',
        question: 'What happens if a trusted backup cannot be verified?',
        answer:
          'We never guess financial account numbers. If trusted data is uncertain or tampered, TRUSTLOCK maintains strict isolation, keeps payments ON HOLD, and requests Security Manager approval.',
      },
    ],
  },
];
