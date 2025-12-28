export const TILE_SIZE = 40;
export const ROWS = 13;
export const COLS = 15;
export const FPS = 30;

// Game Rules
export const BOMB_TIMER_SECONDS = 3;
export const EXPLOSION_DURATION_SECONDS = 1;
export const GAME_DURATION_SECONDS = 60;
export const EXPLOSION_RANGE = 1;

// Entities
export const PLAYER_RADIUS = 0.35; // In grid units (0.5 is full half-width)
export const PLAYER_SPEED = 0.15; // Grid cells per second

// Phase 3: Player positions
export const PLAYER_START_POSITIONS = {
  P1: { x: 1.5, y: 1.5 },         // Top-left
  P2: { x: COLS - 1.5, y: 1.5 },   // Top-right (changed from bottom-right)
  P3: { x: 1.5, y: ROWS - 1.5 },   // Bottom-left
  P4: { x: COLS - 1.5, y: ROWS - 1.5 } // Bottom-right (for future phases)
};