
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
  reevalInterval: number; // Seconds
  reevalChance: number; // 0-1
  plantDist: number; // Cells
  dangerDist: number; // Cells (0 = current only)
}

export const BOT_CONFIGS: Record<string, BotConfig> = {
  hostile: { 
    reevalInterval: 0.5, 
    reevalChance: 0.25, 
    plantDist: 2, 
    dangerDist: 0
  },
  careful: { 
    reevalInterval: 0.25, 
    reevalChance: 1.0, 
    plantDist: 4, 
    dangerDist: 4
  },
  greedy: { 
    reevalInterval: 1.0, 
    reevalChance: 1.0, 
    plantDist: 3, 
    dangerDist: 2
  },
  extreme: { 
    reevalInterval: 0.1, 
    reevalChance: 0.1, 
    plantDist: 10, 
    dangerDist: 10
  }
};

export const COLORS = {
    BG: "#228822",
    HARD_BLOCK: "#333333",
    SOFT_BLOCK: "#D2691E",
    BOMB: "black",
    EXPLOSION: "#FFD700"
};
