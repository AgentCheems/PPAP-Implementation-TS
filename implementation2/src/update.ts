import { Model, Bomb, Cell, GameStatus, Empty, HardBlock, SoftBlock, ExplosionCell, Player } from "./model" 
import { ROWS, COLS, TILE_SIZE, FPS, PLAYER_RADIUS, 
    PLAYER_SPEED, BOMB_TIMER_SECONDS, EXPLOSION_DURATION_SECONDS, 
    EXPLOSION_RANGE, GAME_DURATION_SECONDS
} from "./constants"
import { Msg } from "./message"
import { Match, HashMap as HM, Array as A, pipe } from "effect"

const getIntKey = (x: number, y: number) => y * COLS + x

const checkCollision = (grid: readonly(readonly Cell[])[], bombs: HM.HashMap<number, Bomb>, px: number, py: number, oldX: number, oldY: number): boolean => {
    if (px < 1 || px > COLS - 1 || py < 1 || py > ROWS - 1) return true

    const corners = [
        {x: px - PLAYER_RADIUS, y: py - PLAYER_RADIUS},
        {x: px + PLAYER_RADIUS, y: py - PLAYER_RADIUS},
        {x: px - PLAYER_RADIUS, y: py + PLAYER_RADIUS},
        {x: px + PLAYER_RADIUS, y: py + PLAYER_RADIUS},
    ]

    for (const corner of corners) {
        const gridX = Math.floor(corner.x)
        const gridY = Math.floor(corner.y)
        
        if (gridY < 0 || gridY >= ROWS || gridX < 0 || gridX >= COLS) return true

        const cell = grid[gridY][gridX]
        if (cell._tag === "HardBlock" || cell._tag === "SoftBlock") return true

        const bombKey = getIntKey(gridX, gridY)
        if (HM.has(bombs, bombKey)) {
            const bombCenterX = gridX + 0.5
            const bombCenterY = gridY + 0.5

            const distOld = (oldX - bombCenterX) ** 2 + (oldY - bombCenterY) ** 2
            const distNew = (px - bombCenterX) ** 2 + (py - bombCenterY) ** 2

            if (distNew < distOld - 0.0001) {
            return true
            }  
        }
    }
    return false
}

const triggerExplosion = (
    startX: number, 
    startY: number, 
    grid: readonly (readonly Cell[])[], 
    currentBombs: HM.HashMap<number, Bomb>,
    range: number
): { 
    newExplosion: ExplosionCell[],
    hitBombs: number[],
    brokenSoftBlocks: {x: number, y: number}[]
} => {
    const newExplosion: ExplosionCell[] = []
    const hitBombs: number[] = []
    const brokenSoftBlocks: {x: number, y: number}[] = []

    newExplosion.push({x: startX, y: startY, timer: EXPLOSION_DURATION_SECONDS * FPS })

    const dirs = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}]

    for (const dir of dirs) {
        for (let i = 1; i <= range; i++) {
            const tx = startX + (dir.dx * i)
            const ty = startY + (dir.dy * i)
            if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) break

            const cell = grid[ty][tx]
            if (cell._tag === "HardBlock") break;

            if (cell._tag === "SoftBlock") {
                newExplosion.push({ x: tx, y: ty, timer: EXPLOSION_DURATION_SECONDS * FPS })
                brokenSoftBlocks.push({x: tx, y: ty})
                break;
            }

            const bombKey = getIntKey(tx, ty)
            if (HM.has(currentBombs, bombKey)) {
                hitBombs.push(bombKey)
                newExplosion.push({ x: tx, y: ty, timer: EXPLOSION_DURATION_SECONDS * FPS })
                continue;
            }

            newExplosion.push({ x: tx, y: ty, timer: EXPLOSION_DURATION_SECONDS * FPS })
        }
    }
    return { newExplosion, hitBombs, brokenSoftBlocks }
}

export const update = (msg: Msg, model : Model): Model =>
    Match.value(msg).pipe(
        Match.tag("Canvas.MsgTick", () =>  {
            if (model.status !== GameStatus.PLAYING) return model

            let newTimeLeft = model.timeLeft
            const newTickAcc = model.timeTickAcc + 1

            if (newTickAcc % FPS === 0) {
                newTimeLeft = Math.max(0, newTimeLeft - 1)
            }

            if (newTimeLeft === 0) {
                return { ...model, status: GameStatus.LOSE, timeLeft: 0}
            }

            let newGrid = [...model.grid.map(row =>[...row])]
            let newBombs = model.bombs
            let newExplosions = [...model.explosions]

            newExplosions = newExplosions
            .map(exp => ({...exp, timer: exp.timer - 1}))
            .filter(exp => exp.timer > 0)

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

                const result = triggerExplosion(bombData.x, bombData.y, newGrid, newBombs, 1)
                newExplosions.push(...result.newExplosion)
                result.brokenSoftBlocks.forEach(pos => { newGrid[pos.y][pos.x] = Empty.make({}) })
                result.hitBombs.forEach(k => { if (!processedBombs.has(k)) processingQueue.push(k) })
                newBombs = HM.remove(newBombs, key)
            }

            const playerBombs = HM.reduce(newBombs, 0, (acc, bomb) => acc + 1)
            let nextPlayer = { ...model.player, bombs_active: playerBombs }
            
            // Check Death
            for (const exp of newExplosions) {
                if (
                    nextPlayer.x_coordinate >= exp.x - 0.4 && 
                    nextPlayer.x_coordinate <= exp.x + 1.4 &&
                    nextPlayer.y_coordinate >= exp.y - 0.4 &&
                    nextPlayer.y_coordinate <= exp.y + 1.4
                ) {
                     if (Math.floor(nextPlayer.x_coordinate) === exp.x && Math.floor(nextPlayer.y_coordinate) === exp.y) {
                         nextPlayer.is_alive = false
                     }
                }
            }

            let nextStatus = model.status
            if (!nextPlayer.is_alive) nextStatus = GameStatus.LOSE

            return {
                ...model,
                status: nextStatus,
                grid: newGrid,
                bombs: newBombs,
                explosions: newExplosions,
                player: nextPlayer,
                timeTickAccumulator: newTickAcc >= FPS ? 0 : newTickAcc,
                timeLeft: newTimeLeft,
                lastTickTime: model.lastTickTime + 1
            }
        }),
        Match.tag("Canvas.MsgKeyDown", ({key}) => {
            if (model.status !== GameStatus.PLAYING) return model

            let nextPlayer = {...model.player}
            let nextBombs = model.bombs

            const speed = 0.3
            let dx = 0;
            let dy = 0;
            if (key === "ArrowUp") dy = -speed;
            if (key === "ArrowDown") dy = speed;
            if (key === "ArrowLeft") dx = -speed;
            if (key === "ArrowRight") dx = speed;

            // SPACEBAR
            if (key === " ") {
                const pX = Math.floor(nextPlayer.x_coordinate)
                 const pY = Math.floor(nextPlayer.y_coordinate)
                 const bombKey = getIntKey(pX, pY)
                 if (nextPlayer.is_alive && HM.size(nextBombs) < 1 && !HM.has(nextBombs, bombKey)) {
                     nextBombs = HM.set(nextBombs, bombKey, Bomb.make({
                         id: `${Date.now()}`,
                         x: pX,
                         y: pY,
                         timer: BOMB_TIMER_SECONDS * FPS,
                         owner: 'P1'
                     }))
                 }
            }

            if (dx !== 0 || dy !== 0) {
                const newX = nextPlayer.x_coordinate + dx
                const newY = nextPlayer.y_coordinate + dy
                if (!checkCollision(model.grid, nextBombs, newX, newY, nextPlayer.x_coordinate, nextPlayer.y_coordinate)) {
                    nextPlayer.x_coordinate = newX
                    nextPlayer.y_coordinate = newY
                }
            }

            return { ...model, player: nextPlayer, bombs: nextBombs }
        }),
        Match.tag("Canvas.MsgMouseDown", () => model),
        Match.tag("KeyUp", () => model),
        Match.tag("Restart", () => model),
        Match.exhaustive,
    )