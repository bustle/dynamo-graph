/* @flow */

import type { $Id, $Label, $Weight } from '../Types'
import type { Graph, QueryResult } from '../G'

import { TABLE_EDGE
       , INDEX_ADJACENCY
       } from '../G'

import { invariant } from '../utils'

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

/**
 * For indexing purposes, we also create a special attribute
 *
 *   hk = [from][direction][label]
 *
 *   e.g. e.hk  = a4X>Posted
 *        e'.hk = lzE<Posted
 *
 * This is because DynamoDB only allows indices on a single hash and range key,
 * so we emulate a composite index with an explicit composite key
 */
  , hk         : string
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
    , hk: `${edge.to}${direction}${edge.label}`
  }
}

/**
 *
 * Notice that edges are paramterized over their types
 * We define a EdgeDef object that describes the type of a vertex
 * such that the string representation `label` uniquely identifies the definition
 *
 */

type EdgeDev<a> =
  { label: $Label<Edge<a>>
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
type Multiplicity = { in: Cardinality, out: Cardinality }

export const MANY_TO_MANY : Multiplicity = { in: "MANY", out: "MANY" }
export const MANY_TO_ONE  : Multiplicity = { in: "MANY", out: "ONE"  }
export const  ONE_TO_MANY : Multiplicity = { in:  "ONE", out: "MANY" }
export const  ONE_TO_ONE  : Multiplicity = { in:  "ONE", out: "ONE"  }

const multiplicityIsValid = (m: Multiplicity): boolean => m
  && ( m.in  === "MANY" || m.in  === "ONE" )
  && ( m.out === "MANY" || m.out === "ONE" )

const defs : { [key: string]: { mstring: string, def: EdgeDev<mixed> } } = {}

export function define<a>(label: $Label<Edge<a>>, multiplicity: Multiplicity): EdgeDev<a> {

  invariant
    ( label
    , 'Label must be non-empty'
    )
  invariant
    ( multiplicityIsValid(multiplicity)
    , `Edge "${label}" must have a valid multiplicity`
    )

  const mstring = `${multiplicity.in}2${multiplicity.out}`

  if (defs[label]) {
    const cached = defs[label]
    invariant
      ( cached.mstring === mstring
      , `Contrary definition for edge "${label}" already found, `
      + 'edges may not share a label.'
      )
    return cached.def
  }

  const def = { label, multiplicity }

  defs[label] = { mstring, def }

  return def

}
