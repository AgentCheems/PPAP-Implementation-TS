import { Model, Bomb, Cell, GameStatus, Empty, HardBlock, SoftBlock,
ExplosionCell, Player, PowerUp, PowerupType, InputState } from "./model"
import { ROWS, COLS, TILE_SIZE, FPS, PLAYER_RADIUS,
    PLAYER_SPEED, BOMB_TIMER_SECONDS, EXPLOSION_DURATION_SECONDS,
    EXPLOSION_RANGE, GAME_DURATION_SECONDS, PLAYER_START_POSITIONS
} from "./constants"
import settings from "./settings.json"
import { Msg } from "./message"
import { Match, HashMap as HM, Array as A, pipe } from "effect"
import { getInputKey } from "./input"

const getIntKey = (x: number, y: number) => y * COLS + x

// Bot behavior constants for Phase 3
const BOT_PLANT_CHANCE = settings.botPlantChance || 0
const BOT_MOVE_CHANCE = settings.botMoveChance || 0

const triggerExplosion = (
    bomb: Bomb,
    grid: readonly (readonly Cell[])[],
    currentBombs: HM.HashMap<number, Bomb>,
    currentPowerups: HM.HashMap<number, PowerUp>
): {
    newExplosion: ExplosionCell[],
    hitBombs: number[],
    brokenSoftBlocks: {x: number, y: number}[],
    destroyedPowerups: number[]
} => {
    const newExplosion: ExplosionCell[] = []
    const hitBombs: number[] = []
    const brokenSoftBlocks: {x: number, y: number}[] = []
    const destroyedPowerups: number[] = []

    newExplosion.push({x: bomb.x, y: bomb.y, timer: EXPLOSION_DURATION_SECONDS * FPS, owner: bomb.owner })

    const dirs = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}]

    for (const dir of dirs) {
        for (let i = 1; i <= bomb.range; i++) {
            const tx = bomb.x + (dir.dx * i)
            const ty = bomb.y + (dir.dy * i)
            if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) break

            const cell = grid[ty][tx]
            if (cell._tag === "HardBlock") break

            if (cell._tag === "SoftBlock") {
                newExplosion.push({ x: tx, y: ty, timer: EXPLOSION_DURATION_SECONDS * FPS, owner: bomb.owner })
                brokenSoftBlocks.push({x: tx, y: ty})
                break
            }

            const bombKey = getIntKey(tx, ty)
            if (HM.has(currentBombs, bombKey)) {
                hitBombs.push(bombKey)
                newExplosion.push({ x: tx, y: ty, timer: EXPLOSION_DURATION_SECONDS * FPS, owner: bomb.owner })
                continue
            }
            if (HM.has(currentPowerups, bombKey)) {
                destroyedPowerups.push(bombKey)
            }
            newExplosion.push({ x: tx, y: ty, timer: EXPLOSION_DURATION_SECONDS * FPS, owner: bomb.owner })
        }
    }
    return { newExplosion, hitBombs, brokenSoftBlocks, destroyedPowerups }
}

const isTileBlocked = (grid: readonly (readonly Cell[])[], bombs:
    HM.HashMap<number, Bomb>, tile_x: number, tile_y: number): boolean => {
    if (tile_x < 0 || tile_x > COLS - 1 || tile_y < 0 || tile_y > ROWS - 1)
        return true
    const cell = grid[tile_y][tile_x]
    if (cell._tag === "HardBlock" || cell._tag === "SoftBlock") return true
    // cannot walk thru bombs (unless bagong lapag lang)
    if (HM.has(bombs, getIntKey(tile_x, tile_y))) return true
    return false
}

const tryWalk = (player: Player, dx: number, dy: number, grid: Cell[][], bombs:
    HM.HashMap<number, Bomb>): Player => {
    const isMoving = Math.abs(player.x_coordinate - player.target_x) > 0.05 ||
        Math.abs(player.y_coordinate - player.target_y) > 0.05
    if (isMoving) {
        let nextPlayer = {...player}
        const speed = PLAYER_SPEED * player.speed_multi
        // Move X
        if (nextPlayer.x_coordinate < nextPlayer.target_x) {
            nextPlayer.x_coordinate = Math.min(nextPlayer.x_coordinate + speed, nextPlayer.target_x)
        } else if (nextPlayer.x_coordinate > nextPlayer.target_x) {
            nextPlayer.x_coordinate = Math.max(nextPlayer.x_coordinate - speed, nextPlayer.target_x)
        }
        // Move Y
        if (nextPlayer.y_coordinate < nextPlayer.target_y) {
            nextPlayer.y_coordinate = Math.min(nextPlayer.y_coordinate + speed, nextPlayer.target_y)
        } else if (nextPlayer.y_coordinate > nextPlayer.target_y) {
            nextPlayer.y_coordinate = Math.max(nextPlayer.y_coordinate - speed, nextPlayer.target_y)
        }
        return nextPlayer
    }

    if (dx == 0 && dy == 0) return player

    const target_x = player.target_x + dx
    const target_y = player.target_y + dy

    if (!isTileBlocked(grid, bombs, Math.floor(target_x), Math.floor(target_y))) {
        return {
            ...player,
            target_x: target_x,
            target_y: target_y
        }
    }
    return player
}

const handleBombPlant = (p: Player, planted: boolean, owner: string, bombs:
HM.HashMap<number, Bomb>): HM.HashMap<number, Bomb> => {
    if (planted && p.is_alive) {
        const bx = Math.floor(p.x_coordinate)
        const by = Math.floor(p.y_coordinate)
        const k = getIntKey(bx, by)
        const activeCount = HM.reduce(bombs, 0, (acc, bomb) =>
            bomb.owner === owner ? acc + 1 : acc)
        if (activeCount < p.max_bombs && !HM.has(bombs, k)) {
            return HM.set(bombs, k, Bomb.make({
                id: `${owner}_${Date.now()}`,
                x: bx,
                y: by,
                timer: BOMB_TIMER_SECONDS * FPS,
                range: p.bomb_range,
                owner: owner
            }))
        }
    }
    return bombs
}

// Check if a cell is dangerous
const isCellDangerous = (
    x: number, 
    y: number, 
    bombs: HM.HashMap<number, Bomb>, 
    explosions: ExplosionCell[]
): boolean => {
    // Check if cell has an active explosion
    for (const exp of explosions) {
        if (exp.x === x && exp.y === y && exp.timer > 0) {
            return true
        }
    }
    
    // Check if cell has a bomb
    const bombKey = getIntKey(x, y)
    if (HM.has(bombs, bombKey)) {
        return true
    }
    
    // Check if cell is in range of any bomb
    let isDangerous = false
    
    HM.forEach(bombs, (bomb) => {
        // Skip if bomb just planted (give time to escape)
        if (bomb.timer > BOMB_TIMER_SECONDS * FPS * 0.7) {
            return // Bomb just planted, not immediately dangerous
        }
        
        // Check if on same row and within range
        if (bomb.y === y) {
            const dx = Math.abs(bomb.x - x)
            if (dx <= bomb.range && dx > 0) {
                isDangerous = true
            }
        }
        // Check if on same column and within range
        else if (bomb.x === x) {
            const dy = Math.abs(bomb.y - y)
            if (dy <= bomb.range && dy > 0) {
                isDangerous = true
            }
        }
    })
    
    return isDangerous
}

// Check if bot is in danger
const isBotInDanger = (
    player: Player, 
    bombs: HM.HashMap<number, Bomb>, 
    explosions: ExplosionCell[]
): boolean => {
    const playerX = Math.floor(player.x_coordinate)
    const playerY = Math.floor(player.y_coordinate)
    
    return isCellDangerous(playerX, playerY, bombs, explosions)
}

// Calculate danger level of a cell (0 = safe, higher = more dangerous)
const getCellDangerLevel = (
    x: number, 
    y: number, 
    bombs: HM.HashMap<number, Bomb>, 
    explosions: ExplosionCell[]
): number => {
    let dangerLevel = 0
    
    // Check explosions (very dangerous)
    for (const exp of explosions) {
        if (exp.x === x && exp.y === y && exp.timer > 0) {
            dangerLevel += 100
        }
    }
    
    // Check bombs
    HM.forEach(bombs, (bomb) => {
        // Calculate distance
        const dx = Math.abs(bomb.x - x)
        const dy = Math.abs(bomb.y - y)
        
        // If bomb is at this cell
        if (dx === 0 && dy === 0) {
            dangerLevel += 50
        }
        // If in explosion range
        else if ((dx === 0 && dy <= bomb.range) || (dy === 0 && dx <= bomb.range)) {
            // More dangerous if bomb is about to explode
            const timeFactor = 1.0 - (bomb.timer / (BOMB_TIMER_SECONDS * FPS))
            dangerLevel += Math.floor(30 * timeFactor)
        }
    })
    
    return dangerLevel
}

// NEW: Track bot movement state
const botMovementStates = new Map<string, {
    lastMoveTime: number,
    currentDirection: {dx: number, dy: number} | null,
    isMoving: boolean
}>()

// Get or create bot movement state
const getBotMovementState = (owner: string) => {
    if (!botMovementStates.has(owner)) {
        botMovementStates.set(owner, {
            lastMoveTime: 0,
            currentDirection: null,
            isMoving: false
        })
    }
    return botMovementStates.get(owner)!
}

// NEW: Bot movement that matches human movement (one square at a time)
const botTryWalk = (
    player: Player, 
    dx: number, 
    dy: number, 
    grid: Cell[][], 
    bombs: HM.HashMap<number, Bomb>,
    owner: string,
    currentTime: number
): Player => {
    const movementState = getBotMovementState(owner)
    
    // Check if bot is currently moving to a target
    const isMoving = Math.abs(player.x_coordinate - player.target_x) > 0.05 ||
        Math.abs(player.y_coordinate - player.target_y) > 0.05
    
    if (isMoving) {
        // Continue current movement
        movementState.isMoving = true
        let nextPlayer = {...player}
        const speed = PLAYER_SPEED * player.speed_multi
        
        // Move X
        if (nextPlayer.x_coordinate < nextPlayer.target_x) {
            nextPlayer.x_coordinate = Math.min(nextPlayer.x_coordinate + speed, nextPlayer.target_x)
        } else if (nextPlayer.x_coordinate > nextPlayer.target_x) {
            nextPlayer.x_coordinate = Math.max(nextPlayer.x_coordinate - speed, nextPlayer.target_x)
        }
        // Move Y
        if (nextPlayer.y_coordinate < nextPlayer.target_y) {
            nextPlayer.y_coordinate = Math.min(nextPlayer.y_coordinate + speed, nextPlayer.target_y)
        } else if (nextPlayer.y_coordinate > nextPlayer.target_y) {
            nextPlayer.y_coordinate = Math.max(nextPlayer.y_coordinate - speed, nextPlayer.target_y)
        }
        
        // Check if reached target
        if (Math.abs(nextPlayer.x_coordinate - nextPlayer.target_x) < 0.05 &&
            Math.abs(nextPlayer.y_coordinate - nextPlayer.target_y) < 0.05) {
            movementState.isMoving = false
            movementState.currentDirection = null
        }
        
        return nextPlayer
    }
    
    // Not moving, check if we should start a new movement
    if (dx === 0 && dy === 0) {
        return player
    }
    
    // Only start new movement if enough time has passed since last move
    // This prevents bots from moving too fast
    const timeSinceLastMove = currentTime - movementState.lastMoveTime
    const minMoveInterval = 0.3 // seconds between moves (adjust as needed)
    
    if (timeSinceLastMove < minMoveInterval * FPS) {
        return player
    }
    
    const target_x = player.target_x + dx
    const target_y = player.target_y + dy

    if (!isTileBlocked(grid, bombs, Math.floor(target_x), Math.floor(target_y))) {
        movementState.lastMoveTime = currentTime
        movementState.currentDirection = {dx, dy}
        movementState.isMoving = true
        
        return {
            ...player,
            target_x: target_x,
            target_y: target_y
        }
    }
    
    return player
}

// Find the safest direction
const findSafestDirection = (
    player: Player, 
    grid: Cell[][], 
    bombs: HM.HashMap<number, Bomb>, 
    explosions: ExplosionCell[]
): {dx: number, dy: number} => {
    const directions = [
        { dx: 0, dy: -1, name: "up" },    // up
        { dx: 0, dy: 1, name: "down" },   // down
        { dx: -1, dy: 0, name: "left" },  // left
        { dx: 1, dy: 0, name: "right" },  // right
        { dx: 0, dy: 0, name: "stay" }    // stay (last resort)
    ]
    
    const playerX = Math.floor(player.target_x)
    const playerY = Math.floor(player.target_y)
    
    // Evaluate each direction
    const evaluatedDirs = directions.map(dir => {
        const targetX = playerX + dir.dx
        const targetY = playerY + dir.dy
        
        // Check if tile is walkable
        const isWalkable = !isTileBlocked(grid, bombs, targetX, targetY)
        
        // Calculate danger level at target position
        const dangerLevel = isWalkable ? getCellDangerLevel(targetX, targetY, bombs, explosions) : 999
        
        // Prefer moving over staying if possible
        const moveBonus = (dir.dx !== 0 || dir.dy !== 0) ? -5 : 0
        
        return {
            ...dir,
            isWalkable,
            dangerLevel: dangerLevel + moveBonus,
            distanceFromCenter: Math.abs(dir.dx) + Math.abs(dir.dy) // Prefer moving away
        }
    })
    
    // Filter to only walkable directions
    const walkableDirs = evaluatedDirs.filter(dir => dir.isWalkable)
    
    if (walkableDirs.length === 0) {
        return { dx: 0, dy: 0 } // No safe direction, stay put
    }
    
    // Sort by danger level (lowest danger first), then by distance from center
    walkableDirs.sort((a, b) => {
        if (a.dangerLevel !== b.dangerLevel) {
            return a.dangerLevel - b.dangerLevel
        }
        return b.distanceFromCenter - a.distanceFromCenter // Prefer moving away
    })
    
    // Return the safest direction
    return { dx: walkableDirs[0].dx, dy: walkableDirs[0].dy }
}

// Check if there's an escape route from a bomb
const hasEscapeRoute = (
    player: Player,
    bombX: number,
    bombY: number,
    bombRange: number,
    grid: Cell[][],
    bombs: HM.HashMap<number, Bomb>
): boolean => {
    const playerX = Math.floor(player.x_coordinate)
    const playerY = Math.floor(player.y_coordinate)
    
    // Check if player is in bomb's explosion line
    const inHorizontalLine = playerY === bombY && Math.abs(playerX - bombX) <= bombRange
    const inVerticalLine = playerX === bombX && Math.abs(playerY - bombY) <= bombRange
    
    if (!inHorizontalLine && !inVerticalLine) {
        return true // Not in explosion line
    }
    
    // Find safe directions
    const directions = [
        { dx: 0, dy: -1 },  // up
        { dx: 0, dy: 1 },   // down
        { dx: -1, dy: 0 },  // left
        { dx: 1, dy: 0 }    // right
    ]
    
    for (const dir of directions) {
        const targetX = playerX + dir.dx
        const targetY = playerY + dir.dy
        
        // Check if this direction moves away from bomb
        const movesAwayHorizontally = inHorizontalLine && 
            ((playerX < bombX && dir.dx < 0) || (playerX > bombX && dir.dx > 0))
        const movesAwayVertically = inVerticalLine &&
            ((playerY < bombY && dir.dy < 0) || (playerY > bombY && dir.dy > 0))
        
        if ((inHorizontalLine && movesAwayHorizontally) || 
            (inVerticalLine && movesAwayVertically) ||
            (!inHorizontalLine && !inVerticalLine)) {
            
            // Check if target tile is walkable and safe
            if (!isTileBlocked(grid, bombs, targetX, targetY)) {
                return true
            }
        }
    }
    
    return false
}

// Should plant bomb with escape route check
const shouldPlantBomb = (
    player: Player, 
    grid: Cell[][], 
    bombs: HM.HashMap<number, Bomb>,
    explosions: ExplosionCell[],
    owner: string
): boolean => {
    const playerX = Math.floor(player.x_coordinate)
    const playerY = Math.floor(player.y_coordinate)
    
    // Don't plant if in immediate danger
    if (isBotInDanger(player, bombs, explosions)) {
        return false
    }
    
    // Check bomb limit
    const activeCount = HM.reduce(bombs, 0, (acc, bomb) => 
        bomb.owner === owner ? acc + 1 : acc)
    if (activeCount >= player.max_bombs) {
        return false
    }
    
    // Check if bomb already exists at this location
    const bombKey = getIntKey(playerX, playerY)
    if (HM.has(bombs, bombKey)) {
        return false
    }
    
    // Check if there's a soft block nearby
    const directions = [
        { dx: 0, dy: -1 },  // up
        { dx: 0, dy: 1 },   // down
        { dx: -1, dy: 0 },  // left
        { dx: 1, dy: 0 }    // right
    ]
    
    let hasSoftBlockTarget = false
    
    for (const dir of directions) {
        for (let i = 1; i <= player.bomb_range; i++) {
            const tx = playerX + (dir.dx * i)
            const ty = playerY + (dir.dy * i)
            
            if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) break
            
            const cell = grid[ty][tx]
            if (cell._tag === "HardBlock") break
            
            if (cell._tag === "SoftBlock") {
                hasSoftBlockTarget = true
                break
            }
        }
        if (hasSoftBlockTarget) break
    }
    
    // Check if there's an escape route after planting
    const simulatedBombs = HM.set(bombs, bombKey, Bomb.make({
        id: `${owner}_simulated`,
        x: playerX,
        y: playerY,
        timer: BOMB_TIMER_SECONDS * FPS,
        range: player.bomb_range,
        owner: owner
    }))
    
    const hasEscape = hasEscapeRoute(player, playerX, playerY, player.bomb_range, grid, simulatedBombs)
    
    // Only plant if:
    // 1. There's a good target (soft block) AND there's an escape route, OR
    // 2. Small random chance (much smaller)
    if (hasSoftBlockTarget && hasEscape) {
        return true
    }
    
    // Very small random chance for strategic planting
    return Math.random() * 100 < (BOT_PLANT_CHANCE * 0.1)
}

// Bot behavior function
const updateBot = (
    player: Player, 
    grid: Cell[][], 
    bombs: HM.HashMap<number, Bomb>, 
    explosions: ExplosionCell[],
    owner: string,
    currentTime: number
): { player: Player, bombs: HM.HashMap<number, Bomb> } => {
    if (!player.is_alive || !player.isBot) return { player, bombs }
    
    let nextPlayer = { ...player }
    let nextBombs = bombs
    
    // titignan niya if safe na ung bot
    if (isBotInDanger(player, bombs, explosions)) {
        // Find safest direction and move there
        const safeDir = findSafestDirection(player, grid, bombs, explosions)
        nextPlayer = botTryWalk(nextPlayer, safeDir.dx, safeDir.dy, grid, nextBombs, owner, currentTime)
        return { player: nextPlayer, bombs: nextBombs }
    }
    
    // plant bomb
    if (shouldPlantBomb(player, grid, bombs, explosions, owner)) {
        const bx = Math.floor(nextPlayer.x_coordinate)
        const by = Math.floor(nextPlayer.y_coordinate)
        const k = getIntKey(bx, by)
        const activeCount = HM.reduce(bombs, 0, (acc, bomb) => 
            bomb.owner === owner ? acc + 1 : acc)
        
        if (activeCount < nextPlayer.max_bombs && !HM.has(bombs, k)) {
            nextBombs = HM.set(bombs, k, Bomb.make({
                id: `${owner}_${Date.now()}`,
                x: bx,
                y: by,
                timer: BOMB_TIMER_SECONDS * FPS,
                range: nextPlayer.bomb_range,
                owner: owner
            }))
            
            // if nasa range ng bomba stay away !!
            const safeDir = findSafestDirection(player, grid, nextBombs, explosions)
            nextPlayer = botTryWalk(nextPlayer, safeDir.dx, safeDir.dy, grid, nextBombs, owner, currentTime)
        }
    }
    
    // gagalaw bot if safe
    if (Math.random() * 100 < BOT_MOVE_CHANCE) {
        // Get current danger at player position
        const currentDanger = getCellDangerLevel(
            Math.floor(player.x_coordinate),
            Math.floor(player.y_coordinate),
            bombs,
            explosions
        )
        
        if (currentDanger === 0) {
            const directions = [
                { dx: 0, dy: -1 },  // up
                { dx: 0, dy: 1 },   // down
                { dx: -1, dy: 0 },  // left
                { dx: 1, dy: 0 }    // right
            ]
            
            const safeDirs = directions.filter(dir => {
                const target_x = Math.floor(nextPlayer.target_x + dir.dx)
                const target_y = Math.floor(nextPlayer.target_y + dir.dy)
                return !isTileBlocked(grid, bombs, target_x, target_y) && 
                       getCellDangerLevel(target_x, target_y, bombs, explosions) === 0
            })
            
            if (safeDirs.length > 0) {
                const randomDir = safeDirs[Math.floor(Math.random() * safeDirs.length)]
                nextPlayer = botTryWalk(nextPlayer, randomDir.dx, randomDir.dy, grid, nextBombs, owner, currentTime)
            }
        }
    }
    
    return { player: nextPlayer, bombs: nextBombs }
}

export const update = (msg: Msg, model: Model): Model => {
    // di ko mapagana match required ba un HDASHHDASH
    if (msg._tag === "Canvas.MsgTick") {
        if (model.status !== GameStatus.PLAYING) return model

        const keyInput = getInputKey()

        const p1_planted = keyInput.space && !model.input.space
        const p2_planted = keyInput.x && !model.input.x

        const newKeyInput = InputState.make(keyInput)

        // HANDLES TIMERS
        let newTimeLeft = model.timeLeft
        const newTickAcc = model.timeTickAcc + 1 // increments the counter every single frame
        if (newTickAcc % FPS === 0) { // checks for remainder (30%30 === 0, 60%30 === 0)
            newTimeLeft = Math.max(0, newTimeLeft - 1) // so if 30 frames has passed, 1 second has passed
        }
        if (newTimeLeft === 0) {
            return { ...model, status: GameStatus.DRAW, timeLeft: 0 }
        }

        // HANDLES BOMB/EXPLOSION TIMERS
        let newGrid = [...model.grid.map(row => [...row])]
        let newBombs = model.bombs
        let newPowerups = model.powerups
        let newExplosions = [...model.explosions]

        // DECREASE EXPLOSION TIMERS
        newExplosions = newExplosions
            .map(exp => ({...exp, timer: exp.timer - 1}))
            .filter(exp => exp.timer > 0)

        // DECREASE BOMB TIMERS
        const bombsToExplode: number[] = []
        newBombs = HM.map(newBombs, (bomb) => ({
            ...bomb,
            timer: bomb.timer - 1
        }))
        HM.forEach(newBombs, (bomb, key) => {
            if (bomb.timer <= 0) {
                bombsToExplode.push(key)
            }
        })
        
        // handling chain bomb reaction
        const processingQueue = [...bombsToExplode]
        const processedBombs = new Set<number>()

        while (processingQueue.length > 0) {
            const key = processingQueue.shift()!
            if (processedBombs.has(key)) continue
            processedBombs.add(key)

            const b = HM.get(newBombs, key)
            if (b._tag == "None") continue
            const bombData = b.value
            
            const result = triggerExplosion(bombData, newGrid, newBombs, newPowerups)
            newExplosions.push(...result.newExplosion)
            
            result.destroyedPowerups.forEach(pow => { 
                newPowerups = HM.remove(newPowerups, pow)
            })
            
            result.brokenSoftBlocks.forEach(pos => { 
                newGrid[pos.y][pos.x] = Empty.make({})
                
                // pag nakasira ng softblock, spawn powerup
                if ((Math.random() * 100) < settings.powerupChance) {
                    const prob = Math.random()
                    let type = PowerupType.SpeedUp
                    if (prob < 0.33) type = PowerupType.FireUp
                    else if (prob < 0.66) type = PowerupType.BombUp

                    const k = getIntKey(pos.x, pos.y)
                    newPowerups = HM.set(newPowerups, k, PowerUp.make({
                        type: type,
                        x: pos.x,
                        y: pos.y
                    }))
                }
            })
            
            // chain reaction pag nakahit ng di pa nageexplode na bomb
            result.hitBombs.forEach(k => { 
                if (!processedBombs.has(k)) processingQueue.push(k) 
            })

            // remove bombs sa hashmap once exploded
            newBombs = HM.remove(newBombs, key)
        }

        // HANDLES PLAYER MOVEMENT
        let p1 = {...model.player1}
        let p2 = {...model.player2}
        let p3 = model.player3 ? {...model.player3} : undefined

        // HANDLES P1 (always human)
        if (p1.is_alive) {
            let dx = 0
            let dy = 0
            if (newKeyInput.up) dy = -1
            else if (newKeyInput.down) dy = 1
            else if (newKeyInput.left) dx = -1
            else if (newKeyInput.right) dx = 1
            p1 = tryWalk(p1, dx, dy, newGrid, newBombs)
            newBombs = handleBombPlant(p1, p1_planted, "P1", newBombs)
        }

        // HANDLES P2 (human or bot based on settings)
        if (p2.is_alive) {
            if (p2.isBot) {
                // Bot behavior for P2 with discrete movement
                const botResult = updateBot(p2, newGrid, newBombs, newExplosions, "P2", model.lastTickTime)
                p2 = botResult.player
                newBombs = botResult.bombs
            } else {
                // Human control for P2
                let dx = 0
                let dy = 0
                if (newKeyInput.w) dy = -1
                else if (newKeyInput.s) dy = 1
                else if (newKeyInput.a) dx = -1
                else if (newKeyInput.d) dx = 1
                p2 = tryWalk(p2, dx, dy, newGrid, newBombs)
                newBombs = handleBombPlant(p2, p2_planted, "P2", newBombs)
            }
        }

        // HANDLES P3 (always bot if present)
        if (p3 && p3.is_alive) {
            const botResult = updateBot(p3, newGrid, newBombs, newExplosions, "P3", model.lastTickTime)
            p3 = botResult.player
            newBombs = botResult.bombs
        }

        // COLLISION CHECKING
        const checkCollisions = (player: Player): Player => {
            if (!player.is_alive) return player
            let nextPlayer = { ...player }
            const cx = nextPlayer.x_coordinate
            const cy = nextPlayer.y_coordinate
            const tile_x = Math.floor(cx)
            const tile_y = Math.floor(cy)

            const key = getIntKey(tile_x, tile_y)
            const pu = HM.get(newPowerups, key)
            if (pu._tag === "Some") {
                if (Math.abs(cx-(tile_x+0.5)) < 0.4 && Math.abs(cy-(tile_y+0.5)) < 0.4) {
                    const powerup = pu.value
                    if (powerup.type === PowerupType.BombUp)
                        nextPlayer.max_bombs += 1
                    if (powerup.type === PowerupType.FireUp)
                        nextPlayer.bomb_range += 1
                    if (powerup.type === PowerupType.SpeedUp)
                        nextPlayer.speed_multi += 0.3
                    newPowerups = HM.remove(newPowerups, key)
                }
            }

            // Explosions
            for (const exp of newExplosions) {
                if (tile_x === exp.x && tile_y === exp.y) {
                    // Hit!
                    nextPlayer.is_alive = false
                    nextPlayer.death_tick_delay = model.lastTickTime
                }
            }

            return nextPlayer
        }

        p1 = checkCollisions(p1)
        p2 = checkCollisions(p2)
        if (p3) p3 = checkCollisions(p3)

        const countBombs = (owner: string) => HM.reduce(newBombs, 0, (acc,b) => b.owner == owner ? acc + 1 : acc)
        p1.bombs_active = countBombs('P1')
        p2.bombs_active = countBombs('P2')
        if (p3) p3.bombs_active = countBombs('P3')

        let nextStatus = model.status
        
        // Check win conditions
        const alivePlayers: string[] = []
        if (p1.is_alive) alivePlayers.push("P1")
        if (p2.is_alive) alivePlayers.push("P2")
        if (p3 && p3.is_alive) alivePlayers.push("P3")
        
        // If only one player alive
        if (alivePlayers.length === 1) {
            const winner = alivePlayers[0]
            if (winner === "P1") nextStatus = GameStatus.P1_WIN
            else if (winner === "P2") nextStatus = GameStatus.P2_WIN
            else if (winner === "P3") nextStatus = GameStatus.P3_WIN
        } else if (newTimeLeft === 0 || alivePlayers.length === 0) {
            // Draw conditions: time runs out or all players dead simultaneously
            nextStatus = GameStatus.DRAW
        }
        
        // Handle delayed win conditions
        if (!p1.is_alive && p2.is_alive && (!p3 || !p3.is_alive)) {
            if (model.lastTickTime - p1.death_tick_delay > FPS) {
                nextStatus = GameStatus.P2_WIN
            }
        } else if (!p2.is_alive && p1.is_alive && (!p3 || !p3.is_alive)) {
            if (model.lastTickTime - p2.death_tick_delay > FPS) {
                nextStatus = GameStatus.P1_WIN
            }
        } else if (p3 && !p1.is_alive && !p2.is_alive && p3.is_alive) {
            // P3 wins if P1 and P2 are dead
            nextStatus = GameStatus.P3_WIN
        }

        return {
            ...model,
            status: nextStatus,
            grid: newGrid,
            bombs: newBombs,
            powerups: newPowerups,
            explosions: newExplosions,
            player1: p1,
            player2: p2,
            player3: p3,
            input: newKeyInput,
            timeTickAcc: newTickAcc >= FPS ? 0 : newTickAcc,
            timeLeft: newTimeLeft,
            lastTickTime: model.lastTickTime + 1
        }
    } 
    else if (msg._tag === "Canvas.MsgKeyDown") {
        return model
    }
    else if (msg._tag === "Restart") {
        return model
    }
    else if (msg._tag === "Canvas.MsgMouseDown") {
        return model
    }
    else {
        // Handle any other message types
        return model
    }
}