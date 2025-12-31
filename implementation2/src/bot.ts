import { Player, Model, Cell, Bomb, ExplosionCell } from "./model"
import { ROWS, COLS, FPS, PLAYER_SPEED, BOT_CONFIGS } from "./constants"
import { HashMap as HM } from "effect"

// --- TYPES & HELPERS ---
type Point = { x: number; y: number }

const getIntKey = (x: number, y: number) => y * COLS + x
const getCoords = (k: number) => ({ x: k % COLS, y: Math.floor(k / COLS) })
const getDist = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

// --- DANGER ANALYSIS ---
const getDangerMap = (
  bombs: HM.HashMap<number, Bomb>, 
  explosions: readonly ExplosionCell[],
  grid: readonly (readonly Cell[])[],
  bot: Player
): Set<number> => {
  const danger = new Set<number>()
  const config = BOT_CONFIGS[bot.bot_type]
  const botPos = { x: Math.floor(bot.x_coordinate), y: Math.floor(bot.y_coordinate) }
  const limitDist = config.dangerDist

  const mark = (x: number, y: number) => {
    // Optimization: Only mark danger relevant to the bot (within dangerDist)
    if (limitDist === 0 || getDist(botPos, {x, y}) <= limitDist + 2) {
        danger.add(getIntKey(x, y))
    }
  }

  // 1. Active Explosions
  for (const exp of explosions) mark(exp.x, exp.y)

  // 2. Bomb Predictions (with Wall Checking)
  HM.forEach(bombs, (b) => {
    mark(b.x, b.y)
    const dirs = [{dx: 1, dy: 0}, {dx: -1, dy: 0}, {dx: 0, dy: 1}, {dx: 0, dy: -1}]
    
    for (const dir of dirs) {
      for (let i = 1; i <= b.range; i++) {
        const nx = b.x + (dir.dx * i)
        const ny = b.y + (dir.dy * i)
        
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) break
        const cell = grid[ny][nx]
        
        if (cell._tag === "HardBlock") break
        mark(nx, ny)
        if (cell._tag === "SoftBlock") break
      }
    }
  })
  return danger
}

// --- PATHFINDING (Dijkstra) ---
const getShortestPath = (
  start: Point,
  target: Point,
  grid: readonly (readonly Cell[])[],
  bombs: HM.HashMap<number, Bomb>,
  explosions: readonly ExplosionCell[],
  dangerMap: Set<number>,
  ignoreSoftBlocks: boolean
): Point[] => {
  const startKey = getIntKey(start.x, start.y)
  const targetKey = getIntKey(target.x, target.y)

  if (startKey === targetKey) return []

  const dist = new Map<number, number>()
  const prev = new Map<number, number>()
  const unvisited = new Set<number>()

  // Optimization: Only initialize relevant area or use a priority queue structure
  // For now, full grid init is acceptable for 13x15
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const k = getIntKey(x, y)
      dist.set(k, Infinity)
      unvisited.add(k)
    }
  }
  dist.set(startKey, 0)

  const activeExplosionKeys = new Set<number>()
  for(const e of explosions) activeExplosionKeys.add(getIntKey(e.x, e.y))

  while (unvisited.size > 0) {
    // Inefficient priority extract (O(N)), but grid is small. 
    // A MinHeap would be O(log N) but adds complexity.
    let current = -1
    let minDist = Infinity
    
    for (const k of unvisited) {
      const d = dist.get(k)!
      if (d < minDist) {
        minDist = d
        current = k
      }
    }

    if (current === -1 || minDist === Infinity) break 
    if (current === targetKey) break

    unvisited.delete(current)
    const c = getCoords(current)

    const neighbors = [
      { x: c.x, y: c.y - 1 }, { x: c.x, y: c.y + 1 },
      { x: c.x - 1, y: c.y }, { x: c.x + 1, y: c.y }
    ]

    for (const n of neighbors) {
      if (n.x < 0 || n.x >= COLS || n.y < 0 || n.y >= ROWS) continue
      const nk = getIntKey(n.x, n.y)
      if (!unvisited.has(nk)) continue

      const cell = grid[n.y][n.x]

      let weight = 1
      if (cell._tag === "HardBlock") continue
      if (activeExplosionKeys.has(nk)) continue 
      
      if (cell._tag === "SoftBlock") {
        if (!ignoreSoftBlocks) continue 
        weight += 8 
      }

      if (HM.has(bombs, nk) && nk !== startKey) continue

      if (dangerMap.has(nk)) {
        weight += 20 // High penalty for danger to prefer safe routes
      }

      const alt = dist.get(current)! + weight
      if (alt < dist.get(nk)!) {
        dist.set(nk, alt)
        prev.set(nk, current)
      }
    }
  }

  if (!prev.has(targetKey)) return []
  
  const path: Point[] = []
  let curr = targetKey
  while (curr !== startKey) {
    path.unshift(getCoords(curr))
    curr = prev.get(curr)!
  }
  return path
}

// --- ESCAPE LOGIC (BFS Optimized) ---
const decideEscape = (bot: Player, model: Model, dangerMap: Set<number>): Player => {
    let nextBot = { ...bot }
    const startNode = { x: Math.floor(bot.x_coordinate), y: Math.floor(bot.y_coordinate) }
    const startKey = getIntKey(startNode.x, startNode.y)

    // BFS Queue: [CurrentNode, PathToNode]
    const queue: { pt: Point, path: Point[] }[] = [{ pt: startNode, path: [] }]
    const visited = new Set<number>([startKey])

    let bestPath: Point[] = []

    // Run BFS to find the NEAREST safe tile
    while (queue.length > 0) {
        const { pt, path } = queue.shift()!
        const k = getIntKey(pt.x, pt.y)

        // If this tile is safe, we found our escape!
        if (!dangerMap.has(k) && !HM.has(model.bombs, k) && model.grid[pt.y][pt.x]._tag === "Empty") {
            bestPath = path
            break
        }

        // Limit depth to prevent full grid scan if trapped
        if (path.length > 10) continue 

        const neighbors = [
            { x: pt.x, y: pt.y - 1 }, { x: pt.x, y: pt.y + 1 },
            { x: pt.x - 1, y: pt.y }, { x: pt.x + 1, y: pt.y }
        ]

        for (const n of neighbors) {
            if (n.x < 1 || n.x >= COLS-1 || n.y < 1 || n.y >= ROWS-1) continue
            const nk = getIntKey(n.x, n.y)
            if (visited.has(nk)) continue

            // Obstacle checks
            const cell = model.grid[n.y][n.x]
            if (cell._tag !== "Empty") continue // Can't escape through soft blocks
            if (model.explosions.some(e => e.x === n.x && e.y === n.y)) continue // Blocked by explosion
            
            // Note: We DO allow traversing through "Danger" tiles to get to a "Safe" tile
            // but we might want to prioritize non-dangerous ones. For simple escape, BFS is fine.

            visited.add(nk)
            queue.push({ pt: n, path: [...path, n] })
        }
    }

    if (bestPath.length > 0) {
        nextBot.bot_state = "escape"
        nextBot.bot_path = bestPath
        const last = bestPath[bestPath.length - 1]
        nextBot.bot_goal_x = last.x
        nextBot.bot_goal_y = last.y
    } else {
        // Trapped
        nextBot.bot_state = "wander"
        nextBot.bot_path = []
    }

    return nextBot
}

// --- SAFETY CHECK ---
const isSafeToPlant = (bot: Player, model: Model): boolean => {
  const bx = Math.floor(bot.x_coordinate)
  const by = Math.floor(bot.y_coordinate)
  const vBombs = HM.set(model.bombs, getIntKey(bx, by), Bomb.make({
    id: "sim", x: bx, y: by, timer: 300, range: bot.bomb_range, owner: bot.id
  }))
  
  const danger = getDangerMap(vBombs, model.explosions, model.grid, bot)
  
  const queue = [{x: bx, y: by}]
  const visited = new Set<number>([getIntKey(bx, by)])
  
  while(queue.length > 0) {
    const curr = queue.shift()!
    const k = getIntKey(curr.x, curr.y)
    
    if (!danger.has(k) && !HM.has(model.bombs, k)) return true
    
    const neighbors = [
        { x: curr.x, y: curr.y - 1 }, { x: curr.x, y: curr.y + 1 },
        { x: curr.x - 1, y: curr.y }, { x: curr.x + 1, y: curr.y }
    ]
    
    for(const n of neighbors) {
        if(n.x < 0 || n.x >= COLS || n.y < 0 || n.y >= ROWS) continue
        const nk = getIntKey(n.x, n.y)
        if(visited.has(nk)) continue
        if(model.grid[n.y][n.x]._tag !== "Empty") continue
        if(model.explosions.some(e => e.x === n.x && e.y === n.y)) continue
        if(HM.has(vBombs, nk) && nk !== getIntKey(bx, by)) continue

        visited.add(nk)
        queue.push(n)
    }
  }
  return false
}

// --- GOAL DECISION ---
const decideGoal = (bot: Player, model: Model, dangerMap: Set<number>): Player => {
    let nextBot = { ...bot }
    const bPos = { x: Math.floor(bot.x_coordinate), y: Math.floor(bot.y_coordinate) }
    const config = BOT_CONFIGS[bot.bot_type]
    
    const hasAmmo = bot.bombs_active < bot.max_bombs
    const canDigAggressive = (bot.bot_type === "hostile" || bot.bot_type === "extreme") && hasAmmo

    let goals: { pt: Point, type: string, priority: number }[] = []

    // 1. Powerups (Priority 3)
    HM.forEach(model.powerups, (p) => goals.push({ pt: {x: p.x, y: p.y}, type: "getPowerup", priority: 3 }))

    // 2. Attack (Priority 2)
    model.players.forEach(p => {
        if(p.id !== bot.id && p.is_alive) {
            goals.push({ pt: {x: Math.floor(p.x_coordinate), y: Math.floor(p.y_coordinate)}, type: "attack", priority: 2 })
        }
    })

    // 3. Current Wander Goal (Priority 1.5 - Fixes Twitching)
    // If we are already wandering and the path is valid, keep it.
    if (bot.bot_state === "wander" && bot.bot_path.length > 0) {
        goals.push({ pt: {x: bot.bot_goal_x, y: bot.bot_goal_y}, type: "wander", priority: 1.5 })
    }

    // 4. New Wander Targets (Priority 1)
    for(let i=0; i<3; i++) {
        const rx = Math.floor(Math.random() * (COLS-2)) + 1
        const ry = Math.floor(Math.random() * (ROWS-2)) + 1
        if(model.grid[ry][rx]._tag === "Empty") {
            goals.push({ pt: {x: rx, y: ry}, type: "wander", priority: 1 })
        }
    }

    goals.sort((a,b) => b.priority - a.priority)

    for (const g of goals) {
        if (dangerMap.has(getIntKey(g.pt.x, g.pt.y))) continue

        // Attack Logic: Plant if close
        if (g.type === "attack") {
            const d = getDist(bPos, g.pt)
            if (d <= config.plantDist && hasAmmo && isSafeToPlant(bot, model)) {
                nextBot.bot_should_plant = true
                nextBot.bot_state = "attack"
                return nextBot 
            }
        }

        const allowDig = (canDigAggressive && g.priority >= 2) || (g.type === "wander" && hasAmmo)
        const path = getShortestPath(bPos, g.pt, model.grid, model.bombs, model.explosions, dangerMap, allowDig)

        if (path.length > 0) {
            nextBot.bot_path = path
            nextBot.bot_state = g.type as any
            nextBot.bot_goal_x = g.pt.x
            nextBot.bot_goal_y = g.pt.y
            return nextBot
        }
    }

    nextBot.bot_state = "wander"
    nextBot.bot_path = []
    return nextBot
}

// --- MAIN UPDATE FUNCTION ---
export const updateBotLogic = (bot: Player, model: Model): Player => {
  let nextBot = { ...bot }
  nextBot.bot_should_plant = false

  const bx = Math.floor(bot.x_coordinate)
  const by = Math.floor(bot.y_coordinate)

  const dangerMap = getDangerMap(model.bombs, model.explosions, model.grid, bot)
  const inDanger = dangerMap.has(getIntKey(bx, by))
  const config = BOT_CONFIGS[bot.bot_type]

  // 1. DANGER HANDLING
  if (inDanger) {
      if (nextBot.bot_state !== "escape" || nextBot.bot_path.length === 0) {
          nextBot = decideEscape(nextBot, model, dangerMap)
      } else {
          // If our current escape path leads into danger, re-calculate
          const nextStep = nextBot.bot_path[0]
          if (dangerMap.has(getIntKey(nextStep.x, nextStep.y))) {
             nextBot = decideEscape(nextBot, model, dangerMap)
          }
      }
  } 
  // 2. NORMAL BEHAVIOR
  else {
      const thinkInterval = config.reevalInterval * FPS
      nextBot.bot_ticks_since_think += 1
      
      const needsThink = nextBot.bot_ticks_since_think > thinkInterval || 
                         nextBot.bot_path.length === 0 ||
                         (bx === nextBot.bot_goal_x && by === nextBot.bot_goal_y)

      if (needsThink) {
          // Check randomness only if we aren't stuck/idle
          const shouldReeval = nextBot.bot_path.length === 0 || Math.random() < config.reevalChance
          if (shouldReeval) {
              nextBot = decideGoal(nextBot, model, dangerMap)
              nextBot.bot_ticks_since_think = 0
          }
      }
  }

  // 3. MOVEMENT EXECUTION
  if (nextBot.bot_path.length > 0) {
      const nextCell = nextBot.bot_path[0]
      const cell = model.grid[nextCell.y][nextCell.x]

      // Handle Soft Blocks
      if (cell._tag === "SoftBlock") {
          if (bot.bombs_active < bot.max_bombs && isSafeToPlant(bot, model)) {
              nextBot.bot_should_plant = true
          } else {
              // Can't plant? Wait or Repath.
              // We do not remove the path node, so the bot waits here.
          }
      }
      // Handle Hard Blocks / Bombs
      else if (cell._tag === "HardBlock" || HM.has(model.bombs, getIntKey(nextCell.x, nextCell.y))) {
          // Blocked. Wait for bomb to explode.
      }
      // Move
      else {
          const targetX = nextCell.x + 0.5
          const targetY = nextCell.y + 0.5
          
          const dx = targetX - nextBot.x_coordinate
          const dy = targetY - nextBot.y_coordinate
          const speed = PLAYER_SPEED * nextBot.speed_multi

          const absDx = Math.abs(dx)
          const absDy = Math.abs(dy)
          
          // Axis-Aligned Movement (Prevents corner getting stuck)
          if (absDx > absDy) {
              if (absDx <= speed) nextBot.x_coordinate = targetX
              else nextBot.x_coordinate += Math.sign(dx) * speed
              
              if (absDy <= speed) nextBot.y_coordinate = targetY
              else nextBot.y_coordinate += Math.sign(dy) * speed 
          } else {
              if (absDy <= speed) nextBot.y_coordinate = targetY
              else nextBot.y_coordinate += Math.sign(dy) * speed

              if (absDx <= speed) nextBot.x_coordinate = targetX
              else nextBot.x_coordinate += Math.sign(dx) * speed
          }

          if (Math.abs(nextBot.x_coordinate - targetX) < 0.1 && Math.abs(nextBot.y_coordinate - targetY) < 0.1) {
              nextBot.bot_path = nextBot.bot_path.slice(1)
          }
      }
  }
 
  return nextBot
}