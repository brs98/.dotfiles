export interface BoardMinion {
  readonly entityId: number;
  readonly cardId: string;
  readonly position: number;
  readonly attack: number;
  readonly health: number;
  readonly maxHealth: number;
  readonly taunt: boolean;
  readonly divineShield: boolean;
  readonly poisonous: boolean;
  readonly venomous: boolean;
  readonly reborn: boolean;
  readonly windfury: boolean;
  readonly stealth: boolean;
  readonly scriptDataNum1: number;
  readonly scriptDataNum2: number;
  readonly scriptDataNum3: number;
  readonly scriptDataNum4: number;
  readonly scriptDataNum5: number;
  readonly scriptDataNum6: number;
  readonly tavernTier: number;
  readonly enchantments: readonly BoardEnchantment[];
  readonly rawTags: Readonly<Record<number, number>>;
}

export interface BoardEnchantment {
  readonly cardId: string;
  readonly originEntityId: number;
  readonly tagScriptDataNum1: number;
  readonly tagScriptDataNum2: number;
  readonly timing: number;
}

export interface HeroPower {
  readonly entityId: number;
  readonly cardId: string;
  readonly used: boolean;
  readonly info: number;
  readonly info2: number;
  readonly info3: number;
  readonly info4: number;
  readonly info5: number;
  readonly info6: number;
}

export interface Trinket {
  readonly entityId: number;
  readonly cardId: string;
  readonly scriptDataNum1: number;
  readonly scriptDataNum2: number;
  readonly scriptDataNum6: number;
  readonly rawTags: Readonly<Record<number, number>>;
}

export interface Secret {
  readonly entityId: number;
  readonly cardId: string;
  readonly scriptDataNum1: number;
  readonly scriptDataNum2: number;
}

export interface PlayerBoard {
  readonly playerId: number;
  readonly heroEntityId: number;
  readonly heroCardId: string;
  readonly heroHealth: number;
  readonly tavernTier: number;
  readonly minions: readonly BoardMinion[];
  readonly hand: readonly BoardMinion[];
  readonly heroPowers: readonly HeroPower[];
  readonly trinkets: readonly Trinket[];
  readonly secrets: readonly Secret[];
}

export interface CombatSnapshot {
  readonly turn: number;
  readonly player: PlayerBoard;
  readonly opponent: PlayerBoard;
  readonly firstAttacker: 0 | 1;
  readonly partial: boolean;
}

export type PowerEvent =
  | { readonly type: "game-created" }
  | { readonly type: "combat-started"; readonly snapshot: CombatSnapshot }
  | { readonly type: "combat-ended" }
  | { readonly type: "game-over" };

export type OverlayState =
  | { readonly version: 1; readonly status: "waiting"; readonly message: string }
  | { readonly version: 1; readonly status: "simulating"; readonly turn: number }
  | {
      readonly version: 1;
      readonly status: "ready";
      readonly turn: number;
      readonly win: number;
      readonly tie: number;
      readonly loss: number;
      readonly simulations: number;
      readonly partial: boolean;
    }
  | { readonly version: 1; readonly status: "error"; readonly message: string };
