import { CanvasElement, OutlinedCircle, SolidCircle, SolidRectangle, Text} from "cs12251-mvu/src/canvas";
import { Match, pipe } from "effect";
import { TILE_SIZE } from "./constants";
import { Player } from "./model";
// Configuration for Path Markers (Corner positions)
const CORNER_OFFSET = 4 // Pixels from the edge
const MARKER_SIZE = 6

const getPathMarkerOffset = (botId: string): { dx: number, dy: number, color: string } => {
  // P1 is human, usually 0.
  // P2 (Id 1): Top-Right
  // P3 (Id 2): Bottom-Left
  // P4 (Id 3): Bottom-Right
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
        if (!bot.is_bot || !bot.isAlive) return

        const cx = bot.xCoordinate * TILE_SIZE
        const cy = bot.yCoordinate * TILE_SIZE

    // 1. Draw Danger Radius
    // Only if dangerDist > 0 (Hostile is 0, so no circle)
    // Note: Assuming you have a `config` object or property on bot to get dangerDist.
    // If not, we map it manually like in Python:
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
    // Iterate through the bot's calculated path
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