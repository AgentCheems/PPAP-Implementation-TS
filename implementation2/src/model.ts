
import { Schema as S, HashMap as HM, Array as A } from "effect";
import { ROWS, COLS, PLAYER_START_POSITIONS, FPS } from "./constants";
import settings from "./settings.json";

// GAME-STATE Handling
export enum GameStatus {
    PLAYING,
    ROUND_START,
    ROUND_END,
    GAME_OVER,
    DRAW
}

export type BotType = typeof BotType.Type
export const BotType = S.Union(
    S.Literal("hostile"),
    S.Literal("careful"),
    S.Literal("greedy"),
    S.Literal("not")
)

export type BotState = typeof BotState.Type
export const BotState = S.Union(
    S.Literal("wander"),
    S.Literal("attack"),
    S.Literal("escape"),
    S.Literal("getPowerup")
)

// INPUTS
export type InputState = typeof InputState.Type;
export const InputState = S.Struct({
    up: S.Boolean, down: S.Boolean, left: S.Boolean, right: S.Boolean, space: S.Boolean,
    w: S.Boolean, s: S.Boolean, a: S.Boolean, d: S.Boolean, x: S.Boolean,
    escape: S.Boolean
});

export enum PowerupType { FireUp, BombUp, SpeedUp,
    // Rainbow
 }

// POWERUPS
export type PowerUp = typeof PowerUp.Type;
export const PowerUp = S.Struct({
    type: S.Enums(PowerupType),
    x: S.Int,
    y: S.Int
});

// DIRECTION
export type Direction = typeof Direction.Type; 
export const Direction = S.Union(
    S.Literal("up"),
    S.Literal("down"),
    S.Literal("left"),
    S.Literal("right"),
)

// PLAYER
export type Player = typeof Player.Type;
export const Player = S.Struct({
    id: S.String,
    isBot: S.Boolean,
    // Movement State
    xCoordinate: S.Number,
    yCoordinate: S.Number,
    targetX: S.Number, // For smooth interpolation
    targetY: S.Number,
    lastDirection: Direction,
    
    isAlive: S.Boolean,
    deathTickDelay: S.Number,
    
    // Stats
    bombsActive: S.Number,
    bombRange: S.Number,
    maxBombs: S.Number,
    speedMulti: S.Number,
    
    // Bonus Powerup here (Part 2)

    // AI State (Phase 4)
    botType: BotType,
    botState: BotState,
    botGoalX: S.Number,
    botGoalY: S.Number,
    botPath: S.Array(S.Struct({ x: S.Number, y: S.Number })),
    botTicksSinceThink: S.Number,
    botAttackTargetId: S.String,
    // Score Tracking (Phase 5)
    roundWins: S.Number
});

// GRID CELL
export type Cell = typeof Cell.Type;
export const Cell = S.Union(
    S.TaggedStruct("Empty", {}),
    S.TaggedStruct("SoftBlock", {}),
    S.TaggedStruct("HardBlock", {})
);
export const [Empty, SoftBlock, HardBlock] = Cell.members;

// BOMB
export type Bomb = typeof Bomb.Type;
export const Bomb = S.Struct({
    id: S.String,
    x: S.Int,
    y: S.Int,
    timer: S.Number,
    range: S.Number,
    owner: S.String,
});

// EXPLOSION
export type ExplosionCell = typeof ExplosionCell.Type;
export const ExplosionCell = S.Struct({
    x: S.Int,
    y: S.Int,
    timer: S.Number,
    owner: S.String,
    softBlock: S.Boolean, 
});

// MAIN MODEL
export const Model = S.Struct({
    status: S.Enums(GameStatus),
    grid: S.Array(S.Array(Cell)),
    players: S.Array(Player),
    input: InputState,
    bombs: S.HashMap({ key: S.Int, value: Bomb }),
    powerups: S.HashMap({ key: S.Int, value: PowerUp}),
    explosions: S.Array(ExplosionCell),
    timeLeft: S.Number,
    timeTickAcc: S.Number,
    lastTickTime: S.Number,
    //
    roundStartTimer: S.Number,
    roundWinner: S.String,
    winsToWin: S.Number,
    //
    numHumanPlayers: S.Number,
    numBots: S.Number,
    debugMode: S.Boolean
});
export type Model = typeof Model.Type;

// --- INITIALIZATION ---

export const generateGrid = (): Array<Array<Cell>> => {
    const grid: Cell[][] = []
    const isSafe = (x: number, y: number) => {
        // Corners and adjacents
        const safeSpots = [
            {x:1, y:1}, {x:1, y:2}, {x:2, y:1}, // TL
            {x:COLS-2, y:1}, {x:COLS-2, y:2}, {x:COLS-3, y:1}, // TR
            {x:1, y:ROWS-2}, {x:1, y:ROWS-3}, {x:2, y:ROWS-2}, // BL
            {x:COLS-2, y:ROWS-2}, {x:COLS-2, y:ROWS-3}, {x:COLS-3, y:ROWS-2} // BR
        ];
        return safeSpots.some(p => p.x === x && p.y === y);
    };

    for (let y = 0; y < ROWS; y++) {
        const row: Cell[] = [];
        for (let x = 0; x < COLS; x++) {
            if (x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1) {
                row.push(HardBlock.make({}));
            } else if (x % 2 === 0 && y % 2 === 0) {
                row.push(HardBlock.make({}));
            } else if (isSafe(x, y)) {
                row.push(Empty.make({}));
            } else {
                row.push((Math.random() * 100) < settings.softBlockChance 
                    ? SoftBlock.make({}) 
                    : Empty.make({})
                );
            }
        }
        grid.push(row);
    }
    return grid;
};

export const initPlayer = (id: string, x: number, y: number, isBot: boolean, botType: "hostile" | "careful" | "greedy" | "not"): Player => {
    return Player.make({
        id,
        isBot,
        xCoordinate: x,
        yCoordinate: y,
        targetX: x,
        targetY: y,
        lastDirection: "up",
        isAlive: true,
        deathTickDelay: 0,
        bombsActive: 0,
        maxBombs: 1,
        bombRange: 1,
        speedMulti: 1.0,
        botType,
        botState: "wander",
        botGoalX: x,
        botGoalY: y,
        botPath: [],
        botTicksSinceThink: 0,
        botAttackTargetId: "",
        roundWins: 0
    });
};

export const initInput = InputState.make({
    up: false, down: false, left: false, right: false, space: false,
    w: false, s: false, a: false, d: false, x: false, escape: false
});

export const initModel = Model.make({
    status: GameStatus.ROUND_START,
    grid: generateGrid(),
    players: [
        initPlayer("P1", PLAYER_START_POSITIONS.P1.x, PLAYER_START_POSITIONS.P1.y, false, "not"),
        ...(settings.numHumanPlayers === 1
            ? [
                ...(settings.botTypes[0] ? [initPlayer("P2", PLAYER_START_POSITIONS.P2.x, PLAYER_START_POSITIONS.P2.y, true, settings.botTypes[0] as any)] : []),
                ...(settings.botTypes[1] ? [initPlayer("P3", PLAYER_START_POSITIONS.P3.x, PLAYER_START_POSITIONS.P3.y, true, settings.botTypes[1] as any)] : []),
                ...(settings.botTypes[2] ? [initPlayer("P4", PLAYER_START_POSITIONS.P4.x, PLAYER_START_POSITIONS.P4.y, true, settings.botTypes[2] as any)] : [])
              ]
            : [
                initPlayer("P2", PLAYER_START_POSITIONS.P2.x, PLAYER_START_POSITIONS.P2.y, false, "not"),
                ...(settings.botTypes[0] ? [initPlayer("P3", PLAYER_START_POSITIONS.P3.x, PLAYER_START_POSITIONS.P3.y, true, settings.botTypes[0] as any)] : []),
                ...(settings.botTypes[1] ? [initPlayer("P4", PLAYER_START_POSITIONS.P4.x, PLAYER_START_POSITIONS.P4.y, true, settings.botTypes[1] as any)] : [])
              ]
        )
    ],
    input: initInput,
    bombs: HM.empty(),
    powerups: HM.empty(),
    explosions: A.empty(),
    timeLeft: settings.gameDuration,
    timeTickAcc: 0,
    lastTickTime: 0,
    roundStartTimer: 3* FPS,
    roundWinner: "",
    winsToWin: settings.winsToWin,
    numHumanPlayers: settings.numHumanPlayers,
    numBots: settings.botTypes.length,
    debugMode: false
});
