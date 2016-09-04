/* @flow */

import type { $Id, $Label, $Weight, $Cursor, $PageInfo } from '../Types'
import type { ParsedCursor } from '../Types/Cursor'
import type { Graph } from '../G'

import { INDEX_EDGE_OUT, INDEX_EDGE_IN } from '../G'

import { invariant, validateArg, maybe } from '../utils'
import { Table, Cursor } from '../Types'

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

export type Edge<a> =
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

const defs : { [key: string]: { mstring: string, def: EdgeDef<any> } } = {}

// Webpack treats the word `define` as a magical global due to the way AMD modules work
// and confuses the exports of babel for being "indirect usage"
// TODO: come up with a better name or let this be an es6 module
export { define$ as define }
function define$<a>(label: $Label<Edge<a>>, multiplicity: Multiplicity): EdgeDef<a> {

  invariant(label, 'Label must be non-empty')
  validateArg('E.define', 2, isMultiplicity, multiplicity)

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

  const def =
    { __EDGE_DEF__: true
    , label
    , multiplicity
    }

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

    validateArg('E.set', 1, isGraph, g)
    validateArg('E.set', 2, isID, from)
    validateArg('E.set', 3, isEdgeDef, def)
    validateArg('E.set', 4, isDirection, direction)
    validateArg('E.set', 5, isWeight, weight)
    validateArg('E.set', 6, isID, to)

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
      const [ inE ]: Array<Edge<a>> =
        await range(g, out ? to : from, def, IN)
      if (inE) await remove(g, inE.from, def, IN, inE.to)
    }

    if (def.multiplicity[OUT] === "ONE") {
      const [ outE ]: Array<Edge<a>> =
        await range(g, out ? from : to, def, OUT)
      if (outE) await remove(g, outE.from, def, OUT, outE.to)
    }

    await g.batchPut
      ( Table.EDGE
      , [ serialize(edge)
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

    validateArg('E.get', 1, isGraph, g)
    validateArg('E.get', 2, isID, from)
    validateArg('E.get', 3, isEdgeDef, def)
    validateArg('E.get', 4, isDirection, direction)
    validateArg('E.get', 5, isID, to)

    const [ edge ]: Array<?SerializedEdge<a>> = await g.batchGet
      ( Table.EDGE
      , [ direction === OUT
        ? { hk_out: `${def.label}>${from}`, to }
        : { hk_out: `${def.label}>${to}`, to: from }
        ]
      )

    return edge ? deserialize(edge, direction) : null
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
  ): Promise<Array<Edge<a>>> {

    validateArg('E.get', 1, isGraph, g)
    validateArg('E.get', 2, isID, from)
    validateArg('E.get', 3, isEdgeDef, def)
    validateArg('E.get', 4, isDirection, direction)

    const { RangeCondition
          , Limit
          , ScanIndexForward
          }: ParsedCursor = Cursor.parse(cursor)

    const edges: Array<SerializedEdge<a>> =
      await g.query
        ( Table.EDGE
        , direction === OUT ? INDEX_EDGE_OUT : INDEX_EDGE_IN
        , { KeyConditions:
            { [direction === OUT ? 'hk_out' : 'hk_in']:
                { ComparisonOperator: 'EQ'
                , AttributeValueList: [ `${def.label}${direction}${from}` ]
                }
            , ...maybe('weight', RangeCondition)
            }
          , Limit
          , ScanIndexForward
          }
        )

      return edges.map(e => deserialize(e, direction))
  }


export async function count<a>
  ( g: Graph
  , from: $Id
  , def: EdgeDef<a>
  , direction: Direction = OUT
  , cursor: ?$Cursor = {}
  ): Promise<$PageInfo> {

    validateArg('E.get', 1, isGraph, g)
    validateArg('E.get', 2, isID, from)
    validateArg('E.get', 3, isEdgeDef, def)
    validateArg('E.get', 4, isDirection, direction)

    const { RangeCondition
          , ScanIndexForward
          }: ParsedCursor = Cursor.parse(cursor)

    return g.count
      ( Table.EDGE
      , direction === OUT ? INDEX_EDGE_OUT : INDEX_EDGE_IN
      , { KeyConditions:
          { [direction === OUT ? 'hk_out' : 'hk_in']:
              { ComparisonOperator: 'EQ'
              , AttributeValueList: [ `${def.label}${direction}${from}` ]
              }
          , ...maybe('weight', RangeCondition)
          }
        , ScanIndexForward
        }
      )
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
  ): Promise<?Edge<a>> {

    // effectively performs type validations
    // but we should do them again here so the error messages match
    const e = await get(g, from, def, direction, to)

    if (e) {
      await g.batchDel
        ( Table.EDGE
        , [ direction === OUT
          ? { hk_out: `${def.label}>${from}`, to }
          : { hk_out: `${def.label}>${to}`, to: from }
          ]
        )
    }

    return e

  }

/**
 * We store single edges because this ain't redis anymore, we have more powerful queries.
 * Due to the two-key restriction on indices though, we simulate fields by creating computed tuples
 */

export type SerializedEdge<a> =
  { hk_out    : string
  , hk_in     : string
  , from      : $Id
  , label     : $Label<Edge<a>>
  , weight    : $Weight
  , to        : $Id
  , attrs     : a
  , updatedAt : number
  }

function serialize<a>({ direction, from, to, ...edge }: Edge<a>): SerializedEdge<a> {
  if (direction === IN)
    [ from, to ] = [ to, from ]
  return {
    ...edge
    , from
    , to
    , hk_out: `${edge.label}>${from}`
    , hk_in: `${edge.label}<${to}`
  }
}

function deserialize<a>({ hk_in, hk_out, from, to, attrs, ...edge }: SerializedEdge<a>, direction: Direction): Edge<a> {
  if (direction === IN)
    [ from, to ] = [ to, from ]
  return {
    ...edge
    , direction
    , from
    , to
    , attrs // for consistency (undefined attrs)
  }
}

/**
 * validators
 */

function isMultiplicity(m: Multiplicity): boolean {
  return m
      && ( m[IN]  === "MANY" || m[IN]  === "ONE" )
      && ( m[OUT] === "MANY" || m[OUT] === "ONE" )
}

function isGraph(g: Graph): boolean {
  return g.__GRAPH__
}

function isEdgeDef<a>(def: EdgeDef<a>): boolean {
  return def.__EDGE_DEF__
}

function isID(id: $Id): boolean {
  return typeof id === 'string'
}

function isWeight(weight: MaybeWeight): boolean {
  return weight === GENERATE || typeof weight === 'number'
}

function isDirection(dir: Direction): boolean {
  return dir === OUT || dir === IN
}
