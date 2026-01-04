import { Model, Player, Cell, Bomb, PowerUp, BotState } from "./model"
import { COLS, ROWS, BOT_CONFIGS, BotConfig, FPS } from "./constants"
import { HashMap as HM, Option} from "effect"

export interface BotIntent {
    dx: number
    dy: number
    plant: boolean
}

export interface BotUpdateResult {
    player: Player
    intent: BotIntent
}

interface Point {
    x: number
    y: number
}

// --- UTILITIES ---
// changes every tile into a single number integer
const getIntKey = (x: number, y: number) => y * COLS + x
// cant walk diagonally, so we use formula  distance: |x1 - x2| + |y1 - y2|.
const getManhattanDist = (x1: number, y1: number, x2: number, y2: number) => Math.abs(x1 - x2) + Math.abs(y1 - y2)
// checker
const isValid = (x: number, y: number) => x >= 0 && x < COLS && y >= 0 && y < ROWS
// is this tile allowed? is it hard or soft, if soft blow it up, or escape
const isWalkable = (grid: readonly (readonly Cell[])[], x: number, y: number, allowSoft: boolean): boolean => {
    if (!isValid(x, y)) return false
    const cell = grid[y][x]
    if (cell._tag === "HardBlock") return false
    if (!allowSoft && cell._tag === "SoftBlock") return false
    return true
};

// ---  (Dijkstra) ---
// credits from from https://ondras.github.io/rot.js/manual/#path hahahaha
const findPath = (
    sx: number, sy: number,
    tx: number, ty: number, 
    grid: readonly (readonly Cell[])[], 
    allowSoft: boolean,
    dangerKeys: Set<number> | null = null
): Point[] | null => {
    if (sx === tx && sy === ty) return []
    
    const startKey = getIntKey(sx, sy)
    const targetKey = getIntKey(tx, ty)

    const dist = new Map<number, number>(); // para syang cost of each tile, starting at 0 up to infiinty
    dist.set(startKey, 0)

    const cameFrom = new Map<number, number>(); // lets say papunta tayo tile B, galing A, we write a map  B -> A

    const queue: Point[] = [{x: sx, y: sy}]
    
    const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}]

    let head = 0
    while (head < queue.length) {
        const current = queue[head++]
        const currentKey = getIntKey(current.x, current.y)
        const currentDist = dist.get(currentKey)!

        if (currentKey === targetKey) {
            const path: Point[] = []
            let currKey = targetKey
            while (currKey !== startKey) { // pag nahit natin ung target
                const px = currKey % COLS
                const py = Math.floor(currKey / COLS)
                path.unshift({x: px, y: py})
                currKey = cameFrom.get(currKey)! // web build hat path
            }
            return path
        }

        for (const d of dirs) {
            const nx = current.x + d.x
            const ny = current.y + d.y
            const nKey = getIntKey(nx, ny)

            if (isWalkable(grid, nx, ny, allowSoft)) {
                // Check danger (bombs/explosions)
                if (dangerKeys && dangerKeys.has(nKey)) continue;

                // Let C be distance of current cell (currentDist)
                // Let S be assigned distance of neighboring cell (neighborDist)
                const neighborDist = dist.has(nKey) ? dist.get(nKey)! : Infinity

                // If C + 1 is less than S
                if (currentDist + 1 < neighborDist) { // is the distance to this neighbor shorter  if i go to this tile?
                    // Update assigned distance of neighboring cell
                    dist.set(nKey, currentDist + 1)
                    cameFrom.set(nKey, currentKey)
                    queue.push({x: nx, y: ny})
                }
            }
        }
    }
    return null // No path found
};

// --- DANGER SENSING ---

const getDangerousCells = (model: Model, bot: Player, config: BotConfig): Set<number> => {
    const danger = new Set<number>()

    // ALWAYS dangerous
    model.explosions.forEach(e => danger.add(getIntKey(e.x, e.y)))

    // 2. Bombs
    if (config.dangerType === "bomb_only") {
        HM.forEach(model.bombs, (b) => {
            danger.add(getIntKey(b.x, b.y))
        });
    } else if (config.dangerType === "future_explosion") {
        HM.forEach(model.bombs, (b) => {
            danger.add(getIntKey(b.x, b.y))
            const dirs = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}]
            for (const d of dirs) {
                for (let i = 1; i <= b.range; i++) {
                    const tx = b.x + (d.dx * i)
                    const ty = b.y + (d.dy * i)
                    
                    if (!isValid(tx, ty)) break;
                    if (model.grid[ty][tx]._tag === "HardBlock") break
                    
                    danger.add(getIntKey(tx, ty))
                    
                    if (model.grid[ty][tx]._tag === "SoftBlock") break
                }
            }
        })
    }

    return danger
};

const isInDanger = (bx: number, by: number, dangerCells: Set<number>, dist: number): boolean => {
    for (let dy = -dist; dy <= dist; dy++) { // check up check down
        for (let dx = -dist; dx <= dist; dx++) { // check left check right
            if (Math.abs(dx) + Math.abs(dy) <= dist) {
                const tx = bx + dx
                const ty = by + dy
                if (isValid(tx, ty) && dangerCells.has(getIntKey(tx, ty))) {
                    return true // scan around if dangerous then true 
                }
            }
        }
    }
    return false
}

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

    // 1. ESCAPE 
    if (isInDanger(bx, by, dangerCells, config.dangerDist)) {
        nextBot.botState = "escape"
        
        // Find safe reachable cell
        const safeCandidates: Point[] = []

        //  Dijkstra ulit copy pastae
        const dist = new Map<number, number>()
        dist.set(getIntKey(bx, by), 0)

        const queue: Point[] = [{x: bx, y: by}]
        if (!dangerCells.has(getIntKey(bx, by))) safeCandidates.push({x: bx, y: by})

        const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}]
        let head = 0
        
        while (head < queue.length){ 
            const curr = queue[head++]
            const currentKey = getIntKey(curr.x, curr.y)
            const currentDist = dist.get(currentKey)!

            for (const d of dirs) {
                const nx = curr.x + d.x
                const ny = curr.y + d.y
                const nKey = getIntKey(nx, ny)
                
                if (isWalkable(model.grid, nx, ny, false)) {
                     const neighborDist = dist.has(nKey) ? dist.get(nKey)! : Infinity
                     
                     if (currentDist + 1 < neighborDist) {
                        dist.set(nKey, currentDist + 1)
                        queue.push({x: nx, y: ny})
                        
                        if (!dangerCells.has(nKey)) {
                            safeCandidates.push({x: nx, y: ny})
                        }
                     }
                }
            }
        }

        if (safeCandidates.length > 0) {
            const target = safeCandidates[Math.floor(Math.random() * safeCandidates.length)]
            nextBot.botGoalX = target.x
            nextBot.botGoalY = target.y
            nextBot.botPath = findPath(bx, by, target.x, target.y, model.grid, false, unsafeCells) || []
        } else {
            nextBot.botState = "wander" // Trapped
        }
        return nextBot
    }

    // 2. ATTACK 
    let targetId: string | null = null
    let targetDest: Point | null = null
    const enemies: Player[] = []
        for (let i = 0; i < model.players.length; i++) {
            const p = model.players[i]
            if (p.id !== bot.id && p.isAlive) {
                enemies.push(p)
            }
        }
    if (config.attackPolicy === 1) {
        // Policy 1
        
        let minLen = Infinity

        for (const enemy of enemies) {
            const ex = Math.floor(enemy.xCoordinate)
            const ey = Math.floor(enemy.yCoordinate)
            if (getManhattanDist(bx, by, ex, ey) <= config.attackReachDist) {
                const path = findPath(bx, by, ex, ey, model.grid, false, unsafeCells)
                if (path && path.length < minLen) {
                    minLen = path.length
                    targetId = enemy.id
                    targetDest = {x: ex, y: ey}
                }
            }
        }
    } else {
        // Policy 2: randomizer
        if (enemies.length > 0) {
            const randomizer = Math.floor(Math.random() * enemies.length)
            const enemy = enemies[randomizer]
            targetId = enemy.id
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

    // 3. POWERUP
    if (Math.random() * 100 < config.powerupChance) {
        let bestPu: Point | null = null;

        if (config.powerupPolicy === 1) {
            // jakstra
            const dist = new Map<number, number>();
            dist.set(getIntKey(bx, by), 0);
            
            const queue: Point[] = [{x: bx, y: by}];
            const dirs = [{x:0, y:-1}, {x:0, y:1}, {x:-1, y:0}, {x:1, y:0}];
            let head = 0;
            
            while(head < queue.length) {
                const curr = queue[head++];
                const currentKey = getIntKey(curr.x, curr.y);
                const currentDist = dist.get(currentKey)!;

                if (HM.has(model.powerups, currentKey)) {
                    bestPu = curr;
                    break;
                }

                for (const d of dirs) {
                    const nx = curr.x + d.x;
                    const ny = curr.y + d.y;
                    const nKey = getIntKey(nx, ny);
                    
                    if (isWalkable(model.grid, nx, ny, true)) { 
                        if (unsafeCells.has(nKey)) continue;
                        
                        const neighborDist = dist.has(nKey) ? dist.get(nKey)! : Infinity;
                        
                        if (currentDist + 1 < neighborDist) {
                             dist.set(nKey, currentDist + 1);
                             queue.push({x: nx, y: ny});
                        }
                    }
                }
            }
        } else {
            const candidates: Point[] = [];
            HM.forEach(model.powerups, (pu) => {
                if (getManhattanDist(bx, by, pu.x, pu.y) <= 4) {
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
            const allowSoft = config.powerupPolicy === 1; // we break blocks for powerups
            nextBot.botPath = findPath(bx, by, bestPu.x, bestPu.y, model.grid, allowSoft, unsafeCells) || [];
            return nextBot;
        }
    }

    // 4. WANDER
    nextBot.botState = "wander"; // wala lang, maglakad ka
    return nextBot;
};


// --- MAIN UPDATE FUNCTION ---

export const updateBot = (bot: Player, model: Model, events: { bombPlanted: boolean, explosionEnded: boolean }): BotUpdateResult => {
    let nextBot = { ...bot };
    const intent: BotIntent = { dx: 0, dy: 0, plant: false };
    
    // Config
    const config = BOT_CONFIGS[bot.botType] || BOT_CONFIGS["hostile"];
    const bx = Math.floor(bot.xCoordinate);
    const by = Math.floor(bot.yCoordinate);

    // Unsafe Cells
    const unsafeCells = new Set<number>();
    HM.forEach(model.bombs, (b) => {
        unsafeCells.add(getIntKey(b.x, b.y));
    });
    model.explosions.forEach(e => {
        unsafeCells.add(getIntKey(e.x, e.y));
    });

    // 1. REEVALUATION // run djikastra only when
    nextBot.botTicksSinceThink += 1;
    const secondsSinceThink = nextBot.botTicksSinceThink / FPS;
    const timerTrigger = secondsSinceThink >= config.reevalInterval && (Math.random() * 100 < config.reevalChance); //wait for time
    const eventTrigger = events.bombPlanted || events.explosionEnded; // wait for event like bombs

    if (timerTrigger || eventTrigger) {
        nextBot.botTicksSinceThink = 0;
        const dangerCells = getDangerousCells(model, bot, config);
        nextBot = reevaluate(nextBot, bx, by, model, config, dangerCells, unsafeCells);
    }

    // 2. STATE 
    const state = nextBot.botState;

    if (state === "wander") {
        const distToGoal = getManhattanDist(bx, by, nextBot.botGoalX, nextBot.botGoalY);
        if (distToGoal === 0 || nextBot.botPath.length === 0) {
            let found = false;
            let attempts = 0;
            while (!found && attempts < 20) {
                const rx = Math.floor(Math.random() * COLS);
                const ry = Math.floor(Math.random() * ROWS);
                if (model.grid[ry][rx]._tag !== "HardBlock" && !unsafeCells.has(getIntKey(rx, ry))) {
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
        if (config.attackPolicy === 2) {
            const target = model.players.find(p => p.id === nextBot.botAttackTargetId);
            if (target && target.isAlive) {
                const tx = Math.floor(target.xCoordinate);
                const ty = Math.floor(target.yCoordinate);
                if (tx !== nextBot.botGoalX || ty !== nextBot.botGoalY || nextBot.botPath.length === 0) {
                    nextBot.botGoalX = tx;
                    nextBot.botGoalY = ty;
                    nextBot.botPath = findPath(bx, by, tx, ty, model.grid, true, unsafeCells) || [];
                }
            } else {
                nextBot.botState = "wander";
            }
        } else {
            if (nextBot.botPath.length === 0) {
                nextBot.botState = "wander";
            }
        }
    }
    else if (state === "escape" || state === "getPowerup") {
        if (bx === nextBot.botGoalX && by === nextBot.botGoalY) {
            nextBot.botState = "wander";
        }
    }

    // 3. MOVEMENT 
    if (nextBot.botPath.length > 0) {
        const nextStep = nextBot.botPath[0];
        if (nextStep.x === bx && nextStep.y === by) {
            nextBot.botPath = nextBot.botPath.slice(1);
            if (nextBot.botPath.length > 0) {
                 const step = nextBot.botPath[0];
                 const cell = model.grid[step.y][step.x];
                 if (cell._tag === "SoftBlock") {
                     if (!unsafeCells.has(getIntKey(bx, by))) intent.plant = true;
                     intent.dx = 0; 
                     intent.dy = 0;
                 } else {
                     intent.dx = step.x - bx;
                     intent.dy = step.y - by;
                 }
            }
        } else {
             const cell = model.grid[nextStep.y][nextStep.x];
             if (cell._tag === "SoftBlock") { // pag nastuck ako sa softblock, stop moving, plant a fkung bomb
                 if (!unsafeCells.has(getIntKey(bx, by))) intent.plant = true
                 intent.dx = 0; 
                 intent.dy = 0;
             } else {
                 intent.dx = nextStep.x - bx;
                 intent.dy = nextStep.y - by;
             }
        }
    }

    // 4. BETTER KILLING? (Phase 4 Logic)
    if (!unsafeCells.has(getIntKey(bx, by))) {
        let closestDist = Infinity;
        model.players.forEach(p => {
            if (p.id !== bot.id && p.isAlive) {
                const dist = getManhattanDist(bx, by, Math.floor(p.xCoordinate), Math.floor(p.yCoordinate));
                if (dist < closestDist) closestDist = dist;
            }
        });

        const isAggressive = nextBot.botState === "attack";
        const isCrowded = closestDist <= 2; 

        if ((isAggressive && closestDist <= 2) || isCrowded) {
            intent.plant = true;
        }
    }

    return { player: nextBot, intent };
};