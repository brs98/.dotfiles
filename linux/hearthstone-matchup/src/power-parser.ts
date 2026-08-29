import type {
  BoardMinion,
  CombatSnapshot,
  HeroPower,
  PlayerBoard,
  PowerEvent,
  Secret,
  Trinket,
} from "./domain.js";

type EventListener = (event: PowerEvent) => void;

interface EntityDescriptor {
  readonly name: string;
  readonly id: number;
  readonly zone: string;
  readonly zonePosition: number;
  readonly cardId: string;
  readonly player: number;
}

class Entity {
  readonly id: number;
  cardId = "";
  name = "";
  readonly tags = new Map<string, number>();
  readonly stringTags = new Map<string, string>();
  readonly rawTags = new Map<number, number>();

  constructor(id: number) {
    this.id = id;
  }

  numeric(tag: string): number {
    return this.tags.get(tag) ?? 0;
  }

  string(tag: string): string {
    return this.stringTags.get(tag) ?? "";
  }

  get controller(): number {
    return this.numeric("CONTROLLER");
  }

  get zone(): string {
    return this.string("ZONE");
  }

  get cardType(): string {
    return this.string("CARDTYPE");
  }
}

class GameState {
  readonly entities = new Map<number, Entity>();
  localPlayerId: number | undefined;
  isBattlegrounds = false;
  turn = 0;

  reset(): void {
    this.entities.clear();
    this.localPlayerId = undefined;
    this.isBattlegrounds = false;
    this.turn = 0;
  }

  entity(id: number): Entity {
    const existing = this.entities.get(id);
    if (existing) return existing;
    const created = new Entity(id);
    this.entities.set(id, created);
    return created;
  }

  freshEntity(id: number): Entity {
    const created = new Entity(id);
    this.entities.set(id, created);
    return created;
  }

  noteCardId(cardId: string): void {
    if (cardId === "TB_BaconShop_8P_PlayerE") this.isBattlegrounds = true;
  }

  notePlayer(playerId: number, hasRealAccount: boolean): void {
    if (hasRealAccount && this.localPlayerId === undefined) this.localPlayerId = playerId;
  }

  private entitiesFor(playerId: number): readonly Entity[] {
    return [...this.entities.values()].filter((entity) => entity.controller === playerId);
  }

  private hero(playerId: number): Entity | undefined {
    return this.entitiesFor(playerId)
      .filter((entity) => entity.zone === "PLAY" && entity.cardType === "HERO")
      .sort((left, right) => right.id - left.id)[0];
  }

  private minions(playerId: number): readonly BoardMinion[] {
    return this.entitiesFor(playerId)
      .filter(
        (entity) =>
          entity.zone === "PLAY" && entity.cardType === "MINION" && entity.cardId.length > 0,
      )
      .sort(
        (left, right) =>
          left.numeric("ZONE_POSITION") - right.numeric("ZONE_POSITION") || left.id - right.id,
      )
      .map((entity) => this.boardMinion(entity));
  }

  private hand(playerId: number): readonly BoardMinion[] {
    return this.entitiesFor(playerId)
      .filter(
        (entity) =>
          entity.zone === "HAND" && entity.cardType === "MINION" && entity.cardId.length > 0,
      )
      .sort(
        (left, right) =>
          left.numeric("ZONE_POSITION") - right.numeric("ZONE_POSITION") || left.id - right.id,
      )
      .map((entity) => this.boardMinion(entity));
  }

  private boardMinion(entity: Entity): BoardMinion {
    const maxHealth = Math.max(0, entity.numeric("HEALTH"));
    return {
      entityId: entity.id,
      cardId: entity.cardId,
      position: entity.numeric("ZONE_POSITION"),
      attack: Math.max(0, entity.numeric("ATK")),
      health: Math.max(0, maxHealth - entity.numeric("DAMAGE")),
      maxHealth,
      taunt: entity.numeric("TAUNT") === 1,
      divineShield: entity.numeric("DIVINE_SHIELD") === 1,
      poisonous: entity.numeric("POISONOUS") === 1,
      venomous: entity.numeric("VENOMOUS") === 1,
      reborn: entity.numeric("REBORN") === 1,
      windfury: entity.numeric("WINDFURY") === 1 || entity.numeric("MEGA_WINDFURY") === 1,
      stealth: entity.numeric("STEALTH") === 1,
      scriptDataNum1: entity.numeric("SCRIPT_DATA_NUM_1"),
      scriptDataNum2: entity.numeric("SCRIPT_DATA_NUM_2"),
      scriptDataNum3: entity.numeric("SCRIPT_DATA_NUM_3"),
      scriptDataNum4: entity.numeric("SCRIPT_DATA_NUM_4"),
      scriptDataNum5: entity.numeric("SCRIPT_DATA_NUM_5"),
      scriptDataNum6: entity.numeric("SCRIPT_DATA_NUM_6"),
      tavernTier: entity.numeric("TECH_LEVEL"),
      enchantments: this.enchantments(entity.id),
      rawTags: Object.fromEntries(entity.rawTags),
    };
  }

  private enchantments(attachedTo: number) {
    return [...this.entities.values()]
      .filter(
        (entity) =>
          entity.cardId.length > 0 &&
          entity.numeric("ATTACHED") === attachedTo &&
          entity.zone !== "REMOVEDFROMGAME",
      )
      .sort((left, right) => left.id - right.id)
      .map((entity) => ({
        cardId: entity.cardId,
        originEntityId: entity.numeric("CREATOR"),
        tagScriptDataNum1: entity.numeric("SCRIPT_DATA_NUM_1"),
        tagScriptDataNum2: entity.numeric("SCRIPT_DATA_NUM_2"),
        timing: entity.id,
      }));
  }

  private heroPowers(playerId: number, hero: Entity | undefined): readonly HeroPower[] {
    const candidates = this.entitiesFor(playerId)
      .filter(
        (entity) =>
          entity.cardId.length > 0 &&
          entity.cardType === "HERO_POWER" &&
          entity.zone !== "REMOVEDFROMGAME",
      )
      .sort((left, right) => left.id - right.id);
    const linked = hero
      ? candidates.filter(
          (entity) =>
            entity.numeric("CREATOR") === hero.id || entity.numeric("ATTACHED") === hero.id,
        )
      : [];
    const selected = linked.length > 0 ? linked : candidates.slice(-1);
    return selected
      .map((entity) => ({
        entityId: entity.id,
        cardId: entity.cardId,
        used: entity.numeric("EXHAUSTED") === 1,
        info: entity.numeric("SCRIPT_DATA_NUM_1"),
        info2: entity.numeric("SCRIPT_DATA_NUM_2"),
        info3: entity.numeric("SCRIPT_DATA_NUM_3"),
        info4: entity.numeric("SCRIPT_DATA_NUM_4"),
        info5: entity.numeric("SCRIPT_DATA_NUM_5"),
        info6: entity.numeric("SCRIPT_DATA_NUM_6"),
      }));
  }

  private trinkets(playerId: number): readonly Trinket[] {
    return this.entitiesFor(playerId)
      .filter(
        (entity) =>
          entity.cardId.includes("MagicItem") && entity.zone !== "REMOVEDFROMGAME",
      )
      .sort((left, right) => left.id - right.id)
      .slice(-2)
      .map((entity) => ({
        entityId: entity.id,
        cardId: entity.cardId,
        scriptDataNum1: entity.numeric("SCRIPT_DATA_NUM_1"),
        scriptDataNum2: entity.numeric("SCRIPT_DATA_NUM_2"),
        scriptDataNum6: entity.numeric("SCRIPT_DATA_NUM_6"),
        rawTags: Object.fromEntries(entity.rawTags),
      }));
  }

  private secrets(playerId: number): readonly Secret[] {
    return this.entitiesFor(playerId)
      .filter((entity) => entity.cardId.length > 0 && entity.zone === "SECRET")
      .sort((left, right) => left.id - right.id)
      .map((entity) => ({
        entityId: entity.id,
        cardId: entity.cardId,
        scriptDataNum1: entity.numeric("SCRIPT_DATA_NUM_1"),
        scriptDataNum2: entity.numeric("SCRIPT_DATA_NUM_2"),
      }));
  }

  private board(playerId: number): PlayerBoard {
    const hero = this.hero(playerId);
    const heroHealth = hero
      ? Math.max(0, hero.numeric("HEALTH") + hero.numeric("ARMOR") - hero.numeric("DAMAGE"))
      : 1;
    return {
      playerId,
      heroEntityId: hero?.id ?? 0,
      heroCardId: hero?.cardId ?? "TB_BaconShop_HERO_KelThuzad",
      heroHealth,
      tavernTier: Math.max(1, hero?.numeric("PLAYER_TECH_LEVEL") ?? 1),
      minions: this.minions(playerId),
      hand: this.hand(playerId),
      heroPowers: this.heroPowers(playerId, hero),
      trinkets: this.trinkets(playerId),
      secrets: this.secrets(playerId),
    };
  }

  combatSnapshot(attackerEntityId: number | undefined): CombatSnapshot | undefined {
    const localPlayerId = this.localPlayerId;
    if (!this.isBattlegrounds || localPlayerId === undefined) return undefined;

    const opponents = new Set<number>();
    for (const entity of this.entities.values()) {
      if (
        entity.controller !== 0 &&
        entity.controller !== localPlayerId &&
        entity.zone === "PLAY" &&
        (entity.cardType === "MINION" || entity.cardType === "HERO")
      ) {
        opponents.add(entity.controller);
      }
    }
    const opponentId = [...opponents][0];
    if (opponentId === undefined) return undefined;

    const player = this.board(localPlayerId);
    const opponent = this.board(opponentId);
    const attacker = attackerEntityId === undefined ? undefined : this.entities.get(attackerEntityId);
    const firstAttacker = attacker?.controller === opponentId ? 1 : 0;
    // Power.log exposes the combat boards but not every persistent counter,
    // quest field, anomaly pool, or hidden opposing hand entity required by
    // the simulator. The result is useful, but must always be labelled partial.
    return { turn: this.turn, player, opponent, firstAttacker, partial: true };
  }
}

export class PowerParser {
  private readonly state = new GameState();
  private pendingEntity: Entity | undefined;
  private inCombat = false;
  private readonly listener: EventListener;

  constructor(listener: EventListener = () => undefined) {
    this.listener = listener;
  }

  reset(): void {
    this.state.reset();
    this.pendingEntity = undefined;
    this.inCombat = false;
  }

  feed(line: string): void {
    const payloadMarker = ") - ";
    const payloadStart = line.indexOf(payloadMarker);
    if (payloadStart === -1) return;

    const source = line.slice(0, payloadStart);
    if (!source.endsWith("GameState.DebugPrintPower(")) return;

    const payload = line.slice(payloadStart + payloadMarker.length).trimStart();
    if (payload.startsWith("tag=")) {
      this.applyPendingTag(payload);
      return;
    }
    this.pendingEntity = undefined;

    if (payload.startsWith("TAG_CHANGE ")) {
      this.handleTagChange(payload.slice("TAG_CHANGE ".length));
    } else if (payload.startsWith("FULL_ENTITY - Creating ")) {
      this.handleFullEntityCreating(payload.slice("FULL_ENTITY - Creating ".length));
    } else if (payload.startsWith("FULL_ENTITY - Updating ")) {
      this.handleDescriptorLine(payload.slice("FULL_ENTITY - Updating ".length));
    } else if (payload.startsWith("SHOW_ENTITY - Updating ")) {
      this.handleDescriptorLine(payload.slice("SHOW_ENTITY - Updating ".length));
    } else if (payload.startsWith("CHANGE_ENTITY - Updating ")) {
      this.handleDescriptorLine(payload.slice("CHANGE_ENTITY - Updating ".length));
    } else if (payload.startsWith("BLOCK_START BlockType=ATTACK")) {
      this.handleAttackBlock(payload);
    } else if (payload.startsWith("Player EntityID=")) {
      this.handlePlayer(payload);
    } else if (payload.startsWith("CREATE_GAME")) {
      this.reset();
      this.listener({ type: "game-created" });
    }
  }

  private handlePlayer(line: string): void {
    const playerId = integerValue("PlayerID=", line);
    if (playerId === undefined) return;
    const high = integerValue("hi=", line) ?? 0;
    const low = integerValue("lo=", line) ?? 0;
    this.state.notePlayer(playerId, high !== 0 || low !== 0);
  }

  private handleFullEntityCreating(line: string): void {
    const id = integerValue("ID=", line);
    if (id === undefined) return;
    const entity = this.state.freshEntity(id);
    const cardId = stringValue("CardID=", line);
    if (cardId) {
      entity.cardId = cardId;
      this.state.noteCardId(cardId);
    }
    this.pendingEntity = entity;
  }

  private handleDescriptorLine(line: string): void {
    const descriptor = parseDescriptor(line);
    const entityId = descriptor?.id ?? integerValue("Entity=", line);
    if (entityId === undefined) return;
    if (descriptor) this.applyDescriptor(descriptor, true);
    const entity = this.state.entity(entityId);
    const revealedCardId = stringValue("CardID=", line);
    if (revealedCardId) {
      entity.cardId = revealedCardId;
      this.state.noteCardId(revealedCardId);
    }
    this.pendingEntity = entity;
  }

  private handleTagChange(line: string): void {
    const tagMarker = " tag=";
    const tagStart = line.indexOf(tagMarker);
    if (tagStart === -1) return;
    const subject = line.slice(0, tagStart);
    const rest = line.slice(tagStart + tagMarker.length);
    const valueMarker = " value=";
    const valueStart = rest.indexOf(valueMarker);
    if (valueStart === -1 || !subject.startsWith("Entity=")) return;

    const tag = rest.slice(0, valueStart);
    const value = rest.slice(valueStart + valueMarker.length).trim();
    const subjectValue = subject.slice("Entity=".length);

    if (subjectValue.startsWith("[")) {
      const descriptor = parseDescriptor(subjectValue);
      if (!descriptor) return;
      this.applyDescriptor(descriptor, false);
      this.setTag(this.state.entity(descriptor.id), tag, value);
    } else if (subjectValue === "GameEntity") {
      this.handleGameEntityTag(tag, value);
    } else {
      const id = Number.parseInt(subjectValue, 10);
      if (Number.isFinite(id)) this.setTag(this.state.entity(id), tag, value);
    }
  }

  private handleAttackBlock(line: string): void {
    if (!this.state.isBattlegrounds || this.inCombat) return;
    this.inCombat = true;
    const descriptor = parseDescriptor(line);
    const attackerEntityId = descriptor?.id ?? integerValue("Entity=", line);
    const snapshot = this.state.combatSnapshot(attackerEntityId);
    if (snapshot) this.listener({ type: "combat-started", snapshot });
  }

  private handleGameEntityTag(tag: string, value: string): void {
    if (tag === "TURN") {
      const turn = Number.parseInt(value, 10);
      if (Number.isFinite(turn)) this.state.turn = turn;
      return;
    }
    if (tag !== "STEP") return;

    if (value !== "MAIN_ACTION" && this.inCombat) {
      this.inCombat = false;
      this.listener({ type: "combat-ended" });
    }
    if (value === "FINAL_GAMEOVER") this.listener({ type: "game-over" });
  }

  private applyPendingTag(line: string): void {
    if (!this.pendingEntity) return;
    const valueMarker = " value=";
    const valueStart = line.indexOf(valueMarker);
    if (valueStart === -1) return;
    const tag = line.slice("tag=".length, valueStart).split(" ", 1)[0];
    if (!tag) return;
    const value = line.slice(valueStart + valueMarker.length).trim();
    this.setTag(this.pendingEntity, tag, value);
  }

  private setTag(entity: Entity, tag: string, value: string): void {
    const numericTag = Number.parseInt(tag, 10);
    if (/^\d+$/.test(tag) && Number.isFinite(numericTag)) {
      entity.rawTags.set(numericTag, Number.parseInt(value, 10) || 0);
      return;
    }
    entity.stringTags.set(tag, value);
    entity.tags.set(tag, Number.parseInt(value, 10) || 0);
  }

  private applyDescriptor(descriptor: EntityDescriptor, includePositional: boolean): void {
    const entity = this.state.entity(descriptor.id);
    if (descriptor.cardId.length > 0) {
      entity.cardId = descriptor.cardId;
      this.state.noteCardId(descriptor.cardId);
    }
    if (descriptor.name.length > 0) entity.name = descriptor.name;
    if (!includePositional) return;
    entity.stringTags.set("ZONE", descriptor.zone);
    entity.tags.set("ZONE_POSITION", descriptor.zonePosition);
    entity.tags.set("CONTROLLER", descriptor.player);
  }
}

export function parseDescriptor(input: string): EntityDescriptor | undefined {
  const open = input.indexOf("[");
  if (open === -1) return undefined;
  const match = /^\[entityName=(.*) id=(\d+) zone=([^ ]*) zonePos=(\d+) cardId=([^ ]*) player=(\d+)\]/.exec(
    input.slice(open),
  );
  if (!match) return undefined;
  const [, name, id, zone, zonePosition, cardId, player] = match;
  if (
    name === undefined ||
    id === undefined ||
    zone === undefined ||
    zonePosition === undefined ||
    cardId === undefined ||
    player === undefined
  ) {
    return undefined;
  }
  return {
    name,
    id: Number.parseInt(id, 10),
    zone,
    zonePosition: Number.parseInt(zonePosition, 10),
    cardId,
    player: Number.parseInt(player, 10),
  };
}

function integerValue(key: string, line: string): number | undefined {
  const start = line.indexOf(key);
  if (start === -1) return undefined;
  const match = /^\d+/.exec(line.slice(start + key.length));
  return match?.[0] === undefined ? undefined : Number.parseInt(match[0], 10);
}

function stringValue(key: string, line: string): string | undefined {
  const start = line.indexOf(key);
  if (start === -1) return undefined;
  const value = line.slice(start + key.length).split(" ", 1)[0];
  return value && value.length > 0 ? value : undefined;
}
