import { startSimple } from "cs12251-mvu/src";
import { Model, initModel } from "./model";
import { view } from "./view";
import { update } from "./update";
import { canvasView } from "cs12251-mvu/src/canvas";
import { Msg } from "./message";
import { COLS, ROWS, TILE_SIZE, FPS } from "./constants";

const root = document.getElementById("app")!;
const GAME_WIDTH = COLS * TILE_SIZE;
const GAME_HEIGHT = ROWS * TILE_SIZE;

const gameCanvasView = canvasView<Model, Msg>(
    GAME_WIDTH,
    GAME_HEIGHT,
    FPS,
    "bomberman-canvas",
    view
);
startSimple(root, initModel, update, gameCanvasView);