import {
    type CanvasElement,
    SolidRectangle,
    Clear,
    SolidCircle,
    Text,
    CanvasImage
} from "cs12251-mvu/src/canvas"
import { Model, GameStatus, PowerupType } from "./model"
import { ROWS, COLS, TILE_SIZE } from "./constants"
import { Match, HashMap as HM } from "effect"
import { getDebugElements } from "./debug"

import p1SpriteUp from "url:./assets/players/p1/p1_sprite_up.png"
import p1SpriteDown from "url:./assets/players/p1/p1_sprite_down.png"
import p1SpriteLeft from "url:./assets/players/p1/p1_sprite_left.png"
import p1SpriteRight from "url:./assets/players/p1/p1_sprite_right.png"

import p2SpriteUp from "url:./assets/players/p2/p2_sprite_up.png"
import p2SpriteDown from "url:./assets/players/p2/p2_sprite_down.png"
import p2SpriteLeft from "url:./assets/players/p2/p2_sprite_left.png"
import p2SpriteRight from "url:./assets/players/p2/p2_sprite_right.png"

import p3SpriteUp from "url:./assets/players/p3/p3_sprite_up.png"
import p3SpriteDown from "url:./assets/players/p3/p3_sprite_down.png"
import p3SpriteLeft from "url:./assets/players/p3/p3_sprite_left.png"
import p3SpriteRight from "url:./assets/players/p3/p3_sprite_right.png"

const p1Sprites = {
    up: p1SpriteUp,
    down: p1SpriteDown,
    left: p1SpriteLeft,
    right: p1SpriteRight, 
}

const p2Sprites = {
    up: p2SpriteUp,
    down: p2SpriteDown,
    left: p2SpriteLeft,
    right: p2SpriteRight, 
}

const p3Sprites = {
    up: p3SpriteUp,
    down: p3SpriteDown,
    left: p3SpriteLeft,
    right: p3SpriteRight, 
}

export const view = (model: Model): CanvasElement[] => {
    const elements: CanvasElement[] = []
    elements.push(Clear.make({ color: "#228822" }))
    
    // Render grid 
    model.grid.forEach((row, y) => {
        row.forEach((cell, x) => {
            const px = x * TILE_SIZE
            const py = y * TILE_SIZE

            if (cell._tag === "HardBlock") {
                elements.push(SolidRectangle.make({
                    x: px,
                    y: py,
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    color: "#333333"
                }))
                elements.push(SolidRectangle.make({
                    x: px + 4,
                    y: py + 4,
                    width: TILE_SIZE - 8,
                    height: TILE_SIZE - 8,
                    color: "#444"
                }))
            } else if (cell._tag === "SoftBlock") {
                elements.push(SolidRectangle.make({
                    x: px,
                    y: py,
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    color: "#D2691E"
                }))
                elements.push(SolidRectangle.make({
                    x: px + 4,
                    y: py + 4,
                    width: TILE_SIZE - 8,
                    height: TILE_SIZE - 8,
                    color: "#CD853F"
                }))
            }
        })
    })

    // POWERUPS
    HM.forEach(model.powerups, (pu) => {
        const px = pu.x * TILE_SIZE
        const py = pu.y * TILE_SIZE
        let pow = ""
        
        Match.value(pu.type).pipe(
            Match.when(PowerupType.FireUp, () => {
                pow = "fireUp"
            }),
            Match.when(PowerupType.BombUp, () => {
                pow = "bombUp"
            }),
            Match.when(PowerupType.SpeedUp, () => {
                pow = "speedUp"
            }),
            // add dito bago Rainbow
            Match.orElse(() => "")
        )
        
        elements.push(Text.make({
            x: px + TILE_SIZE / 2,
            y: py + TILE_SIZE / 2,
            text: pow,
            color: "white",
            fontSize: 12,
            font: "bold Arial",
            textAlign: "center"
        }))
    })

    // BOMBS
    HM.forEach(model.bombs, (bomb) => {
        const px = bomb.x * TILE_SIZE + (TILE_SIZE / 2)
        const py = bomb.y * TILE_SIZE + (TILE_SIZE / 2)
        const pulsingEffect = Math.sin(Date.now() / 100) * 2
        
        elements.push(SolidCircle.make({
            x: px,
            y: py,
            radius: (TILE_SIZE / 2.5) + pulsingEffect,
            color: "black"
        }));
        elements.push(SolidCircle.make({
            x: px,
            y: py,
            radius: (TILE_SIZE / 3),
            color: "yellow"
        }))
    })

    // EXPLOSIONS
    model.explosions.forEach(exp => {
        const px = exp.x * TILE_SIZE
        const py = exp.y * TILE_SIZE

        elements.push(SolidRectangle.make({
            x: px,
            y: py,
            width: TILE_SIZE,
            height: TILE_SIZE,
            color: "#FFD700"
        }))
        elements.push(SolidRectangle.make({
            x: px + 5,
            y: py + 5,
            width: TILE_SIZE - 10,
            height: TILE_SIZE - 10,
            color: "#FFFFE0"
        }))
    })

    // PLAYERS
    const renderPlayer = (p: any, imgSrcs: {[key: string]: string}) => {
        
        if (!p.isAlive) return
        
        elements.push(CanvasImage.make({
            x: (p.xCoordinate * TILE_SIZE) - TILE_SIZE / 2,
            y: (p.yCoordinate * TILE_SIZE) - TILE_SIZE / 2,
            src: imgSrcs[p.lastDirection] || imgSrcs["up"]
        }))
    }

    //RENDERING PLAYERS
    model.players.forEach(p=> {
        if (p.id == "P1") renderPlayer(p, p1Sprites)
        if (p.id == "P2") renderPlayer(p, p2Sprites)
        if (p.id == "P3") renderPlayer(p, p3Sprites)
        // if (p.id == "P4") renderPlayer(p, p4Sprites)

    })

    // DEBUG

    if (model.debugMode) elements.push(...getDebugElements(model.players))

    // ROUND START
    if (model.status === GameStatus.ROUND_START) {
        const seconds = Math.ceil(model.roundStartTimer / 30)
        let text = seconds.toString()
        if (seconds > 3) text = "READY"
        else if (seconds === 0) text = "GO!"
        elements.push(Text.make({
            x: (COLS * TILE_SIZE) / 2,
            y: (ROWS * TILE_SIZE) / 2,
            text: text, 
            color: "white", 
            fontSize: 64, 
            font: "bold Arial", 
            textAlign: "center"
        }))
    }

    // HUD (Timer)
    const min = Math.floor(model.timeLeft / 60).toString().padStart(2, '0');
    const sec = (model.timeLeft % 60).toString().padStart(2, '0');

    elements.push(Text.make({
        x: (COLS * TILE_SIZE) / 2,
        y: 25,
        text: `${min}:${sec}`,
        color: "white",
        fontSize: 24,
        font: "monospace",
        textAlign: "center"
    }));

    // Scores
    model.players.forEach((p) => {
        let px = 0;
        let align: "left" | "right" | "center" = "left";

        if (p.id === "P1") {
            px = 20;
            align = "left";
        } else if (p.id === "P2") {
            px = 120; // Offset from P1
            align = "left";
        } else if (p.id === "P3") {
            px = COLS * TILE_SIZE - 120; // Mirror P2
            align = "right";
        } else if (p.id === "P4") {
            px = COLS * TILE_SIZE - 20; // Mirror P1
            align = "right";
        } else {
            return; // Skip unknown IDs
        }

        elements.push(Text.make({ 
            x: px,
            y: 25, 
            text: `${p.id}: ${p.roundWins}`, 
            color: "yellow", 
            fontSize: 18, 
            font: "bold Arial", 
            textAlign: align 
        }));
    });

    // Game Over Overlay
    if (model.status === GameStatus.ROUND_END || model.status === GameStatus.GAME_OVER) {
    // Dim background
        elements.push(SolidRectangle.make({
            x: 0,
            y: 0,
            width: COLS * TILE_SIZE,
            height: ROWS * TILE_SIZE,
            color: "rgba(0,0,0,0.7)"
        }));

        const title = model.status === GameStatus.GAME_OVER ? "GAME OVER" : "ROUND OVER"
        const subtitle = model.roundWinner === "DRAW" ? "DRAW!" : `${model.roundWinner} WINS!`
        const prompt = model.status === GameStatus.GAME_OVER ? "REFRESH TO RESTRART" : "PRESS ESC FOR NEXT RIUBD"

        elements.push(Text.make({ 
            x: (COLS * TILE_SIZE) / 2, 
            y: (ROWS * TILE_SIZE) / 3, 
            text: title, color: "white", 
            fontSize: 48, 
            font: "bold Arial",
            textAlign: "center" }))
        elements.push(Text.make({ 
            x: (COLS * TILE_SIZE) / 2,
            y: (ROWS * TILE_SIZE) / 2, 
            text: subtitle, 
            color: "gold", 
            fontSize: 32, 
            font: "bold Arial", 
            textAlign: "center" }));
        elements.push(Text.make({ 
            x: (COLS * TILE_SIZE) / 2, 
            y: (ROWS * TILE_SIZE) / 1.5, 
            text: prompt, 
            color: "white", 
            fontSize: 18, 
            font: "monospace", 
            textAlign: "center" }));
        
        // Show Final Scores
        model.players.forEach((p, i) => {
             elements.push(Text.make({ x: (COLS * TILE_SIZE) / 2, y: (ROWS * TILE_SIZE) / 1.3 + (i * 25), text: `${p.id}: ${p.roundWins}`, color: "white", fontSize: 20, font: "Arial", textAlign: "center" }));
        });
    }

    return elements;
};