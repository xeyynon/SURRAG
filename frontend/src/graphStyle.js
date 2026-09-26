// Single source for how an entity type looks. The main graph, the case
// workspace graph, the search results and the legend all read this, so a
// colour can never differ between screens (it had been copied three times).

export const NODE_COLORS = {
  person: '#f97316',
  location: '#5fb3b3',
  phone: '#a58fd6',
  vehicle: '#4ade80',
  case: '#f43f5e',
}

export const TYPE_LABELS = {
  person: 'Person',
  location: 'Location',
  phone: 'Phone',
  vehicle: 'Vehicle',
  case: 'Case',
}

// Canvas drawing cannot read CSS variables, so the few colours the graph
// draws itself live here beside the node colours.
export const GRAPH = {
  background: '#22252a',
  highlightFill: '#fbbf24',
  highlightRing: '#fde68a',
  hoverRing: '#ffffff',
  labelBackground: 'rgba(34,37,42,0.88)',
  labelText: '#e5e7eb',
  labelTextHighlight: '#fde68a',
}
