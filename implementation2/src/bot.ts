import { Model, Player, Cell, Bomb, GameStatus, BotState, PowerUp, PowerupType } from "./model";
import { ROWS, COLS, FPS, PLAYER_SPEED, BOT_CONFIGS } from "./constants";
import { HashMap as HM } from "effect";

// Helper interface for simple points
interface Point {
    x: number;
    y: number;
}

// ------------------------------------------------------------------
// HELPERS (Math & Grid)
// ------------------------------------------------------------------

// Calculate Manhattan Distance: |x1 - x2| + [cite_start]|y1 - y2| [cite: 163]
const getDistance = (x1: number, y1: number, x2: number, y2: number): number => {
    return Math.abs(x1 - x2) + Math.abs(y1 - y2);
};

// Check if a coordinate is inside the grid
const isValid = (x: number, y: number): boolean => {
    return x >= 0 && x < COLS && y >= 0 && y < ROWS;
};

// Convert x,y to a single number for Map keys (y * Width + x)
const getKey = (x: number, y: number): number => {
    return y * COLS + x;
};

// ------------------------------------------------------------------
// PATHFINDING (The Algorithm from Phase 3) [cite: 177-195]
// ------------------------------------------------------------------

// This finds the shortest path from start to goal.
// If 'avoidSoftBlocks' is true, we treat SoftBlocks as walls (used for "Reachable" checks).
const findShortestPath = (
    startX: number, 
    startY: number, 
    goalX: number, 
    goalY: number, 
    model: Model,
    avoidSoftBlocks: boolean
): Point[] => {

    // 1. If goal is invalid or a HardBlock, we can't go there.
    if (!isValid(goalX, goalY)) return [];
    
    // Check goal cell type
    const goalCell = model.grid[goalY][goalX];
    if (goalCell._tag === "HardBlock") return []; 
    // If we must avoid soft blocks, and goal is soft block, return empty
    if (avoidSoftBlocks && goalCell._tag === "SoftBlock") return [];

    // 2. Setup for BFS (Breadth-First Search)
    // We use a Queue for cells to visit
    let queue: Point[] = [{ x: startX, y: startY }];
    
    // We need to keep track of where we came from to rebuild the path
    let cameFrom = new Map<number, number>(); // ChildKey -> ParentKey
    
    // Keep track of visited cells so we don't loop
    let visited = new Set<number>();
    visited.add(getKey(startX, startY));

    let found = false;

    // 3. Process the Queue [cite: 182-192]
    while (queue.length > 0) {
        // Remove the first one (shift)
        let current = queue.shift()!;
        
        // If we reached the goal, stop
        if (current.x === goalX && current.y === goalY) {
            found = true;
            break;
        }

        // Check neighbors (Up, Down, Left, Right)
        const directions = [
            { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, 
            { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
        ];

        for (let i = 0; i < directions.length; i++) {
            let nextX = current.x + directions[i].dx;
            let nextY = current.y + directions[i].dy;
            let nextKey = getKey(nextX, nextY);

            // Check if valid and not visited
            if (isValid(nextX, nextY) && !visited.has(nextKey)) {
                let cell = model.grid[nextY][nextX];
                
                let isWalkable = true;

                // Hard Blocks are always walls
                if (cell._tag === "HardBlock") {
                    isWalkable = false;
                } 
                // Soft Blocks are walls only if we are "avoiding" them (Escape/Attack reachable checks)
                else if (cell._tag === "SoftBlock" && avoidSoftBlocks) {
                    isWalkable = false;
                }

                if (isWalkable) {
                    visited.add(nextKey);
                    cameFrom.set(nextKey, getKey(current.x, current.y));
                    queue.push({ x: nextX, y: nextY });
                }
            }
        }
    }

    // 4. Reconstruct the Path [cite: 193-194]
    if (!found) {
        return [];
    }

    // Backtrack from goal to start
    let path: Point[] = [];
    let currKey = getKey(goalX, goalY);
    let startKey = getKey(startX, startY);

    while (currKey !== startKey) {
        // Decode the key back to x, y
        let y = Math.floor(currKey / COLS);
        let x = currKey % COLS;
        
        // Add to front of array
        path.unshift({ x: x, y: y });

        // Move to parent
        let parent = cameFrom.get(currKey);
        if (parent === undefined) break; // Should not happen if found is true
        currKey = parent;
    }

    return path;
};

// Check if a cell is reachable (no soft blocks in the way) [cite: 234-235]
const isReachable = (startX: number, startY: number, targetX: number, targetY: number, model: Model): boolean => {
    let path = findShortestPath(startX, startY, targetX, targetY, model, true);
    // It's reachable if there is a path OR we are already there
    return path.length > 0 || (startX === targetX && startY === targetY);
};

// ------------------------------------------------------------------
// DANGER SENSING [cite: 217-227]
// ------------------------------------------------------------------

const isCellDangerous = (x: number, y: number, model: Model, bot: Player): boolean => {
    const config = BOT_CONFIGS[bot.botType];
    
    // 1. Cells in an active explosion are ALWAYS dangerous
    for (let i = 0; i < model.explosions.length; i++) {
        if (model.explosions[i].x === x && model.explosions[i].y === y) {
            return true;
        }
    }

    // 2. Check Bombs based on bot personality
    // "Hostile" only fears the bomb cell itself
    if (bot.botType === "hostile") {
        const key = getKey(x, y);
        if (HM.has(model.bombs, key)) return true;
    }
    // "Careful", "Greedy", "Extreme" fear the bomb AND its explosion range
    else {
        // We need to check every bomb to see if (x,y) is in its crossfire
        let isThreatened = false;
        
        // Loop through all bombs in the hashmap
        HM.forEach(model.bombs, (bomb) => {
            if (isThreatened) return; // if already found danger, skip

            // Check horizontal alignment
            if (bomb.y === y) {
                let dist = Math.abs(bomb.x - x);
                if (dist <= bomb.range) isThreatened = true;
            }
            // Check vertical alignment
            if (bomb.x === x) {
                let dist = Math.abs(bomb.y - y);
                if (dist <= bomb.range) isThreatened = true;
            }
        });

        if (isThreatened) return true;
    }

    return false;
};

// Check if the BOT itself is in danger right now
const isBotInDanger = (bot: Player, model: Model): boolean => {
    const config = BOT_CONFIGS[bot.botType];
    const rangeToCheck = config.dangerDist; // D value
    
    let botX = Math.round(bot.xCoordinate);
    let botY = Math.round(bot.yCoordinate);

    // Loop through cells around the bot within distance D
    for (let dy = -rangeToCheck; dy <= rangeToCheck; dy++) {
        for (let dx = -rangeToCheck; dx <= rangeToCheck; dx++) {
            let checkX = botX + dx;
            let checkY = botY + dy;
            
            // Just make sure we are checking valid grid spots
            if (isValid(checkX, checkY)) {
                // If any cell nearby is dangerous, the bot is in danger!
                if (isCellDangerous(checkX, checkY, model, bot)) {
                    return true;
                }
            }
        }
    }
    return false;
};

// ------------------------------------------------------------------
// LOGIC: REEVALUATION (Making Decisions) [cite: 207-211]
// ------------------------------------------------------------------

const reevaluateState = (bot: Player, model: Model): Player => {
    let nextBot = { ...bot };
    let myX = Math.round(bot.xCoordinate);
    let myY = Math.round(bot.yCoordinate);
    
    // 1. AM I IN DANGER? [cite_start]-> ESCAPE [cite: 208]
    if (isBotInDanger(bot, model)) {
        nextBot.botState = "escape";
        // Find a safe spot
        // Try 20 random spots to find one that is safe and reachable
        let bestPath: Point[] = [];
        let foundSafe = false;

        for (let i = 0; i < 20; i++) {
            let randX = Math.floor(Math.random() * COLS);
            let randY = Math.floor(Math.random() * ROWS);
            
            // Must not be dangerous AND must be reachable
            if (!isCellDangerous(randX, randY, model, bot) && isReachable(myX, myY, randX, randY, model)) {
                // Also check if it's not a hard/soft block (just to be sure we can stand there)
                let cell = model.grid[randY][randX];
                if (cell._tag === "Empty") {
                    bestPath = findShortestPath(myX, myY, randX, randY, model, true);
                    foundSafe = true;
                    break;
                }
            }
        }
        
        // If we found a path, set it
        if (foundSafe) {
            nextBot.botPath = bestPath;
        } else {
            // Panic: No safe spot? Just default to wander
            nextBot.botState = "wander";
        }
        return nextBot;
    }

    // 2. SHOULD I GET A POWERUP? [cite_start]-> GET_POWERUP [cite: 209, 241-250]
    // Decide policy based on bot type
    let usePolicy2 = false;
    if (bot.botType === "hostile") usePolicy2 = Math.random() < 0.20; // 20% chance
    if (bot.botType === "careful") usePolicy2 = true; // 100% chance
    if (bot.botType === "greedy") usePolicy2 = false; // Always Policy 1
    
    let targetPowerup: Point | null = null;
    let allPowerups: Point[] = [];
    HM.forEach(model.powerups, (p) => allPowerups.push({ x: p.x, y: p.y }));

    if (allPowerups.length > 0) {
        if (!usePolicy2) {
            // Policy 1: Closest one
            let minLen = 9999;
            for (let i = 0; i < allPowerups.length; i++) {
                let p = allPowerups[i];
                let path = findShortestPath(myX, myY, p.x, p.y, model, false);
                if (path.length > 0 && path.length < minLen) {
                    minLen = path.length;
                    targetPowerup = p;
                }
            }
        } else {
            // Policy 2: Random one within 4 cells & reachable
            let nearby = allPowerups.filter(p => 
                getDistance(myX, myY, p.x, p.y) <= 4 && isReachable(myX, myY, p.x, p.y, model)
            );
            if (nearby.length > 0) {
                targetPowerup = nearby[Math.floor(Math.random() * nearby.length)];
            }
        }
    }

    if (targetPowerup) {
        nextBot.botState = "getPowerup";
        nextBot.botPath = findShortestPath(myX, myY, targetPowerup.x, targetPowerup.y, model, false);
        return nextBot;
    }

    // 3. SHOULD I ATTACK? [cite_start]-> ATTACK [cite: 210, 257-264]
    // Decide policy
    let useAttackPolicy2 = false;
    if (bot.botType === "hostile") useAttackPolicy2 = true; // Policy 2
    if (bot.botType === "careful") useAttackPolicy2 = false; // Policy 1
    if (bot.botType === "greedy") useAttackPolicy2 = false; // Policy 1

    let attackRange = 100; // Unlimited for Hostile usually
    if (bot.botType === "careful") attackRange = 3;
    if (bot.botType === "greedy") attackRange = 6;

    let targetEnemy: Player | null = null;
    let enemies = model.players.filter(p => p.id !== bot.id && p.isAlive);

    if (enemies.length > 0) {
        if (!useAttackPolicy2) {
            // Policy 1: Reachable within Range A
            for (let i = 0; i < enemies.length; i++) {
                let e = enemies[i];
                let ex = Math.round(e.xCoordinate);
                let ey = Math.round(e.yCoordinate);
                
                if (getDistance(myX, myY, ex, ey) <= attackRange) {
                    // Check reachable (no soft blocks)
                    if (isReachable(myX, myY, ex, ey, model)) {
                        targetEnemy = e;
                        break; // Just take the first one found
                    }
                }
            }
        } else {
            // Policy 2: Random enemy
            targetEnemy = enemies[Math.floor(Math.random() * enemies.length)];
        }
    }

    if (targetEnemy) {
        nextBot.botState = "attack";
        nextBot.botGoalX = Math.round(targetEnemy.xCoordinate);
        nextBot.botGoalY = Math.round(targetEnemy.yCoordinate);
        // Calculate path
        // Careful/Greedy (Policy 1) need "safe" path (no soft blocks)
        // Hostile (Policy 2) uses standard path
        let avoidSoft = !useAttackPolicy2; 
        nextBot.botPath = findShortestPath(myX, myY, nextBot.botGoalX, nextBot.botGoalY, model, avoidSoft);
        return nextBot;
    }

    // 4. OTHERWISE -> WANDER [cite: 211]
    nextBot.botState = "wander";
    // Pick random goal
    for(let i=0; i<10; i++) {
        let rx = Math.floor(Math.random() * COLS);
        let ry = Math.floor(Math.random() * ROWS);
        // Must not be hard block
        if (model.grid[ry][rx]._tag !== "HardBlock") {
            let path = findShortestPath(myX, myY, rx, ry, model, false);
            if (path.length > 0) {
                nextBot.botPath = path;
                break;
            }
        }
    }
    return nextBot;
};

// ------------------------------------------------------------------
// MAIN BOT UPDATE FUNCTION
// ------------------------------------------------------------------

export const updateBotLogic = (
    bot: Player, 
    model: Model, 
    events: { bombPlanted: boolean, explosionEnded: boolean }
): Player => {
    let nextBot = { ...bot };
    let myX = Math.round(bot.xCoordinate);
    let myY = Math.round(bot.yCoordinate);

    // ------------------------------------
    // 1. CHECK IF WE NEED TO RE-THINK [cite: 212-216]
    // ------------------------------------
    
    // Decrement timer
    nextBot.botTicksSinceThink -= 1;
    let shouldThink = false;

    // A. Event Triggers
    if (events.explosionEnded) shouldThink = true;
    
    // If a bomb was planted nearby (within 5 cells), we should think
    if (events.bombPlanted) {
        let bombClose = false;
        // We scan bombs to see if any is new/close. 
        // Simplification: Just check if *any* bomb is close right now.
        HM.forEach(model.bombs, (b) => {
            if (getDistance(myX, myY, b.x, b.y) <= 5) {
                bombClose = true;
            }
        });
        if (bombClose) shouldThink = true;
    }

    // B. Periodic Timer Trigger
    if (nextBot.botTicksSinceThink <= 0) {
        const config = BOT_CONFIGS[bot.botType];
        // Reset timer (Convert seconds to frames)
        nextBot.botTicksSinceThink = config.reevalInterval * FPS;
        
        // Random Chance check
        if (Math.random() < config.reevalChance) {
            shouldThink = true;
        }
    }

    // Do the thinking if needed
    if (shouldThink) {
        nextBot = reevaluateState(nextBot, model);
        // Update local vars after change
        myX = Math.round(nextBot.xCoordinate);
        myY = Math.round(nextBot.yCoordinate);
    }

    // ------------------------------------
    // 2. EXECUTE MOVEMENT (Walk the Path)
    // ------------------------------------
    
    let targetX = nextBot.xCoordinate;
    let targetY = nextBot.yCoordinate;
    let shouldPlant = false;

    // Special Logic for Attack: Update path to enemy if they moved
    if (nextBot.botState === "attack") {
        // Recalculate path to target's current position (Policy 2 logic mostly)
        if (bot.botType === "hostile") {
             nextBot.botPath = findShortestPath(myX, myY, nextBot.botGoalX, nextBot.botGoalY, model, false);
        }
        
        // Check if we should plant bomb (Attack logic)
        // If hostile: plant if next cell is soft block
        if (bot.botType === "hostile" && nextBot.botPath.length > 0) {
            let next = nextBot.botPath[0];
            if (model.grid[next.y][next.x]._tag === "SoftBlock") {
                 shouldPlant = true;
            }
        }
        
        // Always plant if close to target [cite: 275]
        const config = BOT_CONFIGS[bot.botType];
        if (getDistance(myX, myY, nextBot.botGoalX, nextBot.botGoalY) <= config.plantDist) {
            shouldPlant = true;
        }
    }

    // Special Logic for Wander: Plant if soft block in way [cite: 205]
    if (nextBot.botState === "wander" && nextBot.botPath.length > 0) {
        let next = nextBot.botPath[0];
        if (model.grid[next.y][next.x]._tag === "SoftBlock") {
             shouldPlant = true;
        }
    }

    // MOVE ALONG PATH
    if (nextBot.botPath.length > 0) {
        let nextStep = nextBot.botPath[0];
        let moveSpeed = PLAYER_SPEED * nextBot.speedMulti;

        // Simple movement toward center of next cell
        if (Math.abs(nextBot.xCoordinate - nextStep.x) > 0.1) {
            if (nextBot.xCoordinate < nextStep.x) targetX += moveSpeed;
            else targetX -= moveSpeed;
        } else if (Math.abs(nextBot.yCoordinate - nextStep.y) > 0.1) {
            if (nextBot.yCoordinate < nextStep.y) targetY += moveSpeed;
            else targetY -= moveSpeed;
        } else {
            // We arrived at the cell center!
            // Remove this step from the path
            // We use Array.slice to remove the first element (simpler than shift for immutability but shift works too)
            let newPath = [...nextBot.botPath];
            newPath.shift();
            nextBot.botPath = newPath;
        }
    } else {
        // Path finished? Go back to wander next tick
        if (nextBot.botState !== "wander") {
             // Let the re-eval handle it next tick, or force it now. 
             // We'll just leave it, the periodic check will catch it or we can force idle.
        }
    }

    // Update the bot's intended inputs for the game engine
    return {
        ...nextBot,
        targetX: targetX,
        targetY: targetY,
        botShouldPlant: shouldPlant
    };
};