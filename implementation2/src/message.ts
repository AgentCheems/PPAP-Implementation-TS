import { Schema as S } from "effect"
import { CanvasMsg } from "cs12251-mvu/src/canvas"

export type Msg = typeof Msg.Type
export const Msg = S.Union(
    // S.TaggedStruct("GameChuChu", {}),
    CanvasMsg,
    S.TaggedStruct("Restart", {}),
)