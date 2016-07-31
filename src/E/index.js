/* @flow */

import type { $Id, $Label, $Weight, $Cursor, $Page } from '../Types'
import type { ParsedCursor } from '../Types/Cursor'
import type { Graph } from '../G'

import { TABLE_EDGE
       , INDEX_ADJACENCY
       } from '../G'

import { invariant, maybe } from '../utils'
import { Cursor } from '../Types'

/**
 * E
 *
 * An edge is a directed, weighted arc with a type representation and attribute map:
 *
 *   e = (from, label, direction, weight, to, λ: k -> v)
 *
 *   e.g. e  = (a4X, Posted, >, 10, lzE, ...attrs)
 *        e' = (lzE, Posted, <, 10, a4X, ...attrs)
 */

type Direction = ">" | "<"

export const OUT = ">"
export const IN  = "<"

type Edge<a> =
  { from      : $Id
  , label     : $Label<Edge<a>>
  , direction : Direction
  , weight    : $Weight
  , to        : $Id
  , attrs     : a
/**
 * Just as we do with vertices, we attach a magic "updatedAt" field for maintenance
 */
  , updatedAt : number
  }

/**
 * Although edges are directed, for efficient querying, we always store both directions
 */

function invert<a>(edge: Edge<a>): Edge<a> {
  const direction : Direction = edge.direction === ">" ? "<" : ">"
  return {
    ...edge
    , from: edge.to
    , direction
    , to: edge.from
  }
}

/**
 *
 * Notice that edges are paramterized over their types
 * We define a EdgeDef object that describes the type of a vertex
 * such that the string representation `label` uniquely identifies the definition
 *
 */

type EdgeDef<a> =
  { __EDGE_DEF__: true
  , label: $Label<Edge<a>>
  , multiplicity: Multiplicity
  }


/**
 * The edge multiplicity is used to enforce constraints on the number of edges.
 *
 * i.e. if Foo has multiplicity ONE_TO_MANY,
 *        let a = foo |-Foo-> bar
 *            b = baz |-Foo-> bar
 *      Edges `a` and `b` cannot coexist, as this would imply:
 *            bar <-Foo-| foo
 *        and bar <-Foo-| baz
 *        violating the { in: "ONE" } cardinality constraint
 */

type Cardinality = "MANY" | "ONE"
type Multiplicity = { '>': Cardinality, '<': Cardinality }

export const MANY_TO_MANY : Multiplicity = { [IN]: "MANY", [OUT]: "MANY" }
export const  ONE_TO_MANY : Multiplicity = { [IN]:  "ONE", [OUT]: "MANY" }
export const MANY_TO_ONE  : Multiplicity = { [IN]: "MANY", [OUT]: "ONE"  }
export const  ONE_TO_ONE  : Multiplicity = { [IN]:  "ONE", [OUT]: "ONE"  }

const defs : { [key: string]: { mstring: string, def: EdgeDef<mixed> } } = {}

export function define<a>(label: $Label<Edge<a>>, multiplicity: Multiplicity): EdgeDef<a> {

  invariant
    ( label
    , 'Label must be non-empty'
    )
  invariant
    ( isMultiplicity(multiplicity)
    , `Edge "${label}" must have a valid multiplicity`
    )

  const mstring = `${multiplicity[IN]}2${multiplicity[OUT]}`

  if (defs[label]) {
    const cached = defs[label]
    invariant
      ( cached.mstring === mstring
      , `Contrary definition for edge "${label}" already found, `
      + 'edges may not share a label.'
      )
    return cached.def
  }

  const def = { __EDGE_DEF__: true, label, multiplicity }

  defs[label] = { mstring, def }

  return def

}

/**
 * Using this definition, we have enough information to create an edge.
 * Since edges are uniquely identified by the tuple (from, label, direction, to),
 * we expose a single "set" operation which overwrites the existing edge if one exists
 *
 * Since all edges need weights, but we do not always have a meaningful weight to define,
 * we allow an option `E.GENERATE`
 */

type MaybeWeight = $Weight | "__GENERATE__"

export const GENERATE = "__GENERATE__"

// E.set :: Graph -> Id -> EdgeDef a -> Direction -> (Weight | GENERATE) -> Id -> a -> Edge a
export async function set<a>
  ( g: Graph
  , from: $Id
  , def: EdgeDef<a>
  , direction: Direction = OUT
  , weight: MaybeWeight = GENERATE
  , to: $Id
  , attrs: a
  ): Promise<Edge<a>> {

    invariant(g.__GRAPH__, `E.get expected Graph for 1st argument, got "${g}"`)
    invariant(from, `E.get expected Id for 2nd argument, got "${from}"`)
    invariant(def.__EDGE_DEF__, `E.get expected EdgeDef for 3rd argument, got "${def}"`)
    invariant(isDirection(direction), `E.get expected Direction for 4th argument, got "${direction}"`)
    // TODO: validate weight
    invariant(to, `E.get expected Id for 6th argument, got "${to}"`)

    if (weight === GENERATE)
      weight = await g.weight()

    const edge: Edge<a> =
      { from
      , label: def.label
      , direction
      , weight: ((weight: any): $Weight) // assert that weight is of the correct type
      , to
      , attrs
      , updatedAt: +Date.now()
      }

    const out = direction === OUT

    if (def.multiplicity[IN] === "ONE") {
      const { items: [ inE ] }: $Page<Edge<a>> =
        await range(g, out ? to : from, def, IN)
      if (inE) await remove(g, inE.from, def, IN, inE.to)
    }

    if (def.multiplicity[OUT] === "ONE") {
      const { items: [ outE ] }: $Page<Edge<a>> =
        await range(g, out ? from : to, def, OUT)
      if (outE) await remove(g, outE.from, def, OUT, outE.to)
    }

    await g.batchPut
      ( TABLE_EDGE
      , [ serialize(edge)
        , serialize(invert(edge))
        ]
      )

    return edge
  }

/**
 *
 * Since the tuple (from, label, direction, to) uniquely defines the edge, there exist a map
 *
 *   E.get :: Graph -> Id -> EdgeDef a -> Direction -> Id
 *
 */

export async function get<a>
  ( g: Graph
  , from: $Id
  , def: EdgeDef<a>
  , direction: Direction = OUT
  , to: $Id
  ): Promise<?Edge<a>> {

    // type validations
    invariant(g.__GRAPH__, `E.get expected Graph for 1st argument, got "${g}"`)
    invariant(from, `E.get expected Id for 2nd argument, got "${from}"`)
    invariant(def.__EDGE_DEF__, `E.get expected EdgeDef for 3rd argument, got "${def}"`)
    invariant(isDirection(direction), `E.get expected Direction for 4th argument, got "${direction}"`)
    invariant(to, `E.get expected Id for 5th argument, got "${to}"`)

    const [ edge ]: Array<?SerializedEdge<a>> = await g.batchGet
      ( TABLE_EDGE
      , [{ hk: `${from}${direction}${def.label}`, to }]
      )

    return edge
      ? deserialize(edge)
      : null
  }

/**
 *
 * In order to get any use out of the edge store, we also provide a method to retrieve pages of
 * edges matching a partial tuple (from, label, direction), sorted by weight
 *
 *   E.range :: Graph -> Id -> EdgeDef a -> Direction -> Cursor -> Page (Edge a)
 *
 */

export async function range<a>
  ( g: Graph
  , from: $Id
  , def: EdgeDef<a>
  , direction: Direction = OUT
  , cursor: ?$Cursor = {}
  ): Promise<$Page<Edge<a>>> {

    // type validations
    invariant(g.__GRAPH__, `E.range expected Graph for 1st argument, got "${g}"`)
    invariant(from, `E.range expected Id for 2nd argument, got "${from}"`)
    invariant(def.__EDGE_DEF__, `E.range expected EdgeDef for 3rd argument, got "${def}"`)
    invariant(isDirection(direction), `E.range expected Direction for 4th argument, got "${direction}"`)

    const { RangeCondition, Limit, ScanIndexForward }: ParsedCursor = Cursor.parse(cursor)

    const { items, ...pageInfo }: $Page<SerializedEdge<a>> =
      await g.query
        ( TABLE_EDGE
        , INDEX_ADJACENCY
        , { KeyConditions:
            { hk:     { ComparisonOperator: 'EQ'
                      , AttributeValueList: [ `${from}${direction}${def.label}` ]
                      }
            , ...maybe('weight', RangeCondition)
            }
          , ScanIndexForward
          }
        , Limit
        )

    return { items: items.map(deserialize), ...pageInfo }
  }

/**
 *
 * Finally we expose a method to remove an edge, removing both the forward and backward adjacency from the graph
 *
 *   E.remove :: Graph -> Id -> EdgeDef a -> Direction -> Id -> Edge a
 *
 */

export async function remove<a>
  ( g: Graph
  , from: $Id
  , def: EdgeDef<a>
  , direction: Direction = OUT
  , to: $Id
  ): Promise<Edge<a>> {

    // effectively performs type validations
    // but we should do them again here so the error messages match
    const e = await get(g, from, def, direction, to)

    invariant(e, 'Cannot remove an edge that does not exist')

    await g.batchDel
      ( TABLE_EDGE
      , [ { hk: `${from}${direction}${def.label}`, to }
        , { hk: `${to}${direction === OUT ? IN : OUT}${def.label}`, to: from }
        ]
      )

    return e

  }

/**
 * Do to the two-key restriction on dynamodb, we simulate a compound index
 * by serializing (from, direction, label) as a single string: `hk`
 *
 * As a slight optimization we also serialize
 */

type SerializedEdge<a> =
  { from      : $Id
  , label     : $Label<Edge<a>>
  , out       : boolean
  , weight    : $Weight
  , to        : $Id
  , attrs     : a
  , updatedAt : number
  , hk        : string
  }

function serialize<a>({ direction, ...edge }: Edge<a>): SerializedEdge<a> {
  return {
    ...edge
    , out: direction === OUT
    , hk: `${edge.from}${direction}${edge.label}`
  }
}

function deserialize<a>({ hk, out, attrs, ...edge }: SerializedEdge<a>): Edge<a> {
  return {
    ...edge
    , direction: out ? OUT : IN
    , attrs // for consistency
  }
}

/**
 * validators
 */

function isMultiplicity(m: Multiplicity): boolean {
  return m && ( m[IN]  === "MANY" || m[IN]  === "ONE" )
           && ( m[OUT] === "MANY" || m[OUT] === "ONE" )
}

function isDirection(dir: Direction): boolean {
  return dir === OUT || dir === IN
}
