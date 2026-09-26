// Turns the API's {nodes:[{data}], edges:[{data}]} payload into what the
// force graph draws. Pure, so it is unit-tested without a browser.
//
// `val` drives the library's own hit-test radius (sqrt(val) * nodeRelSize);
// it is kept roughly equal to the radius NetworkGraph draws so a drag lands
// where the circle looks like it is.
export function buildGraphData(graph, keyConnectorIds = []) {
  if (!graph) return { graphData: { nodes: [], links: [] }, alwaysLabelIds: new Set() }

  const links = graph.edges.map((e) => ({
    source: e.data.source,
    target: e.data.target,
    weight: e.data.weight,
  }))

  const degree = {}
  links.forEach((l) => {
    degree[l.source] = (degree[l.source] || 0) + 1
    degree[l.target] = (degree[l.target] || 0) + 1
  })

  const nodes = graph.nodes.map((n) => {
    const deg = degree[n.data.id] || 0
    return { ...n.data, degree: deg, val: 1 + Math.min(deg, 10) * 0.9 }
  })

  // Labels always shown: the new FIR's own entities and the top connectors,
  // so the point of an analysis is legible without hunting. The rest reveal
  // on hover or zoom.
  const keyIds = new Set(keyConnectorIds)
  const alwaysLabelIds = new Set()
  nodes.forEach((n) => {
    if (n.highlight || keyIds.has(n.domain_id)) alwaysLabelIds.add(n.id)
  })

  return { graphData: { nodes, links }, alwaysLabelIds }
}
