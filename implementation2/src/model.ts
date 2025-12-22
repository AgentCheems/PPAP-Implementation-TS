import { Schema as S, HashMap as HM, Array as A, pipe} from "effect";
import { ROWS, COLS, GAME_DURATION_SECONDS} from "./constants"
import { init } from "effect/Array";

// GAME-STATE Handling
export enum GameStatus {
    PLAYING,
    WIN,
    LOSE,
    DRAW
}

// INPUTS
export type InputState = typeof InputState.Type
export const InputState = S.Struct({
    up: S.Boolean,
    down: S.Boolean,
    left: S.Boolean,
    right: S.Boolean,
    space: S.Boolean
})

// PLAYER
export type Player = typeof Player.Type
export const Player = S.Struct({
    x_coordinate: S.Number,
    y_coordinate: S.Number,
    is_alive: S.Boolean,
    bombs_active: S.Number,
    bomb_range: S.Number
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
    owner: S.String
})

// EXPLOSION
export type ExplosionCell = typeof ExplosionCell.Type
export const ExplosionCell = S.Struct({
    x: S.Int,
    y: S.Int,
    timer: S.Number
})

// MAIN MODEL
export const Model = S.Struct({
    status: S.Enums(GameStatus), 
    grid: S.Array(S.Array(Cell)), // this will be the 13 x 15 layout
    player: Player,
    input: InputState,
    // so yung pagstore ng bombs sa hashmap naka "y * COLS + x" check rows then cols easy lookup
    bombs: S.HashMap({
        key: S.Int, 
        value: Bomb
    }), 
    explosions: S.Array(ExplosionCell),
    timeLeft: S.Number,
    timeTickAcc: S.Number,
    lastTickTime: S.Number
    //...
})
export type Model = typeof Model.Type

// INITIALIZATION
const generateGrid = (): Array<Array<Cell>> => {
    return A.makeBy(ROWS, (y) =>
        A.makeBy(COLS, (x) => {
            // Borders
            if ( x === 0 || x === COLS -1 || y === 0 || y === ROWS -1 ) {
                return HardBlock.make({});
            }
            // Hard Block pattern
            if (x % 2 === 0 && y % 2 === 0) {
                return HardBlock.make({});
            }
            // Safe Zone
            if ((x === 1 && y === 1) || (x === 1 && y === 2) || (x === 2 && y === 1)) {
                return Empty.make({});
            }
            // Random Soft Block
            if (Math.random() < 0.7) { // 70% chance of soft block
                return SoftBlock.make({});
            }
            // Else, Empty
            return Empty.make({});
        })
    )}

export const initPlayer = Player.make({
    x_coordinate: 1.5,
    y_coordinate: 1.5,
    is_alive: true,
    bombs_active: 0,
    bomb_range: 1
})

export const initInput = InputState.make({
    up: false,
    down: false,
    left: false,
    right: false,
    space: false
})

export const initModel = Model.make({
    status: GameStatus.PLAYING,
    grid: generateGrid(),
    player: initPlayer,
    input: initInput,
    bombs: HM.empty(),
    explosions: A.empty(),
    timeLeft: GAME_DURATION_SECONDS,
    timeTickAcc: 0,
    lastTickTime: 0
})