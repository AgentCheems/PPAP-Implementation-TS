import { type VNode } from "snabbdom"
import { h } from "."
import {
  Array,
  Match,
  pipe,
  Option,
  Schema as S,
  Effect,
  Ref,
  HashMap,
} from "effect"

export const CanvasElement = S.Union(
  S.TaggedStruct("NullElement", {}),
  S.TaggedStruct("Clear", {
    color: S.String,
  }),
  S.TaggedStruct("Text", {
    x: S.Number,
    y: S.Number,
    text: S.String,
    color: S.String,
    fontSize: S.Int,
    font: S.optionalWith(S.String, {
      default: () => "sans-serif",
    }),
    textAlign: S.optionalWith(
      S.Union(
        S.Literal("left"), //
        S.Literal("center"),
        S.Literal("right"),
      ),
      {
        default: () => "center",
      },
    ),
  }),
  S.TaggedStruct("SolidCircle", {
    x: S.Number,
    y: S.Number,
    radius: S.Number,
    color: S.String,
  }),
  S.TaggedStruct("OutlinedCircle", {
    x: S.Number,
    y: S.Number,
    radius: S.Number,
    color: S.String,
    lineWidth: S.Number,
  }),
  S.TaggedStruct("SolidRectangle", {
    x: S.Number,
    y: S.Number,
    width: S.Number,
    height: S.Number,
    color: S.String,
  }),
  S.TaggedStruct("OutlinedRectangle", {
    x: S.Number,
    y: S.Number,
    width: S.Number,
    height: S.Number,
    color: S.String,
    lineWidth: S.Number,
  }),
  S.TaggedStruct("Line", {
    x1: S.Number,
    y1: S.Number,
    x2: S.Number,
    y2: S.Number,
    color: S.String,
    lineWidth: S.Number,
  }),
  S.TaggedStruct("Image", {
    x: S.Number,
    y: S.Number,
    src: S.String,
  }),
)
export type CanvasElement = typeof CanvasElement.Type
export const [
  NullElement, //
  Clear,
  Text,
  SolidCircle,
  OutlinedCircle,
  SolidRectangle,
  OutlinedRectangle,
  Line,
  CanvasImage,
] = CanvasElement.members

export const CanvasMsg = S.Union(
  S.TaggedStruct("Canvas.MsgTick", {}),
  S.TaggedStruct("Canvas.MsgKeyDown", {
    key: S.String,
  }),
  S.TaggedStruct("Canvas.MsgMouseDown", {
    x: S.Number,
    y: S.Number,
  }),
)
export type CanvasMsg = typeof CanvasMsg.Type
export const [MsgTick, MsgKeyDown, MsgMouseDown] = CanvasMsg.members

const imageCacheRef = Ref.unsafeMake(HashMap.empty())

export const canvasView =
  <Model, Msg>(
    width: number,
    height: number,
    fps: number,
    canvasId: string,
    view: (model: Model) => CanvasElement[],
  ) =>
  (model: Model, dispatch: (msg: CanvasMsg | Msg) => void) =>
    Effect.Do.pipe(
      Effect.let(
        "canvas",
        () => document.getElementById(canvasId) as HTMLCanvasElement | null,
      ),
      Effect.let("ctx", ({ canvas }) => canvas?.getContext("2d")),
      Effect.tap(({ ctx }) =>
        ctx != null ?
          pipe(
            view(model),
            Array.map((e) =>
              Match.value(e).pipe(
                Match.tag("Clear", ({ color }) =>
                  Effect.void.pipe(
                    Effect.tap(() => (ctx.fillStyle = color)),
                    Effect.tap(() => ctx.fillRect(0, 0, width, height)),
                    Effect.tap(() => (ctx.fillStyle = "")),
                  ),
                ),
                Match.tag("NullElement", () => Effect.void),
                Match.tag(
                  "Text",
                  ({ x, y, text, color, font, fontSize, textAlign }) =>
                    Effect.void.pipe(
                      Effect.tap(() => (ctx.fillStyle = color)),
                      Effect.tap(() => (ctx.textAlign = textAlign)),
                      Effect.tap(() => (ctx.font = `${fontSize}px ${font}`)),
                      Effect.tap(() => ctx.fillText(text, x, y)),
                      Effect.tap(() => (ctx.fillStyle = "")),
                    ),
                ),
                Match.tag("SolidCircle", ({ x, y, radius, color }) =>
                  Effect.void.pipe(
                    Effect.tap(() => (ctx.fillStyle = color)),
                    Effect.tap(() => ctx.beginPath()),
                    Effect.tap(() => ctx.arc(x, y, radius, 0, 360)),
                    Effect.tap(() => ctx.fill()),
                    Effect.tap(() => ctx.closePath()),
                    Effect.tap(() => (ctx.fillStyle = "")),
                  ),
                ),
                Match.tag(
                  "OutlinedCircle",
                  ({ x, y, radius, color, lineWidth }) =>
                    Effect.void.pipe(
                      Effect.tap(() => (ctx.strokeStyle = color)),
                      Effect.tap(() => (ctx.lineWidth = lineWidth)),
                      Effect.tap(() => ctx.beginPath()),
                      Effect.tap(() => ctx.arc(x, y, radius, 0, 360)),
                      Effect.tap(() => ctx.closePath()),
                      Effect.tap(() => (ctx.strokeStyle = "")),
                    ),
                ),
                Match.tag("SolidRectangle", ({ x, y, width, height, color }) =>
                  Effect.void.pipe(
                    Effect.tap(() => (ctx.fillStyle = color)),
                    Effect.tap(() => ctx.beginPath()),
                    Effect.tap(() => ctx.fillRect(x, y, width, height)),
                    Effect.tap(() => ctx.fill()),
                    Effect.tap(() => ctx.closePath()),
                    Effect.tap(() => (ctx.fillStyle = "")),
                  ),
                ),
                Match.tag(
                  "OutlinedRectangle",
                  ({ x, y, width, height, color, lineWidth }) =>
                    Effect.void.pipe(
                      Effect.tap(() => (ctx.strokeStyle = color)),
                      Effect.tap(() => (ctx.lineWidth = lineWidth)),
                      Effect.tap(() => ctx.beginPath()),
                      Effect.tap(() => ctx.strokeRect(x, y, width, height)),
                      Effect.tap(() => ctx.closePath()),
                      Effect.tap(() => (ctx.strokeStyle = "")),
                    ),
                ),
                Match.tag("Line", ({ x1, y1, x2, y2, color, lineWidth }) =>
                  Effect.void.pipe(
                    Effect.tap(() => (ctx.strokeStyle = color)),
                    Effect.tap(() => (ctx.lineWidth = lineWidth)),
                    Effect.tap(() => ctx.beginPath()),
                    Effect.tap(() => ctx.moveTo(x1, y1)),
                    Effect.tap(() => ctx.lineTo(x2, y2)),
                    Effect.tap(() => ctx.stroke()),
                    Effect.tap(() => ctx.closePath()),
                    Effect.tap(() => (ctx.strokeStyle = "")),
                  ),
                ),
                Match.tag("Image", ({ x, y, src }) =>
                  Effect.void.pipe(
                    Effect.tap(() =>
                      Effect.Do.pipe(
                        Effect.bind("cache", () => Ref.get(imageCacheRef)),
                        Effect.tap(({ cache }) =>
                          pipe(
                            cache,
                            HashMap.get(src),
                            Option.getOrElse(() => {
                              // FIXME: Must wait for load event
                              const ret = new Image()
                              ret.src = src
                              return ret
                            }),
                            (img) =>
                              Effect.void.pipe(
                                Effect.tap(() => ctx.drawImage(img, x, y)),
                              ),
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
                Match.exhaustive,
              ),
            ),
            Effect.all,
          )
        : Effect.void.pipe(
            Effect.tap(() =>
              setTimeout(() => {
                // Needed to guide type inference
                const f = canvasView(width, height, fps, canvasId, view) as (
                  model: Model,
                  dispatch: (msg: Msg) => void,
                ) => VNode
                f(model, dispatch)
              }, 0),
            ),
          ),
      ),
      Effect.map(() =>
        h(
          "canvas",
          {
            props: {
              id: canvasId,
              width,
              height,
            },

            hook: {
              create: () => {
                window.addEventListener("keydown", (e) =>
                  dispatch(
                    MsgKeyDown.make({
                      key: e.key,
                    }),
                  ),
                )
                window.addEventListener("mousedown", (e) =>
                  dispatch(
                    MsgMouseDown.make({
                      x: e.x,
                      y: e.y,
                    }),
                  ),
                )
                setInterval(
                  () => requestAnimationFrame(() => dispatch(MsgTick.make())),
                  1000.0 / fps,
                )
              },
            },
          },
          [],
        ),
      ),
      Effect.runSync,
    )
