import * as THREE from 'three';

export interface InvestigatorRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  leftArmPivot: THREE.Group;
  rightArmPivot: THREE.Group;
  leftForearmPivot: THREE.Group;
  rightForearmPivot: THREE.Group;
  leftLegPivot: THREE.Group;
  rightLegPivot: THREE.Group;
  leftKneePivot: THREE.Group;
  rightKneePivot: THREE.Group;
  eyeMeshes: THREE.Mesh[];
}

export function createInvestigatorCharacter(): InvestigatorRig {
  const root = new THREE.Group();

  // Materials with realistic tailored contrast (Smart Casual Digital Investigator)
  const coatMat = new THREE.MeshStandardMaterial({
    color: 0x182b22,
    roughness: 0.72,
    metalness: 0.06,
  });
  const shirtMat = new THREE.MeshStandardMaterial({
    color: 0xf5f2e9,
    roughness: 0.85,
    metalness: 0.02,
  });
  const trousersMat = new THREE.MeshStandardMaterial({
    color: 0x0c1912,
    roughness: 0.78,
    metalness: 0.05,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd9a88a,
    roughness: 0.58,
    metalness: 0.02,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x1e1b18,
    roughness: 0.82,
    metalness: 0.05,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x09110c,
    roughness: 0.35,
    metalness: 0.25,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    emissive: 0x10b981,
    emissiveIntensity: 0.22,
    roughness: 0.3,
    metalness: 0.5,
  });
  const badgeMat = new THREE.MeshStandardMaterial({
    color: 0xf5f2e9,
    roughness: 0.3,
    metalness: 0.1,
  });

  // Hips (base pelvis at ~0.92m above floor when standing)
  const hips = new THREE.Group();
  hips.position.set(0, 0.92, 0);
  root.add(hips);

  const pelvisMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.2), trousersMat);
  pelvisMesh.castShadow = true;
  hips.add(pelvisMesh);

  // Leather belt & brushed brass buckle
  const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.335, 0.036, 0.212), shoeMat);
  beltMesh.position.set(0, 0.055, 0);
  hips.add(beltMesh);
  const buckleMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.28, metalness: 0.85 });
  const buckleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.042, 0.015), buckleMat);
  buckleMesh.position.set(0, 0.055, 0.11);
  hips.add(buckleMesh);

  // Torso group
  const torso = new THREE.Group();
  torso.position.set(0, 0.07, 0);
  hips.add(torso);

  // Tailored tapered detective blazer torso + shoulders
  const chestMesh = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.22), coatMat);
  chestMesh.position.set(0, 0.29, 0);
  chestMesh.castShadow = true;
  torso.add(chestMesh);

  const waistMesh = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.15, 0.195), coatMat);
  waistMesh.position.set(0, 0.09, 0);
  waistMesh.castShadow = true;
  torso.add(waistMesh);

  // Shirt V-insert & collar
  const shirtFront = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.34, 0.228), shirtMat);
  shirtFront.position.set(0, 0.28, 0.005);
  torso.add(shirtFront);

  const collarLeft = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.14), shirtMat);
  collarLeft.position.set(-0.055, 0.465, 0.01);
  collarLeft.rotation.z = -0.25;
  torso.add(collarLeft);

  const collarRight = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 0.14), shirtMat);
  collarRight.position.set(0.055, 0.465, 0.01);
  collarRight.rotation.z = 0.25;
  torso.add(collarRight);

  // Coat lapels
  [-1, 1].forEach((side) => {
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.25, 0.025), coatMat);
    lapel.position.set(side * 0.075, 0.32, 0.115);
    lapel.rotation.z = side * 0.18;
    torso.add(lapel);
  });

  // Lanyard & digital investigation ID badge
  const lanyardMat = new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.5 });
  const lanyard = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.16, 0.01), lanyardMat);
  lanyard.position.set(0.09, 0.41, 0.112);
  lanyard.rotation.z = -0.15;
  torso.add(lanyard);

  const badge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.085, 0.015), badgeMat);
  badge.position.set(0.11, 0.305, 0.118);
  torso.add(badge);

  const badgeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.018, 0.018), accentMat);
  badgeStrip.position.set(0.11, 0.34, 0.12);
  torso.add(badgeStrip);

  // Neck + Contoured Head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.064, 0.1, 12), skinMat);
  neck.position.set(0, 0.49, 0);
  torso.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.56, 0);
  torso.add(head);

  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.118, 16, 14), skinMat);
  cranium.scale.set(0.92, 1.06, 1.0);
  cranium.position.set(0, 0.115, -0.005);
  cranium.castShadow = true;
  head.add(cranium);

  const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.155, 0.085, 0.15), skinMat);
  jaw.position.set(0, 0.048, 0.015);
  jaw.castShadow = true;
  head.add(jaw);

  // Nose bridge, mouth contour & ears
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.046, 0.03), skinMat);
  nose.position.set(0, 0.095, 0.112);
  head.add(nose);

  const mouthMat = new THREE.MeshStandardMaterial({ color: 0xa36d56, roughness: 0.7 });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.01, 0.012), mouthMat);
  mouth.position.set(0, 0.055, 0.096);
  head.add(mouth);

  // Realistic human eyes (sclera + iris) & eyebrows
  const eyeMeshes: THREE.Mesh[] = [];
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf5f2e9, roughness: 0.35 });
  const irisMat = new THREE.MeshBasicMaterial({ color: 0x171412 });
  [-0.042, 0.042].forEach((ex) => {
    const sclera = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.014, 0.012), scleraMat);
    sclera.position.set(ex, 0.118, 0.104);
    head.add(sclera);
    eyeMeshes.push(sclera);
    const iris = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.014), irisMat);
    iris.position.set(ex, 0.118, 0.106);
    head.add(iris);
    eyeMeshes.push(iris);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.009, 0.014), hairMat);
    brow.position.set(ex, 0.138, 0.106);
    head.add(brow);
  });

  [-1, 1].forEach((side) => {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.05, 0.032), skinMat);
    ear.position.set(side * 0.11, 0.105, -0.005);
    head.add(ear);
  });

  // Hair cap (sculpted crown + sideburns + back)
  const hairTop = new THREE.Mesh(new THREE.SphereGeometry(0.123, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.54), hairMat);
  hairTop.scale.set(0.93, 0.95, 1.03);
  hairTop.position.set(0, 0.135, -0.008);
  hairTop.castShadow = true;
  head.add(hairTop);

  const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.13, 0.075), hairMat);
  hairBack.position.set(0, 0.105, -0.085);
  head.add(hairBack);

  // Subtle realistic eyeglasses (no glowing sci-fi visor)
  const glassesRimMat = new THREE.MeshStandardMaterial({ color: 0x1e2c24, roughness: 0.3, metalness: 0.7 });
  const glassesBridge = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.006, 0.012), glassesRimMat);
  glassesBridge.position.set(0, 0.12, 0.114);
  head.add(glassesBridge);
  [-0.042, 0.042].forEach((gx) => {
    const lensFrame = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.03, 0.008), glassesRimMat);
    lensFrame.position.set(gx, 0.118, 0.113);
    head.add(lensFrame);
    const lensGlass = new THREE.Mesh(
      new THREE.BoxGeometry(0.044, 0.022, 0.01),
      new THREE.MeshPhysicalMaterial({ color: 0xf5f2e9, transparent: true, opacity: 0.25, roughness: 0.08 })
    );
    lensGlass.position.set(gx, 0.118, 0.114);
    head.add(lensGlass);
  });

  // Articulated Arms with shoulder caps, shirt cuffs, and wristwatch
  function buildArm(side: -1 | 1) {
    const shoulderPivot = new THREE.Group();
    shoulderPivot.position.set(side * 0.225, 0.41, 0);
    torso.add(shoulderPivot);

    const shoulderCap = new THREE.Mesh(new THREE.SphereGeometry(0.058, 10, 10), coatMat);
    shoulderPivot.add(shoulderCap);

    const upperArm = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.046, 0.25, 10), coatMat);
    upperArm.position.set(0, -0.125, 0);
    upperArm.castShadow = true;
    shoulderPivot.add(upperArm);

    const forearmPivot = new THREE.Group();
    forearmPivot.position.set(0, -0.25, 0);
    shoulderPivot.add(forearmPivot);

    const lowerArm = new THREE.Mesh(new THREE.CylinderGeometry(0.044, 0.038, 0.22, 10), coatMat);
    lowerArm.position.set(0, -0.11, 0);
    lowerArm.castShadow = true;
    forearmPivot.add(lowerArm);

    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.038, 0.025, 10), shirtMat);
    cuff.position.set(0, -0.225, 0);
    forearmPivot.add(cuff);

    if (side === -1) {
      const watch = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.018, 10), buckleMat);
      watch.position.set(0, -0.215, 0);
      forearmPivot.add(watch);
    }

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.078, 0.068), skinMat);
    hand.position.set(0, -0.27, 0);
    forearmPivot.add(hand);

    return { shoulderPivot, forearmPivot };
  }

  const leftArm = buildArm(-1);
  const rightArm = buildArm(1);

  // Articulated Legs with tapered trousers and tailored dress shoes
  function buildLeg(side: -1 | 1) {
    const hipPivot = new THREE.Group();
    hipPivot.position.set(side * 0.095, -0.05, 0);
    hips.add(hipPivot);

    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.06, 0.42, 10), trousersMat);
    thigh.position.set(0, -0.21, 0);
    thigh.castShadow = true;
    hipPivot.add(thigh);

    const kneePivot = new THREE.Group();
    kneePivot.position.set(0, -0.42, 0);
    hipPivot.add(kneePivot);

    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.048, 0.4, 10), trousersMat);
    shin.position.set(0, -0.2, 0);
    shin.castShadow = true;
    kneePivot.add(shin);

    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.105, 0.075, 0.21), shoeMat);
    shoe.position.set(0, -0.42, 0.035);
    shoe.castShadow = true;
    kneePivot.add(shoe);

    return { hipPivot, kneePivot };
  }

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);

  return {
    root,
    hips,
    torso,
    head,
    leftArmPivot: leftArm.shoulderPivot,
    rightArmPivot: rightArm.shoulderPivot,
    leftForearmPivot: leftArm.forearmPivot,
    rightForearmPivot: rightArm.forearmPivot,
    leftLegPivot: leftLeg.hipPivot,
    rightLegPivot: rightLeg.hipPivot,
    leftKneePivot: leftLeg.kneePivot,
    rightKneePivot: rightLeg.kneePivot,
    eyeMeshes,
  };
}

export function animateInvestigator(
  rig: InvestigatorRig,
  mode: 'idle' | 'walk' | 'run' | 'sit',
  time: number,
  delta: number
) {
  const dampSpeed = Math.min(1, delta * 12);

  // Periodic natural eye blink (~every 4.2s)
  const blinkCycle = time % 4.2;
  const blinkScaleY = blinkCycle > 4.04 ? Math.max(0.12, Math.abs(Math.cos((blinkCycle - 4.04) * 20))) : 1;
  for (let i = 0; i < rig.eyeMeshes.length; i++) {
    rig.eyeMeshes[i].scale.y = blinkScaleY;
  }

  if (mode === 'sit') {
    rig.hips.position.y = THREE.MathUtils.lerp(rig.hips.position.y, 0.52, dampSpeed);
    rig.torso.rotation.x = THREE.MathUtils.lerp(rig.torso.rotation.x, 0.06, dampSpeed);
    rig.head.rotation.x = THREE.MathUtils.lerp(rig.head.rotation.x, -0.04 + Math.sin(time * 0.9) * 0.015, dampSpeed);
    rig.head.rotation.y = THREE.MathUtils.lerp(rig.head.rotation.y, Math.sin(time * 0.55) * 0.04, dampSpeed);

    // Legs bent 90 deg forward for sitting on office chair
    rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, -1.45, dampSpeed);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, -1.45, dampSpeed);
    rig.leftKneePivot.rotation.x = THREE.MathUtils.lerp(rig.leftKneePivot.rotation.x, 1.45, dampSpeed);
    rig.rightKneePivot.rotation.x = THREE.MathUtils.lerp(rig.rightKneePivot.rotation.x, 1.45, dampSpeed);

    // Arms reaching forward to type on keyboard
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, -0.78, dampSpeed);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -0.78, dampSpeed);
    rig.leftForearmPivot.rotation.x = THREE.MathUtils.lerp(
      rig.leftForearmPivot.rotation.x,
      -0.65 + Math.sin(time * 14) * 0.04,
      dampSpeed
    );
    rig.rightForearmPivot.rotation.x = THREE.MathUtils.lerp(
      rig.rightForearmPivot.rotation.x,
      -0.65 + Math.cos(time * 15) * 0.04,
      dampSpeed
    );
    return;
  }

  if (mode === 'idle') {
    const breath = Math.sin(time * 2.1) * 0.01;
    rig.hips.position.y = THREE.MathUtils.lerp(rig.hips.position.y, 0.92 + breath, dampSpeed);
    rig.torso.rotation.x = THREE.MathUtils.lerp(rig.torso.rotation.x, 0.02 + Math.sin(time * 2.1) * 0.01, dampSpeed);
    rig.head.rotation.x = THREE.MathUtils.lerp(rig.head.rotation.x, Math.sin(time * 1.1) * 0.02, dampSpeed);
    rig.head.rotation.y = THREE.MathUtils.lerp(rig.head.rotation.y, Math.sin(time * 0.6) * 0.07, dampSpeed);
    rig.leftLegPivot.rotation.x = THREE.MathUtils.lerp(rig.leftLegPivot.rotation.x, 0, dampSpeed);
    rig.rightLegPivot.rotation.x = THREE.MathUtils.lerp(rig.rightLegPivot.rotation.x, 0, dampSpeed);
    rig.leftKneePivot.rotation.x = THREE.MathUtils.lerp(rig.leftKneePivot.rotation.x, 0, dampSpeed);
    rig.rightKneePivot.rotation.x = THREE.MathUtils.lerp(rig.rightKneePivot.rotation.x, 0, dampSpeed);
    rig.leftArmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftArmPivot.rotation.x, 0.04 + Math.sin(time * 1.5) * 0.02, dampSpeed);
    rig.rightArmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightArmPivot.rotation.x, -0.04 - Math.sin(time * 1.5) * 0.02, dampSpeed);
    rig.leftForearmPivot.rotation.x = THREE.MathUtils.lerp(rig.leftForearmPivot.rotation.x, -0.15, dampSpeed);
    rig.rightForearmPivot.rotation.x = THREE.MathUtils.lerp(rig.rightForearmPivot.rotation.x, -0.15, dampSpeed);
    return;
  }

  const isRun = mode === 'run';
  const freq = isRun ? 11.5 : 7.2;
  const amp = isRun ? 0.68 : 0.44;
  const phase = time * freq;
  const stride = Math.sin(phase);
  const bob = Math.abs(Math.cos(phase)) * (isRun ? 0.055 : 0.028);

  rig.hips.position.y = THREE.MathUtils.lerp(rig.hips.position.y, 0.91 + bob, dampSpeed * 1.4);
  rig.torso.rotation.x = THREE.MathUtils.lerp(rig.torso.rotation.x, isRun ? 0.14 : 0.05, dampSpeed);
  rig.head.rotation.x = THREE.MathUtils.lerp(rig.head.rotation.x, isRun ? -0.08 : -0.02, dampSpeed);

  rig.leftLegPivot.rotation.x = stride * amp;
  rig.rightLegPivot.rotation.x = -stride * amp;
  rig.leftKneePivot.rotation.x = Math.max(0, -stride) * (isRun ? 0.75 : 0.42);
  rig.rightKneePivot.rotation.x = Math.max(0, stride) * (isRun ? 0.75 : 0.42);

  rig.leftArmPivot.rotation.x = -stride * amp * 0.72;
  rig.rightArmPivot.rotation.x = stride * amp * 0.72;
  rig.leftForearmPivot.rotation.x = isRun ? -0.65 : -0.28;
  rig.rightForearmPivot.rotation.x = isRun ? -0.65 : -0.28;
}
