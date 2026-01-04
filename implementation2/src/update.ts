import { Model, Bomb, Cell, GameStatus, Empty, Player, PowerUp, PowerupType, InputState, initModel, generateGrid, SoftBlock } from "./model"
import { ROWS, COLS, FPS, PLAYER_SPEED, BOMB_TIMER_SECONDS, EXPLOSION_DURATION_SECONDS, PLAYER_DYING_TIME_SECONDS } from "./constants"
import settings from "./settings.json"
import { Msg } from "./message"
import { HashMap as HM, Array as A, Option, Match } from "effect"
import { getInputKey } from "./input"
import { updateBot, BotIntent } from "./bot"

const availablePowerups = [
    // PowerupType.BombUp,
    // PowerupType.FireUp,
    // PowerupType.SpeedUp,
    PowerupType.Vest,
]
// ------------------------------------------------------------------
// HELPERS
// ------------------------------------------------------------------
const getIntKey = (x: number, y: number) => y * COLS + x

const isTileBlocked = (grid: Cell[][], bombs: HM.HashMap<number, Bomb>, tx: number, ty: number): boolean => {
    // 1. Boundary Check
    if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) return true
    
    // 2. Block Check
    const cell = grid[ty][tx]
    if (cell._tag === "HardBlock" || cell._tag === "SoftBlock") return true
    
    // 3. Bomb Check
    // We check if the TARGET tile has a bomb.
    if (HM.has(bombs, getIntKey(tx, ty))) return true
    
    return false
}

const resetRound = (prev: Model): Model => {
    // 1. Reset Grid
    // 2. Reset Players
    // 3. Clear Bombs/Exp/PU
    // 4. Reset Timer
    const newInit = initModel    // fresh start
    const playerScores = newInit.players.map(newP => {
        const oldP = prev.players.find(p => p.id === newP.id)
        return {
            ...newP, roundWins: oldP ? oldP.roundWins : 0
        }
    })
    return {
        ...newInit,
        grid: generateGrid(), // omg ito lang pala, okay na naexport kona
        players: playerScores,
        status: GameStatus.ROUND_START,
        roundStartTimer: 3 * FPS,
        debugMode: false // par amaofff

    }
}
// ------------------------------------------------------------------
// UNIFIED PHYSICS
// ------------------------------------------------------------------


const tryWalk = (player: Player, dx: number, dy: number, grid: Cell[][], bombs: HM.HashMap<number, Bomb>): Player => {
    // 1. Existing Movement
    const isMoving = Math.abs(player.xCoordinate - player.targetX)  || 
                     Math.abs(player.yCoordinate - player.targetY) 

    if (isMoving) {
        const next = { ...player }
        const speed = PLAYER_SPEED * player.speedMulti
        
        // Move X
        if (Math.abs(next.xCoordinate - next.targetX) <= speed) {
            next.xCoordinate = next.targetX; // Snap to target x
        } else {
            if (next.xCoordinate < next.targetX) next.xCoordinate += speed;
            else next.xCoordinate -= speed;
        }
        
        // Move Y
        if (Math.abs(next.yCoordinate - next.targetY) <= speed) {
            next.yCoordinate = next.targetY // Snap to target Y
        } else {
            if (next.yCoordinate < next.targetY) next.yCoordinate += speed
            else next.yCoordinate -= speed
        }
        
        return next;
    }

    // 2. Snap position 
    const snappedPlayer = { 
        ...player, 
        xCoordinate: player.targetX, 
        yCoordinate: player.targetY 
    };

    if (dx === 0 && dy === 0) return snappedPlayer; // No movement requested

    const currentTileX = Math.floor(snappedPlayer.xCoordinate);
    const currentTileY = Math.floor(snappedPlayer.yCoordinate);

    const targetTileX = currentTileX + dx;
    const targetTileY = currentTileY + dy;

    // Check mo collision sa target tile
    if (!isTileBlocked(grid, bombs, targetTileX, targetTileY)) {
        return {
            ...snappedPlayer,
            targetX: targetTileX + 0.5,
            targetY: targetTileY + 0.5
        };
    }
    // Blocked do nothin
    return snappedPlayer;
}

const handleBombPlant = (p: Player, wantsPlant: boolean, bombs: HM.HashMap<number, Bomb>, powerups: HM.HashMap<number, PowerUp>): HM.HashMap<number, Bomb> => {
    if (wantsPlant && p.isAlive) {
        const bx = Math.floor(p.xCoordinate)
        const by = Math.floor(p.yCoordinate)
        const k = getIntKey(bx, by);
        const activeCount = HM.reduce(bombs, 0, (acc, b) => b.owner === p.id ? acc + 1 : acc);
        
        if (activeCount < p.maxBombs && !HM.has(bombs, k) && !HM.has(powerups, k)) {
            return HM.set(bombs, k, Bomb.make({
                id: `${p.id}_${Date.now()}`,
                x: bx,
                y: by,
                timer: BOMB_TIMER_SECONDS * FPS,
                range: p.bombRange,
                owner: p.id
            }))
        }
    }
    return bombs
}

const triggerExplosion = (bomb: Bomb, grid: Cell[][], bombs: HM.HashMap<number, Bomb>, powerups: HM.HashMap<number, PowerUp>) => {
    const newExplosion = [{x: bomb.x, y: bomb.y, timer: EXPLOSION_DURATION_SECONDS * FPS, owner: bomb.owner, softBlock: false }];
    const hitBombs: number[] = [];
    const brokenSoftBlocks: {x: number, y: number}[] = [];
    const destroyedPowerups: number[] = [];

    const dirs = [{dx: 0, dy: -1}, {dx: 0, dy: 1}, {dx: -1, dy: 0}, {dx: 1, dy: 0}]

    for (const dir of dirs) {
        for (let i = 1; i <= bomb.range; i++) {
            const tx = bomb.x + (dir.dx * i)
            const ty = bomb.y + (dir.dy * i)
            
            if (tx < 0 || tx >= COLS || ty < 0 || ty >= ROWS) break
            
            const cell = grid[ty][tx]
            if (cell._tag === "HardBlock") break

            if (cell._tag === "SoftBlock") {
                newExplosion.push({ x: tx, y: ty, timer: EXPLOSION_DURATION_SECONDS * FPS, owner: bomb.owner, softBlock: true });
                brokenSoftBlocks.push({x: tx, y: ty});
                break; // Explosion stops at soft block
            }

            const k = getIntKey(tx, ty)
            if (HM.has(bombs, k)) {
                hitBombs.push(k);
                newExplosion.push({ x: tx, y: ty, timer: EXPLOSION_DURATION_SECONDS * FPS, owner: bomb.owner, softBlock: false });
                break; // Explosion stops at bomb (but triggers it)
            }
            if (HM.has(powerups, k)) destroyedPowerups.push(k)
            
            newExplosion.push({ x: tx, y: ty, timer: EXPLOSION_DURATION_SECONDS * FPS, owner: bomb.owner, softBlock: false });
        }
    }
    return { newExplosion, hitBombs, brokenSoftBlocks, destroyedPowerups }
}

// ------------------------------------------------------------------
// MAIN UPDATE LOOP
// ------------------------------------------------------------------

export const update = (msg: Msg, model: Model): Model => {
    return Match.value(msg).pipe(
        Match.tag("Canvas.MsgTick", () => {
            let shouldPlayPowerUpSound = false
            let shouldPlayDeathSound = false
            let shouldPlayExplosionSound = false
            const inputs = InputState.make(getInputKey());

            // 0.A ROUND START
            if (model.status === GameStatus.ROUND_START) {
                if (model.roundStartTimer > 0) {
                    return {
                        ...model,
                        roundStartTimer: model.roundStartTimer - 1,
                        input: inputs
                    }
                } else {
                    return {
                        ... model,
                        status: GameStatus.PLAYING
                    }
                }
            }

            // 0.B ROUND END
            if (model.status === GameStatus.ROUND_END) {
                // wait for esc key
                if (inputs.escape && !model.input.escape) {
                    // check kung gameover na
                    const winner = model.players.find(p => p.roundWins >= model.winsToWin)
                    if (winner) {
                        return {
                            ...model,
                            status: GameStatus.GAME_OVER,
                            roundWinner: winner.id
                        }
                    }
                    return resetRound(model)
                } // if walang napindot freeze pane
                return {
                    ...model,
                    input: inputs
                }
            }

            if (model.status === GameStatus.GAME_OVER) return model

            // 1. GAME TIMER
            const debugToggled = inputs.escape && !model.input.escape
            const nextDebug = debugToggled ? !model.debugMode : model.debugMode
            let timeLeft = model.timeLeft
            const tickAcc = model.timeTickAcc + 1

            if (tickAcc % FPS === 0) timeLeft = Math.max(0, timeLeft - 1)
                // timeout means draw
            if (timeLeft === 0) return { 
                ...model, 
                status: GameStatus.GAME_OVER, //gameover round is done
                roundWinner: "DRAW",
                timeLeft: 0, 
                input: inputs, 
                debugMode: nextDebug 
            }

            // 2. STATE SNAPSHOTS
            let grid = model.grid.map(row => [...row])
            let powerups = model.powerups
            let explosions = [...model.explosions]
            let bombs = model.bombs
            
            const prevBombCount = HM.size(bombs)
            const prevExpCount = explosions.length

            // 3. EXPLOSION & BOMB TIMERS
            explosions = explosions.map(e => ({...e, timer: e.timer-1})).filter(e => e.timer > 0)
            
            const toExplode: number[] = []
            bombs = HM.map(bombs, b => ({...b, timer: b.timer-1}))
            HM.forEach(bombs, (b, k) => { if (b.timer <= 0) {
                toExplode.push(k); 
                shouldPlayExplosionSound = true
                console.log("utot")
            }})

            // 4. CHAIN REACTIONS
            const queue = [...toExplode]
            const processed = new Set<number>()
            while (queue.length > 0) {
                const k = queue.shift()!
                if (processed.has(k)) continue
                processed.add(k)

                const b = HM.get(bombs, k)
                if (Option.isNone(b)) continue

                const res = triggerExplosion(b.value, grid, bombs, powerups)
                explosions.push(...res.newExplosion)
                
                res.destroyedPowerups.forEach(p => powerups = HM.remove(powerups, p))
                res.brokenSoftBlocks.forEach(p => {
                    grid[p.y][p.x] = Empty.make({})
                    if (Math.random() * 100 < settings.powerupChance) {
                        const randomIndex = Math.floor(Math.random() * availablePowerups.length)
                        let type = availablePowerups[randomIndex]
                        powerups = HM.set(powerups, getIntKey(p.x, p.y), PowerUp.make({type, x: p.x, y: p.y}))
                    }
                })
                res.hitBombs.forEach(bk => { if(!processed.has(bk)) queue.push(bk) })
                bombs = HM.remove(bombs, k)
            }
            // tapos na explosion
            const bombAdded = HM.size(bombs) > prevBombCount
            const expEnded = explosions.length < prevExpCount

            // 5. PLAYER LOOP (Unified)
            const nextPlayers = model.players.map(p => {
                if (!p.isAlive) {
                    if (p.dyingTimer > 0) return {...p, dyingTimer: p.dyingTimer - 1} 
                    return p
                }

                let nextP = { ...p }
                let intent: BotIntent = { dx: 0, dy: 0, plant: false }
                
                // Z. POWERUP STATE
                if (nextP.VestTimer > 0 && nextP.hasVest) {
                    nextP.VestTimer -= 1
                    if (nextP.VestTimer <=0) {
                        nextP.hasVest = false
                    }
                    console.log(nextP.VestTimer)
                }


                // A. GATHER INTENT
                const isMoving = Math.abs(nextP.xCoordinate - nextP.targetX) > 0.05 || 
                                 Math.abs(nextP.yCoordinate - nextP.targetY) > 0.05

                // Optimization: Only think/input if we are ready to move
                if (!isMoving) {
                    if (p.isBot) {
                        // AI LOGIC
                        const res = updateBot(nextP, model, { bombPlanted: bombAdded, explosionEnded: expEnded })
                        nextP = res.player // Update internal bot state
                        intent = res.intent // Get movement desire
                    } else {
                        // HUMAN INPUT
                        if (p.id === "P1") {
                            if (inputs.up) intent.dy = -1
                            else if (inputs.down) intent.dy = 1
                            else if (inputs.left) intent.dx = -1 
                            else if (inputs.right) intent.dx = 1
                            intent.plant = inputs.space && !model.input.space
                        } else if (p.id === "P2") {
                            if (inputs.w) intent.dy = -1
                            else if (inputs.s) intent.dy = 1
                            else if (inputs.a) intent.dx = -1 
                            else if (inputs.d) intent.dx = 1
                            intent.plant = inputs.x && !model.input.x
                        }
                    }
                }
                // B. UPDATE DIRECTION
                if (intent.dx !== 0 || intent.dy !== 0) {
                    if (intent.dx === -1) nextP.lastDirection = "left"
                    else if (intent.dx === 1) nextP.lastDirection = "right"
                    else if (intent.dy === -1) nextP.lastDirection = "up"
                    else if (intent.dy === 1) nextP.lastDirection = "down"
                }

                // C. EXECUTE PHYSICS
                let walkedPlayer = tryWalk(nextP, intent.dx, intent.dy, grid, bombs)

                // D. ACTIONS (Planting)
                bombs = handleBombPlant(walkedPlayer, intent.plant, bombs, powerups)

                // E. COLLISIONS (Powerups & Explosions)
                let updatedPlayer = { ...walkedPlayer }
                const playerTileX = Math.floor(updatedPlayer.xCoordinate)
                const playerTileY = Math.floor(updatedPlayer.yCoordinate)
                
                const k = getIntKey(playerTileX, playerTileY)
                
                const pu = HM.get(powerups, k)
                if (Option.isSome(pu)) {
                    if (pu.value.type === PowerupType.BombUp) {
                        updatedPlayer = { ...updatedPlayer, maxBombs: updatedPlayer.maxBombs + 1 }
                    }
                    else if (pu.value.type === PowerupType.FireUp) {
                        updatedPlayer = { ...updatedPlayer, bombRange: updatedPlayer.bombRange + 1 }
                    }
                    else if (pu.value.type === PowerupType.SpeedUp) {
                        updatedPlayer = { ...updatedPlayer, speedMulti: updatedPlayer.speedMulti + 0.2 }
                    }
                    else if (pu.value.type === PowerupType.Vest) {
                        updatedPlayer = { ...updatedPlayer, hasVest: true, VestTimer: FPS * 10, }
                    }
                    powerups = HM.remove(powerups, k)
                    shouldPlayPowerUpSound = true
                }

                if (explosions.some(e => e.x === playerTileX && e.y === playerTileY)) {
                    if (!updatedPlayer.hasVest) {
                    updatedPlayer = { ...updatedPlayer, isAlive: false, deathTickDelay: model.lastTickTime, dyingTimer: PLAYER_DYING_TIME_SECONDS * FPS }
                    shouldPlayDeathSound = true
                    }
                }
                
                // Update stats
                return { 
                    ...updatedPlayer, 
                    bombsActive: HM.reduce(bombs, 0, (acc, b) => b.owner === p.id ? acc + 1 : acc) 
                }
            })

            // 6. CHECK WIN CONDITION
            let nextStatus = model.status;
            const alive = nextPlayers.filter(p => p.isAlive)
            const dead = nextPlayers.filter(p => !p.isAlive)
            let roundEnded = false
            let roundWinnerId = "DRAW" // or start with false
            let updatedPlayers = nextPlayers
            
            if (alive.length <= 1) {
                const lastDeath = dead.reduce((max, p) => Math.max(max, p.deathTickDelay), 0);
                if (model.lastTickTime - lastDeath >= FPS) {
                    roundEnded = true
                    if (alive.length === 1) {
                        roundWinnerId = alive[0].id
                        // award the point
                        updatedPlayers = nextPlayers.map(p => p.id === roundWinnerId ? { ...p, roundWins: p.roundWins + 1 } : p)
                    } else {
                        nextStatus = GameStatus.DRAW
                    }
                    // pag draw, no points
                }
            }

            if (roundEnded) {
                return {
                    ...model, 
                    status: GameStatus.ROUND_END,
                    roundWinner: roundWinnerId,
                    players: updatedPlayers,
                    input: inputs,
                    grid,
                    bombs,
                    powerups,
                    explosions,
                }
            }

            return {
                ...model,
                status: GameStatus.PLAYING,
                grid, 
                bombs, 
                powerups, 
                explosions,
                players: nextPlayers,
                input: inputs,
                timeTickAcc: tickAcc >= FPS ? 0 : tickAcc,
                timeLeft,
                lastTickTime: model.lastTickTime + 1,
                debugMode: nextDebug,
                playDeathSound: shouldPlayDeathSound,
                playExplosionSound: shouldPlayExplosionSound,
                playPowerUpSound: shouldPlayPowerUpSound,
            }
        }),
        Match.tag("Canvas.MsgKeyDown", () => model),
        Match.tag("Canvas.MsgMouseDown", () => model),
        Match.tag("Restart", () => initModel),
        Match.exhaustive
    );
}
