import * as THREE from 'three';
import { createPlaqueTexture } from './textures';
import { NpcDefinition } from '../types/game';

export interface NpcRig {
  def: NpcDefinition;
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  indicatorRing: THREE.Mesh;
  nameplate: THREE.Mesh;
  worldPos: THREE.Vector3;
  baseYaw: number;
  eyeMeshes: THREE.Mesh[];
}

export function createNpcCharacter(
  def: NpcDefinition,
  maxAnisotropy: number
): NpcRig {
  const { appearance } = def;
  const root = new THREE.Group();
  root.position.set(def.position[0], def.position[1], def.position[2]);
  root.rotation.y = def.yaw;
  const scale = appearance.heightScale ?? 1;
  root.scale.set(scale, scale, scale);

  const isFinancialOfficer = def.roleCategory === 'financial_officer';
  const isSecurityManager =
    def.roleCategory === 'security_manager' || def.roleCategory === 'company_manager';

  const skinMat = new THREE.MeshStandardMaterial({
    color: appearance.skinColor,
    roughness: 0.6,
    metalness: 0.02,
  });
  const suitMat = new THREE.MeshStandardMaterial({
    color: appearance.suitColor,
    roughness: 0.72,
    metalness: 0.06,
  });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: appearance.shirtColor,
    roughness: 0.82,
    metalness: 0.02,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: appearance.hairColor,
    roughness: 0.85,
    metalness: 0.04,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x0a1712,
    roughness: 0.42,
    metalness: 0.25,
  });

  // Upper body material depends on role: Financial Officers wear formal tailored shirts & trousers
  const upperTorsoMat = isFinancialOfficer ? shirtMat : suitMat;
  const armSleeveMat = isFinancialOfficer ? shirtMat : suitMat;

  const hips = new THREE.Group();
  hips.position.set(0, 0.9, 0);
  root.add(hips);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.13, 0.19), suitMat);
  pelvis.castShadow = true;
  hips.add(pelvis);

  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.312, 0.032, 0.2), darkMat);
  belt.position.set(0, 0.05, 0);
  hips.add(belt);

  // Tapered Legs & Formal Shoes
  [-0.088, 0.088].forEach((lx) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.048, 0.82, 10), suitMat);
    leg.position.set(lx, -0.45, 0);
    leg.castShadow = true;
    hips.add(leg);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.2), darkMat);
    shoe.position.set(lx, -0.86, 0.03);
    shoe.castShadow = true;
    hips.add(shoe);
  });

  // Torso
  const torso = new THREE.Group();
  torso.position.set(0, 0.06, 0);
  hips.add(torso);

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.21), upperTorsoMat);
  chest.position.set(0, 0.28, 0);
  chest.castShadow = true;
  torso.add(chest);

  const waist = new THREE.Mesh(new THREE.BoxGeometry(0.305, 0.14, 0.185), upperTorsoMat);
  waist.position.set(0, 0.09, 0);
  waist.castShadow = true;
  torso.add(waist);

  if (!isFinancialOfficer) {
    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.125, 0.32, 0.218), shirtMat);
    shirt.position.set(0, 0.27, 0.005);
    torso.add(shirt);

    [-1, 1].forEach((side) => {
      const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.23, 0.022), suitMat);
      lapel.position.set(side * 0.072, 0.31, 0.11);
      lapel.rotation.z = side * 0.16;
      torso.add(lapel);
    });
  } else {
    // Formal shirt collar & button placket for Financial Officers
    const placket = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.33, 0.012), darkMat);
    placket.position.set(0, 0.27, 0.106);
    torso.add(placket);
    [-1, 1].forEach((side) => {
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.04, 0.13), shirtMat);
      collar.position.set(side * 0.048, 0.455, 0.01);
      collar.rotation.z = side * 0.22;
      torso.add(collar);
    });
  }

  if (appearance.hasTie || isSecurityManager) {
    const tieMat = new THREE.MeshStandardMaterial({
      color: isSecurityManager ? 0x10b981 : 0x0a1712,
      roughness: 0.45,
      metalness: 0.1,
    });
    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.24, 0.015), tieMat);
    tie.position.set(0, 0.26, 0.115);
    torso.add(tie);
  }

  if (appearance.hasVest) {
    // Technical utility uniform vest for Network Engineers
    const vestMat = new THREE.MeshStandardMaterial({ color: 0x0f2e21, roughness: 0.65, metalness: 0.1 });
    const vestTrimMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      emissive: 0xb48a1c,
      emissiveIntensity: 0.25,
      roughness: 0.4,
    });
    const vestL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.31, 0.224), vestMat);
    vestL.position.set(-0.11, 0.27, 0.002);
    torso.add(vestL);
    const vestR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.31, 0.224), vestMat);
    vestR.position.set(0.11, 0.27, 0.002);
    torso.add(vestR);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(0.348, 0.022, 0.228), vestTrimMat);
    trim.position.set(0, 0.16, 0.002);
    torso.add(trim);
  }

  if (appearance.hasBadge) {
    const badgeColor = appearance.badgeColor ?? 0xd4af37;
    const badge = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.08, 0.015),
      new THREE.MeshStandardMaterial({ color: 0xf5f2e9, roughness: 0.3 })
    );
    badge.position.set(0.1, 0.3, 0.114);
    torso.add(badge);
    const badgeAccent = new THREE.Mesh(
      new THREE.BoxGeometry(0.055, 0.018, 0.017),
      new THREE.MeshStandardMaterial({
        color: badgeColor,
        emissive: badgeColor,
        emissiveIntensity: 0.25,
      })
    );
    badgeAccent.position.set(0.1, 0.335, 0.116);
    torso.add(badgeAccent);
  }

  // Tapered Arms & Cuffs
  const buildArm = (side: -1 | 1) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.215, 0.4, 0);
    torso.add(pivot);

    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.054, 10, 10), armSleeveMat);
    pivot.add(shoulderCap);

    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.038, 0.43, 10), armSleeveMat);
    sleeve.position.set(0, -0.215, 0);
    sleeve.castShadow = true;
    pivot.add(sleeve);

    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.039, 0.037, 0.024, 10), shirtMat);
    cuff.position.set(0, -0.43, 0);
    pivot.add(cuff);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.076, 0.065), skinMat);
    hand.position.set(0, -0.47, 0);
    pivot.add(hand);

    if (side === -1 && appearance.hasClipboard) {
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.015, 0.26),
        new THREE.MeshStandardMaterial({ color: 0x3f2e24, roughness: 0.5 })
      );
      board.position.set(0.03, -0.46, 0.11);
      board.rotation.x = 0.25;
      pivot.add(board);
      const paper = new THREE.Mesh(
        new THREE.BoxGeometry(0.17, 0.018, 0.22),
        new THREE.MeshStandardMaterial({ color: 0xf5f2e9, roughness: 0.85 })
      );
      paper.position.set(0.03, -0.455, 0.11);
      paper.rotation.x = 0.25;
      pivot.add(paper);
    }

    return pivot;
  };
  const leftArmPivot = buildArm(-1);
  const rightArmPivot = buildArm(1);

  // Neck + Contoured Human Head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.058, 0.095, 12), skinMat);
  neck.position.set(0, 0.48, 0);
  torso.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.55, 0);
  torso.add(head);

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.112, 16, 14), skinMat);
  cranium.scale.set(0.92, 1.05, 1.0);
  cranium.position.set(0, 0.11, -0.004);
  cranium.castShadow = true;
  head.add(cranium);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.08, 0.14), skinMat);
  jaw.position.set(0, 0.045, 0.015);
  jaw.castShadow = true;
  head.add(jaw);

  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.044, 0.028), skinMat);
  nose.position.set(0, 0.09, 0.108);
  head.add(nose);

  const mouth = new THREE.Mesh(
    new THREE.BoxGeometry(0.04, 0.009, 0.012),
    new THREE.MeshStandardMaterial({ color: 0x9f6b56, roughness: 0.7 })
  );
  mouth.position.set(0, 0.052, 0.092);
  head.add(mouth);

  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.046, 0.028), skinMat);
    ear.position.set(side * 0.105, 0.1, -0.004);
    head.add(ear);
  });

  // Realistic human eyes (sclera + iris) & eyebrows
  const eyeMeshes: THREE.Mesh[] = [];
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf5f2e9, roughness: 0.35 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x171412 });
  [-0.04, 0.04].forEach((ex) => {
    const sclera = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.013, 0.011), scleraMat);
    sclera.position.set(ex, 0.115, 0.101);
    head.add(sclera);
    eyeMeshes.push(sclera);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.011, 0.014), eyeMat);
    eye.position.set(ex, 0.115, 0.103);
    head.add(eye);
    eyeMeshes.push(eye);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.009, 0.012), hairMat);
    brow.position.set(ex, 0.135, 0.104);
    head.add(brow);
  });

  // Hair styles
  const hairTop = new THREE.Mesh(
    new THREE.SphereGeometry(0.117, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    hairMat
  );
  hairTop.scale.set(0.93, 0.95, 1.02);
  hairTop.position.set(0, 0.128, -0.008);
  head.add(hairTop);

  if (appearance.hairStyle === 'bob') {
    const bobBack = new THREE.Mesh(new THREE.BoxGeometry(0.205, 0.21, 0.085), hairMat);
    bobBack.position.set(0, 0.08, -0.08);
    head.add(bobBack);
  } else if (appearance.hairStyle === 'bun') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.062, 10, 10), hairMat);
    bun.position.set(0, 0.175, -0.125);
    head.add(bun);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.185, 0.13, 0.06), hairMat);
    back.position.set(0, 0.105, -0.088);
    head.add(back);
  } else {
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.175, 0.125, 0.06), hairMat);
    back.position.set(0, 0.105, -0.085);
    head.add(back);
  }

  if (appearance.hasGlasses) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(0.17, 0.034, 0.02),
      new THREE.MeshStandardMaterial({ color: 0x263b30, metalness: 0.7, roughness: 0.3 })
    );
    frame.position.set(0, 0.115, 0.108);
    head.add(frame);
  }

  if (appearance.hasHeadset) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.118, 0.011, 6, 16, Math.PI), darkMat);
    band.position.set(0, 0.125, 0);
    head.add(band);
    const mic = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.085), darkMat);
    mic.position.set(0.095, 0.06, 0.065);
    head.add(mic);
  }

  // Floating Nameplate showing full Name and Job Title
  const plateTex = createPlaqueTexture(def.name.toUpperCase(), def.role, '#d4af37', maxAnisotropy);
  const plateMat = new THREE.MeshBasicMaterial({
    map: plateTex,
    transparent: true,
    opacity: 0.92,
  });
  const nameplate = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.28), plateMat);
  nameplate.position.set(0, 2.08, 0);
  root.add(nameplate);

  // Ground selection ring (Warm Gold for unread / Emerald when completed)
  const indicatorRing = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.48, 28),
    new THREE.MeshBasicMaterial({
      color: 0xd4af37,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    })
  );
  indicatorRing.rotation.x = -Math.PI / 2;
  indicatorRing.position.set(0, 0.025, 0);
  root.add(indicatorRing);

  return {
    def,
    root,
    hips,
    torso,
    head,
    leftArmPivot,
    rightArmPivot,
    indicatorRing,
    nameplate,
    worldPos: new THREE.Vector3(def.position[0], def.position[1], def.position[2]),
    baseYaw: def.yaw,
    eyeMeshes,
  };
}

export function animateNpc(
  rig: NpcRig,
  playerPos: THREE.Vector3,
  isTalking: boolean,
  hasUnreadTopic: boolean,
  time: number,
  delta: number
) {
  const damp = Math.min(1, delta * 8);
  const dx = playerPos.x - rig.worldPos.x;
  const dz = playerPos.z - rig.worldPos.z;
  const dist = Math.hypot(dx, dz);

  // Subtle idle breathing & natural periodic blink offset per NPC
  rig.hips.position.y = 0.9 + Math.sin(time * 2.0 + rig.baseYaw) * 0.008;
  const blinkPhase = (time + Math.abs(rig.baseYaw)) % 4.6;
  const blinkScaleY =
    blinkPhase > 4.44 ? Math.max(0.12, Math.abs(Math.cos((blinkPhase - 4.44) * 20))) : 1;
  for (let i = 0; i < rig.eyeMeshes.length; i++) {
    rig.eyeMeshes[i].scale.y = blinkScaleY;
  }

  // Turn smoothly toward player when nearby or talking
  const targetYaw = dist < 3.4 || isTalking ? Math.atan2(dx, dz) : rig.baseYaw;
  let diff = targetYaw - rig.root.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  rig.root.rotation.y += diff * Math.min(1, delta * 6);

  // Face nameplate cleanly toward player
  rig.nameplate.rotation.y = Math.atan2(dx, dz) - rig.root.rotation.y;

  // Ring color indicates unread dialogue topics (Warm Gold) vs completed (Emerald)
  const ringMat = rig.indicatorRing.material as THREE.MeshBasicMaterial;
  ringMat.color.setHex(isTalking ? 0xfbbf24 : hasUnreadTopic ? 0xd4af37 : 0x10b981);
  ringMat.opacity = isTalking ? 0.92 : dist < 3.0 ? 0.78 : 0.42;

  if (isTalking) {
    rig.head.rotation.x = THREE.MathUtils.lerp(rig.head.rotation.x, Math.sin(time * 5.2) * 0.05, damp);
    rig.head.rotation.y = THREE.MathUtils.lerp(rig.head.rotation.y, 0, damp);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(
      rig.rightArmPivot.rotation.x,
      -0.38 + Math.sin(time * 4.6) * 0.12,
      damp
    );
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(
      rig.leftArmPivot.rotation.x,
      rig.def.appearance.hasClipboard ? -0.58 : -0.16 + Math.cos(time * 3.8) * 0.07,
      damp
    );
  } else if (rig.def.idleAction === 'typing') {
    rig.head.rotation.x = THREE.MathUtils.lerp(rig.head.rotation.x, 0.08, damp);
    rig.head.rotation.y = THREE.MathUtils.lerp(rig.head.rotation.y, Math.sin(time * 0.9) * 0.08, damp);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(
      rig.rightArmPivot.rotation.x,
      -0.55 + Math.sin(time * 7.5) * 0.05,
      damp
    );
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(
      rig.leftArmPivot.rotation.x,
      -0.55 + Math.cos(time * 7.2) * 0.05,
      damp
    );
  } else if (rig.def.idleAction === 'clipboard') {
    rig.head.rotation.x = THREE.MathUtils.lerp(
      rig.head.rotation.x,
      0.16 + Math.sin(time * 1.4) * 0.03,
      damp
    );
    rig.head.rotation.y = THREE.MathUtils.lerp(rig.head.rotation.y, 0.08, damp);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, -0.68, damp);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(
      rig.rightArmPivot.rotation.x,
      -0.25 + Math.sin(time * 1.6) * 0.04,
      damp
    );
  } else if (rig.def.idleAction === 'inspecting') {
    rig.head.rotation.x = THREE.MathUtils.lerp(
      rig.head.rotation.x,
      -0.04 + Math.sin(time * 1.1) * 0.04,
      damp
    );
    rig.head.rotation.y = THREE.MathUtils.lerp(rig.head.rotation.y, Math.sin(time * 0.7) * 0.16, damp);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(
      rig.leftArmPivot.rotation.x,
      rig.def.appearance.hasClipboard ? -0.62 : 0.04,
      damp
    );
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -0.18, damp);
  } else {
    rig.head.rotation.x = THREE.MathUtils.lerp(rig.head.rotation.x, 0.02, damp);
    rig.head.rotation.y = THREE.MathUtils.lerp(rig.head.rotation.y, Math.sin(time * 0.6) * 0.06, damp);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(
      rig.leftArmPivot.rotation.x,
      rig.def.appearance.hasClipboard ? -0.58 : 0.04,
      damp
    );
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -0.04, damp);
  }
}
