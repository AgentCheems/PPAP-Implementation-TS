

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
export const PLAYER_RADIUS = 0.35; // In grid units
export const PLAYER_SPEED = 0.15; // Grid cells per tick

// Phase 3/4: Player positions
export const PLAYER_START_POSITIONS = {
  P1: { x: 1.5, y: 1.5 },         // Top-left
  P2: { x: COLS - 1.5, y: 1.5 },   // Top-right
  P3: { x: 1.5, y: ROWS - 1.5 },   // Bottom-left
  P4: { x: COLS - 1.5, y: ROWS - 1.5 } // Bottom-right
};

export interface BotConfig {
  // Reevaluation
  reevalInterval: number; // t seconds
  reevalChance: number; // p percent

  // Danger
  dangerDist: number; // D
  dangerType: "bomb_only" | "future_explosion"; // Hostile vs Others

  // Planting
  plantRange: number; // R (Plant if enemy within R)
  // Used for "Within X cells" checks in descriptions, effectively same as R usually, but keeping separate if logic differs. 
  // PDF says "Attempts to plant bombs if target player is within X cells". 
  // We will use 'plantRange' for the specific R value mentioned in ATTACK state "Regardless of policy".
  // And 'engageDist' for the "Attempts to plant bombs if within X cells" in Config description.
  engageDist: number; 
  
  // Policies
  attackPolicy: 1 | 2;
  attackReachDist: number; // A (Policy 1)
  
  powerupPolicy: 1 | 2;
  powerupChance: number; // % chance to check powerups
}

export const BOT_CONFIGS: Record<string, BotConfig> = {
  hostile: { 
    reevalInterval: 0.5, 
    reevalChance: 25, 
    dangerDist: 0,
    dangerType: "bomb_only",
    engageDist: 2, 
    plantRange: 2, // From "within R cells"
    attackPolicy: 2,
    attackReachDist: 0, // N/A for Policy 2
    powerupPolicy: 2,
    powerupChance: 20
  },
  careful: { 
    reevalInterval: 0.25, 
    reevalChance: 100, 
    dangerDist: 4,
    dangerType: "future_explosion",
    engageDist: 4,
    plantRange: 4,
    attackPolicy: 1,
    attackReachDist: 3, // Reachable within 3 cells
    powerupPolicy: 2,
    powerupChance: 100
  },
  greedy: { 
    reevalInterval: 1.0, 
    reevalChance: 100, 
    dangerDist: 2,
    dangerType: "future_explosion",
    engageDist: 3,
    plantRange: 3,
    attackPolicy: 1,
    attackReachDist: 6,
    powerupPolicy: 1,
    powerupChance: 100
  },
  extreme: { 
    reevalInterval: 0.1, 
    reevalChance: 10, 
    dangerDist: 10,
    dangerType: "future_explosion",
    engageDist: 10,
    plantRange: 10,
    attackPolicy: 2,
    attackReachDist: 10,
    powerupPolicy: 1,
    powerupChance: 100
  }
};

export const COLORS = {
    BG: "#228822",
    HARD_BLOCK: "#333333",
    SOFT_BLOCK: "#D2691E",
    BOMB: "black",
    EXPLOSION: "#FFD700"
};