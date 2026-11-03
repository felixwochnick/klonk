import dagre from '@dagrejs/dagre'

export type GraphNode = { id: string, width: number, height: number }
export type GraphEdge = { from: string, to: string, label?: { width: number, height: number }, minlen?: number, weight?: number }
export type Point = { x: number, y: number }

export type GraphLayout = {
  nodes: Map<string, { x: number, y: number, width: number, height: number }>
  /** Je Kante (gleiche Reihenfolge): Linienzug und Mitte der Beschriftung */
  edges: { points: Point[], label?: Point }[]
  width: number
  height: number
}

/** Schichten-Layout (dagre); Koordinaten = Mittelpunkte der Knoten, Ursprung links oben */
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], options: { rankdir: 'TB' | 'BT' | 'LR' | 'RL', nodesep?: number, ranksep?: number }): GraphLayout {
  const g = new dagre.graphlib.Graph({ multigraph: true })
  g.setGraph({ rankdir: options.rankdir, nodesep: options.nodesep ?? 40, ranksep: options.ranksep ?? 60, edgesep: 20, marginx: 0, marginy: 0 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const node of nodes) g.setNode(node.id, { width: node.width, height: node.height })
  edges.forEach((edge, i) => {
    g.setEdge(edge.from, edge.to, { width: edge.label?.width ?? 0, height: edge.label?.height ?? 0, labelpos: 'c', minlen: edge.minlen ?? 1, weight: edge.weight ?? 1 }, `e${i}`)
  })
  dagre.layout(g)
  const result: GraphLayout = { nodes: new Map(), edges: [], width: 0, height: 0 }
  for (const node of nodes) {
    const laid = g.node(node.id) as { x: number, y: number }
    result.nodes.set(node.id, { x: laid.x, y: laid.y, width: node.width, height: node.height })
    result.width = Math.max(result.width, laid.x + node.width / 2)
    result.height = Math.max(result.height, laid.y + node.height / 2)
  }
  edges.forEach((edge, i) => {
    const laid = g.edge({ v: edge.from, w: edge.to, name: `e${i}` }) as { points?: Point[], x?: number, y?: number }
    const points = laid.points ?? []
    for (const p of points) {
      result.width = Math.max(result.width, p.x)
      result.height = Math.max(result.height, p.y)
    }
    result.edges.push({ points, label: edge.label && laid.x !== undefined ? { x: laid.x, y: laid.y! } : undefined })
  })
  return result
}

/** Pfad durch die Punkte (leicht gerundete Ecken wären hübscher – gerade Stücke bleiben gut lesbar) */
export function polyline(points: Point[]) {
  return points.map((p, i) => `${i ? 'L' : 'M'}${Math.round(p.x * 2) / 2} ${Math.round(p.y * 2) / 2}`).join('')
}

/** Spitze am Ende eines Linienzugs: Richtung des letzten Stücks */
export function endDirection(points: Point[]) {
  const end = points.at(-1)!
  const before = points.at(-2) ?? end
  const dx = end.x - before.x
  const dy = end.y - before.y
  const length = Math.hypot(dx, dy) || 1
  return { end, ux: dx / length, uy: dy / length }
}
