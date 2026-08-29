import assert from "node:assert/strict";
import test from "node:test";
import type { CombatSnapshot, PowerEvent } from "./domain.js";
import { parseDescriptor, PowerParser } from "./power-parser.js";

function gameStateLine(payload: string): string {
  return `D 14:57:49.9029830 GameState.DebugPrintPower() - ${payload}`;
}

function setup(listener: (event: PowerEvent) => void = () => undefined): PowerParser {
  const parser = new PowerParser(listener);
  parser.feed(gameStateLine("CREATE_GAME"));
  parser.feed(
    gameStateLine(
      "    Player EntityID=2 PlayerID=1 GameAccountId=[hi=1441151 lo=5069]",
    ),
  );
  parser.feed(gameStateLine("    Player EntityID=3 PlayerID=9 GameAccountId=[hi=0 lo=0]"));
  parser.feed(gameStateLine("FULL_ENTITY - Creating ID=45 CardID=TB_BaconShop_8P_PlayerE"));
  hero(parser, 101, "TB_BaconShop_HERO_08", 1);
  hero(parser, 109, "TB_BaconShop_HERO_11", 9);
  return parser;
}

function entity(
  parser: PowerParser,
  id: number,
  cardId: string,
  player: number,
  position: number,
): void {
  parser.feed(gameStateLine(`FULL_ENTITY - Creating ID=${id} CardID=${cardId}`));
  parser.feed(gameStateLine("    tag=CARDTYPE value=MINION"));
  parser.feed(gameStateLine("    tag=ZONE value=PLAY"));
  parser.feed(gameStateLine(`    tag=CONTROLLER value=${player}`));
  parser.feed(gameStateLine(`    tag=ZONE_POSITION value=${position}`));
  parser.feed(gameStateLine("    tag=ATK value=2"));
  parser.feed(gameStateLine("    tag=HEALTH value=3"));
}

function hero(parser: PowerParser, id: number, cardId: string, player: number): void {
  parser.feed(gameStateLine(`FULL_ENTITY - Creating ID=${id} CardID=${cardId}`));
  parser.feed(gameStateLine("    tag=CARDTYPE value=HERO"));
  parser.feed(gameStateLine("    tag=ZONE value=PLAY"));
  parser.feed(gameStateLine(`    tag=CONTROLLER value=${player}`));
  parser.feed(gameStateLine("    tag=HEALTH value=30"));
  parser.feed(gameStateLine("    tag=PLAYER_TECH_LEVEL value=3"));
}

test("descriptor parser tolerates brackets and localized entity names", () => {
  const parsed = parseDescriptor(
    "[entityName=未知实体 [cardType=INVALID] id=660 zone=SETASIDE zonePos=0 cardId= player=2]",
  );
  assert.deepEqual(parsed, {
    name: "未知实体 [cardType=INVALID]",
    id: 660,
    zone: "SETASIDE",
    zonePosition: 0,
    cardId: "",
    player: 2,
  });
});

test("snapshots both boards once at the first attack", () => {
  const events: PowerEvent[] = [];
  const parser = setup((event) => events.push(event));
  entity(parser, 561, "BG28_300", 9, 1);
  entity(parser, 562, "BG31_330", 1, 1);
  parser.feed(gameStateLine("    TAG_CHANGE Entity=561 tag=DIVINE_SHIELD value=1 "));
  parser.feed(gameStateLine("    TAG_CHANGE Entity=562 tag=TAUNT value=1 "));
  parser.feed(gameStateLine("    TAG_CHANGE Entity=562 tag=DAMAGE value=1 "));

  const attack =
    "BLOCK_START BlockType=ATTACK Entity=[entityName=A id=562 zone=PLAY zonePos=1 cardId=BG31_330 player=1] EffectIndex=0";
  parser.feed(gameStateLine(attack));
  parser.feed(gameStateLine(attack));

  const combatEvents = events.filter(
    (event): event is Extract<PowerEvent, { type: "combat-started" }> =>
      event.type === "combat-started",
  );
  assert.equal(combatEvents.length, 1);
  const firstCombat = combatEvents[0];
  assert.ok(firstCombat);
  const snapshot: CombatSnapshot = firstCombat.snapshot;
  assert.equal(snapshot.player.minions[0]?.health, 2);
  assert.equal(snapshot.player.minions[0]?.maxHealth, 3);
  assert.equal(snapshot.player.minions[0]?.taunt, true);
  assert.equal(snapshot.opponent.minions[0]?.divineShield, true);
  assert.equal(snapshot.player.heroCardId, "TB_BaconShop_HERO_08");
  assert.equal(snapshot.opponent.heroCardId, "TB_BaconShop_HERO_11");
  assert.equal(snapshot.firstAttacker, 0);
});

test("stale TAG_CHANGE descriptors do not resurrect removed minions", () => {
  let snapshot: CombatSnapshot | undefined;
  const parser = setup((event) => {
    if (event.type === "combat-started") snapshot = event.snapshot;
  });
  entity(parser, 561, "BG28_300", 9, 1);
  entity(parser, 562, "BG31_330", 1, 1);

  const stale = "[entityName=X id=561 zone=PLAY zonePos=1 cardId=BG28_300 player=9]";
  parser.feed(gameStateLine(`    TAG_CHANGE Entity=${stale} tag=ZONE value=REMOVEDFROMGAME `));
  parser.feed(gameStateLine(`    TAG_CHANGE Entity=${stale} tag=ATK value=0 `));
  parser.feed(gameStateLine(`    TAG_CHANGE Entity=${stale} tag=HEALTH value=0 `));
  parser.feed(
    gameStateLine(
      "BLOCK_START BlockType=ATTACK Entity=[entityName=A id=562 zone=PLAY zonePos=1 cardId=BG31_330 player=1] EffectIndex=0",
    ),
  );

  assert.equal(snapshot?.opponent.minions.length, 0);
});

test("recycled entity IDs discard their old tags", () => {
  let snapshot: CombatSnapshot | undefined;
  const parser = setup((event) => {
    if (event.type === "combat-started") snapshot = event.snapshot;
  });
  entity(parser, 700, "BG28_300", 9, 1);
  parser.feed(gameStateLine("FULL_ENTITY - Creating ID=700 CardID=BG34_630"));
  parser.feed(gameStateLine("    tag=ZONE value=SETASIDE"));
  entity(parser, 562, "BG31_330", 1, 1);
  parser.feed(
    gameStateLine(
      "BLOCK_START BlockType=ATTACK Entity=[entityName=A id=562 zone=PLAY zonePos=1 cardId=BG31_330 player=1] EffectIndex=0",
    ),
  );

  assert.equal(snapshot?.opponent.minions.length, 0);
});

test("SHOW_ENTITY and CHANGE_ENTITY apply the revealed card ID", () => {
  let snapshot: CombatSnapshot | undefined;
  const parser = setup((event) => {
    if (event.type === "combat-started") snapshot = event.snapshot;
  });
  entity(parser, 561, "BG28_300", 9, 1);
  entity(parser, 562, "BG31_330", 1, 1);
  parser.feed(
    gameStateLine(
      "SHOW_ENTITY - Updating Entity=562 CardID=BGS_004",
    ),
  );
  parser.feed(
    gameStateLine(
      "CHANGE_ENTITY - Updating Entity=[entityName=X id=561 zone=PLAY zonePos=1 cardId=BG28_300 player=9] CardID=BG34_630",
    ),
  );
  parser.feed(
    gameStateLine(
      "BLOCK_START BlockType=ATTACK Entity=[entityName=A id=562 zone=PLAY zonePos=1 cardId=BGS_004 player=1] EffectIndex=0",
    ),
  );

  assert.equal(snapshot?.player.minions[0]?.cardId, "BGS_004");
  assert.equal(snapshot?.opponent.minions[0]?.cardId, "BG34_630");
});

test("selects only the current projected opponent hero power", () => {
  let snapshot: CombatSnapshot | undefined;
  const parser = setup((event) => {
    if (event.type === "combat-started") snapshot = event.snapshot;
  });
  entity(parser, 561, "BG28_300", 9, 1);
  entity(parser, 562, "BG31_330", 1, 1);
  const powers: ReadonlyArray<readonly [number, string]> = [
    [150, "BG27_HERO_801p2"],
    [950, "TB_BaconShop_HP_075"],
  ];
  for (const [id, cardId] of powers) {
    parser.feed(gameStateLine(`FULL_ENTITY - Creating ID=${id} CardID=${cardId}`));
    parser.feed(gameStateLine("    tag=CARDTYPE value=HERO_POWER"));
    parser.feed(gameStateLine("    tag=ZONE value=PLAY"));
    parser.feed(gameStateLine("    tag=CONTROLLER value=9"));
  }
  parser.feed(
    gameStateLine(
      "BLOCK_START BlockType=ATTACK Entity=[entityName=A id=562 zone=PLAY zonePos=1 cardId=BG31_330 player=1] EffectIndex=0",
    ),
  );

  assert.deepEqual(snapshot?.opponent.heroPowers.map((power) => power.cardId), [
    "TB_BaconShop_HP_075",
  ]);
});

test("ignores the delayed PowerTaskList stream", () => {
  let snapshot: CombatSnapshot | undefined;
  const parser = setup((event) => {
    if (event.type === "combat-started") snapshot = event.snapshot;
  });
  entity(parser, 561, "BG28_300", 9, 1);
  entity(parser, 562, "BG31_330", 1, 1);
  const descriptor = "[entityName=X id=561 zone=PLAY zonePos=1 cardId=BG28_300 player=9]";
  parser.feed(gameStateLine(`    TAG_CHANGE Entity=${descriptor} tag=ZONE value=REMOVEDFROMGAME `));
  parser.feed(
    `D 14:57:49.9029830 PowerTaskList.DebugPrintPower() -     TAG_CHANGE Entity=${descriptor} tag=ZONE value=PLAY `,
  );
  parser.feed(
    gameStateLine(
      "BLOCK_START BlockType=ATTACK Entity=[entityName=A id=562 zone=PLAY zonePos=1 cardId=BG31_330 player=1] EffectIndex=0",
    ),
  );

  assert.equal(snapshot?.opponent.minions.length, 0);
});
