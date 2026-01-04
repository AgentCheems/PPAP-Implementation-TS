import {
    type CanvasElement,
    SolidRectangle,
    Clear,
    SolidCircle,
    Text,
    CanvasImage
} from "cs12251-mvu/src/canvas"
import { Model, GameStatus, PowerupType } from "./model"
import { ROWS, COLS, TILE_SIZE, BOMB_TIMER_SECONDS, FPS, PLAYER_DYING_TIME_SECONDS } from "./constants"
import { Match, HashMap as HM } from "effect"
import { getDebugElements } from "./debug"

import p1SpriteUp from "url:./assets/players/p1/p1_sprite_up.png"
import p1SpriteDown from "url:./assets/players/p1/p1_sprite_down.png"
import p1SpriteLeft from "url:./assets/players/p1/p1_sprite_left.png"
import p1SpriteRight from "url:./assets/players/p1/p1_sprite_right.png"
import p1SpriteDying1 from "url:./assets/players/p1/p1_sprite_dying_1.png"
import p1SpriteDying2 from "url:./assets/players/p1/p1_sprite_dying_2.png"
import p1SpriteDying3 from "url:./assets/players/p1/p1_sprite_dying_3.png"

import p2SpriteUp from "url:./assets/players/p2/p2_sprite_up.png"
import p2SpriteDown from "url:./assets/players/p2/p2_sprite_down.png"
import p2SpriteLeft from "url:./assets/players/p2/p2_sprite_left.png"
import p2SpriteRight from "url:./assets/players/p2/p2_sprite_right.png"
import p2SpriteDying1 from "url:./assets/players/p2/p2_sprite_dying_1.png"
import p2SpriteDying2 from "url:./assets/players/p2/p2_sprite_dying_2.png"
import p2SpriteDying3 from "url:./assets/players/p2/p2_sprite_dying_3.png"

import p3SpriteUp from "url:./assets/players/p3/p3_sprite_up.png"
import p3SpriteDown from "url:./assets/players/p3/p3_sprite_down.png"
import p3SpriteLeft from "url:./assets/players/p3/p3_sprite_left.png"
import p3SpriteRight from "url:./assets/players/p3/p3_sprite_right.png"
import p3SpriteDying1 from "url:./assets/players/p3/p3_sprite_dying_1.png"
import p3SpriteDying2 from "url:./assets/players/p3/p3_sprite_dying_2.png"
import p3SpriteDying3 from "url:./assets/players/p3/p3_sprite_dying_3.png"

import p4SpriteUp from "url:./assets/players/p4/p4_sprite_up.png"
import p4SpriteDown from "url:./assets/players/p4/p4_sprite_down.png"
import p4SpriteLeft from "url:./assets/players/p4/p4_sprite_left.png"
import p4SpriteRight from "url:./assets/players/p4/p4_sprite_right.png"
import p4SpriteDying1 from "url:./assets/players/p4/p4_sprite_dying_1.png"
import p4SpriteDying2 from "url:./assets/players/p4/p4_sprite_dying_2.png"
import p4SpriteDying3 from "url:./assets/players/p4/p4_sprite_dying_3.png"

import bomb1 from "url:./assets/bombs/bomb_1.png"
import bomb2 from "url:./assets/bombs/bomb_2.png"
import bomb3 from "url:./assets/bombs/bomb_3.png"

import explosion1 from "url:./assets/explosions/explosion_1.png"
import explosion2 from "url:./assets/explosions/explosion_2.png"
import explosion3 from "url:./assets/explosions/explosion_3.png"
import explosion4 from "url:./assets/explosions/explosion_4.png"
import soft1 from "url:./assets/explosions/soft_1.png"
import soft2 from "url:./assets/explosions/soft_2.png"
import soft3 from "url:./assets/explosions/soft_3.png"
import soft4 from "url:./assets/explosions/soft_4.png"

import softBlock from "url:./assets/blocks/softblock.png"
import hardBlock from "url:./assets/blocks/hardblock.png"
import tileBlock from "url:./assets/blocks/tileblock.png"

import powerupBomb1 from "url:./assets/powerups/powerup_bomb_1.png"
import powerupBomb2 from "url:./assets/powerups/powerup_bomb_2.png"
import powerupFire1 from "url:./assets/powerups/powerup_fire_1.png"
import powerupFire2 from "url:./assets/powerups/powerup_fire_2.png"
import powerupSpeed1 from "url:./assets/powerups/powerup_speed_1.png"
import powerupSpeed2 from "url:./assets/powerups/powerup_speed_2.png"
import powerupVest1 from "url:./assets/powerups/powerup_vest_1.png"
import powerupVest2 from "url:./assets/powerups/powerup_vest_2.png" // part 2 here

import deathSound from "url:./assets/sounds/death.mp3"
import explosionSound from "url:./assets/sounds/explosion.mp3"
import powerUpSound from "url:./assets/sounds/powerup.mp3"

const p1Sprites = {
    up: p1SpriteUp,
    down: p1SpriteDown,
    left: p1SpriteLeft,
    right: p1SpriteRight, 
    dying: [p1SpriteDying3, p1SpriteDying2, p1SpriteDying1],
}

const p2Sprites = {
    up: p2SpriteUp,
    down: p2SpriteDown,
    left: p2SpriteLeft,
    right: p2SpriteRight, 
    dying: [p2SpriteDying3, p2SpriteDying2, p2SpriteDying1],
}

const p3Sprites = {
    up: p3SpriteUp,
    down: p3SpriteDown,
    left: p3SpriteLeft,
    right: p3SpriteRight, 
    dying: [p3SpriteDying3, p3SpriteDying2, p3SpriteDying1],
}

const p4Sprites = {
    up: p4SpriteUp,
    down: p4SpriteDown,
    left: p4SpriteLeft,
    right: p4SpriteRight, 
    dying: [p4SpriteDying3, p4SpriteDying2, p4SpriteDying1],
}

const bombSprites = [
    bomb1,
    bomb2,
    bomb3,
]

const explosionSprites = {
    regular: [explosion1, explosion2, explosion3, explosion4],
    softBlock: [soft4, soft3, soft2, soft1],
}

const powerupSprites = {
    [PowerupType.BombUp]: [powerupBomb1, powerupBomb2],
    [PowerupType.FireUp]: [powerupFire1, powerupFire2],
    [PowerupType.SpeedUp]: [powerupSpeed1, powerupSpeed2], 
    [PowerupType.Vest]: [powerupVest1, powerupVest2], //part2 here
}
export const view = (model: Model): CanvasElement[] => {
    const elements: CanvasElement[] = []
    elements.push(Clear.make({ color: "#228822" }))
    
    // Play sounds
    if (model.playPowerUpSound) {
        const audio = new Audio(powerUpSound)
        audio.play()
    }

    if (model.playDeathSound) {
        const audio = new Audio(deathSound)
        audio.play()
    }

    if (model.playExplosionSound) {
        const audio = new Audio(explosionSound) 
        audio.play()
    }

    // Render grid 
    model.grid.forEach((row, y) => {
        row.forEach((cell, x) => {
            const px = x * TILE_SIZE
            const py = y * TILE_SIZE

            if (cell._tag === "HardBlock") {
                elements.push(CanvasImage.make({
                    x: px,
                    y: py,
                    src: hardBlock
                }))
            } else if (cell._tag === "SoftBlock") {
                elements.push(CanvasImage.make({
                    x: px,
                    y: py,
                    src: softBlock
                }))
            }
        })
    })

    // POWERUPS
    HM.forEach(model.powerups, (pu) => {
        const px = pu.x * TILE_SIZE
        const py = pu.y * TILE_SIZE
        
        elements.push(CanvasImage.make({
            x: px,
            y: py,
            src: powerupSprites[pu.type][Math.floor(Date.now() / 500) % 2]
        }))
    })

    // BOMBS
    HM.forEach(model.bombs, (bomb) => {
        const px = bomb.x * TILE_SIZE
        const py = bomb.y * TILE_SIZE
        const pulsingEffect = Math.round(Math.cos(6 * bomb.timer * Math.PI / (BOMB_TIMER_SECONDS*FPS)) + 1)
        
        elements.push(CanvasImage.make({
            x: px,
            y: py,
            src: bombSprites[pulsingEffect],
        }))
    })

    // EXPLOSIONS
    model.explosions.forEach(exp => {
        const px = exp.x * TILE_SIZE
        const py = exp.y * TILE_SIZE

        const type = exp.softBlock ? "softBlock" : "regular"

        elements.push(CanvasImage.make({
            x: px,
            y: py,
            src: explosionSprites[type][Math.floor(exp.timer * 4 / FPS)]
        }))
    })

    // PLAYERS
    const renderPlayer = (p: any, imgSrcs: {[key: string]: string | string[]}) => {
        
        if (!p.isAlive) {
            if (p.dyingTimer <= 0) return
            const stage = Math.floor(p.dyingTimer * 3 / (PLAYER_DYING_TIME_SECONDS * FPS))
            const src = imgSrcs["dying"][stage]
            elements.push(CanvasImage.make({
                x: (p.xCoordinate * TILE_SIZE) - TILE_SIZE / 2,
                y: (p.yCoordinate * TILE_SIZE) - TILE_SIZE / 2,
                src: src
            }))
            return
        }
        
        elements.push(CanvasImage.make({
            x: (p.xCoordinate * TILE_SIZE) - TILE_SIZE / 2,
            y: (p.yCoordinate * TILE_SIZE) - TILE_SIZE / 2,
            src: (imgSrcs[p.lastDirection] || imgSrcs["up"]) as string
        }))

        if (p.hasVest) {
            elements.push(SolidCircle.make({
                x: (p.xCoordinate * TILE_SIZE),
                y: (p.yCoordinate * TILE_SIZE),
                radius: TILE_SIZE / 2,
                color: "rgba(0, 234, 255, 0.5)",
            }))

        }
    }

    //RENDERING PLAYERS
    model.players.forEach(p=> {
        if (p.id == "P1") renderPlayer(p, p1Sprites)
        if (p.id == "P2") renderPlayer(p, p2Sprites)
        if (p.id == "P3") renderPlayer(p, p3Sprites)
        if (p.id == "P4") renderPlayer(p, p4Sprites)

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
