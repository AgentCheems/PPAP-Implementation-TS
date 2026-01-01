import { Schema as S, HashMap as HM, Array as A } from "effect";
import { ROWS, COLS, PLAYER_START_POSITIONS } from "./constants";
import settings from "./settings.json";

// GAME-STATE Handling
export enum GameStatus {
    PLAYING,
    P1_WIN,
    P2_WIN,
    P3_WIN,  // Added for Phase 3
    P4_WIN,
    DRAW
}

export type BotType = typeof BotType.Type
export const BotType = S.Union(
    S.Literal("hostile"),
    S.Literal("careful"),
    S.Literal("greedy"),
    S.Literal("extreme"),
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
    // for P1
    up: S.Boolean,
    down: S.Boolean,
    left: S.Boolean,
    right: S.Boolean,
    space: S.Boolean,
    // for P2
    w: S.Boolean,
    s: S.Boolean,
    a: S.Boolean,
    d: S.Boolean,
    x: S.Boolean,
    // debugotinarigar
    escape: S.Boolean
});

export enum PowerupType {
    FireUp,
    BombUp,
    SpeedUp
}

// POWERUPS
export type PowerUp = typeof PowerUp.Type;
export const PowerUp = S.Struct({
    type: S.Enums(PowerupType),
    x: S.Int,
    y: S.Int
});

// PLAYER
export type Player = typeof Player.Type;
export const Player = S.Struct({
    id: S.String, // mas better na itong P1. P2. P3. P4
    isBot: S.Boolean,  // Added for Phase 3
    // -- keep the same
    xCoordinate: S.Number,
    yCoordinate: S.Number,
    targetX: S.Number,
    targetY: S.Number,
    isAlive: S.Boolean,
    deathTickDelay: S.Number, // one-second delay before their opponent is declared the winner
    // Bomb Stats
    bombsActive: S.Number,
    bombRange: S.Number,
    maxBombs: S.Number,
    speedMulti: S.Number,
    // AI Effects
    botType: BotType, // gawin paba tong Struct Union nakaktamad namamn // ok na
    botState: BotState,
    botGoalX: S.Number,
    botGoalY: S.Number,
    botPath: S.Array(S.Struct({
        x: S.Number,
        y: S.Number
    })),
    botTicksSinceThink: S.Number, //djaskstra reevaluation counter
    botShouldPlant: S.Boolean

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
    owner: S.String, // P1, P2, P3, P4
});

// EXPLOSION
export type ExplosionCell = typeof ExplosionCell.Type;
export const ExplosionCell = S.Struct({
    x: S.Int,
    y: S.Int,
    timer: S.Number,
    owner: S.String // P1, P2, P3, P4
});

// MAIN MODEL
export const Model = S.Struct({
    status: S.Enums(GameStatus),
    grid: S.Array(S.Array(Cell)), // this will be the 13 x 15 layout
    players: S.Array(Player),

    // player1: Player,
    // player2: Player,
    // player3: S.optional(Player), // Added for Phase 3 - optional player

    input: InputState,
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
    gameEndTimer: S.Number,
    // Phase 3 settings
    numHumanPlayers: S.Number,  // Added: 1 or 2 human players
    numBots: S.Number,           // Added: number of bots (1-3)
    // Phase 4
    debugMode: S.Boolean
});
export type Model = typeof Model.Type;

// INITIALIZATION
const generateGrid = (): Array<Array<Cell>> => {
    const grid: Cell[][] = [];
    const isSafe = (x: number, y: number) => {
        // Four Corners (spawn points):
        if ((x == 1 && y == 1) || (x == COLS - 2 && y == ROWS - 2)) return true;
        if ((x == COLS - 2 && y == 1) || (x == 1 && y == ROWS - 2)) return true;
        
        // P1 Adjacents (top-left: 1, 1)
        if ((x == 1 && y == 2) || (x == 2 && y == 1)) return true;
        
        // P2 Adjacents (top-right: COLS-2, 1) = (13, 1)
        if ((x == COLS - 2 && y == 2) || (x == COLS - 3 && y == 1)) return true;
        
        // P3 Adjacents (bottom-left: 1, ROWS-2) = (1, 11)
        if ((x == 1 && y == ROWS - 3) || (x == 2 && y == ROWS - 2)) return true;
        
        // P4 Adjacents (bottom-right: COLS-2, ROWS-2) = (13, 11)
        if ((x == COLS - 2 && y == ROWS - 3) || (x == COLS - 3 && y == ROWS - 2)) return true;
        
        return false;
    };

    for (let y = 0; y < ROWS; y++) {
        const row: Cell[] = [];
        for (let x = 0; x < COLS; x++) {
            if (x == 0 || x == COLS - 1 || y == 0 || y == ROWS - 1) {
                row.push(HardBlock.make({}));
                continue;
            }
            // Hard Block pattern
            if (x % 2 == 0 && y % 2 == 0) {
                row.push(HardBlock.make({}));
                continue;
            }
            // Safe Zone
            if (isSafe(x, y)) {
                row.push(Empty.make({}));
                continue;
            }
            // Random Soft Block
            if ((Math.random() * 100) < settings.softBlockChance) {
                row.push(SoftBlock.make({}));
            } else {
                row.push(Empty.make({}));
            }
        }
        grid.push(row);
    }
    return grid;
};

export const initPlayer = (p: string, x: number, y: number, isBot: boolean = false, type: "hostile" | "careful" | "greedy" = "hostile"): Player => {
    return Player.make({
    id: p,
    isBot: isBot,
    xCoordinate: x,
    yCoordinate: y,
    targetX: x,
    targetY: y,
    isAlive: true,
    deathTickDelay: 0,
    bombsActive: 0,
    maxBombs: 1,
    bombRange: 1,
    speedMulti: 1.0,

    botType: type,
    botState: "wander",
    botGoalX: x,
    botGoalY: y,
    botPath: [],
    botTicksSinceThink: 0,
    botShouldPlant: false
})
};

export const initInput = InputState.make({
    up: false, down: false, left: false, right: false, space: false,
    w: false, s: false, a: false, d: false, x: false, escape: false
});

const initBot = (id: string, pos: {x: number, y: number}, type: any) =>
    initPlayer(id, pos.x, pos.y, true, type as any)

export const initModel = Model.make({
    status: GameStatus.PLAYING,
    grid: generateGrid(),
    players: [
        //P1 always Human
        initPlayer("P1", PLAYER_START_POSITIONS.P1.x, PLAYER_START_POSITIONS.P1.y, false),
        ...(settings.numHumanPlayers === 1
        ? [//If isa lang human, then P2, P3, P4 are bots
            ...(settings.botTypes[0] ? [initBot("P2", PLAYER_START_POSITIONS.P2, settings.botTypes[0])] : []),
            ...(settings.botTypes[1] ? [initBot("P3", PLAYER_START_POSITIONS.P3, settings.botTypes[1])] : []),
            ...(settings.botTypes[2] ? [initBot("P4", PLAYER_START_POSITIONS.P4, settings.botTypes[2])] : []),
        ]
        : [// If 2 human, P3, P4 bots

            initPlayer("P2", PLAYER_START_POSITIONS.P2.x, PLAYER_START_POSITIONS.P2.y, false),
            ...(settings.botTypes[0] ? [initBot("P3", PLAYER_START_POSITIONS.P3, settings.botTypes[0])] : []),
            ...(settings.botTypes[1] ? [initBot("P4", PLAYER_START_POSITIONS.P4, settings.botTypes[1])] : []),
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
    gameEndTimer: -1,
    numHumanPlayers: settings.numHumanPlayers,
    numBots: settings.botTypes.length,
    debugMode: true
});