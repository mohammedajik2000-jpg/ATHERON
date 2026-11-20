import React, { useState } from 'react';
import {
  Award,
  CheckCircle2,
  Compass,
  Map as MapIcon,
  MessageSquare,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  ACHIEVEMENTS,
  CASE_METADATA,
  MISSIONS,
  ROOM_LABELS,
  WORLD_CLUES,
} from '../data/caseData';
import {
  CASE_NPCS,
} from '../data/npcs';
import { resetVaultDemo } from '../engines/fingerprintVaultClient';
import {
  ClueDefinition,
  ComputerMode,
  InvestigationState,
  NpcDefinition,
  NpcDialogueTopic,
  RoomId,
} from '../types/game';
import { NearbyPrompt } from './CyberScene';

interface GameHUDProps {
  currentRoom: RoomId;
  activeMissionIndex: number;
  state: InvestigationState;
  nearbyPrompt: NearbyPrompt | null;
  activeNpc: NpcDefinition | null;
  computerMode: ComputerMode;
  muted: boolean;
  showDrawer: boolean;
  recentClue: ClueDefinition | null;
  showCompletionModal: boolean;
  onFinishIntro: () => void;
  onToggleMute: () => void;
  onToggleDrawer: () => void;
  onInteractClick: () => void;
  onAskNpcTopic: (npc: NpcDefinition, topic: NpcDialogueTopic) => void;
  onCloseNpc: () => void;
  onDismissClueBanner: () => void;
  onDismissCompletion: () => void;
  onTeleportRoom: (room: RoomId) => void;
  onResetCase: () => void;
}

const ROOM_ORDER: RoomId[] = [
  'exterior',
  'reception',
  'support_dept',
  'finance',
  'it_dept',
  'main_office',
  'vendor_dept',
  'server_room',
  'investigation_room',
];

export const GameHUD: React.FC<GameHUDProps> = ({
  currentRoom,
  activeMissionIndex,
  state,
  nearbyPrompt,
  activeNpc,
  computerMode,
  muted,
  showDrawer,
  recentClue,
  showCompletionModal,
  onFinishIntro,
  onToggleMute,
  onToggleDrawer,
  onInteractClick,
  onAskNpcTopic,
  onCloseNpc,
  onDismissClueBanner,
  onDismissCompletion,
  onTeleportRoom,
  onResetCase,
}) => {
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const currentMission = MISSIONS[Math.min(activeMissionIndex, MISSIONS.length - 1)];

  if (computerMode === 'using_computer') {
    return null;
  }

  // PHASE 1: CINEMATIC STORY INTRODUCTION OVERLAY
  if (computerMode === 'intro_cinematic') {
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 p-4 sm:p-8 flex flex-col items-center pointer-events-none">
        <div className="pointer-events-auto w-full max-w-3xl bg-[#071f15]/95 border border-emerald-500/45 rounded-xl p-5 sm:p-6 shadow-[0_20px_60px_rgba(2,12,8,0.9)] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 text-[11px] font-mono-data font-bold rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/40">
                CASE {CASE_METADATA.caseId}
              </span>
              <span className="text-xs font-mono-data text-amber-300">
                {CASE_METADATA.company}
              </span>
            </div>
            <button
              onClick={onFinishIntro}
              className="text-xs text-[#d6d3c4] hover:text-[#f5f2e9] px-2.5 py-1 rounded bg-[#0c2d20] border border-emerald-500/35 cursor-pointer whitespace-nowrap shrink-0"
            >
              Skip Intro
            </button>
          </div>

          <div>
            <h1 className="font-display text-lg sm:text-xl font-bold text-[#f5f2e9]">
              Incoming Dispatch — Security Manager Dev Raghavan
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-[#d6d3c4] leading-relaxed">
              &ldquo;Welcome to Harbor &amp; Finch Freight Pvt. Ltd. At 08:30 IST this morning, our ERP reconciliation flagged three overnight vendor bank-detail changes routed to offshore accounts without Finance approval. The audit trail shows the <span className="text-amber-300 font-mono-data">TallyBridge</span> integration account, and our vendor advisory warns of a potential token leak.&rdquo;
            </p>
            <p className="mt-2 text-xs text-[#a3aa9c]">
              Explore all 8 corporate departments, click or press E to inspect staff roles and interview witnesses, gather E01–E20 evidence, and launch TRUSTLOCK Automatic Recovery inside the Digital Investigation Room.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={onFinishIntro}
              className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] rounded-lg shadow-lg cursor-pointer whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-4 h-4" />
              <span>Enter Harbor &amp; Finch HQ</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeTopic = activeNpc?.topics.find((t) => t.id === selectedTopicId) ?? null;

  return (
    <>
      {/* TOP BAR HUD */}
      <div className="fixed top-4 left-4 right-4 z-20 flex items-start justify-between gap-4 pointer-events-none">
        <div className="pointer-events-auto max-w-md bg-[#071f15]/92 border border-emerald-500/35 rounded-lg px-4 py-3 shadow-xl">
          <div className="flex items-center gap-2 text-xs text-amber-300 font-medium">
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span>{ROOM_LABELS[currentRoom]}</span>
            <span className="text-emerald-400/50">·</span>
            <span className="font-mono-data text-[#f5f2e9]">{state.finalScore} pts</span>
          </div>

          <div className="mt-1.5 flex items-baseline gap-2">
            <span className="font-display text-xs font-bold text-emerald-300 shrink-0">
              MISSION {currentMission.id}/6
            </span>
            <span className="text-sm font-semibold text-[#f5f2e9] truncate">
              {currentMission.title}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[#d6d3c4] leading-snug">{currentMission.objective}</p>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleDrawer}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium bg-[#071f15]/92 hover:bg-[#0d3323] text-[#f5f2e9] border border-emerald-500/35 rounded-lg shadow-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <MapIcon className="w-3.5 h-3.5 text-amber-300" />
            <span>
              Map &amp; Case ({state.discoveredClues.length}/{WORLD_CLUES.length} Clues · {state.talkedToNpcs.length}/{CASE_NPCS.length} Staff)
            </span>
          </button>

          <button
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute audio' : 'Mute audio'}
            className="p-2 bg-[#071f15]/92 hover:bg-[#0d3323] text-[#f5f2e9] border border-emerald-500/35 rounded-lg shadow-lg transition-colors cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4 text-[#a3aa9c]" /> : <Volume2 className="w-4 h-4 text-emerald-300" />}
          </button>
        </div>
      </div>

      {/* RECENT CLUE TOAST */}
      {recentClue && !activeNpc && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-20 max-w-lg w-[90vw] pointer-events-auto bg-[#082519]/95 border border-amber-400/55 rounded-lg px-4 py-3 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-mono-data text-amber-300 font-semibold">
                EVIDENCE RECOVERED · {recentClue.code} (+{recentClue.points} pts)
              </div>
              <div className="mt-0.5 text-sm font-semibold text-[#f5f2e9]">{recentClue.title}</div>
              <p className="mt-1 text-xs text-[#d6d3c4]">{recentClue.summary}</p>
            </div>
            <button
              onClick={onDismissClueBanner}
              className="p-1 text-[#a3aa9c] hover:text-[#f5f2e9] cursor-pointer"
              aria-label="Close notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* PHASE 3: INTERACTIVE NPC DIALOGUE MODAL */}
      {activeNpc && (
        <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-2xl bg-[#071f15]/95 border border-emerald-500/50 rounded-xl p-5 shadow-2xl space-y-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-amber-300" />
                  <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                    {activeNpc.name}
                  </h2>
                  <span className="text-[11px] font-mono-data px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/35">
                    {activeNpc.role}
                  </span>
                  {activeNpc.workflowStage && (
                    <span className="text-[10px] font-mono-data px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-400/35">
                      {activeNpc.workflowStage}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-[#a3aa9c] mt-0.5">{activeNpc.department}</div>
                <div className="mt-2 px-2.5 py-1.5 rounded bg-[#0c2d20]/80 border border-emerald-500/30 text-[11px] text-[#f5f2e9]">
                  <span className="font-semibold text-amber-300">Role &amp; Responsibility: </span>
                  {activeNpc.responsibility}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedTopicId(null);
                  onCloseNpc();
                }}
                className="p-1.5 rounded bg-[#0c2d20] hover:bg-[#134230] text-[#d6d3c4] cursor-pointer"
                aria-label="End conversation"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-lg bg-[#051a11]/90 border border-emerald-500/25 text-xs sm:text-sm text-[#f5f2e9] leading-relaxed">
              {activeTopic ? (
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-amber-300">
                    Q: {activeTopic.question}
                  </div>
                  <p>{activeTopic.answer}</p>
                  {(activeTopic.evidenceTag || activeTopic.unlocksClueId) && (
                    <div className="pt-1 text-[11px] font-mono-data text-emerald-300">
                      {activeTopic.unlocksClueId
                        ? 'Evidence Package Unlocked in CYBERQUEST Terminal'
                        : `Referenced Record: ${activeTopic.evidenceTag}`}
                    </div>
                  )}
                </div>
              ) : (
                <p>{activeNpc.greeting}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-mono-data uppercase tracking-wider text-[#a3aa9c]">
                Ask Question
              </div>
              <div className="flex flex-wrap gap-2">
                {activeNpc.topics.map((topic) => {
                  const asked = state.askedNpcTopics.includes(topic.id);
                  return (
                    <button
                      key={topic.id}
                      onClick={() => {
                        setSelectedTopicId(topic.id);
                        onAskNpcTopic(activeNpc, topic);
                      }}
                      className={`px-3 py-2 rounded-lg text-xs text-left border transition-colors cursor-pointer ${
                        selectedTopicId === topic.id
                          ? 'bg-emerald-600/30 border-amber-400 text-amber-200'
                          : asked
                          ? 'bg-[#092419] border-emerald-500/25 text-[#d6d3c4] hover:border-emerald-400/50'
                          : 'bg-[#0d3122] border-emerald-400/45 text-[#f5f2e9] hover:bg-[#134230]'
                      }`}
                    >
                      {topic.question}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM-CENTER INTERACTION PROMPT + CONTROLS BAR */}
      {!activeNpc && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2.5 pointer-events-none">
          {nearbyPrompt && computerMode === 'walking' && (
            <button
              onClick={onInteractClick}
              className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] font-semibold text-xs sm:text-sm rounded-lg shadow-[0_8px_28px_rgba(16,185,129,0.38)] transition-transform active:scale-95 cursor-pointer whitespace-nowrap"
            >
              <span className="px-1.5 py-0.5 bg-[#04140d] text-amber-300 font-mono-data text-xs rounded">
                E
              </span>
              <span>{nearbyPrompt.label}</span>
            </button>
          )}

          <div className="pointer-events-auto px-4 py-1.5 bg-[#071f15]/92 border border-emerald-500/30 rounded-lg text-[11px] text-[#d6d3c4] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 shadow-lg">
            <span>
              <strong className="text-amber-300 font-mono-data">WASD</strong> Walk
            </span>
            <span className="text-emerald-400/40">·</span>
            <span>
              <strong className="text-amber-300 font-mono-data">Shift</strong> Run
            </span>
            <span className="text-emerald-400/40">·</span>
            <span>
              <strong className="text-amber-300 font-mono-data">Drag Mouse</strong> Orbit Camera
            </span>
            <span className="text-emerald-400/40">·</span>
            <span>
              <strong className="text-amber-300 font-mono-data">Scroll</strong> Zoom
            </span>
            <span className="text-emerald-400/40">·</span>
            <span>
              <strong className="text-amber-300 font-mono-data">E / Click Staff</strong> Inspect Role / Talk / Sit
            </span>
          </div>
        </div>
      )}

      {/* FACILITY MAP, PERSONNEL, MISSIONS & ACHIEVEMENTS MODAL */}
      {showDrawer && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#020d08]/85 pointer-events-auto">
          <div className="w-full max-w-5xl max-h-[86vh] flex flex-col bg-[#071f15] border border-emerald-500/40 rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-emerald-500/25">
              <div>
                <h2 className="font-display text-base font-bold text-[#f5f2e9]">
                  {CASE_METADATA.company} — Investigation Field Guide
                </h2>
                <p className="text-xs text-[#a3aa9c]">
                  Case {CASE_METADATA.caseId} · {state.finalScore} pts · {state.unlockedAchievements.length}/{ACHIEVEMENTS.length} Achievements
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    void resetVaultDemo().catch(() => {});
                    onResetCase();
                    onToggleDrawer();
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#f5f2e9] hover:text-white bg-[#0c2d20] hover:bg-[#134230] border border-emerald-400/35 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-300" />
                  Reset Case
                </button>
                <button
                  onClick={onToggleDrawer}
                  className="p-1.5 text-[#a3aa9c] hover:text-[#f5f2e9] bg-[#0c2d20] rounded-md cursor-pointer"
                  aria-label="Close Field Guide"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto cyber-scroll p-5 grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div className="space-y-2.5">
                  <h3 className="font-display text-sm font-semibold text-amber-300">
                    Facility Locations (8 Departments + Exterior)
                  </h3>
                  <div className="space-y-1.5">
                    {ROOM_ORDER.map((rId) => {
                      const isHere = currentRoom === rId;
                      const roomClues = WORLD_CLUES.filter((c) => c.room === rId);
                      const foundInRoom = roomClues.filter((c) =>
                        state.discoveredClues.includes(c.id)
                      ).length;
                      return (
                        <div
                          key={rId}
                          className={`flex items-center justify-between p-2.5 rounded-lg border ${
                            isHere
                              ? 'bg-emerald-950/60 border-amber-400/55'
                              : 'bg-[#0b2a1d]/75 border-emerald-500/20'
                          }`}
                        >
                          <div>
                            <div className="text-xs font-semibold text-[#f5f2e9]">
                              {ROOM_LABELS[rId]} {isHere ? '(Current)' : ''}
                            </div>
                            <div className="text-[11px] text-[#a3aa9c]">
                              {rId === 'investigation_room'
                                ? 'Contains CYBERQUEST Terminal Desk'
                                : rId === 'exterior'
                                ? 'HQ Plaza & Entrance'
                                : `Clue Packages: ${foundInRoom}/${roomClues.length}`}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              onTeleportRoom(rId);
                              onToggleDrawer();
                            }}
                            className="px-2.5 py-1 text-xs bg-[#123d2b] hover:bg-emerald-600 text-[#f5f2e9] rounded cursor-pointer"
                          >
                            Go
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-display text-sm font-semibold text-amber-300 flex items-center gap-1.5">
                    <Users className="w-4 h-4" />
                    Case Personnel ({state.talkedToNpcs.length}/{CASE_NPCS.length} Interviewed)
                  </h3>
                  <div className="grid grid-cols-1 gap-1.5">
                    {CASE_NPCS.map((npc) => {
                      const interviewed = state.talkedToNpcs.includes(npc.id);
                      return (
                        <div
                          key={npc.id}
                          className="p-2 rounded border border-emerald-500/20 bg-[#0b2a1d]/75 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-[#f5f2e9]">{npc.name}</span>
                            <span className="text-[#d6d3c4]"> · {npc.role}</span>
                            <div className="text-[10px] text-[#a3aa9c]">{ROOM_LABELS[npc.room]}</div>
                          </div>
                          <span
                            className={`text-[10px] font-mono-data px-2 py-0.5 rounded ${
                              interviewed
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-[#0f3626] text-[#a3aa9c]'
                            }`}
                          >
                            {interviewed ? 'INTERVIEWED' : 'PENDING'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="space-y-2.5">
                  <h3 className="font-display text-sm font-semibold text-amber-300">Mission Progression</h3>
                  {MISSIONS.map((m, idx) => {
                    const done = state.caseSolved ? true : idx < activeMissionIndex;
                    const active = !state.caseSolved && idx === activeMissionIndex;
                    return (
                      <div
                        key={m.id}
                        className={`p-2.5 rounded border text-xs ${
                          done
                            ? 'bg-emerald-950/35 border-emerald-500/40 text-emerald-200'
                            : active
                            ? 'bg-emerald-950/55 border-amber-400/55 text-[#f5f2e9]'
                            : 'bg-[#0b2a1d]/55 border-emerald-500/20 text-[#869289]'
                        }`}
                      >
                        <div className="flex items-center justify-between font-semibold">
                          <span>
                            {m.id}. {m.title}
                          </span>
                          {done && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                        </div>
                        <p className="mt-0.5 opacity-85">{active ? m.hint : m.objective}</p>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-2">
                  <h3 className="font-display text-sm font-semibold text-emerald-300 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-amber-300" />
                    Achievements
                  </h3>
                  <div className="grid grid-cols-1 gap-2">
                    {ACHIEVEMENTS.map((ach) => {
                      const unlocked = state.unlockedAchievements.includes(ach.id);
                      return (
                        <div
                          key={ach.id}
                          className={`p-2.5 rounded border text-xs flex items-center justify-between ${
                            unlocked
                              ? 'bg-emerald-950/45 border-amber-400/45 text-[#f5f2e9]'
                              : 'bg-[#0b2a1d]/45 border-emerald-500/15 text-[#869289]'
                          }`}
                        >
                          <div>
                            <div className="font-semibold">{ach.title}</div>
                            <div className="text-[11px] opacity-85">{ach.description}</div>
                          </div>
                          <span className="font-mono-data text-[11px] shrink-0 text-amber-300">+{ach.points}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CASE SOLVED COMPLETION MODAL */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#020d08]/85 pointer-events-auto">
          <div className="w-full max-w-lg bg-[#071f15] border border-amber-400/50 rounded-xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-emerald-300">
              <ShieldCheck className="w-7 h-7 text-amber-300" />
              <div>
                <div className="text-xs font-mono-data uppercase tracking-wider text-amber-300">Case Resolved</div>
                <h2 className="font-display text-lg font-bold text-[#f5f2e9]">
                  Harbor &amp; Finch Case CR-26-047 Closed
                </h2>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-[#d6d3c4] leading-relaxed">
              You interviewed company personnel, recovered E01–E20 evidence, completed all 14 sequential CYBERQUEST pipeline steps (including TRUSTLOCK Automatic Recovery), tested all 4 alternative hypotheses, and filed your 14-section report.
            </p>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="p-3 bg-[#0b2a1d] border border-emerald-500/30 rounded-lg">
                <div className="text-[11px] text-[#a3aa9c]">Score</div>
                <div className="mt-0.5 text-base font-bold font-mono-data text-amber-300">
                  {state.finalScore}
                </div>
              </div>
              <div className="p-3 bg-[#0b2a1d] border border-emerald-500/30 rounded-lg">
                <div className="text-[11px] text-[#a3aa9c]">Accuracy</div>
                <div className="mt-0.5 text-base font-bold font-mono-data text-emerald-300">
                  {state.finalAccuracy}%
                </div>
              </div>
              <div className="p-3 bg-[#0b2a1d] border border-emerald-500/30 rounded-lg">
                <div className="text-[11px] text-[#a3aa9c]">Clues</div>
                <div className="mt-0.5 text-base font-bold font-mono-data text-[#f5f2e9]">
                  {state.discoveredClues.length}/{WORLD_CLUES.length}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onDismissCompletion}
                className="px-4 py-2 text-xs font-semibold bg-gradient-to-r from-emerald-600 to-amber-500 hover:from-emerald-500 hover:to-amber-400 text-[#04140d] rounded-md transition-colors cursor-pointer"
              >
                Continue Exploring 3D Facility
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
