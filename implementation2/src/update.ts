import { Model, Bomb, Cell, GameStatus, Empty, HardBlock, SoftBlock,
ExplosionCell, Player, PowerUp, PowerupType, InputState, 
initModel} from "./model"
import { ROWS, COLS, TILE_SIZE, FPS, PLAYER_RADIUS,
    PLAYER_SPEED, BOMB_TIMER_SECONDS, EXPLOSION_DURATION_SECONDS,
    EXPLOSION_RANGE, GAME_DURATION_SECONDS, PLAYER_START_POSITIONS
} from "./constants"
import settings from "./settings.json"
import { Msg } from "./message"
import { Match, HashMap as HM, Array as A, pipe } from "effect"
import { getInputKey } from "./input"
import { updateBotLogic } from "./bot"

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


export const update = (msg: Msg, model: Model): Model => {
    return Match.value(msg).pipe(
        Match.tag("Canvas.MsgTick", () => {
        if (model.status !== GameStatus.PLAYING) return model

            const keyInput = getInputKey()
            const newKeyInput = InputState.make(keyInput)
            const p1_planted = keyInput.space && !model.input.space
            const p2_planted = keyInput.x && !model.input.x
            const debugToggled = keyInput.escape && !model.input.escape
            const nextDebugMode = debugToggled ? !model.debugMode : model.debugMode

            // 1. TIMER
            let newTimeLeft = model.timeLeft 
            const newTickAcc = model.timeTickAcc + 1 // increments the counter every single frame
            if (newTickAcc % FPS === 0) { // checks for remainder (30%30 === 0, 60%30 === 0)
                newTimeLeft = Math.max(0, newTimeLeft - 1) // so if 30 frames has passed, 1 second has passed
            }
            if (newTimeLeft === 0) {
                return { ...model, status: GameStatus.DRAW, timeLeft: 0, input: newKeyInput, debugMode: nextDebugMode}
            }

            // 2. STATE COPIES
            let newGrid = [...model.grid.map(row => [...row])]
            let newPowerups = model.powerups
            let newExplosions = [...model.explosions]
            let newBombs = model.bombs
            
            // 3. MANAGE ENTITY TIMERS
            // a. decrease explosion timers
            newExplosions = newExplosions
            .map(exp => ({...exp, timer: exp.timer - 1}))
            .filter(exp => exp.timer > 0)
            
            // b. decrease bomb timers
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
            
            // 4. HANDLING BOMB CHAIN REACTIONS
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
                
                result.destroyedPowerups.forEach(pow => {newPowerups = HM.remove(newPowerups, pow)})  
                result.brokenSoftBlocks.forEach(pos => { 
                    newGrid[pos.y][pos.x] = Empty.make({})
                    // pag nakasira ng softblock, spawn powerup
                    if ((Math.random() * 100) < settings.powerupChance) {
                        const prob = Math.random()
                        let type = PowerupType.SpeedUp
                        if (prob < 0.33) {
                            type = PowerupType.FireUp
                        }
                        else if (prob < 0.66) {
                            type = PowerupType.BombUp
                        }
                        const k = getIntKey(pos.x, pos.y)
                        newPowerups = HM.set(newPowerups, k, PowerUp.make({
                            type: type,
                            x: pos.x,
                            y: pos.y
                        }))
                    }
                })
                // chain reaction pag nakahit ng di pa nageexplode na bomb
                result.hitBombs.forEach(k => {if (!processedBombs.has(k)) processingQueue.push(k)})
                // remove bombs sa hashmap once exploded
                newBombs = HM.remove(newBombs, key)
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
                        // bogsh !
                        nextPlayer.is_alive = false
                        nextPlayer.death_tick_delay = model.lastTickTime
                    }
                }
                return nextPlayer
            }

            // 5. UPDATE PLAYERS
            const NewInitializedModel: Model = {
                ...model,
                grid: newGrid,
                bombs: newBombs,
                powerups: newPowerups,
                explosions: newExplosions
            }

            const nextPlayers = model.players.map(p => {
                if (!p.is_alive) return p

                // A/ Bot handling
                if (p.is_bot) {
                    let botPlayer = updateBotLogic(p, NewInitializedModel)
                    newBombs = handleBombPlant(botPlayer, botPlayer.bot_should_plant, p.id, newBombs)
                    botPlayer = checkCollisions(botPlayer)
                    return {
                        ...botPlayer,
                        bombs_active: HM.reduce(newBombs, 0, (acc, b) => b.owner === p.id ? acc + 1 : acc)
                    }
                    
                }

                // B. Human Hnadling\
                let dx = 0, dy = 0, plant = false
                // P1
                if (p.id === "P1") {
                    if (newKeyInput.up) dy = -1
                    else if (newKeyInput.down) dy = 1
                    else if (newKeyInput.left) dx = -1
                    else if (newKeyInput.right) dx = 1
                    if (p1_planted) plant = true
                }
                // P2
                else if (p.id === "P2") {
                    if (newKeyInput.w) dy = -1
                    else if (newKeyInput.s) dy = 1
                    else if (newKeyInput.a) dx = -1
                    else if (newKeyInput.d) dx = 1
                    if (p2_planted) plant = true
                }
            
                let walkPlayer = tryWalk(p, dx, dy, newGrid, newBombs)
                newBombs = handleBombPlant(walkPlayer, plant, p.id, newBombs)
                walkPlayer = checkCollisions(walkPlayer)
                const updatedWalkPlayer = {
                    ...walkPlayer,
                    bombs_active: HM.reduce(newBombs, 0, (acc, b) => b.owner === p.id ? acc + 1 : acc)
                }
                return walkPlayer
            })

            // 6. WIN cONDITIONS
            let nextStatus = model.status
            const alivePlayers = nextPlayers.filter(p => p.is_alive)

            if (alivePlayers.length === 1) {
                const winner = alivePlayers[0].id
                if (winner === "P1") nextStatus = GameStatus.P1_WIN
                if (winner === "P2") nextStatus = GameStatus.P2_WIN
                if (winner === "P3") nextStatus = GameStatus.P3_WIN
                if (winner === "P4") nextStatus = GameStatus.P4_WIN    
            }
            else if (alivePlayers.length === 0) {
                nextStatus = GameStatus.DRAW
            }

            return {
                ...model,
                status: nextStatus,
                grid: newGrid,
                bombs: newBombs,
                powerups: newPowerups,
                explosions: newExplosions,
                players: nextPlayers,
                input: newKeyInput,
                timeTickAcc: newTickAcc >= FPS ? 0 : newTickAcc,
                timeLeft: newTimeLeft,
                lastTickTime: model.lastTickTime + 1,
                debugMode: nextDebugMode
            }
        }),
        Match.tag("Canvas.MsgKeyDown", () => model),
        Match.tag("Canvas.MsgMouseDown", () => model),
        Match.tag("Restart", () => initModel),
        Match.exhaustive
    )
}
