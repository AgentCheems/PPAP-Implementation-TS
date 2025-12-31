
import { Player, Model, Cell, Bomb, PowerUp, ExplosionCell } from "./model"
import { ROWS, COLS, FPS, PLAYER_SPEED, BOMB_TIMER_SECONDS } from "./constants"
import { HashMap as HM } from "effect"

export type Point = { x: number; y: number }

const BOT_CONFIGS = {
  hostile: { interval: 0.5, chance: 0.25, dangerDist: 0, plantDist: 2 },
  careful: { interval: 0.25, chance: 1.0, dangerDist: 4, plantDist: 4 },
  greedy: { interval: 1.0, chance: 1.0, dangerDist: 2, plantDist: 3 },
} as const

// --- Helpers ---

const getIntKey = (x: number, y: number) => y * COLS + x

const distManhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

const isWalkable = (x: number, y: number, grid: readonly (readonly Cell[])[], bombs: HM.HashMap<number, Bomb>, ignoreSoftBlocks: boolean): boolean => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false
    const cell = grid[y][x]
    if (cell._tag === "HardBlock") return false
    if (!ignoreSoftBlocks && cell._tag === "SoftBlock") return false
    if (HM.has(bombs, getIntKey(x, y))) return false
    return true
}

// --- Pathfinding ---

// --- Pathfinding (Dijkstra) ---

export const getShortestPath = (
  start: Point,
  end: Point,
  grid: readonly (readonly Cell[])[],
  bombs: HM.HashMap<number, Bomb>,
  ignoreSoftBlocks: boolean
): Point[] => {
    const startKey = getIntKey(start.x, start.y)
    const endKey = getIntKey(end.x, end.y)

    if (startKey === endKey) return []

    // 1. Initialize Distances
    const dist = new Map<number, number>()
    const prev = new Map<number, number>() // To reconstruct path
    const queue: number[] = [] // Simple queue since weights are 1 (effectively a PQ)

    dist.set(startKey, 0)
    queue.push(startKey)

    let found = false

    // 2. Main Loop
    while (queue.length > 0) {
        // In unweighted grid, shift() is effectively extractMin()
        // If weights were different, we'd need to sort or use a heap
        const uKey = queue.shift()! 
        
        if (uKey === endKey) {
            found = true
            break
        }

        const ux = uKey % COLS
        const uy = Math.floor(uKey / COLS)
        const currentDist = dist.get(uKey)!

        // Check Neighbors
        const neighbors = [
            { x: ux, y: uy - 1 },
            { x: ux, y: uy + 1 },
            { x: ux - 1, y: uy },
            { x: ux + 1, y: uy }
        ]

        for (const n of neighbors) {
            if (!isWalkable(n.x, n.y, grid, bombs, ignoreSoftBlocks)) continue
            
            const vKey = getIntKey(n.x, n.y)
            const newDist = currentDist + 1

            // Relaxation Step: If we found a shorter path to v
            if (!dist.has(vKey) || newDist < dist.get(vKey)!) {
                dist.set(vKey, newDist)
                prev.set(vKey, uKey)
                queue.push(vKey)
            }
        }
    }

    // 3. Reconstruct Path (Backtracking)
    if (!found) return []

    const path: Point[] = []
    let curr = endKey
    while (curr !== startKey) {
        path.unshift({ x: curr % COLS, y: Math.floor(curr / COLS) })
        curr = prev.get(curr)!
    }
    
    return path
}
// --- Safety Checks ---

const isCellDangerous = (x: number, y: number, bombs: HM.HashMap<number, Bomb>, explosions: readonly ExplosionCell[], type: string): boolean => {
    // 1. Current Explosions (Always dangerous)
    for (const exp of explosions) {
        if (exp.x === x && exp.y === y) return true
    }

    // 2. Bombs
    if (type === "hostile") {
        // Hostile: "Only cells containing bombs ... are considered to be dangerous"
        return HM.has(bombs, getIntKey(x, y))
    }

    // Careful / Greedy: "Only cells possibly caught in an explosion..."
    let dangerous = false
    HM.forEach(bombs, (bomb) => {
         if (bomb.x === x && bomb.y === y) dangerous = true
         // Check range
         const dx = Math.abs(bomb.x - x)
         const dy = Math.abs(bomb.y - y)
         if ((dx === 0 && dy <= bomb.range) || (dy === 0 && dx <= bomb.range)) {
             dangerous = true
         }
    })
    return dangerous
}

const isBotInDanger = (bot: Player, bombs: HM.HashMap<number, Bomb>, explosions: readonly ExplosionCell[]): boolean => {
    const config = BOT_CONFIGS[bot.bot_type as keyof typeof BOT_CONFIGS]
    const checkDist = config.dangerDist
    const bx = Math.floor(bot.x_coordinate)
    const by = Math.floor(bot.y_coordinate)

    // Check cells within Manhattan distance D
    for (let dy = -checkDist; dy <= checkDist; dy++) {
        for (let dx = -checkDist; dx <= checkDist; dx++) {
             if (Math.abs(dx) + Math.abs(dy) > checkDist) continue
             const tx = bx + dx
             const ty = by + dy
             if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) continue
             if (isCellDangerous(tx, ty, bombs, explosions, bot.bot_type)) return true
        }
    }
    return false
}

// --- Logic ---

const getRandomGoal = (grid: readonly (readonly Cell[])[]): Point => {
    // Try 10 times to find a non-hardblock cell
    for(let i=0; i<10; i++) {
        const x = Math.floor(Math.random() * (COLS - 2)) + 1
        const y = Math.floor(Math.random() * (ROWS - 2)) + 1
        if (grid[y][x]._tag !== "HardBlock") return {x, y}
    }
    return {x: 1, y: 1} // Fallback
}

const reevaluate = (bot: Player, model: Model): Player => {
    let nextBot = { ...bot }
    const bx = Math.floor(bot.x_coordinate)
    const by = Math.floor(bot.y_coordinate)
    const bPos = { x: bx, y: by }

    // 1. Danger -> Escape
    if (isBotInDanger(bot, model.bombs, model.explosions)) {
        nextBot.bot_state = "escape"
        // Find safe cell
        // BFS to nearest safe cell
        // Simplification: Pick random safe cell or scan nearby
        // We'll scan cells within range 10 for a safe spot
        let bestSafe: Point | null = null
        let minDist = 999
        
        // Scan a 10x10 area? too slow maybe.
        // Let's just pick a random safe goal
        for(let i=0; i<20; i++) {
             const rx = Math.floor(Math.random() * COLS)
             const ry = Math.floor(Math.random() * ROWS)
             if (!isCellDangerous(rx, ry, model.bombs, model.explosions, bot.bot_type) && 
                 isWalkable(rx, ry, model.grid, model.bombs, false)) {
                 const d = distManhattan(bPos, {x: rx, y: ry})
                 if (d < minDist) { minDist = d; bestSafe = {x: rx, y: ry} }
             }
        }
        
        if (bestSafe) {
             nextBot.bot_goal_x = bestSafe.x
             nextBot.bot_goal_y = bestSafe.y
             nextBot.bot_path = getShortestPath(bPos, bestSafe, model.grid, model.bombs, false)
             return nextBot
        }
        // If trapped, wander
        nextBot.bot_state = "wander"
    }

    // 2. Powerup -> Get Powerup
    // Policy 1: Closest. Policy 2: Random within 4.
    // Hostile: 20% Policy 2, else skip? Spec says "Employs Policy 2 20% of the time". What about other 80%? Assuming "Doesn't get powerup".
    // Careful: 100% Policy 2.
    // Greedy: Policy 1.
    
    let targetPowerup: Point | null = null
    const powerups: Point[] = []
    HM.forEach(model.powerups, (p) => powerups.push({x: p.x, y: p.y}))

    if (powerups.length > 0) {
        if (bot.bot_type === "greedy") {
            // Policy 1: Closest
            powerups.sort((a,b) => distManhattan(bPos, a) - distManhattan(bPos, b))
            targetPowerup = powerups[0]
        } else if (bot.bot_type === "careful") {
            // Policy 2: Random within 4
            const nearby = powerups.filter(p => distManhattan(bPos, p) <= 4)
            if (nearby.length > 0) targetPowerup = nearby[Math.floor(Math.random() * nearby.length)]
        } else if (bot.bot_type === "hostile") {
             if (Math.random() < 0.2) {
                 const nearby = powerups.filter(p => distManhattan(bPos, p) <= 4)
                 if (nearby.length > 0) targetPowerup = nearby[Math.floor(Math.random() * nearby.length)]
             }
        }
    }

    if (targetPowerup) {
        nextBot.bot_state = "get_powerup"
        nextBot.bot_goal_x = targetPowerup.x
        nextBot.bot_goal_y = targetPowerup.y
        nextBot.bot_path = getShortestPath(bPos, targetPowerup, model.grid, model.bombs, false)
        return nextBot
    }

    // 3. Attack -> Attack
    // Policy 1: Reachable within A. (Careful: A=3, Greedy: A=6)
    // Policy 2: Random other player. (Hostile)
    
    let targetPlayer: Player | null = null
    const otherPlayers = model.players.filter(p => p.id !== bot.id && p.is_alive)
    
    if (otherPlayers.length > 0) {
        if (bot.bot_type === "hostile") {
            // Policy 2
            targetPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)]
        } else {
            // Policy 1
            const range = bot.bot_type === "careful" ? 3 : 6
            const nearby = otherPlayers.filter(p => distManhattan(bPos, {x: Math.floor(p.x_coordinate), y: Math.floor(p.y_coordinate)}) <= range)
            if (nearby.length > 0) {
                targetPlayer = nearby[0] // pick first? Spec doesn't specify sort.
            }
        }
    }

    if (targetPlayer) {
        nextBot.bot_state = "attack"
        const tx = Math.floor(targetPlayer.x_coordinate)
        const ty = Math.floor(targetPlayer.y_coordinate)
        nextBot.bot_goal_x = tx
        nextBot.bot_goal_y = ty
        
        // Hostile (Policy 2) uses SoftBlock breaking path?
        // Spec: "Hostile ... Employs second policy ... Compute shortest path ... next cell has soft block ... attempt to plant"
        // Careful/Greedy (Policy 1) ... "Compute shortest path such that NONE of the cells have soft blocks"
        
        const ignoreSoft = bot.bot_type === "hostile" // Hostile ignores soft blocks (can destroy them)
        // actually, ignoreSoftBlocks param in getShortestPath:
        // true = treat soft blocks as walkable (will need to bomb them).
        // false = treat soft blocks as walls (avoid them).
        
        nextBot.bot_path = getShortestPath(bPos, {x: tx, y: ty}, model.grid, model.bombs, ignoreSoft)
        return nextBot
    }

    // 4. Default -> Wander
    nextBot.bot_state = "wander"
    const g = getRandomGoal(model.grid)
    nextBot.bot_goal_x = g.x
    nextBot.bot_goal_y = g.y
    nextBot.bot_path = getShortestPath(bPos, g, model.grid, model.bombs, false)
    
    return nextBot
}

export const updateBotLogic = (bot: Player, model: Model): Player => {
    let nextBot = { ...bot }
    nextBot.bot_should_plant = false // reset trigger
    
    const config = BOT_CONFIGS[bot.bot_type as keyof typeof BOT_CONFIGS]
    const ticksNeeded = config.interval * FPS
    
    // Reevaluation Timer
    nextBot.bot_ticks_since_think += 1
    if (nextBot.bot_ticks_since_think >= ticksNeeded) {
        if (Math.random() < config.chance) {
            nextBot = reevaluate(nextBot, model)
            nextBot.bot_ticks_since_think = 0
        }
    }

    // State Execution
    const bx = Math.floor(nextBot.x_coordinate)
    const by = Math.floor(nextBot.y_coordinate)
    
    // Check if goal reached
    if (bx === nextBot.bot_goal_x && by === nextBot.bot_goal_y) {
        // Goal reached, switch to wander to pick new goal
        nextBot = reevaluate(nextBot, model) // Or just force wander?
        if (nextBot.bot_state !== "wander") {
             // force wander if we accomplished task?
             // Simple: just pick new wander goal
             const g = getRandomGoal(model.grid)
             nextBot.bot_goal_x = g.x
             nextBot.bot_goal_y = g.y
             nextBot.bot_path = getShortestPath({x: bx, y: by}, g, model.grid, model.bombs, false)
        }
    }

    // Follow Path
    if (nextBot.bot_path.length > 0) {
        const nextCell = nextBot.bot_path[0]
        
        // Move towards nextCell
        // Are we at the center of current cell?
        // We need smooth movement.
        
        const dx = (nextCell.x + 0.5) - nextBot.x_coordinate
        const dy = (nextCell.y + 0.5) - nextBot.y_coordinate
        
        const speed = PLAYER_SPEED * nextBot.speed_multi
        
        const distToCenter = Math.sqrt(dx*dx + dy*dy)
        
        if (distToCenter < speed) {
            // Arrived at next cell center
            nextBot.x_coordinate = nextCell.x + 0.5
            nextBot.y_coordinate = nextCell.y + 0.5
            nextBot.bot_path = nextBot.bot_path.slice(1) // Pop
        } else {
            const angle = Math.atan2(dy, dx)
            nextBot.x_coordinate += Math.cos(angle) * speed
            nextBot.y_coordinate += Math.sin(angle) * speed
        }
        
        // Bombing Logic (Attack / Wander through blocks)
        if (bot.bot_state === "attack" || bot.bot_state === "wander") {
             // Check if next cell is SoftBlock
             const nextType = model.grid[nextCell.y][nextCell.x]._tag
             if (nextType === "SoftBlock") {
                  // Plant!
                  nextBot.bot_should_plant = true
             }
        }
    }

    // Attack specific: Plant if near target
    if (bot.bot_state === "attack") {
         const dist = distManhattan({x: bx, y: by}, {x: nextBot.bot_goal_x, y: nextBot.bot_goal_y})
         if (dist <= config.plantDist) {
              nextBot.bot_should_plant = true
         }
    }

    return nextBot
}
