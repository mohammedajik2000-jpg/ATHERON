import * as THREE from 'three';

function applyTextureQuality(tex: THREE.CanvasTexture, maxAnisotropy: number, repeatX = 1, repeatY = 1) {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

export function createFloorTileTexture(
  baseColor: string,
  groutColor: string,
  accentColor: string,
  maxAnisotropy: number,
  repeatX = 12,
  repeatY = 12
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle architectural stone speckle
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = i % 2 === 0 ? 'rgba(245,242,233,0.025)' : 'rgba(0,0,0,0.045)';
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    ctx.fillRect(x, y, 2, 2);
  }

  // Tile grid lines
  ctx.strokeStyle = groutColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 128, 128);
  ctx.strokeRect(128, 0, 128, 128);
  ctx.strokeRect(0, 128, 128, 128);
  ctx.strokeRect(128, 128, 128, 128);

  // Subtle brass/emerald corner inlay
  ctx.fillStyle = accentColor;
  ctx.fillRect(124, 124, 8, 8);

  const tex = new THREE.CanvasTexture(canvas);
  return applyTextureQuality(tex, maxAnisotropy, repeatX, repeatY);
}

export function createServerFloorTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#061a11';
  ctx.fillRect(0, 0, 256, 256);

  ctx.strokeStyle = '#123827';
  ctx.lineWidth = 4;
  ctx.strokeRect(0, 0, 128, 128);
  ctx.strokeRect(128, 0, 128, 128);
  ctx.strokeRect(0, 128, 128, 128);
  ctx.strokeRect(128, 128, 128, 128);

  // Perforated airflow dots
  ctx.fillStyle = '#030d08';
  for (let gx = 20; gx < 110; gx += 16) {
    for (let gy = 20; gy < 110; gy += 16) {
      ctx.fillRect(gx, gy, 5, 5);
      ctx.fillRect(gx + 128, gy + 128, 5, 5);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  return applyTextureQuality(tex, maxAnisotropy, 6, 5);
}

export function createPlaqueTexture(
  title: string,
  subtitle: string,
  accent = '#d4af37',
  maxAnisotropy = 4
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#051a11';
  ctx.fillRect(0, 0, 512, 160);

  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.strokeRect(8, 8, 496, 144);

  ctx.fillStyle = accent;
  ctx.fillRect(24, 34, 8, 92);

  ctx.fillStyle = '#f5f2e9';
  ctx.font = 'bold 34px "Chakra Petch", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(title, 50, 62);

  ctx.fillStyle = '#d6d3c4';
  ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(subtitle, 50, 108);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

export function createWhiteboardTexture(maxAnisotropy = 4): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 288;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f5f2e9';
  ctx.fillRect(0, 0, 512, 288);

  ctx.strokeStyle = '#9aa89e';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 280);

  ctx.fillStyle = '#051a11';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('TallyBridge Integration Scope (Q3)', 28, 42);

  // Diagram boxes
  ctx.strokeStyle = '#059669';
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 78, 145, 76);
  ctx.fillStyle = '#059669';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('TallyBridge', 52, 108);
  ctx.fillStyle = '#294235';
  ctx.font = '13px monospace';
  ctx.fillText('203.0.113.42', 52, 134);

  // Arrow
  ctx.strokeStyle = '#051a11';
  ctx.beginPath();
  ctx.moveTo(181, 116);
  ctx.lineTo(295, 116);
  ctx.stroke();
  ctx.fillStyle = '#051a11';
  ctx.font = '13px monospace';
  ctx.fillText('GET /invoices', 188, 104);

  ctx.strokeStyle = '#b48a1c';
  ctx.strokeRect(298, 78, 175, 76);
  ctx.fillStyle = '#926f10';
  ctx.font = 'bold 16px monospace';
  ctx.fillText('Harbor ERP API', 316, 108);
  ctx.fillStyle = '#294235';
  ctx.font = '13px monospace';
  ctx.fillText('00:30-14:30 UTC', 316, 134);

  // Audit warning card
  ctx.fillStyle = '#fef2f2';
  ctx.fillRect(36, 180, 437, 74);
  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 180, 437, 74);
  ctx.fillStyle = '#b91c1c';
  ctx.font = 'bold 15px monospace';
  ctx.fillText('AUDIT NOTE: Verify Q2 ROLE_ERP_EMERGENCY_ADMIN removed', 48, 210);
  ctx.fillStyle = '#7f1d1d';
  ctx.font = '13px monospace';
  ctx.fillText('Disbursements must require valid APR-2026 approval_ref', 48, 236);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}

export function createMonitorScreenTexture(
  mode: 'standby' | 'soc_map' | 'workstation' | 'noc_wall' | 'soc_ops',
  maxAnisotropy = 4
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 320;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#04140d';
  ctx.fillRect(0, 0, 512, 320);

  // Subtle emerald grid
  ctx.strokeStyle = 'rgba(16, 185, 129, 0.14)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 512; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 320);
    ctx.stroke();
  }
  for (let y = 0; y < 320; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }

  if (mode === 'workstation') {
    ctx.fillStyle = '#082418';
    ctx.fillRect(0, 0, 512, 42);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 17px monospace';
    ctx.fillText('TRUSTLOCK // CYBERQUEST TERMINAL', 18, 27);

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 60, 224, 108);
    ctx.strokeStyle = '#d4af37';
    ctx.strokeRect(268, 60, 224, 108);
    ctx.strokeStyle = '#10b981';
    ctx.strokeRect(20, 186, 472, 112);

    ctx.fillStyle = '#d6d3c4';
    ctx.font = '13px monospace';
    ctx.fillText('CASE ID: CR-26-047', 34, 86);
    ctx.fillStyle = '#f5f2e9';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText('Harbor & Finch Freight', 34, 114);
    ctx.fillStyle = '#34d399';
    ctx.font = '13px monospace';
    ctx.fillText('Auto Recovery + Vault', 34, 144);

    ctx.fillStyle = '#fbbf24';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('AUTOMATIC RECOVERY OS', 284, 86);
    ctx.fillStyle = '#f5f2e9';
    ctx.font = '12px monospace';
    ctx.fillText('14-Step Forensic Engine', 284, 114);
    ctx.fillText('Sit & Press [E] to Launch', 284, 142);

    for (let i = 0; i < 24; i++) {
      const h = 20 + ((i * 19) % 58);
      ctx.fillStyle = i > 15 && i < 21 ? '#d4af37' : '#10b981';
      ctx.fillRect(36 + i * 18, 280 - h, 10, h);
    }
  } else if (mode === 'soc_map') {
    ctx.fillStyle = '#082418';
    ctx.fillRect(0, 0, 512, 36);
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('HARBOR & FINCH — DIGITAL INVESTIGATION BOARD', 18, 23);

    const nodes = [
      { x: 90, y: 150, label: '185.220.101.47', color: '#ef4444' },
      { x: 256, y: 110, label: 'API Gateway E18', color: '#d4af37' },
      { x: 256, y: 230, label: 'TallyBridge Svc', color: '#f59e0b' },
      { x: 420, y: 165, label: 'Finance ERP E19', color: '#10b981' },
    ];
    ctx.strokeStyle = '#1d4d38';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(90, 150);
    ctx.lineTo(256, 110);
    ctx.lineTo(420, 165);
    ctx.moveTo(256, 230);
    ctx.lineTo(256, 110);
    ctx.stroke();

    nodes.forEach((n) => {
      ctx.fillStyle = n.color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5f2e9';
      ctx.font = '12px monospace';
      ctx.fillText(n.label, n.x - 45, n.y + 30);
    });
  } else if (mode === 'noc_wall') {
    ctx.fillStyle = '#082418';
    ctx.fillRect(0, 0, 512, 38);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('NOC — NETWORK & EGRESS TELEMETRY', 18, 24);

    ctx.fillStyle = '#0a261b';
    ctx.fillRect(20, 56, 472, 92);
    ctx.strokeStyle = '#10b981';
    ctx.strokeRect(20, 56, 472, 92);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('ALLOWLIST: 203.0.113.42  [TallyBridge-Worker/4.2.1]', 34, 84);
    ctx.fillStyle = '#ef4444';
    ctx.fillText('ALERT:     185.220.101.47 [AS205100 · python-requests]', 34, 114);
    ctx.fillStyle = '#d6d3c4';
    ctx.font = '12px monospace';
    ctx.fillText('E15 NetFlow Egress Spike: 1.84 MB @ 02:44:12 UTC', 34, 136);

    for (let i = 0; i < 20; i++) {
      const h = i === 14 || i === 15 ? 88 : 18 + ((i * 11) % 28);
      ctx.fillStyle = i === 14 || i === 15 ? '#d4af37' : '#10b981';
      ctx.fillRect(28 + i * 23, 286 - h, 14, h);
    }
  } else if (mode === 'soc_ops') {
    ctx.fillStyle = '#082418';
    ctx.fillRect(0, 0, 512, 38);
    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 16px monospace';
    ctx.fillText('SOC — SIEM, IAM & INTEGRITY MONITOR', 18, 24);

    const alerts = [
      { code: 'IAM-04', txt: 'ROLE_ERP_EMERGENCY_ADMIN active on svc-tallybridge', col: '#ef4444' },
      { code: 'NTP-05', txt: 'HR/Access DB clock drift +42s (UTC alignment flag)', col: '#d4af37' },
      { code: 'DNA-19', txt: '3 E19 bank records fail BK-2026-11-18-* hash check', col: '#ef4444' },
      { code: 'AUTH-1', txt: 'No Rohan Menon portal sessions since 2026-10-31', col: '#10b981' },
    ];
    alerts.forEach((a, idx) => {
      const y = 58 + idx * 60;
      ctx.fillStyle = '#0a261b';
      ctx.fillRect(20, y, 472, 48);
      ctx.fillStyle = a.col;
      ctx.fillRect(20, y, 6, 48);
      ctx.font = 'bold 12px monospace';
      ctx.fillText(a.code, 36, y + 20);
      ctx.fillStyle = '#f5f2e9';
      ctx.font = '12px sans-serif';
      ctx.fillText(a.txt, 36, y + 38);
    });
  } else {
    ctx.fillStyle = '#082418';
    ctx.fillRect(16, 16, 480, 288);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(32, 38, 180, 14);
    ctx.fillStyle = '#0e3625';
    ctx.fillRect(32, 72, 448, 86);
    ctx.fillRect(32, 174, 210, 110);
    ctx.fillRect(258, 174, 222, 110);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAnisotropy);
  tex.needsUpdate = true;
  return tex;
}
