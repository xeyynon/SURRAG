// One shape per entity type, so type is readable without relying on colour
// (colour-blind safe, and it survives a screenshot printed in greyscale).
// Polygons are in unit coordinates and scaled by the node radius; a person is
// a plain circle (null).
export const SHAPE_POINTS = {
  person: null,
  location: [[0, -1.3], [1.3, 0], [0, 1.3], [-1.3, 0]], // diamond
  phone: [[-0.95, -0.95], [0.95, -0.95], [0.95, 0.95], [-0.95, 0.95]], // square
  vehicle: [[0, -1.25], [1.25, 0.95], [-1.25, 0.95]], // triangle
  case: [[1.15, 0], [0.575, 1], [-0.575, 1], [-1.15, 0], [-0.575, -1], [0.575, -1]], // hexagon
}

export function tracePath(ctx, type, x, y, r) {
  const pts = SHAPE_POINTS[type]
  ctx.beginPath()
  if (!pts) {
    ctx.arc(x, y, r, 0, 2 * Math.PI)
    return
  }
  pts.forEach(([px, py], i) => {
    const X = x + px * r
    const Y = y + py * r
    if (i === 0) ctx.moveTo(X, Y)
    else ctx.lineTo(X, Y)
  })
  ctx.closePath()
}

// SVG version for the legend, from the same points.
export function svgPoints(type, size = 10) {
  const pts = SHAPE_POINTS[type]
  if (!pts) return null
  const r = size / 2 / 1.3
  return pts.map(([px, py]) => `${size / 2 + px * r},${size / 2 + py * r}`).join(' ')
}
