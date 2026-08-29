import { createRequire } from "node:module";
import type { BoardMinion, CombatSnapshot, PlayerBoard } from "./domain.js";

export interface SimulationOdds {
  readonly win: number;
  readonly tie: number;
  readonly loss: number;
  readonly simulations: number;
}

interface LambdaResponse {
  readonly statusCode: number;
  readonly body: string | null;
}

interface RawSimulationResult {
  readonly won?: number;
  readonly tied?: number;
  readonly lost?: number;
  readonly wonPercent?: number;
  readonly tiedPercent?: number;
  readonly lostPercent?: number;
}

const SIMULATIONS = 4_000;
const MAX_DURATION_MS = 4_000;
const require = createRequire(import.meta.url);
const simulateBgsBattle = loadSimulator();

export async function simulate(snapshot: CombatSnapshot): Promise<SimulationOdds> {
  const input = {
    playerBoard: boardInput(
      snapshot.player,
      snapshot.firstAttacker === 0 ? snapshot.firstAttackerEntityId : undefined,
    ),
    opponentBoard: boardInput(
      snapshot.opponent,
      snapshot.firstAttacker === 1 ? snapshot.firstAttackerEntityId : undefined,
    ),
    options: {
      numberOfSimulations: SIMULATIONS,
      maxAcceptableDuration: MAX_DURATION_MS,
      includeOutcomeSamples: false,
      skipInfoLogs: true,
    },
    gameState: {
      currentTurn: snapshot.turn,
      anomalies: [],
    },
    debugState: {
      forcedCurrentAttacker: snapshot.firstAttacker,
      forcedFaceOffBase: [],
    },
  };

  const response: unknown = await simulateBgsBattle({ body: JSON.stringify(input) });
  if (!isLambdaResponse(response) || response.statusCode !== 200 || response.body === null) {
    throw new Error("The Battlegrounds simulator rejected this board state.");
  }

  const result: unknown = JSON.parse(response.body);
  if (!isSimulationResult(result)) {
    throw new Error("The Battlegrounds simulator returned an invalid result.");
  }
  const simulations = (result.won ?? 0) + (result.tied ?? 0) + (result.lost ?? 0);
  if (simulations === 0) throw new Error("No valid combat simulations completed.");

  return {
    win: result.wonPercent,
    tie: result.tiedPercent,
    loss: result.lostPercent,
    simulations,
  };
}

function boardInput(board: PlayerBoard, firstAttackerEntityId: number | undefined): object {
  const firstAttackerIndex = board.minions.findIndex(
    (minion) => minion.entityId === firstAttackerEntityId,
  );
  return {
    player: {
      entityId: board.heroEntityId || undefined,
      cardId: board.heroCardId,
      hpLeft: board.heroHealth,
      tavernTier: board.tavernTier,
      heroPowers: board.heroPowers,
      questEntities: [],
      trinkets: board.trinkets.map((trinket) => ({
        entityId: trinket.entityId,
        cardId: trinket.cardId,
        scriptDataNum1: trinket.scriptDataNum1,
        scriptDataNum2: trinket.scriptDataNum2,
        scriptDataNum6: trinket.scriptDataNum6,
        tags: trinket.rawTags,
      })),
      secrets: board.secrets,
      globalInfo: {},
      hand: board.hand.map((minion) => minionInput(minion)),
      startOfCombatDone: true,
    },
    secrets: board.secrets,
    board: board.minions.map((minion, index) =>
      minionInput(minion, firstAttackerIndex > 0 && index < firstAttackerIndex),
    ),
  };
}

function minionInput(minion: BoardMinion, hasAttacked = false): object {
  return {
    entityId: minion.entityId,
    cardId: minion.cardId,
    attack: minion.attack,
    health: minion.health,
    maxAttack: minion.attack,
    maxHealth: minion.maxHealth,
    taunt: minion.taunt,
    divineShield: minion.divineShield,
    poisonous: minion.poisonous,
    venomous: minion.venomous,
    hadVenomous: minion.venomous,
    reborn: minion.reborn,
    windfury: minion.windfury,
    stealth: minion.stealth,
    scriptDataNum1: minion.scriptDataNum1,
    scriptDataNum2: minion.scriptDataNum2,
    scriptDataNum3: minion.scriptDataNum3,
    scriptDataNum4: minion.scriptDataNum4,
    scriptDataNum5: minion.scriptDataNum5,
    scriptDataNum6: minion.scriptDataNum6,
    tavernTier: minion.tavernTier,
    enchantments: minion.enchantments,
    tags: minion.rawTags,
    ...(hasAttacked ? { hasAttacked: 1 } : {}),
  };
}

function isLambdaResponse(value: unknown): value is LambdaResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "statusCode" in value &&
    typeof value.statusCode === "number" &&
    "body" in value &&
    (typeof value.body === "string" || value.body === null)
  );
}

function isSimulationResult(value: unknown): value is Required<RawSimulationResult> {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.wonPercent === "number" &&
    typeof candidate.tiedPercent === "number" &&
    typeof candidate.lostPercent === "number" &&
    (candidate.won === undefined || typeof candidate.won === "number") &&
    (candidate.tied === undefined || typeof candidate.tied === "number") &&
    (candidate.lost === undefined || typeof candidate.lost === "number")
  );
}

type SimulateHandler = (event: { readonly body: string }) => Promise<unknown>;

function loadSimulator(): SimulateHandler {
  const module: unknown = require("@firestone-hs/simulate-bgs-battle");
  if (isSimulatorModule(module)) return module.default;
  throw new Error("The Firestone Battlegrounds simulator could not be loaded.");
}

function isSimulatorModule(value: unknown): value is { readonly default: SimulateHandler } {
  return (
    typeof value === "object" &&
    value !== null &&
    "default" in value &&
    typeof value.default === "function"
  );
}
