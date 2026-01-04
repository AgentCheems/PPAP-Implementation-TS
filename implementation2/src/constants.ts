import { Schema as S, HashMap as HM, Array as A } from "effect";

export const TILE_SIZE = 40;
export const ROWS = 13;
export const COLS = 15;
export const FPS = 30;

// Game Rules
export const BOMB_TIMER_SECONDS = 3;
export const EXPLOSION_DURATION_SECONDS = 1;
export const GAME_DURATION_SECONDS = 120;
export const EXPLOSION_RANGE = 1;

// Entities
export const PLAYER_RADIUS = 0.35; 
export const PLAYER_SPEED = 0.15;
export const PLAYER_DYING_TIME_SECONDS = 3;

// Phase 3/4: Player positions
export const PLAYER_START_POSITIONS = {
  P1: { x: 1.5, y: 1.5 },         
  P2: { x: COLS - 1.5, y: 1.5 },  
  P3: { x: 1.5, y: ROWS - 1.5 }, 
  P4: { x: COLS - 1.5, y: ROWS - 1.5 }
};

export type BotConfig = typeof BotConfig.Type
export const BotConfig = S.Struct({
  // Reevaluation
  reevalInterval: S.Number, // t seconds
  reevalChance: S.Number, // p percent

  // Danger
  dangerDist: S.Number, // D
  dangerType: S.Union(S.Literal("bomb_only"), S.Literal("future_explosion")), // Hostile vs Others

  // Planting
  plantRange: S.Number, // R (Plant if enemy within R)
  
  // Policies
  attackPolicy: S.Union(S.Literal(1), S.Literal(2)),
  attackReachDist: S.Number, // A (Policy 1)
  
  powerupPolicy: S.Union(S.Literal(1), S.Literal(2)),
  powerupChance: S.Number // % chance to check powerups
})

export const careful = BotConfig.make({
  reevalInterval: 0.25,
  reevalChance: 100,
  dangerDist: 4,
  dangerType: "future_explosion",
  plantRange: 4,
  attackPolicy: 1,
  attackReachDist: 3,
  powerupPolicy: 2,
  powerupChance: 100,
})

export const hostile = BotConfig.make({ 
  reevalInterval: 0.5, reevalChance: 25, 
  dangerDist: 0, dangerType: "bomb_only",
  plantRange: 2, 
  attackPolicy: 2, attackReachDist: 0, 
  powerupPolicy: 2, powerupChance: 20
})

export const greedy = BotConfig.make({ 
  reevalInterval: 1.0, reevalChance: 100, 
  dangerDist: 2, dangerType: "future_explosion",
  plantRange: 3,
  attackPolicy: 1, attackReachDist: 6,
  powerupPolicy: 1, powerupChance: 100
})

export const BOT_CONFIGS: Record<string, BotConfig> = {
  hostile,
  careful,
  greedy
};

