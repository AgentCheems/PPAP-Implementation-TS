import { Model, Bomb, Cell, GameStatus, Empty, HardBlock, SoftBlock, ExplosionCell, Player, PowerUp, PowerupType, InputState } from "./model" 
import { ROWS, COLS, TILE_SIZE, FPS, PLAYER_RADIUS, 
    PLAYER_SPEED, BOMB_TIMER_SECONDS, EXPLOSION_DURATION_SECONDS, 
    EXPLOSION_RANGE, GAME_DURATION_SECONDS
} from "./constants"
import settings from "./settings.json"
import { Msg } from "./message"
import { Match, HashMap as HM, Array as A, pipe } from "effect"
import { getInputKey } from "./input"

const getIntKey = (x: number, y: number) => y * COLS + x

const triggerExplosion = (
    bomb: Bomb,
    grid: readonly (readonly Cell[])[], 
    currentBombs: HM.HashMap<number, Bomb>,
    currentPowerups: HM.HashMap<number, PowerUp>
): { 
    newExplosion: ExplosionCell[],
    hitBombs: number[],
    brokenSoftBlocks: {x: number, y: number}[]
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
            if (cell._tag === "HardBlock") break;

            if (cell._tag === "SoftBlock") {
                newExplosion.push({ x: tx, y: ty, timer: EXPLOSION_DURATION_SECONDS * FPS, owner: bomb.owner})
                brokenSoftBlocks.push({x: tx, y: ty})
                break;
            }

            const bombKey = getIntKey(tx, ty)
            if (HM.has(currentBombs, bombKey)) {
                hitBombs.push(bombKey)
                newExplosion.push({ x: tx, y: ty, timer: EXPLOSION_DURATION_SECONDS * FPS, owner: bomb.owner })
                continue;
            }

            if (HM.has(currentPowerups, bombKey)) {
                destroyedPowerups.push(bombKey)
            }
            newExplosion.push({ x: tx, y: ty, timer: EXPLOSION_DURATION_SECONDS * FPS, owner: bomb.owner })
        }
    }
    return { newExplosion, hitBombs, brokenSoftBlocks, destroyedPowerups }
}

const isTileBlocked = (grid: readonly(readonly Cell[])[], bombs: HM.HashMap<number, Bomb>, tile_x: number, tile_y: number): boolean => {
    if (tile_x < 0 || tile_x > COLS - 1 || tile_y < 0 || tile_y > ROWS - 1) return true

    const cell = grid[tile_y][tile_x]
    if (cell._tag === "HardBlock" || cell._tag === "SoftBlock") return true
    // cannot walk thru bombs (unless bagong lapag lang)
    if (HM.has(bombs, getIntKey(tile_x, tile_y))) return true
    return false
}

const tryWalk = (player: Player, dx: number, dy: number, grid: Cell[][], bombs: HM.HashMap<number, Bomb>): Player => {
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
            
            if (dx === 0 && dy === 0) return player

            const target_x = player.target_x + dx //confusing ba ung naming omg whtff
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

const handleBombPlant = (p: Player, planted: boolean, owner: string, bombs: HM.HashMap<number, Bomb>): HM.HashMap<number, Bomb> => {
                if (planted && p.is_alive) {
                    const bx = Math.floor(p.x_coordinate)
                    const by = Math.floor(p.y_coordinate)
                    const k = getIntKey(bx, by)
                    const activeCount = HM.reduce(bombs, 0, (acc, bomb) => bomb.owner === owner ? acc + 1 : acc) // ?? huh

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

export const update = (msg: Msg, model : Model): Model =>
    Match.value(msg).pipe(
        // TICK FOR PHYSICS, TIME, MOVEMENT
        Match.tag("Canvas.MsgTick", () => {
            if (model.status !== GameStatus.PLAYING) return model

            const keyInput = getInputKey()

            const p1_planted = keyInput.space && !model.input.space
            const p2_planted = keyInput.x && !model.input.space

            const newKeyInput = InputState.make(keyInput)


            // HANDLES TIMERS // WTFFF hahaha galing dito https://editor.p5js.org/denaplesk2/sketches/S1OAhXA-M
            let newTimeLeft = model.timeLeft
            const newTickAcc = model.timeTickAcc + 1 // increments the counter every single frame
            if (newTickAcc % FPS === 0) { // checks for remainder (30%30 === 0, 60%30 === 0)
                newTimeLeft = Math.max(0, newTimeLeft - 1) // so if 30 frames has passed, 1 second has passed
            }
            if (newTimeLeft === 0) {
                return { ...model, status: GameStatus.DRAW, timeLeft: 0}
            }

            // HANDLES BOMB/EXPLOSION TIMERS
            let newGrid = [...model.grid.map(row =>[...row])]
            let newBombs = model.bombs
            let newPowerups = model.powerups
            let newExplosions = [...model.explosions]

            // DECREASE EXPLOSION TIMERS
            newExplosions = newExplosions
                .map(exp => ({...exp, timer: exp.timer - 1}))
                .filter(exp => exp.timer > 0)

            // DECREASE BOMB TIMERS
            const bombsToExplode: number[] = []
            newBombs = HM.map(newBombs, (bomb)=> ({
                ...bomb,
                timer: bomb.timer - 1
            }))
            HM.forEach(newBombs, (bomb, key) => {
                if (bomb.timer <= 0) {
                    bombsToExplode.push(key)
                }
            })

            // handling chain bomb reaction... to be continued
            const processingQueue = [...bombsToExplode]
            const processedBombs = new Set<number>()
            
            while (processingQueue.length > 0) {
                const key = processingQueue.shift()!
                if (processedBombs.has(key)) continue
                processedBombs.add(key)
                
                const b = HM.get(newBombs, key)
                if(b._tag === "None") continue; 
                const bombData = b.value;
                // dito create ung explosion after matapos ung bomb timer at that location
                const result = triggerExplosion(bombData, newGrid, newBombs, newPowerups)
                newExplosions.push(...result.newExplosion)
                // what if nasira ung powerup sa bomba
                result.destroyedPowerups.forEach(pow => { newPowerups = HM.remove(newPowerups, pow)})
                // sisirain nya ung blocks
                result.brokenSoftBlocks.forEach(pos => { newGrid[pos.y][pos.x] = Empty.make({}) 
                // pag nakasira ng softblock, spawn powerup
                if ((Math.random() * 100) < settings.powerupChance) {
                    const prob = Math.random()
                    let type = PowerupType.SpeedUp
                    if (prob < 0.33) type = PowerupType.FireUp
                    else if (prob <0.66) type = PowerupType.BombUp

                    const k = getIntKey(pos.x, pos.y)
                    newPowerups = HM.set(newPowerups, k, PowerUp.make({
                    type: type,
                    x: pos.x,
                    y: pos.y
            }))
                }
                })
                // chain reaction pag nakahit ng di pa nageexplode na bomb
                result.hitBombs.forEach(k => { if (!processedBombs.has(k)) processingQueue.push(k) })
                // remove bombs sa hashmap once exploded
                newBombs = HM.remove(newBombs, key)
            }

            // // HANDLES PLAYER MOVEMENT
            // const playerBombs = HM.reduce(newBombs, 0, (acc, bomb) => acc + 1) // ?? huh
            // let nextPlayer = { ...model.player, bombs_active: playerBombs }

            let p1 = {...model.player1}
            let p2 = {...model.player2}


            // HANDLES P1
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

            // HANDLES P2
            if (p2.is_alive) {
                let dx = 0
                let dy = 0
                if (newKeyInput.w) dy = -1 
                else if (newKeyInput.s) dy = 1 
                else if (newKeyInput.a) dx = -1 
                else if (newKeyInput.d) dx = 1 
                p2 = tryWalk(p2, dx, dy, newGrid, newBombs)
                newBombs = handleBombPlant(p2, p2_planted, "P2", newBombs)

            }

            // COLLISION??
            const checkCollisions = (player: Player): Player => {
                if (!player.is_alive) return player
                let nextPlayer = { ...player}
                const cx = nextPlayer.x_coordinate
                const cy = nextPlayer.y_coordinate
                const tile_x = Math.floor(cx)
                const tile_y = Math.floor(cy)

                const key = getIntKey(tile_x, tile_y)
                const pu = HM.get(newPowerups, key)
                if (pu._tag === "Some") {
                    if (Math.abs(cx-(tile_x+0.5)) < 0.4 && Math.abs(cy-(tile_y+0.5)) < 0.4) {
                        const powerup = pu.value
                        if (powerup.type === PowerupType.BombUp) nextPlayer.max_bombs += 1
                        if (powerup.type === PowerupType.FireUp) nextPlayer.bomb_range += 1
                        if (powerup.type === PowerupType.SpeedUp) nextPlayer.speed_multi += 0.3
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

            const countBombs = (owner: string) => HM.reduce(newBombs, 0, (acc, b) => b.owner === owner ? acc + 1 : acc)
            p1.bombs_active = countBombs('P1')
            p2.bombs_active = countBombs('P2')


            let nextStatus = model.status
            if (!p1.is_alive && p2.is_alive) { // pag napatay ng p2 si p1
                if (model.lastTickTime - p1.death_tick_delay > FPS) {
                    nextStatus = GameStatus.P2_WIN
                }
            } else if (!p2.is_alive && p1.is_alive) { // pag napatay ng p1 si p2
                if (model.lastTickTime - p2.death_tick_delay > FPS) {
                    nextStatus = GameStatus.P1_WIN
                }
            } else if (!p1.is_alive && !p2.is_alive) { // pag sabay namatay pareho
                // if (Math.abs(p2.death_tick_delay - p1.death_tick_delay) <= FPS/4) { // ito pwede ichange ung /4
                if (p1.death_tick_delay === p2.death_tick_delay) { // too strict
                    nextStatus = GameStatus.DRAW
                } else { // kung sino late namatay panalo
                    if (p2.death_tick_delay > p1.death_tick_delay) {
                        nextStatus = GameStatus.P2_WIN
                    } else {
                        nextStatus = GameStatus.P1_WIN
                    }
                } 
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
                input: newKeyInput,
                timeTickAcc: newTickAcc >= FPS ? 0 : newTickAcc,
                timeLeft: newTimeLeft,
                lastTickTime: model.lastTickTime + 1
            }
        }),
        Match.tag("Canvas.MsgKeyDown", () => model), //{
            // if (model.status !== GameStatus.PLAYING) return model

            // // SPACEBAR
            // if (key === " ") {
            //     let nextBombs = model.bombs
            //     const pX = Math.floor(model.player.x_coordinate)
            //     const pY = Math.floor(model.player.y_coordinate)
            //     const bombKey = getIntKey(pX, pY)
            //     if (model.player.is_alive && HM.size(nextBombs) < 1 && !HM.has(nextBombs, bombKey)) {
            //         nextBombs = HM.set(nextBombs, bombKey, Bomb.make({
            //             id: `${Date.now()}`,
            //             x: pX,
            //             y: pY,
            //             timer: BOMB_TIMER_SECONDS * FPS,
            //             owner: 'P1'
            //         }))
            //         return {...model, bombs: nextBombs}
            //     }
            //     return model
            // }

            // const p = model.player
            // const isMoving = Math.abs(p.x_coordinate - p.target_x) > 0.05 ||
            //                 Math.abs(p.y_coordinate - p.target_y) > 0.05
            // if (isMoving) {
            //     return model
            // }
            // let newTileY = p.target_y
            // let newTileX = p.target_x

            // if (key === "ArrowUp") newTileY -= 1
            // else if (key === "ArrowDown") newTileY += 1
            // else if (key === "ArrowLeft") newTileX -= 1
            // else if (key === "ArrowRight") newTileX += 1
            // else return model // Not a movement key

            // if (!isTileBlocked(model.grid, model.bombs, Math.floor(newTileX), Math.floor(newTileY))) {
            //     return {
            //         ...model,
            //         player: {
            //             ...p,
            //             target_x: newTileX,
            //             target_y: newTileY
            //         }
            //     }
            // }
        //     return model
        // }),
        Match.tag("Restart", () => model),
        Match.tag("Canvas.MsgMouseDown", () => model),
        Match.exhaustive,
    )