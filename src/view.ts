import {
    type CanvasElement,
    SolidRectangle,
    Clear,
    SolidCircle,
    Text,
    CanvasImage
} from "cs12251-mvu/src/canvas";
import { Model, GameStatus, PowerupType } from "./model";
import { ROWS, COLS, TILE_SIZE } from "./constants";
import { Match, HashMap as HM } from "effect";
import { getDebugElements } from "./debug";

export const view = (model: Model): CanvasElement[] => {
    const elements: CanvasElement[] = [];
    elements.push(Clear.make({ color: "#228822" }));
    
    // Render grid
    model.grid.forEach((row, y) => {
        row.forEach((cell, x) => {
            const px = x * TILE_SIZE;
            const py = y * TILE_SIZE;

            if (cell._tag === "HardBlock") {
                elements.push(SolidRectangle.make({
                    x: px,
                    y: py,
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    color: "#333333"
                }));
                elements.push(SolidRectangle.make({
                    x: px + 4,
                    y: py + 4,
                    width: TILE_SIZE - 8,
                    height: TILE_SIZE - 8,
                    color: "#444"
                }));
            } else if (cell._tag === "SoftBlock") {
                elements.push(SolidRectangle.make({
                    x: px,
                    y: py,
                    width: TILE_SIZE,
                    height: TILE_SIZE,
                    color: "#D2691E"
                }));
                elements.push(SolidRectangle.make({
                    x: px + 4,
                    y: py + 4,
                    width: TILE_SIZE - 8,
                    height: TILE_SIZE - 8,
                    color: "#CD853F"
                }));
            }
        });
    });

    // POWERUPS
    HM.forEach(model.powerups, (pu) => {
        const px = pu.x * TILE_SIZE;
        const py = pu.y * TILE_SIZE;
        let pow = "";
        
        Match.value(pu.type).pipe(
            Match.when(PowerupType.FireUp, () => {
                pow = "fireUp";
            }),
            Match.when(PowerupType.BombUp, () => {
                pow = "bombUp";
            }),
            Match.when(PowerupType.SpeedUp, () => {
                pow = "speedUp";
            }),
            Match.orElse(() => "")
        );
        
        elements.push(Text.make({
            x: px + TILE_SIZE / 2,
            y: py + TILE_SIZE / 2,
            text: pow,
            color: "white",
            fontSize: 12,
            font: "bold Arial",
            textAlign: "center"
        }));
    });

    // BOMBS
    HM.forEach(model.bombs, (bomb) => {
        const px = bomb.x * TILE_SIZE + (TILE_SIZE / 2);
        const py = bomb.y * TILE_SIZE + (TILE_SIZE / 2);
        const pulsingEffect = Math.sin(Date.now() / 100) * 2;
        
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
        }));
    });

    // EXPLOSIONS
    model.explosions.forEach(exp => {
        const px = exp.x * TILE_SIZE;
        const py = exp.y * TILE_SIZE;

        elements.push(SolidRectangle.make({
            x: px,
            y: py,
            width: TILE_SIZE,
            height: TILE_SIZE,
            color: "#FFD700"
        }));
        elements.push(SolidRectangle.make({
            x: px + 5,
            y: py + 5,
            width: TILE_SIZE - 10,
            height: TILE_SIZE - 10,
            color: "#FFFFE0"
        }));
    });

    // PLAYERS
    const renderPlayer = (p: any, imgSrc: string, label: string) => {
        if (!p.is_alive) return;
        
        elements.push(CanvasImage.make({
            x: (p.x_coordinate * TILE_SIZE) - TILE_SIZE / 2,
            y: (p.y_coordinate * TILE_SIZE) - TILE_SIZE / 2,
            src: imgSrc
        }));
        elements.push(Text.make({
            x: p.x_coordinate * TILE_SIZE,
            y: p.y_coordinate * TILE_SIZE,
            text: label,
            color: "white",
            fontSize: 12,
            font: "bold Arial",
            textAlign: "center"
        }));
    };

    //RENDERING PLAYERS
    model.players.forEach(p=> {
        if (p.id == "P1") renderPlayer(p, "./assets/p1_sprite.png", "P1");
        if (p.id == "P2") renderPlayer(p, "./assets/p2_sprite.png", "P2");
        if (p.id == "P3") renderPlayer(p, "./assets/p3_sprite.png", "P3");
        if (p.id == "P4") renderPlayer(p, "./assets/p4_sprite.png", "P4");

    })

    // DEBUG

    if (model.debugMode) elements.push(...getDebugElements(model.players))



    // renderPlayer(model.player1, "./assets/p1_sprite.png", "P1");
    // renderPlayer(model.player2, "./assets/p2_sprite.png", "P2");
    
    // // Add P3 rendering if present - Phase 3
    // if (model.player3) {
    //     renderPlayer(model.player3, "./assets/p3_sprite.png", "P3");
    // }

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

    // Game Over Overlay
    if (model.status !== GameStatus.PLAYING) {
        // Dim background
        elements.push(SolidRectangle.make({
            x: 0,
            y: 0,
            width: COLS * TILE_SIZE,
            height: ROWS * TILE_SIZE,
            color: "rgba(0,0,0,0.7)"
        }));

        let msg = "";
        if (model.status === GameStatus.P1_WIN) msg = "P1 WIN!";
        if (model.status === GameStatus.P2_WIN) msg = "P2 WIN!";
        if (model.status === GameStatus.P3_WIN) msg = "P3 WIN!";
        if (model.status === GameStatus.P4_WIN) msg = "P4 WIN!";
        if (model.status === GameStatus.DRAW) msg = "DRAW";

        elements.push(Text.make({
            x: (COLS * TILE_SIZE) / 2,
            y: (ROWS * TILE_SIZE) / 2,
            text: msg,
            color: "white",
            fontSize: 48,
            font: "bold Arial",
            textAlign: "center"
        }));
    }

    return elements;
};