// src/bot.ts

import { Player, Model, Cell, Bomb, PowerUp, ExplosionCell } from "./model"
import { ROWS, COLS, FPS, PLAYER_SPEED } from "./constants"
import { HashMap as HM } from "effect"

export type Point = { x: number; y: number }

const BOT_CONFIGS = {
  hostile: { interval: 0.5, chance: 0.25, dangerDist: 0, plantDist: 2 },
  careful: { interval: 0.25, chance: 1.0, dangerDist: 4, plantDist: 4 },
  greedy: { interval: 1.0, chance: 1.0, dangerDist: 2, plantDist: 3 },
}

// --- Helpers ---
const getIntKey = (x: number, y: number) => y * COLS + x
const distManhattan = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

// Check if a specific coordinate is safe to walk on
const isWalkable = (x: number, y: number, grid: readonly (readonly Cell[])[], bombs: HM.HashMap<number, Bomb>, ignoreSoftBlocks: boolean): boolean => {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return false
    const cell = grid[y][x]
    if (cell._tag === "HardBlock") return false
    if (!ignoreSoftBlocks && cell._tag === "SoftBlock") return false
    if (HM.has(bombs, getIntKey(x, y))) return false
    return true
}

// --- Pathfinding (Dijkstra/BFS) ---
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

    const dist = new Map<number, number>()
    const prev = new Map<number, number>()
    const queue: number[] = [] 

    dist.set(startKey, 0)
    queue.push(startKey)

    let found = false

    while (queue.length > 0) {
        const uKey = queue.shift()! 
        if (uKey === endKey) { found = true; break }

        const ux = uKey % COLS
        const uy = Math.floor(uKey / COLS)
        const currentDist = dist.get(uKey)!

        const neighbors = [{ x: ux, y: uy - 1 }, { x: ux, y: uy + 1 }, { x: ux - 1, y: uy }, { x: ux + 1, y: uy }]

        for (const n of neighbors) {
            if (!isWalkable(n.x, n.y, grid, bombs, ignoreSoftBlocks)) continue
            
            const vKey = getIntKey(n.x, n.y)
            const newDist = currentDist + 1

            if (!dist.has(vKey) || newDist < dist.get(vKey)!) {
                dist.set(vKey, newDist)
                prev.set(vKey, uKey)
                queue.push(vKey)
            }
        }
    }

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
    for (const exp of explosions) {
        if (exp.x === x && exp.y === y) return true
    }
    if (type === "hostile") return HM.has(bombs, getIntKey(x, y))

    let dangerous = false
    HM.forEach(bombs, (bomb) => {
         if (bomb.x === x && bomb.y === y) dangerous = true
         const dx = Math.abs(bomb.x - x)
         const dy = Math.abs(bomb.y - y)
         if ((dx === 0 && dy <= bomb.range) || (dy === 0 && dx <= bomb.range)) dangerous = true
    })
    return dangerous
}

const isBotInDanger = (bot: Player, bombs: HM.HashMap<number, Bomb>, explosions: readonly ExplosionCell[]): boolean => {
    const config = BOT_CONFIGS[bot.bot_type as keyof typeof BOT_CONFIGS]
    const checkDist = config.dangerDist
    const bx = Math.floor(bot.x_coordinate)
    const by = Math.floor(bot.y_coordinate)

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

// --- Helper: Robust Pathfinding ---
// Tries to find a path. If blocked, tries to find a path that breaks soft blocks.
const findPathWithFallback = (start: Point, end: Point, grid: readonly (readonly Cell[])[], bombs: HM.HashMap<number, Bomb>, preferSafe: boolean): Point[] => {
    // 1. Try safe path (respecting walls)
    let path = getShortestPath(start, end, grid, bombs, !preferSafe) // if preferSafe=true, ignoreSoft=false
    
    // 2. If no path and we wanted a safe one, try unsafe (breaking blocks)
    if (path.length === 0 && preferSafe) {
        path = getShortestPath(start, end, grid, bombs, true)
    }
    return path
}

const getRandomGoal = (grid: readonly (readonly Cell[])[]): Point => {
    for(let i=0; i<10; i++) {
        const x = Math.floor(Math.random() * (COLS - 2)) + 1
        const y = Math.floor(Math.random() * (ROWS - 2)) + 1
        if (grid[y][x]._tag !== "HardBlock") return {x, y}
    }
    return {x: 1, y: 1}
}

const reevaluate = (bot: Player, model: Model): Player => {
    let nextBot = { ...bot }
    const bx = Math.floor(bot.x_coordinate)
    const by = Math.floor(bot.y_coordinate)
    const bPos = { x: bx, y: by }

    // 1. Danger -> Escape
    if (isBotInDanger(bot, model.bombs, model.explosions)) {
        nextBot.bot_state = "escape"
        let bestSafe: Point | null = null
        let minDist = 999
        
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
             // Escape should always respect walls (don't bomb while fleeing)
             nextBot.bot_path = getShortestPath(bPos, bestSafe, model.grid, model.bombs, false)
             return nextBot
        }
        nextBot.bot_state = "wander"
    }

    // 2. Powerup -> Get Powerup
    let targetPowerup: Point | null = null
    const powerups: Point[] = []
    HM.forEach(model.powerups, (p) => powerups.push({x: p.x, y: p.y}))

    if (powerups.length > 0) {
        if (bot.bot_type === "greedy") {
            powerups.sort((a,b) => distManhattan(bPos, a) - distManhattan(bPos, b))
            targetPowerup = powerups[0]
        } else if (bot.bot_type === "careful") {
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
        // Greedy/Careful prefer safe, but will break blocks if needed (Fallback Fix)
        const preferSafe = bot.bot_type !== "hostile"
        nextBot.bot_path = findPathWithFallback(bPos, targetPowerup, model.grid, model.bombs, preferSafe)
        return nextBot
    }

    // 3. Attack -> Attack
    let targetPlayer: Player | null = null
    const otherPlayers = model.players.filter(p => p.id !== bot.id && p.is_alive)
    
    if (otherPlayers.length > 0) {
        if (bot.bot_type === "hostile") {
            targetPlayer = otherPlayers[Math.floor(Math.random() * otherPlayers.length)]
        } else {
            const range = bot.bot_type === "careful" ? 3 : 6
            const nearby = otherPlayers.filter(p => distManhattan(bPos, {x: Math.floor(p.x_coordinate), y: Math.floor(p.y_coordinate)}) <= range)
            if (nearby.length > 0) targetPlayer = nearby[0]
        }
    }

    if (targetPlayer) {
        nextBot.bot_state = "attack"
        const tx = Math.floor(targetPlayer.x_coordinate)
        const ty = Math.floor(targetPlayer.y_coordinate)
        nextBot.bot_goal_x = tx
        nextBot.bot_goal_y = ty
        
        const preferSafe = bot.bot_type !== "hostile"
        nextBot.bot_path = findPathWithFallback(bPos, {x: tx, y: ty}, model.grid, model.bombs, preferSafe)
        return nextBot
    }

    // 4. Default -> Wander
    nextBot.bot_state = "wander"
    const g = getRandomGoal(model.grid)
    nextBot.bot_goal_x = g.x
    nextBot.bot_goal_y = g.y
    // Even wandering should support breaking blocks if trapped
    nextBot.bot_path = findPathWithFallback(bPos, g, model.grid, model.bombs, bot.bot_type !== "hostile")
    
    return nextBot
}

export const updateBotLogic = (bot: Player, model: Model): Player => {
    let nextBot = { ...bot }
    nextBot.bot_should_plant = false
    
    const config = BOT_CONFIGS[bot.bot_type as keyof typeof BOT_CONFIGS]
    const ticksNeeded = config.interval * FPS
    
    nextBot.bot_ticks_since_think += 1
    if (nextBot.bot_ticks_since_think >= ticksNeeded) {
        if (Math.random() < config.chance) {
            nextBot = reevaluate(nextBot, model)
            nextBot.bot_ticks_since_think = 0
        }
    }

    const bx = Math.floor(nextBot.x_coordinate)
    const by = Math.floor(nextBot.y_coordinate)
    
    if (bx === nextBot.bot_goal_x && by === nextBot.bot_goal_y) {
        nextBot = reevaluate(nextBot, model)
    }

    if (nextBot.bot_path.length > 0) {
        const nextCell = nextBot.bot_path[0]
        
        // --- MOVEMENT & PHASING FIX ---
        // Check what is actually at the next cell
        const cellTag = model.grid[nextCell.y][nextCell.x]._tag
        const hasBomb = HM.has(model.bombs, getIntKey(nextCell.x, nextCell.y))
        
        // If SoftBlock, STOP and PLANT. Do not move.
        if (cellTag === "SoftBlock") {
            nextBot.bot_should_plant = true
            // Do NOT remove path node yet, we haven't moved.
            // We wait for the bomb to clear it.
        }
        // If blocked by HardBlock or Bomb, wait.
        else if (cellTag === "HardBlock" || hasBomb) {
            // Blocked. Wait. (Or re-think next tick)
        }
        // If Free, Move.
        else {
            const dx = (nextCell.x + 0.5) - nextBot.x_coordinate
            const dy = (nextCell.y + 0.5) - nextBot.y_coordinate
            const speed = PLAYER_SPEED * nextBot.speed_multi
            const distToCenter = Math.sqrt(dx*dx + dy*dy)
            
            if (distToCenter < speed) {
                nextBot.x_coordinate = nextCell.x + 0.5
                nextBot.y_coordinate = nextCell.y + 0.5
                nextBot.bot_path = nextBot.bot_path.slice(1)
            } else {
                const angle = Math.atan2(dy, dx)
                nextBot.x_coordinate += Math.cos(angle) * speed
                nextBot.y_coordinate += Math.sin(angle) * speed
            }
        }
    }

    // Attack planting logic
    if (bot.bot_state === "attack") {
         const dist = distManhattan({x: bx, y: by}, {x: nextBot.bot_goal_x, y: nextBot.bot_goal_y})
         if (dist <= config.plantDist) {
              nextBot.bot_should_plant = true
         }
    }

    return nextBot
}