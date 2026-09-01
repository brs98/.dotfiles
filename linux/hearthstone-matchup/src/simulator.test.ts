import assert from "node:assert/strict";
import test from "node:test";
import type { CombatSnapshot, PlayerBoard } from "./domain.js";
import { buildSimulationInput } from "./simulator.js";

function board(playerId: number, heroEntityId: number, heroCardId: string): PlayerBoard {
  return {
    playerId,
    participantId: heroEntityId,
    heroEntityId,
    heroCardId,
    heroHealth: 30,
    tavernTier: 3,
    minions: [],
    hand: [],
    heroPowers: [],
    trinkets: [],
    secrets: [],
  };
}

test("builds the currently visible Duos faceoff input", () => {
  const snapshot: CombatSnapshot = {
    kind: "duos",
    turn: 8,
    player: board(1, 101, "HERO_A"),
    opponent: board(9, 109, "HERO_C"),
    firstAttacker: 0,
    firstAttackerEntityId: 501,
    partial: true,
  };

  const input = buildSimulationInput(snapshot);

  assert.equal(input.playerBoard.player.cardId, "HERO_A");
  assert.equal(input.opponentBoard.player.cardId, "HERO_C");
  assert.equal(input.debugState.forcedCurrentAttacker, 0);
});

test("preserves the first attacker for Solo", () => {
  const snapshot: CombatSnapshot = {
    kind: "solo",
    turn: 8,
    player: board(1, 101, "HERO_A"),
    opponent: board(9, 109, "HERO_C"),
    firstAttacker: 1,
    firstAttackerEntityId: 601,
    partial: true,
  };

  const input = buildSimulationInput(snapshot);

  assert.equal(input.debugState.forcedCurrentAttacker, 1);
});
