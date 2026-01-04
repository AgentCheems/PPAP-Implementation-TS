import { CanvasElement, OutlinedCircle, SolidCircle, SolidRectangle, Text} from "cs12251-mvu/src/canvas";
import { Match, pipe } from "effect";
import { TILE_SIZE } from "./constants";
import { Player } from "./model";
const CORNER_OFFSET = 4
const MARKER_SIZE = 6

const getPathMarkerOffset = (botId: string): { dx: number, dy: number, color: string } => {
  return pipe(Match.value(botId).pipe(
    Match.when("P1", () => ({
        dx: TILE_SIZE - CORNER_OFFSET - MARKER_SIZE,
        dy: CORNER_OFFSET,
        color: "cyan"
    })),
    Match.when("P2", () => ({
        dx: CORNER_OFFSET,
        dy: TILE_SIZE - CORNER_OFFSET - MARKER_SIZE,
        color: "magenta"
    })),
    Match.when("P3", () => ({
        dx: TILE_SIZE - CORNER_OFFSET - MARKER_SIZE,
        dy: TILE_SIZE - CORNER_OFFSET - MARKER_SIZE,
        color: "lime"
    })),
    Match.orElse(() => ({
        dx: 0,
        dy: 0,
        color: "white"
    }))
  ))
  }


export const getDebugElements = (players: readonly Player[]): CanvasElement[] => {
  const elements: CanvasElement[] = []

    players.forEach(bot => {
        if (!bot.isBot || !bot.isAlive) return

        const cx = bot.xCoordinate * TILE_SIZE
        const cy = bot.yCoordinate * TILE_SIZE

    // 1. Draw Danger Radius
        const dangerDistMap: Record<string, number> = { hostile: 1, careful: 4, greedy: 2 }
        const radiusCells = dangerDistMap[bot.botType] || 0

    if (radiusCells > 0) {
      elements.push(SolidCircle.make({
        x: cx,
        y: cy,
        radius: radiusCells * TILE_SIZE,
        color: "rgba(255, 0, 0, 0.1)"
      }))
    }

    // 2. Draw Bot Type (Above head)
    elements.push(Text.make({
      x: cx,
      y: cy - 25,
      text: bot.botType,
      color: "white",
      fontSize: 10,
      font: "sans-serif",
      textAlign: "center"
    }))

    // 3. Draw Bot State (Below feet)
    elements.push(Text.make({
      x: cx,
      y: cy + 25,
      text: bot.botState.toUpperCase(),
      color: "yellow",
      fontSize: 10,
      font: "sans-serif",
      textAlign: "center"
    }))

    // 4. Draw Path Markers
    const { dx, dy, color } = getPathMarkerOffset(bot.id)

    bot.botPath.forEach(step => {
        elements.push(SolidRectangle.make({
            x: step.x * TILE_SIZE + dx,
            y: step.y * TILE_SIZE + dy,
            width: MARKER_SIZE,
            height: MARKER_SIZE,
            color: color
        }))
    })
  })

  return elements
}