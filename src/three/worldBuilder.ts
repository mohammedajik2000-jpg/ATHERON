import * as THREE from 'three';
import { WORLD_CLUES } from '../data/caseData';
import { CASE_NPCS } from '../data/npcs';
import { ClueDefinition, ClueId, NpcId, RoomId } from '../types/game';
import { createNpcCharacter, NpcRig } from './npcModels';
import {
  createFloorTileTexture,
  createMonitorScreenTexture,
  createPlaqueTexture,
  createServerFloorTexture,
  createWhiteboardTexture,
} from './textures';

export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  tag?: string;
}

export interface RoomZone {
  id: RoomId;
  label: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface DoorController {
  id: string;
  center: THREE.Vector3;
  leftLeaf: THREE.Mesh;
  rightLeaf: THREE.Mesh;
  axis: 'x' | 'z';
  baseOffset: number;
  openProgress: number;
  isOpen: boolean;
}

export interface CluePropHandle {
  clue: ClueDefinition;
  group: THREE.Group;
  beacon: THREE.Mesh;
  ring: THREE.Mesh;
  worldPos: THREE.Vector3;
}

export interface InvestigationStation {
  triggerPos: THREE.Vector3;
  seatPos: THREE.Vector3;
  seatYaw: number;
  cameraPos: THREE.Vector3;
  cameraLookAt: THREE.Vector3;
  monitorScreenMat: THREE.MeshStandardMaterial;
}

export interface BuiltWorld {
  colliders: AABB[];
  rooms: RoomZone[];
  doors: DoorController[];
  clueProps: Map<ClueId, CluePropHandle>;
  npcRigs: Map<NpcId, NpcRig>;
  station: InvestigationStation;
  animatedLedStrips: THREE.Mesh[];
}

export function buildCorporateWorld(scene: THREE.Scene, maxAnisotropy: number): BuiltWorld {
  const colliders: AABB[] = [];
  const doors: DoorController[] = [];
  const clueProps = new Map<ClueId, CluePropHandle>();
  const npcRigs = new Map<NpcId, NpcRig>();
  const animatedLedStrips: THREE.Mesh[] = [];

  const rooms: RoomZone[] = [
    { id: 'exterior', label: 'Harbor & Finch Corporate Plaza', minX: -10, maxX: 4, minZ: 14, maxZ: 24 },
    { id: 'reception', label: 'Corporate Reception & Executive Lobby', minX: -10, maxX: 4, minZ: 6, maxZ: 14 },
    { id: 'support_dept', label: 'Network Operations Room (NOC)', minX: -18, maxX: -10, minZ: 6, maxZ: 14 },
    { id: 'finance', label: 'Finance Department', minX: -18, maxX: -10, minZ: -4, maxZ: 6 },
    { id: 'it_dept', label: 'Security Operations Centre (SOC)', minX: -18, maxX: -10, minZ: -14, maxZ: -4 },
    { id: 'main_office', label: 'Modern Corporate Office', minX: -10, maxX: 4, minZ: -4, maxZ: 6 },
    { id: 'vendor_dept', label: 'Vendor Management Department', minX: 4, maxX: 16, minZ: 1, maxZ: 11 },
    { id: 'server_room', label: 'Server Room & Data Centre', minX: 4, maxX: 16, minZ: -13, maxZ: -2 },
    {
      id: 'investigation_room',
      label: 'Digital Investigation Room',
      minX: -10,
      maxX: 4,
      minZ: -14,
      maxZ: -4,
    },
  ];

  // Shared PBR Materials — Deep Forest Green / Emerald / Warm Gold / Soft Ivory corporate palette
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x132b20,
    roughness: 0.78,
    metalness: 0.08,
  });
  const wallAccentMat = new THREE.MeshStandardMaterial({
    color: 0x0a1c14,
    roughness: 0.64,
    metalness: 0.16,
  });
  const glassWallMat = new THREE.MeshPhysicalMaterial({
    color: 0xa7f3d0,
    roughness: 0.08,
    metalness: 0.05,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1e382b,
    roughness: 0.35,
    metalness: 0.75,
  });
  const deskTopMat = new THREE.MeshStandardMaterial({
    color: 0x162b21,
    roughness: 0.42,
    metalness: 0.14,
  });
  const woodDeskMat = new THREE.MeshStandardMaterial({
    color: 0x463224,
    roughness: 0.55,
    metalness: 0.06,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: 0x07150e,
    roughness: 0.32,
    metalness: 0.82,
  });
  const fabricMat = new THREE.MeshStandardMaterial({
    color: 0x12291f,
    roughness: 0.9,
    metalness: 0.02,
  });
  const loungeFabricMat = new THREE.MeshStandardMaterial({
    color: 0x1c3d2d,
    roughness: 0.88,
    metalness: 0.04,
  });
  const screenStandbyTex = createMonitorScreenTexture('standby', maxAnisotropy);
  const screenWorkstationTex = createMonitorScreenTexture('workstation', maxAnisotropy);
  const socMapTex = createMonitorScreenTexture('soc_map', maxAnisotropy);
  const nocWallTex = createMonitorScreenTexture('noc_wall', maxAnisotropy);
  const socOpsTex = createMonitorScreenTexture('soc_ops', maxAnisotropy);

  const genericScreenMat = new THREE.MeshStandardMaterial({
    map: screenStandbyTex,
    emissive: 0x059669,
    emissiveMap: screenStandbyTex,
    emissiveIntensity: 0.65,
    roughness: 0.2,
    metalness: 0.1,
  });

  // Procedural Floor Textures
  const lobbyFloorTex = createFloorTileTexture('#0a2117', '#04140d', '#d4af37', maxAnisotropy, 10, 8);
  const officeFloorTex = createFloorTileTexture('#0e271c', '#06180f', '#10b981', maxAnisotropy, 12, 10);
  const plazaFloorTex = createFloorTileTexture('#071a12', '#04140d', '#d4af37', maxAnisotropy, 10, 8);
  const serverFloorTex = createServerFloorTexture(maxAnisotropy);

  // Exterior Ground & Corporate Skyline
  const exteriorGround = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 190),
    new THREE.MeshStandardMaterial({ color: 0x030e09, roughness: 0.92, metalness: 0.05 })
  );
  exteriorGround.rotation.x = -Math.PI / 2;
  exteriorGround.position.y = -0.04;
  exteriorGround.receiveShadow = true;
  scene.add(exteriorGround);

  const towerBodyMat = new THREE.MeshStandardMaterial({ color: 0x061910, roughness: 0.5, metalness: 0.4 });
  const towerGlowMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    emissive: 0xb48a1c,
    emissiveIntensity: 0.95,
    roughness: 0.25,
  });
  const towerPositions: [number, number, number, number, number][] = [
    [-28, 22, 12, 6, 6],
    [-26, 26, -12, 7, 5],
    [28, 28, 10, 6, 7],
    [30, 32, -8, 8, 6],
    [-14, 24, 34, 8, 6],
    [10, 30, 35, 7, 7],
    [0, 36, -32, 10, 6],
    [-22, 18, -26, 6, 6],
  ];
  towerPositions.forEach(([tx, th, tz, tw, td]) => {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(tw, th, td), towerBodyMat);
    tower.position.set(tx, th / 2 - 2, tz);
    scene.add(tower);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(tw + 0.1, 0.28, td + 0.1), towerGlowMat);
    crown.position.set(tx, th - 2.3, tz);
    scene.add(crown);
  });

  function addFloor(
    minX: number,
    maxX: number,
    minZ: number,
    maxZ: number,
    mat: THREE.Material,
    yOffset = 0
  ) {
    const w = maxX - minX;
    const d = maxZ - minZ;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((minX + maxX) / 2, yOffset, (minZ + maxZ) / 2);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const plazaFloorMat = new THREE.MeshStandardMaterial({
    map: plazaFloorTex,
    roughness: 0.55,
    metalness: 0.12,
  });
  const lobbyFloorMat = new THREE.MeshStandardMaterial({
    map: lobbyFloorTex,
    roughness: 0.25,
    metalness: 0.15,
  });
  const officeFloorMat = new THREE.MeshStandardMaterial({
    map: officeFloorTex,
    roughness: 0.62,
    metalness: 0.08,
  });
  const serverFloorMat = new THREE.MeshStandardMaterial({
    map: serverFloorTex,
    roughness: 0.35,
    metalness: 0.45,
  });
  const socFloorMat = new THREE.MeshStandardMaterial({
    map: lobbyFloorTex,
    color: 0x0b261a,
    roughness: 0.35,
    metalness: 0.18,
  });

  // Floors for Exterior Plaza + all 8 interior rooms
  addFloor(-10, 4, 14, 24, plazaFloorMat, -0.01);
  addFloor(-10, 4, 6, 14, lobbyFloorMat, 0);
  addFloor(-18, -10, 6, 14, officeFloorMat, 0); // Support Dept
  addFloor(-18, -10, -4, 6, officeFloorMat, 0); // Finance Dept
  addFloor(-18, -10, -14, -4, officeFloorMat, 0); // IT Dept
  addFloor(-10, 4, -4, 6, officeFloorMat, 0); // Main Office
  addFloor(4, 16, 1, 11, officeFloorMat, 0); // Vendor Integration
  addFloor(4, 16, -13, -2, serverFloorMat, 0.01); // Server Room
  addFloor(-10, 4, -14, -4, socFloorMat, 0); // Investigation Room

  // Ceilings & architectural lights
  const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x061910, roughness: 0.85, metalness: 0.1 });
  const lightStripMat = new THREE.MeshStandardMaterial({
    color: 0xf5f2e9,
    emissive: 0xe6dec8,
    emissiveIntensity: 1.2,
    roughness: 0.2,
  });
  const socLightStripMat = new THREE.MeshStandardMaterial({
    color: 0x34d399,
    emissive: 0x10b981,
    emissiveIntensity: 1.35,
    roughness: 0.2,
  });

  function addCeilingWithLights(cx: number, cz: number, w: number, d: number, isAccent = false) {
    const ceil = new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, d), ceilingMat);
    ceil.position.set(cx, 3.68, cz);
    scene.add(ceil);
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(Math.max(1.2, w * 0.45), 0.06, 0.22),
      isAccent ? socLightStripMat : lightStripMat
    );
    strip.position.set(cx, 3.58, cz);
    scene.add(strip);
  }

  addCeilingWithLights(-3, 10, 14, 8);
  addCeilingWithLights(-14, 10, 8, 8);
  addCeilingWithLights(-14, 1, 8, 10);
  addCeilingWithLights(-14, -9, 8, 10, true);
  addCeilingWithLights(-3, 1, 14, 10);
  addCeilingWithLights(10, 6, 12, 10);
  addCeilingWithLights(10, -7.5, 12, 11, true);
  addCeilingWithLights(-3, -9, 14, 10, true);

  // Exterior Entrance Canopy & Illuminated Corporate Facade Sign
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.22, 3.2), wallAccentMat);
  canopy.position.set(-3.0, 3.45, 15.6);
  canopy.castShadow = true;
  scene.add(canopy);
  const canopyTrim = new THREE.Mesh(new THREE.BoxGeometry(6.9, 0.06, 3.25), towerGlowMat);
  canopyTrim.position.set(-3.0, 3.34, 15.6);
  scene.add(canopyTrim);

  [-6.0, 0.0].forEach((px) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.28), frameMat);
    pillar.position.set(px, 1.7, 17.0);
    pillar.castShadow = true;
    scene.add(pillar);
    addCollider(px, 17.0, 0.35, 0.35);
  });

  // Illuminated plaza walkway rails / low bollards so player stays within corporate grounds
  addCollider(-10.5, 19.0, 0.5, 10.0);
  addCollider(4.5, 19.0, 0.5, 10.0);
  addCollider(-3.0, 24.4, 15.0, 0.6);

  const WALL_H = 3.6;
  const WALL_T = 0.24;

  function addCollider(cx: number, cz: number, w: number, d: number, tag?: string) {
    colliders.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
      tag,
    });
  }

  function addSolidWall(x1: number, z1: number, x2: number, z2: number, mat: THREE.Material = wallMat) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) return;
    const isHorizontal = Math.abs(dx) >= Math.abs(dz);
    const w = isHorizontal ? len : WALL_T;
    const d = isHorizontal ? WALL_T : len;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, d), mat);
    mesh.position.set((x1 + x2) / 2, WALL_H / 2, (z1 + z2) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);

    const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.12, d + 0.02), darkMetalMat);
    trim.position.set((x1 + x2) / 2, 0.06, (z1 + z2) / 2);
    scene.add(trim);

    colliders.push({
      minX: (x1 + x2) / 2 - w / 2,
      maxX: (x1 + x2) / 2 + w / 2,
      minZ: (z1 + z2) / 2 - d / 2,
      maxZ: (z1 + z2) / 2 + d / 2,
    });
  }

  function addWindowWall(x1: number, z1: number, x2: number, z2: number) {
    const dx = x2 - x1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dz);
    const isHorizontal = Math.abs(dx) >= Math.abs(dz);
    const w = isHorizontal ? len : WALL_T;
    const d = isHorizontal ? WALL_T : len;
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;

    const lower = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9, d), wallAccentMat);
    lower.position.set(cx, 0.45, cz);
    lower.receiveShadow = true;
    scene.add(lower);

    const upper = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), wallAccentMat);
    upper.position.set(cx, 3.35, cz);
    scene.add(upper);

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(isHorizontal ? len : 0.06, 2.0, isHorizontal ? 0.06 : len),
      glassWallMat
    );
    glass.position.set(cx, 2.0, cz);
    scene.add(glass);

    const count = Math.max(2, Math.floor(len / 2.8));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const mx = THREE.MathUtils.lerp(x1, x2, t);
      const mz = THREE.MathUtils.lerp(z1, z2, t);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.1, 0.1), frameMat);
      post.position.set(mx, 2.0, mz);
      scene.add(post);
    }

    colliders.push({
      minX: cx - w / 2,
      maxX: cx + w / 2,
      minZ: cz - d / 2,
      maxZ: cz + d / 2,
    });
  }

  function addGlassPartitionWithDoor(
    id: string,
    x1: number,
    z1: number,
    x2: number,
    z2: number,
    doorCenterCoord: number,
    doorWidth = 2.6
  ) {
    const isHorizontal = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
    const start = isHorizontal ? Math.min(x1, x2) : Math.min(z1, z2);
    const end = isHorizontal ? Math.max(x1, x2) : Math.max(z1, z2);
    const doorMin = doorCenterCoord - doorWidth / 2;
    const doorMax = doorCenterCoord + doorWidth / 2;

    if (doorMin > start + 0.1) {
      if (isHorizontal) addWindowWall(start, z1, doorMin, z1);
      else addWindowWall(x1, start, x1, doorMin);
    }
    if (end > doorMax + 0.1) {
      if (isHorizontal) addWindowWall(doorMax, z1, end, z1);
      else addWindowWall(x1, doorMax, x1, end);
    }

    const lintelW = isHorizontal ? doorWidth : WALL_T;
    const lintelD = isHorizontal ? WALL_T : doorWidth;
    const cx = isHorizontal ? doorCenterCoord : x1;
    const cz = isHorizontal ? z1 : doorCenterCoord;

    const lintel = new THREE.Mesh(new THREE.BoxGeometry(lintelW, 0.9, lintelD), wallAccentMat);
    lintel.position.set(cx, 3.15, cz);
    scene.add(lintel);

    const leafW = doorWidth / 2 - 0.04;
    const leafGeo = new THREE.BoxGeometry(
      isHorizontal ? leafW : 0.06,
      2.65,
      isHorizontal ? 0.06 : leafW
    );
    const leftLeaf = new THREE.Mesh(leafGeo, glassWallMat);
    const rightLeaf = new THREE.Mesh(leafGeo, glassWallMat);

    const edgeTrimGeo = new THREE.BoxGeometry(
      isHorizontal ? 0.06 : 0.08,
      2.65,
      isHorizontal ? 0.08 : 0.06
    );
    const leftTrim = new THREE.Mesh(edgeTrimGeo, frameMat);
    leftTrim.position.set(isHorizontal ? leafW / 2 - 0.03 : 0, 0, isHorizontal ? 0 : leafW / 2 - 0.03);
    leftLeaf.add(leftTrim);

    const rightTrim = new THREE.Mesh(edgeTrimGeo, frameMat);
    rightTrim.position.set(
      isHorizontal ? -leafW / 2 + 0.03 : 0,
      0,
      isHorizontal ? 0 : -leafW / 2 + 0.03
    );
    rightLeaf.add(rightTrim);

    const offset = doorWidth / 4;
    if (isHorizontal) {
      leftLeaf.position.set(cx - offset, 1.33, cz);
      rightLeaf.position.set(cx + offset, 1.33, cz);
    } else {
      leftLeaf.position.set(cx, 1.33, cz - offset);
      rightLeaf.position.set(cx, 1.33, cz + offset);
    }

    scene.add(leftLeaf, rightLeaf);

    doors.push({
      id,
      center: new THREE.Vector3(cx, 0, cz),
      leftLeaf,
      rightLeaf,
      axis: isHorizontal ? 'x' : 'z',
      baseOffset: offset,
      openProgress: 0,
      isOpen: false,
    });
  }

  // --- BUILD ARCHITECTURAL PERIMETER & INTERIOR PARTITIONS (8 ROOMS + EXTERIOR) ---
  // Reception (x: -10..4, z: 6..14)
  addGlassPartitionWithDoor('door_entrance', -10, 14, 4, 14, -3, 2.8); // Exterior <-> Reception
  addGlassPartitionWithDoor('door_support', -10, 6, -10, 14, 10, 2.4); // Reception <-> Support Dept
  addWindowWall(4, 6, 4, 14);
  addGlassPartitionWithDoor('door_reception', -10, 6, 4, 6, -3, 2.8); // Reception <-> Main Office

  // Support Department (x: -18..-10, z: 6..14)
  addWindowWall(-18, 6, -18, 14);
  addWindowWall(-18, 14, -10, 14);
  addGlassPartitionWithDoor('door_support_finance', -18, 6, -10, 6, -14, 2.4);

  // Finance Department (x: -18..-10, z: -4..6)
  addGlassPartitionWithDoor('door_finance', -10, -4, -10, 6, 1, 2.6); // Finance <-> Main Office
  addWindowWall(-18, -4, -18, 6);
  addGlassPartitionWithDoor('door_it_finance', -18, -4, -10, -4, -14, 2.4); // Finance <-> IT Dept

  // IT & Security Department (x: -18..-10, z: -14..-4)
  addWindowWall(-18, -14, -18, -4);
  addWindowWall(-18, -14, -10, -14);
  addGlassPartitionWithDoor('door_it_investigation', -10, -14, -10, -4, -9, 2.4); // IT <-> Investigation Room

  // Main Office east <-> Vendor Dept & Server Room
  addGlassPartitionWithDoor('door_vendor', 4, 1, 4, 6, 3.5, 2.4);
  addSolidWall(4, -2, 4, 1);
  addGlassPartitionWithDoor('door_server', 4, -4, 4, -2, -3, 1.8);

  // Vendor Integration Dept outer walls (x: 4..16, z: 1..11)
  addSolidWall(4, 6, 4, 11);
  addSolidWall(4, 11, 16, 11);
  addWindowWall(16, 1, 16, 11);
  addSolidWall(4, 1, 16, 1, wallAccentMat);

  // Server Room outer walls (x: 4..16, z: -13..-2)
  addSolidWall(4, -13, 4, -4);
  addSolidWall(4, -2, 16, -2, wallAccentMat);
  addSolidWall(16, -13, 16, -2, wallAccentMat);
  addSolidWall(4, -13, 16, -13, wallAccentMat);

  // Investigation Room (x: -10..4, z: -14..-4)
  addGlassPartitionWithDoor('door_investigation', -10, -4, 4, -4, -3, 2.8);
  addSolidWall(4, -14, 4, -4, wallAccentMat);
  addWindowWall(-10, -14, 4, -14);

  // --- ROOM SIGNAGE PLAQUES ---
  function addPlaque(
    title: string,
    subtitle: string,
    accent: string,
    x: number,
    y: number,
    z: number,
    rotY: number,
    w = 2.2,
    h = 0.68
  ) {
    const tex = createPlaqueTexture(title, subtitle, accent, maxAnisotropy);
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      emissive: 0x0f172a,
      emissiveMap: tex,
      emissiveIntensity: 0.45,
      roughness: 0.3,
      metalness: 0.2,
    });
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), mat);
    plaque.position.set(x, y, z);
    plaque.rotation.y = rotY;
    scene.add(plaque);
  }

  addPlaque('HARBOR & FINCH', 'FREIGHT PVT. LTD. · HQ', '#d4af37', -3.0, 3.85, 17.25, 0, 4.2, 1.05);
  addPlaque('CORPORATE RECEPTION', 'Visitor Access & Operations Lobby', '#10b981', -9.75, 2.82, 10.0, Math.PI / 2, 2.4, 0.65);
  addPlaque('NETWORK OPERATIONS (NOC)', 'Routing, Firewalls & Telemetry', '#10b981', -9.84, 2.82, 10.0, -Math.PI / 2, 1.95, 0.52);
  addPlaque('FINANCE DEPT.', 'Treasury Control & ERP Ledgers', '#d4af37', -9.84, 2.82, 1.0, Math.PI / 2, 1.9, 0.52);
  addPlaque('SECURITY OPERATIONS (SOC)', 'SIEM, IAM & Incident Triage', '#10b981', -9.84, 2.82, -9.0, -Math.PI / 2, 2.0, 0.52);
  addPlaque('VENDOR MANAGEMENT', 'Partner Governance & Contracts', '#d4af37', 3.84, 2.82, 3.5, -Math.PI / 2, 2.0, 0.52);
  addPlaque('SERVER & DATA CENTRE', 'Edge Gateway, UPS & Core Racks', '#10b981', 3.84, 2.82, -3.0, -Math.PI / 2, 1.95, 0.5);
  addPlaque('DIGITAL INVESTIGATION', 'TRUSTLOCK Vault & Recovery · CR-26-047', '#d4af37', -3.0, 2.82, -3.84, 0, 2.45, 0.56);

  // Whiteboard in Vendor Management Dept
  const wbTex = createWhiteboardTexture(maxAnisotropy);
  const wbMesh = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.9, 0.06),
    new THREE.MeshStandardMaterial({ map: wbTex, roughness: 0.3, metalness: 0.05 })
  );
  wbMesh.position.set(10.0, 1.85, 1.18);
  scene.add(wbMesh);

  // Digital Investigation Wallboard on East wall of Digital Investigation Room
  const socWallScreen = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 1.8, 0.08),
    new THREE.MeshStandardMaterial({
      map: socMapTex,
      emissive: 0x059669,
      emissiveMap: socMapTex,
      emissiveIntensity: 0.65,
      roughness: 0.25,
    })
  );
  socWallScreen.position.set(3.82, 1.95, -9.2);
  socWallScreen.rotation.y = -Math.PI / 2;
  scene.add(socWallScreen);

  // NOC Wall Telemetry Board (West wall of Network Operations Room)
  const nocWallScreen = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 1.65, 0.08),
    new THREE.MeshStandardMaterial({
      map: nocWallTex,
      emissive: 0x059669,
      emissiveMap: nocWallTex,
      emissiveIntensity: 0.62,
      roughness: 0.25,
    })
  );
  nocWallScreen.position.set(-17.82, 1.95, 10.0);
  nocWallScreen.rotation.y = Math.PI / 2;
  scene.add(nocWallScreen);

  // SOC SIEM & IAM Wallboard (West wall of Security Operations Centre)
  const socOpsScreen = new THREE.Mesh(
    new THREE.BoxGeometry(3.0, 1.65, 0.08),
    new THREE.MeshStandardMaterial({
      map: socOpsTex,
      emissive: 0x059669,
      emissiveMap: socOpsTex,
      emissiveIntensity: 0.62,
      roughness: 0.25,
    })
  );
  socOpsScreen.position.set(-17.82, 1.95, -9.0);
  socOpsScreen.rotation.y = Math.PI / 2;
  scene.add(socOpsScreen);

  function createOfficeChair(x: number, z: number, rotY: number, seatTint = 0x1e293b): THREE.Group {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;

    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.06, 10), darkMetalMat);
    hub.position.y = 0.07;
    g.add(hub);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.28), darkMetalMat);
      leg.position.set(Math.sin(angle) * 0.14, 0.045, Math.cos(angle) * 0.14);
      leg.rotation.y = angle;
      g.add(leg);
    }

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.36, 10), frameMat);
    stem.position.y = 0.25;
    g.add(stem);

    const cushionMat =
      seatTint === 0x1e293b ? fabricMat : new THREE.MeshStandardMaterial({ color: seatTint, roughness: 0.88 });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.48), cushionMat);
    seat.position.y = 0.45;
    seat.castShadow = true;
    g.add(seat);

    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.05), darkMetalMat);
    spine.position.set(0, 0.68, -0.23);
    g.add(spine);

    const back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.07), cushionMat);
    back.position.set(0, 0.78, -0.21);
    back.rotation.x = -0.08;
    back.castShadow = true;
    g.add(back);

    [-0.26, 0.26].forEach((ax) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.32), darkMetalMat);
      arm.position.set(ax, 0.63, -0.02);
      g.add(arm);
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.18, 0.04), frameMat);
      post.position.set(ax, 0.54, -0.05);
      g.add(post);
    });

    scene.add(g);
    return g;
  }

  function createWorkstationDesk(
    x: number,
    z: number,
    rotY: number,
    options: {
      wood?: boolean;
      withChair?: boolean;
      heroMonitor?: boolean;
      width?: number;
      depth?: number;
    } = {}
  ) {
    const w = options.width ?? 1.7;
    const d = options.depth ?? 0.85;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;

    const top = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.055, d),
      options.wood ? woodDeskMat : deskTopMat
    );
    top.position.y = 0.74;
    top.castShadow = true;
    top.receiveShadow = true;
    g.add(top);

    const legGeo = new THREE.BoxGeometry(0.06, 0.72, 0.06);
    [
      [-w / 2 + 0.08, -d / 2 + 0.08],
      [w / 2 - 0.08, -d / 2 + 0.08],
      [-w / 2 + 0.08, d / 2 - 0.08],
      [w / 2 - 0.08, d / 2 - 0.08],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(legGeo, darkMetalMat);
      leg.position.set(lx, 0.36, lz);
      leg.castShadow = true;
      g.add(leg);
    });

    const standBase = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.025, 0.2), darkMetalMat);
    standBase.position.set(0, 0.78, -0.18);
    g.add(standBase);

    const standNeck = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.28, 0.05), frameMat);
    standNeck.position.set(0, 0.91, -0.22);
    g.add(standNeck);

    const monW = options.heroMonitor ? 1.12 : 0.72;
    const monH = options.heroMonitor ? 0.64 : 0.42;
    const monY = options.heroMonitor ? 1.24 : 1.07;

    const bezel = new THREE.Mesh(new THREE.BoxGeometry(monW + 0.05, monH + 0.05, 0.045), darkMetalMat);
    bezel.position.set(0, monY, -0.18);
    bezel.castShadow = true;
    g.add(bezel);

    const scrMat = options.heroMonitor
      ? new THREE.MeshStandardMaterial({
          map: screenWorkstationTex,
          emissive: 0x10b981,
          emissiveMap: screenWorkstationTex,
          emissiveIntensity: 0.85,
          roughness: 0.15,
          metalness: 0.1,
        })
      : genericScreenMat;

    const screen = new THREE.Mesh(new THREE.PlaneGeometry(monW, monH), scrMat);
    screen.position.set(0, monY, -0.155);
    g.add(screen);

    if (options.heroMonitor) {
      [-1, 1].forEach((side) => {
        const wing = new THREE.Group();
        wing.position.set(side * 0.88, monY - 0.03, -0.05);
        wing.rotation.y = -side * 0.34;
        const wBezel = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.04), darkMetalMat);
        const wScr = new THREE.Mesh(new THREE.PlaneGeometry(0.51, 0.35), genericScreenMat);
        wScr.position.z = 0.022;
        wing.add(wBezel, wScr);
        g.add(wing);
      });
    }

    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.018, 0.15), darkMetalMat);
    kb.position.set(-0.04, 0.775, 0.14);
    g.add(kb);

    const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.02, 0.11), frameMat);
    mouse.position.set(0.27, 0.775, 0.14);
    g.add(mouse);

    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 10), darkMetalMat);
    lampBase.position.set(-w / 2 + 0.18, 0.78, -0.18);
    g.add(lampBase);
    const lampStem = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.34, 0.025), frameMat);
    lampStem.position.set(-w / 2 + 0.18, 0.95, -0.18);
    g.add(lampStem);
    const lampHead = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.03, 0.07),
      new THREE.MeshStandardMaterial({
        color: 0xf5f2e9,
        emissive: 0xd4af37,
        emissiveIntensity: options.heroMonitor ? 1.15 : 0.65,
      })
    );
    lampHead.position.set(-w / 2 + 0.24, 1.12, -0.14);
    g.add(lampHead);

    scene.add(g);

    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    const bbW = w * cos + d * sin;
    const bbD = w * sin + d * cos;
    addCollider(x, z, bbW, bbD);

    if (options.withChair) {
      const chairDist = 0.82;
      const cx = x + Math.sin(rotY) * chairDist;
      const cz = z + Math.cos(rotY) * chairDist;
      createOfficeChair(cx, cz, rotY + Math.PI, options.heroMonitor ? 0x123827 : 0x1e293b);
    }

    return { group: g, screenMat: scrMat };
  }

  function createPottedPlant(x: number, z: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.18, 0.42, 12),
      new THREE.MeshStandardMaterial({ color: 0x2c3e33, roughness: 0.6, metalness: 0.2 })
    );
    pot.position.y = 0.21;
    pot.castShadow = true;
    g.add(pot);

    const leafMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.75, metalness: 0.02 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.58, 6), leafMat);
      leaf.position.set(Math.cos(a) * 0.14, 0.62, Math.sin(a) * 0.14);
      leaf.rotation.z = Math.cos(a) * 0.35;
      leaf.rotation.x = Math.sin(a) * 0.35;
      leaf.castShadow = true;
      g.add(leaf);
    }
    scene.add(g);
    addCollider(x, z, 0.55, 0.55);
  }

  function createServerRack(x: number, z: number, rotY: number) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;

    const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.95, 2.25, 0.95), darkMetalMat);
    chassis.position.y = 1.125;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    g.add(chassis);

    const glassDoor = new THREE.Mesh(new THREE.BoxGeometry(0.84, 2.05, 0.04), glassWallMat);
    glassDoor.position.set(0, 1.12, 0.48);
    g.add(glassDoor);

    const emeraldLedMat = new THREE.MeshStandardMaterial({
      color: 0x34d399,
      emissive: 0x10b981,
      emissiveIntensity: 1.45,
      roughness: 0.2,
    });
    const goldLedMat = new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xd4af37,
      emissiveIntensity: 1.35,
      roughness: 0.2,
    });

    for (let b = 0; b < 8; b++) {
      const bladeY = 0.35 + b * 0.22;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.14, 0.05), frameMat);
      blade.position.set(0, bladeY, 0.44);
      g.add(blade);

      const led = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.025, 0.02),
        b % 2 === 0 ? emeraldLedMat.clone() : goldLedMat.clone()
      );
      led.position.set(-0.2, bladeY, 0.47);
      g.add(led);
      animatedLedStrips.push(led);
    }

    scene.add(g);
    addCollider(x, z, 1.05, 1.05);
  }

  function createFilingCabinet(x: number, z: number, rotY = 0) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.35, 0.55), frameMat);
    body.position.y = 0.675;
    body.castShadow = true;
    g.add(body);
    for (let i = 0; i < 3; i++) {
      const drawer = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.35, 0.04), deskTopMat);
      drawer.position.set(0, 0.28 + i * 0.4, 0.28);
      g.add(drawer);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.04), darkMetalMat);
      handle.position.set(0, 0.28 + i * 0.4, 0.31);
      g.add(handle);
    }
    scene.add(g);
    const cos = Math.abs(Math.cos(rotY));
    const sin = Math.abs(Math.sin(rotY));
    addCollider(x, z, 0.9 * cos + 0.55 * sin, 0.9 * sin + 0.55 * cos);
  }

  // --- POPULATE ALL 8 ROOMS + EXTERIOR ---
  createPottedPlant(-7.2, 16.2);
  createPottedPlant(1.2, 16.2);

  // 1. RECEPTION (x: -10..4, z: 6..14)
  const recDesk = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.02, 1.05), wallAccentMat);
  recDesk.position.set(-4.2, 0.51, 9.8);
  recDesk.castShadow = true;
  recDesk.receiveShadow = true;
  scene.add(recDesk);
  const recTop = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.06, 1.15), deskTopMat);
  recTop.position.set(-4.2, 1.03, 9.8);
  scene.add(recTop);
  const recAccent = new THREE.Mesh(
    new THREE.BoxGeometry(3.6, 0.06, 0.04),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, emissive: 0xb48a1c, emissiveIntensity: 0.9 })
  );
  recAccent.position.set(-4.2, 0.82, 10.33);
  scene.add(recAccent);
  addCollider(-4.2, 9.8, 3.9, 1.15);

  const sofaBase = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.42, 0.9), loungeFabricMat);
  sofaBase.position.set(1.4, 0.21, 11.4);
  sofaBase.castShadow = true;
  scene.add(sofaBase);
  const sofaBack = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.55, 0.2), loungeFabricMat);
  sofaBack.position.set(1.4, 0.62, 11.75);
  sofaBack.castShadow = true;
  scene.add(sofaBack);
  addCollider(1.4, 11.4, 2.4, 0.9);

  const coffeeTable = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.36, 0.75), deskTopMat);
  coffeeTable.position.set(1.4, 0.18, 9.7);
  coffeeTable.castShadow = true;
  scene.add(coffeeTable);
  addCollider(1.4, 9.7, 1.4, 0.75);

  createPottedPlant(-8.8, 12.8);
  createPottedPlant(2.8, 12.8);

  // 2. NETWORK OPERATIONS ROOM (NOC) (x: -18..-10, z: 6..14)
  createWorkstationDesk(-14.0, 9.2, 0, { withChair: true }); // Sunita / NOC telemetry desk
  createWorkstationDesk(-16.0, 12.6, Math.PI, { withChair: true }); // Prakash's network & IAM admin desk
  createServerRack(-16.8, 7.2, Math.PI / 2); // NOC Edge Switch & Patch Rack
  createPottedPlant(-11.2, 12.8);

  // 3. MODERN CORPORATE OFFICE (x: -10..4, z: -4..6)
  createWorkstationDesk(-6.8, 2.8, Math.PI / 2, { withChair: true });
  createWorkstationDesk(-6.8, -0.8, Math.PI / 2, { withChair: true });
  createWorkstationDesk(0.8, 2.8, -Math.PI / 2, { withChair: true });
  createWorkstationDesk(0.8, -0.8, -Math.PI / 2, { withChair: true });

  const opsTable = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.74, 1.0), deskTopMat);
  opsTable.position.set(-2.0, 0.37, 1.8);
  opsTable.castShadow = true;
  scene.add(opsTable);
  addCollider(-2.0, 1.8, 1.6, 1.0);

  // 4. FINANCE DEPARTMENT (x: -18..-10, z: -4..6)
  createWorkstationDesk(-14.2, 0.4, 0, { wood: true, withChair: true });
  createWorkstationDesk(-14.2, 3.8, Math.PI, { wood: true, withChair: true });
  createFilingCabinet(-11.4, -3.2, 0);
  createFilingCabinet(-16.6, -3.2, 0);
  // Treasury Authorization Lockbox
  const treasurySafe = new THREE.Mesh(new THREE.BoxGeometry(0.75, 1.1, 0.65), darkMetalMat);
  treasurySafe.position.set(-16.9, 0.55, -1.3);
  treasurySafe.castShadow = true;
  scene.add(treasurySafe);
  addCollider(-16.9, -1.3, 0.8, 0.7);
  createPottedPlant(-17.0, 5.0);

  // 5. SECURITY OPERATIONS CENTRE (SOC) (x: -18..-10, z: -14..-4)
  createWorkstationDesk(-14.0, -9.2, 0, { withChair: true }); // Aditi Kapoor's SOC Analyst desk
  createWorkstationDesk(-16.2, -12.0, Math.PI / 2, { withChair: true });
  createFilingCabinet(-16.6, -5.2, Math.PI / 2);
  createPottedPlant(-11.2, -12.8);

  // 6. VENDOR MANAGEMENT DEPARTMENT (x: 4..16, z: 1..11)
  createWorkstationDesk(10.4, 7.6, Math.PI, { withChair: true });
  createWorkstationDesk(10.4, 4.4, 0, { withChair: true });
  createWorkstationDesk(14.2, 6.2, -Math.PI / 2, { withChair: true });
  createFilingCabinet(6.0, 9.8, 0); // Signed Partner SLA Contracts
  createPottedPlant(14.8, 2.2);

  // 7. SERVER ROOM & DATA CENTRE (x: 4..16, z: -13..-2)
  createServerRack(7.4, -10.5, 0);
  createServerRack(10.0, -10.5, 0);
  createServerRack(12.6, -10.5, 0);
  createServerRack(7.4, -4.8, Math.PI);
  createServerRack(10.0, -4.8, Math.PI);
  createServerRack(12.6, -4.8, Math.PI);

  // Data Centre Dedicated UPS Battery Backup Unit
  const upsUnit = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.85, 0.85), frameMat);
  upsUnit.position.set(14.9, 0.925, -11.6);
  upsUnit.castShadow = true;
  scene.add(upsUnit);
  const upsLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.05, 0.14, 0.42),
    new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 1.4 })
  );
  upsLed.position.set(14.34, 1.45, -11.6);
  scene.add(upsLed);
  addCollider(14.9, -11.6, 1.15, 0.9);

  const diagCart = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 0.75), frameMat);
  diagCart.position.set(11.6, 0.55, -5.0);
  diagCart.castShadow = true;
  scene.add(diagCart);
  addCollider(11.6, -5.0, 1.1, 0.75);

  const gatewayShelf = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.88, 0.75), frameMat);
  gatewayShelf.position.set(7.6, 0.44, -9.2);
  gatewayShelf.castShadow = true;
  scene.add(gatewayShelf);
  addCollider(7.6, -9.2, 1.1, 0.75);

  // 8. DIGITAL INVESTIGATION ROOM (x: -10..4, z: -14..-4)
  const briefTable = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.74, 1.05), wallAccentMat);
  briefTable.position.set(1.2, 0.37, -8.5);
  briefTable.castShadow = true;
  scene.add(briefTable);
  addCollider(1.2, -8.5, 1.9, 1.05);

  // Realistic Forensic Case Briefing Laptop & Chain-of-Custody Binder Stack
  const briefLaptopBase = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.28), darkMetalMat);
  briefLaptopBase.position.set(1.05, 0.75, -8.45);
  scene.add(briefLaptopBase);
  const briefLaptopLid = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.26, 0.02), darkMetalMat);
  briefLaptopLid.position.set(1.05, 0.88, -8.58);
  briefLaptopLid.rotation.x = -0.18;
  scene.add(briefLaptopLid);
  const briefLaptopScr = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.22), genericScreenMat);
  briefLaptopScr.position.set(1.05, 0.88, -8.565);
  briefLaptopScr.rotation.x = -0.18;
  scene.add(briefLaptopScr);

  const custodyCase = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.34), frameMat);
  custodyCase.position.set(1.65, 0.81, -8.5);
  custodyCase.castShadow = true;
  scene.add(custodyCase);

  createFilingCabinet(-8.7, -5.2, Math.PI / 2); // Chain-of-custody evidence cabinet
  createPottedPlant(-8.8, -12.8);
  createPottedPlant(2.8, -12.8);

  // Security & Synthetic Fingerprint Vault Access Pedestal (Investigation Room)
  const vaultPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 1.08, 20), darkMetalMat);
  vaultPedestal.position.set(-6.2, 0.54, -10.8);
  vaultPedestal.castShadow = true;
  scene.add(vaultPedestal);
  const vaultCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.29, 0.29, 0.05, 20),
    new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 1.1 })
  );
  vaultCollar.position.set(-6.2, 1.06, -10.8);
  scene.add(vaultCollar);
  const scannerPad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.18, 0.025, 24),
    new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x10b981, emissiveIntensity: 1.35, roughness: 0.12 })
  );
  scannerPad.position.set(-6.2, 1.1, -10.8);
  scannerPad.rotation.x = 0.28;
  scene.add(scannerPad);
  const scannerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.015, 8, 28),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, emissive: 0xb48a1c, emissiveIntensity: 1.45 })
  );
  scannerRing.position.set(-6.2, 1.11, -10.8);
  scannerRing.rotation.x = Math.PI / 2 + 0.28;
  scene.add(scannerRing);
  addCollider(-6.2, -10.8, 0.72, 0.72);

  const heroStation = createWorkstationDesk(-3.0, -11.4, 0, {
    withChair: false,
    heroMonitor: true,
    width: 2.2,
    depth: 0.92,
  });
  createOfficeChair(-3.0, -10.15, Math.PI, 0x123827);
  addCollider(-3.0, -10.15, 0.55, 0.55, 'hero_chair');

  const station: InvestigationStation = {
    triggerPos: new THREE.Vector3(-3.0, 0, -9.9),
    seatPos: new THREE.Vector3(-3.0, 0, -10.15),
    seatYaw: Math.PI,
    cameraPos: new THREE.Vector3(-3.0, 1.24, -10.72),
    cameraLookAt: new THREE.Vector3(-3.0, 1.24, -11.56),
    monitorScreenMat: heroStation.screenMat,
  };

  // --- ADDITIONAL CORPORATE INFRASTRUCTURE DETAILS ---
  // Reception badge turnstiles (flanking the central entrance corridor) & desk terminal
  const turnstileLedMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x059669,
    emissiveIntensity: 1.2,
  });
  [-4.9, -1.1].forEach((tx) => {
    const gate = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.96, 1.15), frameMat);
    gate.position.set(tx, 0.48, 12.6);
    gate.castShadow = true;
    scene.add(gate);
    const reader = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.24), turnstileLedMat);
    reader.position.set(tx, 0.98, 12.95);
    scene.add(reader);
    addCollider(tx, 12.6, 0.28, 1.2);
  });

  const recTermBezel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.04), darkMetalMat);
  recTermBezel.position.set(-4.2, 1.32, 9.55);
  recTermBezel.rotation.y = Math.PI;
  scene.add(recTermBezel);
  const recTermScr = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.32), genericScreenMat);
  recTermScr.position.set(-4.2, 1.32, 9.525);
  recTermScr.rotation.y = Math.PI;
  scene.add(recTermScr);

  // Main Office coffee & hydration credenza (corner by east window wall)
  const credenza = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.85, 0.55), woodDeskMat);
  credenza.position.set(2.5, 0.425, 5.1);
  credenza.castShadow = true;
  scene.add(credenza);
  const espresso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.42, 0.34), darkMetalMat);
  espresso.position.set(2.2, 1.06, 5.1);
  scene.add(espresso);
  const cooler = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.44, 12), glassWallMat);
  cooler.position.set(2.85, 1.07, 5.1);
  scene.add(cooler);
  addCollider(2.5, 5.1, 1.55, 0.6);

  // Server Room overhead cable trays & precision HVAC cooling cabinet
  [-10.5, -4.8].forEach((rz) => {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.08, 0.55), frameMat);
    tray.position.set(10.0, 2.55, rz);
    scene.add(tray);
  });
  const cableBridge = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.08, 6.2), frameMat);
  cableBridge.position.set(10.0, 2.55, -7.65);
  scene.add(cableBridge);

  const cracUnit = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 1.5), frameMat);
  cracUnit.position.set(15.0, 1.1, -7.6);
  cracUnit.castShadow = true;
  scene.add(cracUnit);
  const cracVent = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 1.1), darkMetalMat);
  cracVent.position.set(14.38, 1.35, -7.6);
  scene.add(cracVent);
  addCollider(15.0, -7.6, 1.25, 1.55);

  // Ceiling CCTV Security Domes across key rooms
  const cctvMat = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.15, metalness: 0.7 });
  [
    [-8.8, 3.48, 13.0],
    [3.1, 3.48, 5.0],
    [4.9, 3.48, -2.9],
    [-9.0, 3.48, -4.9],
  ].forEach(([cx, cy, cz]) => {
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.08, 12), frameMat);
    mount.position.set(cx, cy, cz);
    scene.add(mount);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), cctvMat);
    dome.position.set(cx, cy - 0.05, cz);
    scene.add(dome);
  });

  // --- INTERACTIVE CLUE PROPS (8 Clues covering E01–E20) ---
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xf59e0b,
    emissiveIntensity: 1.4,
    roughness: 0.2,
  });

  WORLD_CLUES.forEach((clue) => {
    const g = new THREE.Group();
    g.position.set(clue.position[0], clue.position[1], clue.position[2]);

    if (clue.propType === 'tablet') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.025, 0.22), darkMetalMat);
      const scr = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.03, 0.18),
        new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x10b981, emissiveIntensity: 0.85 })
      );
      g.add(body, scr);
    } else if (clue.propType === 'folder' || clue.propType === 'binder') {
      const cover = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.05, 0.24),
        new THREE.MeshStandardMaterial({
          color: clue.propType === 'folder' ? 0xd97706 : 0x059669,
          roughness: 0.5,
        })
      );
      const pages = new THREE.Mesh(
        new THREE.BoxGeometry(0.29, 0.035, 0.21),
        new THREE.MeshStandardMaterial({ color: 0xf5f2e9, roughness: 0.85 })
      );
      pages.position.x = 0.01;
      g.add(cover, pages);
    } else if (clue.propType === 'drive') {
      const drive = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 0.26), darkMetalMat);
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.055, 0.04),
        new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x10b981, emissiveIntensity: 1.4 })
      );
      strip.position.z = 0.08;
      g.add(drive, strip);
    } else if (clue.propType === 'terminal') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.32, 0.06), darkMetalMat);
      box.position.y = 0.16;
      const scr = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.26, 0.07),
        new THREE.MeshStandardMaterial({ color: 0x34d399, emissive: 0x10b981, emissiveIntensity: 0.95 })
      );
      scr.position.y = 0.16;
      g.add(box, scr);
    } else {
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.02, 0.34),
        new THREE.MeshStandardMaterial({ color: 0x3f2e24, roughness: 0.6 })
      );
      const sheet = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.025, 0.28),
        new THREE.MeshStandardMaterial({ color: 0xf5f2e9, roughness: 0.8 })
      );
      g.add(board, sheet);
    }

    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), beaconMat.clone());
    beacon.position.y = 0.42;
    g.add(beacon);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.23, 24),
      new THREE.MeshBasicMaterial({ color: 0xd4af37, side: THREE.DoubleSide, transparent: true, opacity: 0.78 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    g.add(ring);

    scene.add(g);
    clueProps.set(clue.id, {
      clue,
      group: g,
      beacon,
      ring,
      worldPos: new THREE.Vector3(clue.position[0], clue.position[1], clue.position[2]),
    });
  });

  // --- 10 INTERACTIVE 3D NPC CHARACTERS ---
  CASE_NPCS.forEach((npc) => {
    const npcRig = createNpcCharacter(npc, maxAnisotropy);
    scene.add(npcRig.root);
    addCollider(npc.position[0], npc.position[2], 0.56, 0.56, `npc_${npc.id}`);
    npcRigs.set(npc.id, npcRig);
  });

  const deskBeacon = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.11, 0),
    new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      emissive: 0x10b981,
      emissiveIntensity: 1.35,
      roughness: 0.2,
    })
  );
  deskBeacon.position.set(-3.0, 1.85, -11.4);
  scene.add(deskBeacon);
  animatedLedStrips.push(deskBeacon);

  return {
    colliders,
    rooms,
    doors,
    clueProps,
    npcRigs,
    station,
    animatedLedStrips,
  };
}
