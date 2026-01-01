import { Model, Player, Cell, Bomb, PowerUp, BotState } from "./model";
import { COLS, ROWS, BOT_CONFIGS, BotConfig, FPS } from "./constants";
import { HashMap as HM, Option } from "effect";

export interface BotIntent {
    dx: number;
    dy: number;
    plant: boolean;
}

export interface BotUpdateResult {
    player: Player;
    intent: BotIntent;
}

interface Point {
    x: number;
    y: number;
}

// --- UTILITIES ---

const getIntKey = (x: number, y: number) => y * COLS + x;

const getManhattanDist = (x1: number, y1: number, x2: number, y2: number) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

const isValid = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS;

const isWalkable = (grid: readonly (readonly Cell[])[], x: number, y: number, allowSoft: boolean): boolean => {
    if (!isValid(x, y)) return false;
    const cell = grid[y][x];
    if (cell._tag === "HardBlock") return false;
    if (!allowSoft && cell._tag === "SoftBlock") return false;
    return true;
};

// --- PATHFINDING (BFS) ---

/**
 * Computes shortest path from (sx, sy) to (tx, ty).
 * @param allowSoft If true, path can go through SoftBlocks (Wander/Attack). If false, strict reachable path (Escape/Powerup).
 * @param dangerKeys Set of integer keys representing dangerous cells to avoid (Bombs, Explosions).
 */
const findPath = (
    sx: number, sy: number, 
    tx: number, ty: number, 
    grid: readonly (readonly Cell[])[], 
    allowSoft: boolean,
    dangerKeys: Set<number> | null = null
): Point[] | null => {
    if (sx === tx && sy === ty) return [];
    
    // Queue for BFS: [Current Point]
    const queue: Point[] = [{x: sx, y: sy}];
    // Map to reconstruct path: Child Key -> Parent Key
    const cameFrom = new Map<number, number>();
    const visited = new Set<number>();
    
    const startKey = getIntKey(sx, sy);
    visited.add(startKey);

    // Neighbor order: Up, Down, Left, Right (Tie-breaking handled by order)
    const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];

    let head = 0;
    while (head < queue.length) {
        const current = queue[head++];
        
        // Target Found?
        if (current.x === tx && current.y === ty) {
            const path: Point[] = [];
            let currKey = getIntKey(tx, ty);
            while (currKey !== startKey) {
                const px = currKey % COLS;
                const py = Math.floor(currKey / COLS);
                path.unshift({x: px, y: py});
                currKey = cameFrom.get(currKey)!;
            }
            return path;
        }

        // Explore Neighbors
        for (const d of dirs) {
            const nx = current.x + d.x;
            const ny = current.y + d.y;
            const nKey = getIntKey(nx, ny);

            if (!visited.has(nKey)) {
                // Check walkability
                if (isWalkable(grid, nx, ny, allowSoft)) {
                    // Check danger/blockers
                    if (dangerKeys && dangerKeys.has(nKey)) continue;

                    visited.add(nKey);
                    cameFrom.set(nKey, getIntKey(current.x, current.y));
                    queue.push({x: nx, y: ny});
                }
            }
        }
    }
    return null; // No path found
};

// --- DANGER SENSING ---

const getDangerousCells = (model: Model, bot: Player, config: BotConfig): Set<number> => {
    const danger = new Set<number>();

    // 1. Existing Explosions are ALWAYS dangerous
    model.explosions.forEach(e => danger.add(getIntKey(e.x, e.y)));

    // 2. Bombs
    if (config.dangerType === "bomb_only") {
        // Hostile: Only cells with bombs are dangerous
        HM.forEach(model.bombs, (b) => {
            danger.add(getIntKey(b.x, b.y));
        });
    } else {
        // Careful/Greedy/Extreme: Cells with bombs OR cells that will be caught in explosion
        HM.forEach(model.bombs, (b) => {
            danger.add(getIntKey(b.x, b.y));
            
            const dirs = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}];
            for (const d of dirs) {
                for (let i = 1; i <= b.range; i++) {
                    const tx = b.x + (d.dx * i);
                    const ty = b.y + (d.dy * i);
                    
                    if (!isValid(tx, ty)) break;
                    if (model.grid[ty][tx]._tag === "HardBlock") break;
                    
                    danger.add(getIntKey(tx, ty));
                    
                    if (model.grid[ty][tx]._tag === "SoftBlock") break; 
                }
            }
        });
    }

    return danger;
};

const isInDanger = (bx: number, by: number, dangerCells: Set<number>, dist: number): boolean => {
    // A bot considers itself to be in danger if there is ANY cell within distance D that is dangerous.
    for (let dy = -dist; dy <= dist; dy++) {
        for (let dx = -dist; dx <= dist; dx++) {
            if (Math.abs(dx) + Math.abs(dy) <= dist) {
                const tx = bx + dx;
                const ty = by + dy;
                if (isValid(tx, ty) && dangerCells.has(getIntKey(tx, ty))) {
                    return true;
                }
            }
        }
    }
    return false;
};

// --- REEVALUATION LOGIC ---

const reevaluate = (
    bot: Player, 
    bx: number, by: number, 
    model: Model, 
    config: BotConfig, 
    dangerCells: Set<number>,
    unsafeCells: Set<number>
): Player => {
    const nextBot = { ...bot };

    // 1. DANGER -> ESCAPE (Highest Priority)
    if (isInDanger(bx, by, dangerCells, config.dangerDist)) {
        nextBot.botState = "escape";
        
        // Choose random goal cell that is REACHABLE (no soft blocks) and NOT DANGEROUS
        const safeCandidates: Point[] = [];
        const queue: Point[] = [{x: bx, y: by}];
        const visited = new Set<number>([getIntKey(bx, by)]);
        // If current cell is safe, it's a candidate
        if (!dangerCells.has(getIntKey(bx, by))) safeCandidates.push({x: bx, y: by});

        const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
        
        let head = 0;
        // Limit search to reasonable area to avoid full grid scan lag
        while (head < queue.length && head < 100) {
            const curr = queue[head++];
            for (const d of dirs) {
                const nx = curr.x + d.x;
                const ny = curr.y + d.y;
                const k = getIntKey(nx, ny);
                if (!visited.has(k) && isWalkable(model.grid, nx, ny, false)) {
                    visited.add(k);
                    queue.push({x: nx, y: ny});
                    // Safe means NOT in dangerCells
                    // Note: unsafeCells are typically subset of dangerCells, so if we avoid dangerCells we avoid bombs/explosions
                    if (!dangerCells.has(k)) {
                        safeCandidates.push({x: nx, y: ny});
                    }
                }
            }
        }

        if (safeCandidates.length > 0) {
            const target = safeCandidates[Math.floor(Math.random() * safeCandidates.length)];
            nextBot.botGoalX = target.x;
            nextBot.botGoalY = target.y;
            
            // FIX: Use immediate danger (active bombs + explosions) as blocking obstacles.
            // This allows the bot to pathfind *out* of a danger zone if it is currently inside one.
            nextBot.botPath = findPath(bx, by, target.x, target.y, model.grid, false, unsafeCells) || [];
        } else {
            // Trapped
            nextBot.botState = "wander";
        }
        return nextBot;
    }

    // 2. ATTACK -> ATTACK (Priority upgraded from 3rd to 2nd)
    // Kill the enemy before getting powerups if safe to do so.
    let targetId: string | null = null;
    let targetDest: Point | null = null;

    if (config.attackPolicy === 1) {
        // Policy 1: Reachable player within A cells. Closest.
        const enemies = model.players.filter(p => p.id !== bot.id && p.isAlive);
        let minLen = Infinity;

        for (const enemy of enemies) {
            const ex = Math.floor(enemy.xCoordinate);
            const ey = Math.floor(enemy.yCoordinate);
            if (getManhattanDist(bx, by, ex, ey) <= config.attackReachDist) {
                // Check reachability (allowSoft = false). Avoid Unsafe Cells.
                const path = findPath(bx, by, ex, ey, model.grid, false, unsafeCells);
                if (path && path.length < minLen) {
                    minLen = path.length;
                    targetId = enemy.id;
                    targetDest = {x: ex, y: ey};
                }
            }
        }
    } else {
        // Policy 2: Random player.
        const enemies = model.players.filter(p => p.id !== bot.id && p.isAlive);
        if (enemies.length > 0) {
            const enemy = enemies[Math.floor(Math.random() * enemies.length)];
            targetId = enemy.id;
            targetDest = {x: Math.floor(enemy.xCoordinate), y: Math.floor(enemy.yCoordinate)};
        }
    }

    if (targetId && targetDest) {
        nextBot.botState = "attack";
        nextBot.botAttackTargetId = targetId;
        nextBot.botGoalX = targetDest.x;
        nextBot.botGoalY = targetDest.y;
        const allowSoft = config.attackPolicy === 2;
        nextBot.botPath = findPath(bx, by, targetDest.x, targetDest.y, model.grid, allowSoft, unsafeCells) || [];
        return nextBot;
    }

    // 3. POWERUP -> GET_POWERUP (Priority downgraded from 2nd to 3rd)
    if (Math.random() * 100 < config.powerupChance) {
        let bestPu: Point | null = null;

        if (config.powerupPolicy === 1) {
            // Policy 1: Closest Powerup (BFS flood)
            const queue: Point[] = [{x: bx, y: by}];
            const visited = new Set<number>([getIntKey(bx, by)]);
            const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
            let head = 0;
            while(head < queue.length) {
                const curr = queue[head++];
                if (HM.has(model.powerups, getIntKey(curr.x, curr.y))) {
                    bestPu = curr;
                    break;
                }
                for (const d of dirs) {
                    const nx = curr.x + d.x;
                    const ny = curr.y + d.y;
                    const k = getIntKey(nx, ny);
                    // Policy 1: allowSoft=true. Avoid Unsafe Cells.
                    if (!visited.has(k) && isWalkable(model.grid, nx, ny, true)) { 
                        if (unsafeCells.has(k)) continue;
                        visited.add(k);
                        queue.push({x: nx, y: ny});
                    }
                }
            }
        } else {
            // Policy 2: Random Reachable within 4 cells
            const candidates: Point[] = [];
            HM.forEach(model.powerups, (pu) => {
                if (getManhattanDist(bx, by, pu.x, pu.y) <= 4) {
                    // Must be REACHABLE (allowSoft = false). Avoid Unsafe Cells.
                    const path = findPath(bx, by, pu.x, pu.y, model.grid, false, unsafeCells);
                    if (path) candidates.push({x: pu.x, y: pu.y});
                }
            });
            if (candidates.length > 0) {
                bestPu = candidates[Math.floor(Math.random() * candidates.length)];
            }
        }

        if (bestPu) {
            nextBot.botState = "getPowerup";
            nextBot.botGoalX = bestPu.x;
            nextBot.botGoalY = bestPu.y;
            const allowSoft = config.powerupPolicy === 1;
            nextBot.botPath = findPath(bx, by, bestPu.x, bestPu.y, model.grid, allowSoft, unsafeCells) || [];
            return nextBot;
        }
    }

    // 4. WANDER
    nextBot.botState = "wander";
    return nextBot;
};


// --- MAIN UPDATE FUNCTION ---

export const updateBot = (bot: Player, model: Model, events: { bombPlanted: boolean, explosionEnded: boolean }): BotUpdateResult => {
    let nextBot = { ...bot };
    const intent: BotIntent = { dx: 0, dy: 0, plant: false };
    
    // Config
    const config = BOT_CONFIGS[bot.botType] || BOT_CONFIGS["hostile"];
    
    // IMPORTANT: Use floor to match physics engine's tile logic.
    const bx = Math.floor(bot.xCoordinate);
    const by = Math.floor(bot.yCoordinate);

    // Prepare Unsafe Cells (Bombs + Explosions) for Pathfinding/Safety
    const unsafeCells = new Set<number>();
    HM.forEach(model.bombs, (b) => {
        unsafeCells.add(getIntKey(b.x, b.y));
    });
    model.explosions.forEach(e => {
        unsafeCells.add(getIntKey(e.x, e.y));
    });

    // 1. REEVALUATION CHECK
    nextBot.botTicksSinceThink += 1;
    const secondsSinceThink = nextBot.botTicksSinceThink / FPS;
    
    const timerTrigger = secondsSinceThink >= config.reevalInterval && (Math.random() * 100 < config.reevalChance);
    const eventTrigger = events.bombPlanted || events.explosionEnded;

    if (timerTrigger || eventTrigger) {
        nextBot.botTicksSinceThink = 0;
        const dangerCells = getDangerousCells(model, bot, config);
        nextBot = reevaluate(nextBot, bx, by, model, config, dangerCells, unsafeCells);
    }

    // 2. STATE EXECUTION
    const state = nextBot.botState;

    if (state === "wander") {
        const distToGoal = getManhattanDist(bx, by, nextBot.botGoalX, nextBot.botGoalY);
        // If arrived or no path, pick new random goal
        if (distToGoal === 0 || nextBot.botPath.length === 0) {
            let found = false;
            let attempts = 0;
            while (!found && attempts < 20) {
                const rx = Math.floor(Math.random() * COLS);
                const ry = Math.floor(Math.random() * ROWS);
                // Valid goal: Not HardBlock, Not Unsafe
                if (model.grid[ry][rx]._tag !== "HardBlock" && !unsafeCells.has(getIntKey(rx, ry))) {
                    // Wander allows soft blocks. Avoid Unsafe Cells.
                    const path = findPath(bx, by, rx, ry, model.grid, true, unsafeCells); 
                    if (path && path.length > 0) {
                        nextBot.botGoalX = rx;
                        nextBot.botGoalY = ry;
                        nextBot.botPath = path;
                        found = true;
                    }
                }
                attempts++;
            }
        }
    }
    else if (state === "attack") {
        // Update target position if using Policy 2 (Chase)
        if (config.attackPolicy === 2) {
            const target = model.players.find(p => p.id === nextBot.botAttackTargetId);
            if (target && target.isAlive) {
                const tx = Math.floor(target.xCoordinate);
                const ty = Math.floor(target.yCoordinate);
                if (tx !== nextBot.botGoalX || ty !== nextBot.botGoalY || nextBot.botPath.length === 0) {
                    nextBot.botGoalX = tx;
                    nextBot.botGoalY = ty;
                    // Chase: Allow soft blocks. Avoid Unsafe Cells.
                    nextBot.botPath = findPath(bx, by, tx, ty, model.grid, true, unsafeCells) || [];
                }
            } else {
                nextBot.botState = "wander"; // Target dead/gone
            }
        } else {
            // Policy 1 (Careful/Greedy): Static path to last known location.
            // If path ends (reached destination), revert to wander so we don't freeze.
            if (nextBot.botPath.length === 0) {
                nextBot.botState = "wander";
            }
        }
    }
    else if (state === "escape") {
        if (bx === nextBot.botGoalX && by === nextBot.botGoalY) {
            nextBot.botState = "wander";
        }
    }
    else if (state === "getPowerup") {
         if (bx === nextBot.botGoalX && by === nextBot.botGoalY) {
            nextBot.botState = "wander";
        }
    }

    // 3. MOVEMENT EXECUTION
    if (nextBot.botPath.length > 0) {
        const nextStep = nextBot.botPath[0];

        // If we are at the next step, remove it from path
        if (nextStep.x === bx && nextStep.y === by) {
            // Immutable removal
            nextBot.botPath = nextBot.botPath.slice(1);
            
            // Proceed to next
            if (nextBot.botPath.length > 0) {
                 const step = nextBot.botPath[0];
                 const cell = model.grid[step.y][step.x];
                 
                 // PHASING FIX
                 if (cell._tag === "SoftBlock") {
                     // Blocked by SoftBlock, wait for plant/explode
                     if (!unsafeCells.has(getIntKey(bx, by))) intent.plant = true;
                     intent.dx = 0; 
                     intent.dy = 0;
                 } else {
                     intent.dx = step.x - bx;
                     intent.dy = step.y - by;
                 }
            }
        } else {
            // Move towards nextStep
             const cell = model.grid[nextStep.y][nextStep.x];
             if (cell._tag === "SoftBlock") {
                 // Blocked, must plant
                 if (!unsafeCells.has(getIntKey(bx, by))) intent.plant = true;
                 
                 intent.dx = 0; 
                 intent.dy = 0;
             } else {
                 intent.dx = nextStep.x - bx;
                 intent.dy = nextStep.y - by;
             }
        }
    }

    // 4. OFFENSIVE PLANTING LOGIC (Killer Instinct)
    // If not in danger, check if we should be aggressive
    if (!unsafeCells.has(getIntKey(bx, by))) {
        
        let closestDist = Infinity;
        model.players.forEach(p => {
            if (p.id !== bot.id && p.isAlive) {
                const dist = getManhattanDist(bx, by, Math.floor(p.xCoordinate), Math.floor(p.yCoordinate));
                if (dist < closestDist) closestDist = dist;
            }
        });

        const isAggressive = nextBot.botState === "attack";
        const isCrowded = closestDist <= 2; // Enemy is right next to us

        // If we are chasing (attack) and close enough, OR just crowded
        if ((isAggressive && closestDist <= config.plantRange) || isCrowded) {
            intent.plant = true;
        }
    }

    return { player: nextBot, intent };
};