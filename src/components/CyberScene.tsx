import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { soundEngine } from '../audio/soundEngine';
import { animateInvestigator, createInvestigatorCharacter } from '../three/character';
import { animateNpc } from '../three/npcModels';
import { AABB, buildCorporateWorld } from '../three/worldBuilder';
import { ClueDefinition, ClueId, ComputerMode, NpcDefinition, NpcId, RoomId } from '../types/game';

export interface NearbyPrompt {
  type: 'clue' | 'computer' | 'npc';
  label: string;
  clue?: ClueDefinition;
  npc?: NpcDefinition;
}

interface CyberSceneProps {
  discoveredClues: ClueId[];
  askedNpcTopics: string[];
  activeNpcId: NpcId | null;
  computerMode: ComputerMode;
  interactSignal: number;
  teleportTarget: RoomId | null;
  onTeleportHandled: () => void;
  onRoomChange: (room: RoomId) => void;
  onNearbyChange: (prompt: NearbyPrompt | null) => void;
  onClueDiscover: (clue: ClueDefinition) => void;
  onNpcInteract: (npc: NpcDefinition) => void;
  onStartSitting: () => void;
  onComputerReady: () => void;
  onExitComputer: () => void;
  onStandComplete: () => void;
}

const _camPos = new THREE.Vector3();
const _camTarget = new THREE.Vector3();
const _moveDir = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _lookAtCurrent = new THREE.Vector3();

function resolveCircleAABB(
  px: number,
  pz: number,
  radius: number,
  colliders: AABB[],
  ignoreHeroChair: boolean
): [number, number] {
  let x = px;
  let z = pz;
  for (let i = 0; i < colliders.length; i++) {
    const box = colliders[i];
    if (ignoreHeroChair && box.tag === 'hero_chair') continue;

    const closestX = Math.max(box.minX, Math.min(x, box.maxX));
    const closestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    const distSq = dx * dx + dz * dz;

    if (distSq < radius * radius) {
      if (distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const overlap = radius - dist;
        x += (dx / dist) * overlap;
        z += (dz / dist) * overlap;
      } else {
        const leftPen = x - box.minX;
        const rightPen = box.maxX - x;
        const topPen = z - box.minZ;
        const botPen = box.maxZ - z;
        const minPen = Math.min(leftPen, rightPen, topPen, botPen);
        if (minPen === leftPen) x = box.minX - radius;
        else if (minPen === rightPen) x = box.maxX + radius;
        else if (minPen === topPen) z = box.minZ - radius;
        else z = box.maxZ + radius;
      }
    }
  }
  return [x, z];
}

const ROOM_SPAWN_POINTS: Record<RoomId, [number, number]> = {
  exterior: [-3.0, 18.8],
  reception: [-3.0, 11.8],
  support_dept: [-12.0, 10.6],
  finance: [-12.2, 1.0],
  it_dept: [-12.2, -9.2],
  main_office: [-3.0, 2.5],
  vendor_dept: [7.2, 5.2],
  server_room: [6.0, -7.2],
  investigation_room: [-3.0, -7.2],
};

export const CyberScene: React.FC<CyberSceneProps> = ({
  discoveredClues,
  askedNpcTopics,
  activeNpcId,
  computerMode,
  interactSignal,
  teleportTarget,
  onTeleportHandled,
  onRoomChange,
  onNearbyChange,
  onClueDiscover,
  onNpcInteract,
  onStartSitting,
  onComputerReady,
  onExitComputer,
  onStandComplete,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);

  const discoveredRef = useRef<ClueId[]>(discoveredClues);
  discoveredRef.current = discoveredClues;

  const askedTopicsRef = useRef<string[]>(askedNpcTopics);
  askedTopicsRef.current = askedNpcTopics;

  const activeNpcRef = useRef<NpcId | null>(activeNpcId);
  activeNpcRef.current = activeNpcId;

  const modeRef = useRef<ComputerMode>(computerMode);
  modeRef.current = computerMode;

  const callbacksRef = useRef({
    onRoomChange,
    onNearbyChange,
    onClueDiscover,
    onNpcInteract,
    onStartSitting,
    onComputerReady,
    onExitComputer,
    onStandComplete,
  });
  callbacksRef.current = {
    onRoomChange,
    onNearbyChange,
    onClueDiscover,
    onNpcInteract,
    onStartSitting,
    onComputerReady,
    onExitComputer,
    onStandComplete,
  };

  const triggerActionRef = useRef<(() => void) | null>(null);
  const initialPos =
    computerMode === 'intro_cinematic' ? new THREE.Vector3(-3.0, 0, 21.5) : new THREE.Vector3(-3.0, 0, 11.8);
  const playerPosRef = useRef(initialPos);
  const playerYawRef = useRef(Math.PI);

  useEffect(() => {
    if (interactSignal > 0 && triggerActionRef.current) {
      triggerActionRef.current();
    }
  }, [interactSignal]);

  useEffect(() => {
    if (teleportTarget) {
      const [tx, tz] = ROOM_SPAWN_POINTS[teleportTarget];
      playerPosRef.current.set(tx, 0, tz);
      onTeleportHandled();
    }
  }, [teleportTarget, onTeleportHandled]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04140d);
    scene.fog = new THREE.FogExp2(0x04140d, 0.014);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(
      54,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.1,
      140
    );

    const hemi = new THREE.HemisphereLight(0xdcfce7, 0x051a11, 0.95);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfef9e7, 1.38);
    keyLight.position.set(12, 22, 16);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 70;
    keyLight.shadow.camera.left = -24;
    keyLight.shadow.camera.right = 24;
    keyLight.shadow.camera.top = 24;
    keyLight.shadow.camera.bottom = -24;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x10b981, 0.65);
    rimLight.position.set(-16, 12, -18);
    scene.add(rimLight);

    const roomLights: [number, number, number, number, number][] = [
      [-3, 4.2, 18, 0xfde68a, 5.6], // Exterior Plaza
      [-3, 3.2, 10, 0xf5f2e9, 5.6], // Reception
      [-14, 3.2, 10, 0x34d399, 5.4], // NOC
      [-14, 3.2, 1, 0xfef3c7, 5.2], // Finance
      [-14, 3.2, -9, 0x10b981, 5.8], // SOC
      [-3, 3.2, 1, 0xf5f2e9, 6.0], // Main Office
      [10, 3.2, 6, 0xfef3c7, 5.5], // Vendor Dept
      [10, 3.2, -7.5, 0x34d399, 6.8], // Server Room
      [-3, 3.2, -9.5, 0x10b981, 7.0], // Investigation Room
    ];
    roomLights.forEach(([lx, ly, lz, color, intensity]) => {
      const pt = new THREE.PointLight(color, intensity, 16, 1.6);
      pt.position.set(lx, ly, lz);
      scene.add(pt);
    });

    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const world = buildCorporateWorld(scene, maxAniso);
    const rig = createInvestigatorCharacter();
    rig.root.position.copy(playerPosRef.current);
    rig.root.rotation.y = playerYawRef.current;
    scene.add(rig.root);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let camYaw = 0;
    let camPitch = 0.36;
    let camDist = 3.7;
    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let pointerDownX = 0;
    let pointerDownY = 0;

    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    const npcRoots = Array.from(world.npcRigs.values()).map((r) => r.root);

    _lookAtCurrent.set(playerPosRef.current.x, 1.4, playerPosRef.current.z);
    camera.position.set(
      playerPosRef.current.x + 2.4,
      playerPosRef.current.y + 2.6,
      playerPosRef.current.z + 4.4
    );
    camera.lookAt(_lookAtCurrent);

    const keys: Record<string, boolean> = {};
    let currentRoom: RoomId = modeRef.current === 'intro_cinematic' ? 'exterior' : 'reception';
    let lastNearbyKey = '';
    let prevMode: ComputerMode = modeRef.current;

    const handleInteract = () => {
      const mode = modeRef.current;
      if (mode === 'using_computer') {
        callbacksRef.current.onExitComputer();
        return;
      }
      if (mode !== 'walking' || activeNpcRef.current) return;

      const pPos = playerPosRef.current;
      if (pPos.distanceTo(world.station.triggerPos) < 2.55) {
        soundEngine.playTerminalBoot();
        callbacksRef.current.onStartSitting();
        return;
      }

      // Check nearest NPC
      let bestNpc: NpcDefinition | null = null;
      let bestNpcDist = 2.35;
      world.npcRigs.forEach((npcRig) => {
        const d = Math.hypot(pPos.x - npcRig.worldPos.x, pPos.z - npcRig.worldPos.z);
        if (d < bestNpcDist) {
          bestNpcDist = d;
          bestNpc = npcRig.def;
        }
      });

      if (bestNpc) {
        soundEngine.playClick();
        callbacksRef.current.onNpcInteract(bestNpc);
        return;
      }

      // Check nearest undiscovered clue
      let bestClue: ClueDefinition | null = null;
      let bestClueDist = 2.25;
      world.clueProps.forEach((handle, id) => {
        if (discoveredRef.current.includes(id)) return;
        const d = Math.hypot(pPos.x - handle.worldPos.x, pPos.z - handle.worldPos.z);
        if (d < bestClueDist) {
          bestClueDist = d;
          bestClue = handle.clue;
        }
      });

      if (bestClue) {
        soundEngine.playCluePickup();
        callbacksRef.current.onClueDiscover(bestClue);
      }
    };

    triggerActionRef.current = handleInteract;

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      keys[e.code] = true;

      if (e.code === 'KeyE') {
        handleInteract();
      } else if (e.code === 'Escape') {
        if (document.pointerLockElement === renderer.domElement) {
          document.exitPointerLock();
        }
        if (modeRef.current === 'using_computer') {
          callbacksRef.current.onExitComputer();
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (modeRef.current !== 'walking' || activeNpcRef.current) return;
      isDragging = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      pointerDownX = e.clientX;
      pointerDownY = e.clientY;
    };

    const onMouseUp = (e: MouseEvent) => {
      const wasClick =
        isDragging && Math.hypot(e.clientX - pointerDownX, e.clientY - pointerDownY) < 6;
      isDragging = false;

      if (!wasClick || modeRef.current !== 'walking' || activeNpcRef.current) return;

      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(npcRoots, true);
      if (hits.length > 0 && hits[0].distance <= 14) {
        let obj: THREE.Object3D | null = hits[0].object;
        while (obj && !npcRoots.includes(obj as THREE.Group)) {
          obj = obj.parent;
        }
        if (obj) {
          for (const npcRig of world.npcRigs.values()) {
            if (npcRig.root === obj) {
              soundEngine.playClick();
              callbacksRef.current.onNpcInteract(npcRig.def);
              break;
            }
          }
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (modeRef.current !== 'walking' || activeNpcRef.current) return;
      if (document.pointerLockElement === renderer.domElement) {
        camYaw -= e.movementX * 0.0028;
        camPitch = THREE.MathUtils.clamp(camPitch + e.movementY * 0.0024, 0.12, 1.02);
      } else if (isDragging) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        camYaw -= dx * 0.0055;
        camPitch = THREE.MathUtils.clamp(camPitch + dy * 0.0045, 0.12, 1.02);
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (modeRef.current !== 'walking') return;
      camDist = THREE.MathUtils.clamp(camDist + e.deltaY * 0.0025, 2.2, 5.8);
    };

    const onResize = () => {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('resize', onResize);
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function updateRoomDetection(px: number, pz: number) {
      for (let i = 0; i < world.rooms.length; i++) {
        const r = world.rooms[i];
        if (px >= r.minX && px <= r.maxX && pz >= r.minZ && pz <= r.maxZ) {
          if (r.id !== currentRoom) {
            currentRoom = r.id;
            callbacksRef.current.onRoomChange(r.id);
          }
          break;
        }
      }
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.elapsedTime;
      const mode = modeRef.current;

      // Transition handling
      if (prevMode === 'using_computer' && mode === 'standing_transition') {
        camYaw = 0;
        camPitch = 0.36;
      } else if (prevMode === 'using_computer' && mode === 'walking') {
        playerPosRef.current.set(-3.0, 0, -9.35);
        playerYawRef.current = Math.PI;
        camYaw = 0;
        camPitch = 0.36;
      } else if (prevMode === 'intro_cinematic' && mode === 'walking') {
        playerPosRef.current.set(-3.0, 0, 11.8);
        playerYawRef.current = Math.PI;
        camYaw = 0;
        camPitch = 0.36;
        updateRoomDetection(-3.0, 11.8);
      }
      prevMode = mode;

      // 1. Update Clue Beacons & Server LEDs
      world.clueProps.forEach((handle, id) => {
        const found = discoveredRef.current.includes(id);
        handle.beacon.visible = !found;
        handle.ring.visible = !found;
        if (!found) {
          handle.beacon.rotation.y = elapsed * 2.2;
          handle.beacon.position.y = 0.42 + Math.sin(elapsed * 3.2) * 0.05;
        }
      });

      for (let i = 0; i < world.animatedLedStrips.length; i++) {
        const strip = world.animatedLedStrips[i];
        if (strip.geometry.type === 'OctahedronGeometry') {
          if (strip.userData.baseY === undefined) {
            strip.userData.baseY = strip.position.y;
          }
          strip.rotation.y = elapsed * 1.8;
          strip.position.y = (strip.userData.baseY as number) + Math.sin(elapsed * 2.6 + i) * 0.05;
        } else {
          const mat = strip.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = 0.8 + Math.sin(elapsed * 4.5 + i * 0.9) * 0.65;
        }
      }

      // 2. Animate all 9 NPCs
      world.npcRigs.forEach((npcRig, npcId) => {
        const isTalking = activeNpcRef.current === npcId;
        const hasUnread = npcRig.def.topics.some(
          (t) => !askedTopicsRef.current.includes(t.id)
        );
        animateNpc(npcRig, playerPosRef.current, isTalking, hasUnread, elapsed, delta);
      });

      // 3. Update Doors (auto-open on proximity)
      for (let i = 0; i < world.doors.length; i++) {
        const door = world.doors[i];
        const dist = Math.hypot(
          playerPosRef.current.x - door.center.x,
          playerPosRef.current.z - door.center.z
        );
        const shouldOpen = dist < 2.55;
        if (shouldOpen && !door.isOpen) {
          door.isOpen = true;
          if (mode === 'walking') soundEngine.playDoorOpen();
        } else if (!shouldOpen && door.isOpen) {
          door.isOpen = false;
        }
        door.openProgress = THREE.MathUtils.damp(
          door.openProgress,
          door.isOpen ? 1 : 0,
          7.5,
          delta
        );
        const slideOffset = door.baseOffset + door.openProgress * (door.baseOffset * 1.75);
        if (door.axis === 'x') {
          door.leftLeaf.position.x = door.center.x - slideOffset;
          door.rightLeaf.position.x = door.center.x + slideOffset;
        } else {
          door.leftLeaf.position.z = door.center.z - slideOffset;
          door.rightLeaf.position.z = door.center.z + slideOffset;
        }
      }

      // 4. Phase 1 Cinematic Intro Choreography vs Walking vs Monitor Zoom
      if (mode === 'intro_cinematic') {
        // Detective walks up exterior plaza toward illuminated HQ entrance
        const targetZ = 15.6;
        if (playerPosRef.current.z > targetZ) {
          playerPosRef.current.z = Math.max(targetZ, playerPosRef.current.z - 1.35 * delta);
          animateInvestigator(rig, 'walk', elapsed, delta);
        } else {
          animateInvestigator(rig, 'idle', elapsed, delta);
        }
        playerYawRef.current = Math.PI;
        rig.root.position.copy(playerPosRef.current);
        rig.root.rotation.y = playerYawRef.current;

        const sweepX = -3.0 + Math.sin(elapsed * 0.35) * 4.2;
        const sweepZ = 21.8 + Math.cos(elapsed * 0.25) * 1.2;
        camera.position.x = THREE.MathUtils.damp(camera.position.x, sweepX, 2.5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, 3.2, 2.5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, sweepZ, 2.5, delta);

        _lookAtCurrent.set(-3.0, 2.2, 16.2);
        camera.lookAt(_lookAtCurrent);
      } else if (mode === 'walking') {
        const dialogueOpen = Boolean(activeNpcRef.current);
        let moveForward = 0;
        let moveRight = 0;
        if (!dialogueOpen) {
          if (keys['KeyW'] || keys['ArrowUp']) moveForward += 1;
          if (keys['KeyS'] || keys['ArrowDown']) moveForward -= 1;
          if (keys['KeyD'] || keys['ArrowRight']) moveRight += 1;
          if (keys['KeyA'] || keys['ArrowLeft']) moveRight -= 1;
        }

        const isMoving = moveForward !== 0 || moveRight !== 0;
        const isRunning = isMoving && (keys['ShiftLeft'] || keys['ShiftRight']);

        if (isMoving) {
          _forward.set(-Math.sin(camYaw), 0, -Math.cos(camYaw)).normalize();
          _right.set(Math.cos(camYaw), 0, -Math.sin(camYaw)).normalize();
          _moveDir
            .set(0, 0, 0)
            .addScaledVector(_forward, moveForward)
            .addScaledVector(_right, moveRight)
            .normalize();

          const speed = isRunning ? 5.2 : 2.85;
          const nextX = playerPosRef.current.x + _moveDir.x * speed * delta;
          const nextZ = playerPosRef.current.z + _moveDir.z * speed * delta;

          const [resolvedX, resolvedZ] = resolveCircleAABB(
            nextX,
            nextZ,
            0.34,
            world.colliders,
            false
          );
          playerPosRef.current.set(resolvedX, 0, resolvedZ);

          const targetYaw = Math.atan2(_moveDir.x, _moveDir.z);
          let diff = targetYaw - playerYawRef.current;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          playerYawRef.current += diff * Math.min(1, delta * 12);

          soundEngine.playFootstep(isRunning);
          animateInvestigator(rig, isRunning ? 'run' : 'walk', elapsed, delta);
        } else {
          animateInvestigator(rig, 'idle', elapsed, delta);
        }

        rig.root.position.copy(playerPosRef.current);
        rig.root.rotation.y = playerYawRef.current;

        updateRoomDetection(playerPosRef.current.x, playerPosRef.current.z);

        // Nearby interaction prompt priority: Station > NPC > Clue
        let nextNearby: NearbyPrompt | null = null;
        if (!dialogueOpen) {
          if (playerPosRef.current.distanceTo(world.station.triggerPos) < 2.55) {
            nextNearby = {
              type: 'computer',
              label: 'Sit & Launch TRUSTLOCK / CYBERQUEST Terminal',
            };
          } else {
            let bestNpcDist = 2.35;
            world.npcRigs.forEach((npcRig) => {
              const d = Math.hypot(
                playerPosRef.current.x - npcRig.worldPos.x,
                playerPosRef.current.z - npcRig.worldPos.z
              );
              if (d < bestNpcDist) {
                bestNpcDist = d;
                nextNearby = {
                  type: 'npc',
                  label: `Talk to ${npcRig.def.name} — ${npcRig.def.role}`,
                  npc: npcRig.def,
                };
              }
            });

            if (!nextNearby) {
              let bestClueDist = 2.25;
              world.clueProps.forEach((handle, id) => {
                if (discoveredRef.current.includes(id)) return;
                const d = Math.hypot(
                  playerPosRef.current.x - handle.worldPos.x,
                  playerPosRef.current.z - handle.worldPos.z
                );
                if (d < bestClueDist) {
                  bestClueDist = d;
                  nextNearby = {
                    type: 'clue',
                    label: `Inspect ${handle.clue.code}: ${handle.clue.title}`,
                    clue: handle.clue,
                  };
                }
              });
            }
          }
        }

        const keyStr = nextNearby
          ? `${nextNearby.type}:${nextNearby.clue?.id ?? nextNearby.npc?.id ?? 'station'}`
          : '';
        if (keyStr !== lastNearbyKey) {
          lastNearbyKey = keyStr;
          callbacksRef.current.onNearbyChange(nextNearby);
        }

        const horizDist = Math.cos(camPitch) * camDist;
        const vertHeight = Math.sin(camPitch) * camDist + 1.15;
        _camTarget.set(
          playerPosRef.current.x + Math.sin(camYaw) * horizDist,
          Math.max(0.65, vertHeight),
          playerPosRef.current.z + Math.cos(camYaw) * horizDist
        );

        camera.position.x = THREE.MathUtils.damp(camera.position.x, _camTarget.x, 9, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _camTarget.y, 9, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _camTarget.z, 9, delta);

        _camPos.set(playerPosRef.current.x, 1.38, playerPosRef.current.z);
        _lookAtCurrent.x = THREE.MathUtils.damp(_lookAtCurrent.x, _camPos.x, 12, delta);
        _lookAtCurrent.y = THREE.MathUtils.damp(_lookAtCurrent.y, _camPos.y, 12, delta);
        _lookAtCurrent.z = THREE.MathUtils.damp(_lookAtCurrent.z, _camPos.z, 12, delta);
        camera.lookAt(_lookAtCurrent);
      } else if (mode === 'sitting_transition' || mode === 'using_computer') {
        if (lastNearbyKey !== '') {
          lastNearbyKey = '';
          callbacksRef.current.onNearbyChange(null);
        }

        playerPosRef.current.x = THREE.MathUtils.damp(
          playerPosRef.current.x,
          world.station.seatPos.x,
          8,
          delta
        );
        playerPosRef.current.z = THREE.MathUtils.damp(
          playerPosRef.current.z,
          world.station.seatPos.z,
          8,
          delta
        );
        let yawDiff = world.station.seatYaw - playerYawRef.current;
        while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
        while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
        playerYawRef.current += yawDiff * Math.min(1, delta * 10);

        rig.root.position.copy(playerPosRef.current);
        rig.root.rotation.y = playerYawRef.current;
        animateInvestigator(rig, 'sit', elapsed, delta);

        camera.position.x = THREE.MathUtils.damp(
          camera.position.x,
          world.station.cameraPos.x,
          5.5,
          delta
        );
        camera.position.y = THREE.MathUtils.damp(
          camera.position.y,
          world.station.cameraPos.y,
          5.5,
          delta
        );
        camera.position.z = THREE.MathUtils.damp(
          camera.position.z,
          world.station.cameraPos.z,
          5.5,
          delta
        );

        _lookAtCurrent.x = THREE.MathUtils.damp(
          _lookAtCurrent.x,
          world.station.cameraLookAt.x,
          7,
          delta
        );
        _lookAtCurrent.y = THREE.MathUtils.damp(
          _lookAtCurrent.y,
          world.station.cameraLookAt.y,
          7,
          delta
        );
        _lookAtCurrent.z = THREE.MathUtils.damp(
          _lookAtCurrent.z,
          world.station.cameraLookAt.z,
          7,
          delta
        );
        camera.lookAt(_lookAtCurrent);

        if (
          mode === 'sitting_transition' &&
          camera.position.distanceTo(world.station.cameraPos) < 0.08
        ) {
          callbacksRef.current.onComputerReady();
        }
      } else if (mode === 'standing_transition') {
        const standTargetX = -3.0;
        const standTargetZ = -9.35;
        playerPosRef.current.x = THREE.MathUtils.damp(playerPosRef.current.x, standTargetX, 7.5, delta);
        playerPosRef.current.z = THREE.MathUtils.damp(playerPosRef.current.z, standTargetZ, 7.5, delta);
        rig.root.position.copy(playerPosRef.current);
        animateInvestigator(rig, 'idle', elapsed, delta);

        const horizDist = Math.cos(camPitch) * camDist;
        const vertHeight = Math.sin(camPitch) * camDist + 1.15;
        _camTarget.set(
          playerPosRef.current.x + Math.sin(camYaw) * horizDist,
          Math.max(0.65, vertHeight),
          playerPosRef.current.z + Math.cos(camYaw) * horizDist
        );
        camera.position.x = THREE.MathUtils.damp(camera.position.x, _camTarget.x, 7.5, delta);
        camera.position.y = THREE.MathUtils.damp(camera.position.y, _camTarget.y, 7.5, delta);
        camera.position.z = THREE.MathUtils.damp(camera.position.z, _camTarget.z, 7.5, delta);

        _camPos.set(playerPosRef.current.x, 1.38, playerPosRef.current.z);
        _lookAtCurrent.x = THREE.MathUtils.damp(_lookAtCurrent.x, _camPos.x, 9, delta);
        _lookAtCurrent.y = THREE.MathUtils.damp(_lookAtCurrent.y, _camPos.y, 9, delta);
        _lookAtCurrent.z = THREE.MathUtils.damp(_lookAtCurrent.z, _camPos.z, 9, delta);
        camera.lookAt(_lookAtCurrent);

        if (
          Math.hypot(playerPosRef.current.x - standTargetX, playerPosRef.current.z - standTargetZ) <
            0.09 &&
          camera.position.distanceTo(_camTarget) < 0.22
        ) {
          playerPosRef.current.set(standTargetX, 0, standTargetZ);
          playerYawRef.current = Math.PI;
          callbacksRef.current.onStandComplete();
        }
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full cursor-grab active:cursor-grabbing"
      aria-label="3D Investigation World Viewport"
    />
  );
};
