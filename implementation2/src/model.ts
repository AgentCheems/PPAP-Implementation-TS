import { Schema as S, HashMap as HM, Array as A, pipe} from "effect";
import { ROWS, COLS, GAME_DURATION_SECONDS} from "./constants"
import settings from "./settings.json"

// GAME-STATE Handling
export enum GameStatus {
    PLAYING,
    P1_WIN,
    P2_WIN,
    DRAW
}

// INPUTS
export type InputState = typeof InputState.Type
export const InputState = S.Struct({
    // for P1
    up: S.Boolean,
    down: S.Boolean,
    left: S.Boolean,
    right: S.Boolean,
    space: S.Boolean,
    // for P2,
    w: S.Boolean,
    s: S.Boolean,
    a: S.Boolean,
    d: S.Boolean,
    x: S.Boolean
})

export enum PowerupType {
    FireUp,
    BombUp,
    SpeedUp
}

// POWERUPS
export type PowerUp = typeof PowerUp.Type
export const PowerUp = S.Struct({
    type: S.Enums(PowerupType),
    x: S.Int,
    y: S.Int
})

// PLAYER
export type Player = typeof Player.Type
export const Player = S.Struct({
    x_coordinate: S.Number,
    y_coordinate: S.Number,
    target_x: S.Number,
    target_y: S.Number,
    is_alive: S.Boolean,
    death_tick_delay: S.Number, // one-second delay before their opponent is declared the winner 
    // Bomb Stats
    bombs_active: S.Number,
    bomb_range: S.Number,
    max_bombs: S.Number,
    speed_multi: S.Number
})

// GRID CELL
export type Cell = typeof Cell.Type
export const Cell = S.Union(
    S.TaggedStruct("Empty", {}),
    S.TaggedStruct("SoftBlock", {}),
    S.TaggedStruct("HardBlock", {})
)
export const [Empty, SoftBlock,HardBlock] = Cell.members

// BOMB
export type Bomb = typeof Bomb.Type
export const Bomb = S.Struct({
    id: S.String, 
    x: S.Int,
    y: S.Int,
    timer: S.Number,
    range: S.Number,
    owner: S.String, // P1, P2, P3, P4
})

// EXPLOSION
export type ExplosionCell = typeof ExplosionCell.Type
export const ExplosionCell = S.Struct({
    x: S.Int,
    y: S.Int,
    timer: S.Number,
    owner: S.String // P1, P2, P3, P4
})

// MAIN MODEL
export const Model = S.Struct({
    status: S.Enums(GameStatus), 
    grid: S.Array(S.Array(Cell)), // this will be the 13 x 15 layout
    player1: Player,
    player2: Player,
    input: InputState,
    // so yung pagstore ng bombs sa hashmap naka "y * COLS + x" check rows then cols easy lookup
    bombs: S.HashMap({
        key: S.Int, 
        value: Bomb
    }), 
    powerups: S.HashMap({
        key: S.Int,
        value: PowerUp
    }),
    explosions: S.Array(ExplosionCell),
    timeLeft: S.Number,
    timeTickAcc: S.Number,
    lastTickTime: S.Number,
    gameEndTimer: S.Number //dami, pero para sa delay ito
    //...
})
export type Model = typeof Model.Type

// INITIALIZATION
const generateGrid = (): Array<Array<Cell>> => {
    const grid: Cell[][] = []
    
    const isSafe = (x: number, y: number) => {
        //Four Corners:
        if ((x===1 && y===1) || (x===COLS-2 && y===ROWS-2)) return true //P1 (top-left) and P2 (bot-right) start
        if ((x===COLS-2 && y===1) || (x===1 && y===ROWS-2)) return true //P3 (top-right) and P4 (bot-left) start

        //P1 Adjacents
        if ((x===1 && y===2) || (x===2 && y===1)) return true
        // P2 Adjacents
        if ((x===COLS-2 && y===ROWS-3) || (x===COLS-3 && y===ROWS-2)) return true
        // P3 Adjacents
        if ((x===COLS-2 && y===2) || (x===COLS-3 && y===1)) return true
        // P4 Adjacents
        if ((x===1 && y===ROWS-3) || (x===2 && y===ROWS-2)) return true

        return false
    }

    for (let y=0; y < ROWS; y++) {
        const row: Cell[] = []
        for (let x=0; x < COLS; x++) {
            if ( x === 0 || x === COLS -1 || y === 0 || y === ROWS -1 ) {
                row.push(HardBlock.make({}))
                continue
            }
            // Hard Block pattern
            if (x % 2 === 0 && y % 2 === 0) {
                row.push(HardBlock.make({}))
                continue
            }
            // Safe Zone
            if (isSafe(x, y)) {
                row.push(Empty.make({}))
                continue
            }
            // Random Soft Block
            if ((Math.random() * 100) < settings.softBlockChance) { // 70% chance of soft block
                row.push(SoftBlock.make({}))
            } else {
                row.push(Empty.make({}))
            }
        }
        grid.push(row)
    }
    return grid
}

export const initPlayer = (x: number, y: number): Player => Player.make({
    x_coordinate: x,
    y_coordinate: y,
    target_x: x,
    target_y: y,
    is_alive: true,
    death_tick_delay: 0,
    bombs_active: 0,
    max_bombs: 1,
    bomb_range: 1,
    speed_multi: 1.0
})

export const initInput = InputState.make({
    up: false,
    down: false,
    left: false,
    right: false,
    space: false,
    w: false,
    s: false,
    a: false,
    d: false,
    x: false
})

export const initModel = Model.make({
    status: GameStatus.PLAYING,
    grid: generateGrid(),
    player1: initPlayer(1.5, 1.5),
    player2: initPlayer(COLS - 1.5, ROWS - 1.5),
    input: initInput,
    bombs: HM.empty(),
    powerups: HM.empty(),
    explosions: A.empty(),
    timeLeft: settings.gameDuration,
    timeTickAcc: 0,
    lastTickTime: 0,
    gameEndTimer: -1 //delay timer
})