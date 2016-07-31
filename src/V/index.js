/* @flow */

import type { $Id, $Label, $Key, $Cursor, $Page } from '../Types'
import type { ParsedCursor } from '../Types/Cursor'
import type { Graph } from '../G'

import { INDEX_EDGE_FROM
       , INDEX_VERTEX_KEY
       , INDEX_VERTEX_ALL
       } from '../G'

import { OUT, IN } from '../E'

import { invariant, maybe, flatten } from '../utils'
import { Table, Cursor } from '../Types'

/**
 * V
 *
 * A vertex is a tuple of an id, type representation, and attribute map:
 *
 *   v = (id, label, λ: k -> v)
 *
 */

export type Vertex<a> =
  { id    : $Id
  , label : $Label<Vertex<a>>
  , attrs : a

/*
 * Such that the id uniquely identifies the vertex.
 *
 *   i.e. ∀ v1,v2 ∈ V : v1.id = v2.id ⇒ v1 = v2
 *
 * For convenience, we augment this definition with two additional properties:
 *
 *   key - unique string identifier such that the tuple (label, key) uniquely identifies a vertex:
 *     i.e. ∀ v1,v2 ∈ V : v1.key = v2.key ∧ v1.label = v2.label ⇒ v1 = v2
 *
 *   updatedAt - timestamp of last mutation, used to track the state of the graph
 *     n.b. ideally mutations should be avoided in favour of duplicating and re-linking vertices
 *          in which case, updatedAt describes the time the vertex was created
 */

  , key       : ?$Key<Vertex<a>>
  , updatedAt : number
  }

/**
 *
 * Notice that vertices are paramterized over their type.
 * We define a VertexDef object which describes the type of a vertex,
 * such that the string representation `label` uniquely identifies the definition
 *
 */

type VertexDef<a> =
  { __VERTEX_DEF__: true
  , label: $Label<Vertex<a>>
  // TODO: schema/validation object
  }

/**
 * usage:
 *
 * import { G, V } from 'dynamo-graph'
 *
 * const g = G.define('my-graph')
 * const PERSON = V.define('Person')
 *
 */

const defs: { [key: string]: VertexDef<mixed> } = {}

export function define<a>(label: $Label<Vertex<a>>): VertexDef<a> {

  invariant(label, 'Label must be non-empty')

  if (defs[label])
    return defs[label]

  const def =
    { __VERTEX_DEF__: true
    , label
    }

  return defs[label] = def

}

/**
 * Using this vertex definition, we have enough information to put a vertex to the graph
 */

// V.create :: Graph -> VertexDef a -> a -> Vertex a
export async function create<a>(g: Graph, def: VertexDef<a>, attrs: a): Promise<Vertex<a>> {
  const id: $Id = await g.id()
  return putVertex(g, def, id, attrs)
}

// V.update :: Graph -> VertexDef a -> Id -> a -> Vertex a
export async function update<a>(g: Graph, def: VertexDef<a>, id: $Id, attrs: a): Promise<Vertex<a>> {
  return putVertex(g, def, id, attrs)
}

// V.putByKey :: Graph -> VertexDef a -> Key a -> a -> Vertex a
export async function putByKey<a>(g: Graph, def: VertexDef<a>, key: $Key<a>, attrs: a): Promise<Vertex<a>> {
  const v: ?Vertex<a> = await getByKey(g, def, key)
  const id: $Id = v ? v.id
                    : await g.id()
  return putVertex(g, def, id, attrs, key)
}

async function putVertex<a>(g: Graph, { label }: VertexDef<a>, id: $Id, attrs: a, key: ?$Key<a>): Promise<Vertex<a>> {

  const v: Vertex<a> =
    { id, label, attrs        // copy attributes
    , updatedAt: +Date.now()  // ensure updatedAt field is changed with each mutation
    , ...(key ? { key } : {}) // avoid undefined fields
    }

  await g.batchPut(Table.VERTEX, [v])

  // prime cache
  g.VertexLoader.clear(id).prime(id, v)

  return v
}

/**
 *
 * Since the id uniquely identifies the vertex, there exists a mapping
 *
 *   V.get :: Graph -> Id -> Vertex (∃. a) ?
 *
 */

export async function get(g: Graph, id: $Id): Promise<?Vertex<mixed>> {

  invariant(g.__GRAPH__, `V.get expected Graph for 1st argument, got "${g.toString()}"`)
  invariant(id,          `V.get expected Id for 2nd argument, got "${id}"`)

  return g.VertexLoader.load(id)
}

// V.getMany :: Graph -> [ Id ] -> [ Vertex (∃ a) ? ]
export async function getMany(g: Graph, ids: Array<$Id>): Promise<Array<?Vertex<mixed>>> {

  invariant(g.__GRAPH__,        `V.getMany expected Graph for 1st argument, got "${g.toString()}"`)
  invariant(Array.isArray(ids), `V.getMany expected [Id] for 2nd argument, got "${ids}"`)

  return g.VertexLoader.loadMany(ids)
}

/**
 * And since the label-key pair uniquely identifies a vertex,
 * there exists a similar mapping:
 *
 *   V.getByKey :: Graph -> VertexDef a -> Key a -> Vertex a ?
 *
 * note however, that due to performance characteristics,
 * this method should only be used for root fields, not for traversals
 */

export async function getByKey<a>
  ( g: Graph
  , def: VertexDef<a>
  , key: $Key<a>
  ): Promise<?Vertex<a>> {

    invariant(g.__GRAPH__,        `V.getByKey expected Graph for 1st argument, got "${g.toString()}"`)
    invariant(def.__VERTEX_DEF__, `V.getByKey expected VertexDef for 2nd argument, got "${def.toString()}"`)
    invariant(key,                `V.getByKey expected Key for 3rd argument, got "${key}"`)

    const { items: [ v ] }: $Page<Vertex<a>> =
      await g.query
        ( Table.VERTEX
        , INDEX_VERTEX_KEY
        , { KeyConditions:
            { label: { ComparisonOperator: 'EQ', AttributeValueList: [ def.label ] }
            , key:   { ComparisonOperator: 'EQ', AttributeValueList: [ key   ] }
            }
          , Limit: 1 // we do not want pagination data
          }
        )

    return v

  }

/**
 * Also recall that there exists a per-type index of all vertices,
 * we expose this through a paginated method
 *
 * Note, however, that this is a utility function intended for OLAP use only
 * For OLTP, always use explicit root nodes and edges
 */

// V.all :: Graph -> VertexDef a -> Cursor? -> Page (Vertex a)
export async function all<a>
  ( g: Graph
  , def: VertexDef<a>
  , cursor: ?$Cursor = {}
  ): Promise<$Page<Vertex<a>>> {

    invariant(g.__GRAPH__,        `V.all expected Graph for 1st argument, got "${g.toString()}"`)
    invariant(def.__VERTEX_DEF__, `V.all expected VertexDef for 2nd argument, got "${def}"`)

    const { RangeCondition, Limit, ScanIndexForward }: ParsedCursor = Cursor.parse(cursor)

    return g.query
      ( Table.VERTEX
      , INDEX_VERTEX_ALL
      , { KeyConditions:
          { label: { ComparisonOperator: 'EQ'
                   , AttributeValueList: [ def.label ]
                   }
          , ...maybe('updatedAt', RangeCondition)
          }
        , ScanIndexForward
        }
      , Limit
      )

  }

/**
 * Finally, we expose a method to remove a vertex from the graph
 *
 * Removing a vertex will also remove all adjacencies
 */

export async function remove(g: Graph, id: $Id): Promise<Vertex<mixed>> {

  // effectively performs type validations
  // but we should do them again here so the error messages match
  const v = await get(g, id)

  invariant(v, 'Cannot remove a vertex that does not exist')

  // TODO: delete adjacencies
  const { items: edges } =
    await g.query
      ( Table.EDGE
      , INDEX_EDGE_FROM
      , { KeyConditions:
          { from: { ComparisonOperator: 'EQ', AttributeValueList: [ v.id ] }
          }
        }
      )

  const edgeKeys: Array<{ hk: string, to: string }> =
    flatten(
      edges.map(
        ({ out, label, to }) =>
          to === id // handles duplicate keys error
          ? [ { hk: `${id}${out?OUT:IN}${label}`, to } ]
          : [ { hk: `${id}${out?OUT:IN}${label}`, to }
            , { hk: `${to}${out?IN:OUT}${label}`, to: id }
            ]
      )
    )

  await g.batchDel(Table.EDGE, edgeKeys)
  await g.batchDel(Table.VERTEX, [{ id }])

  // sync loader
  g.VertexLoader.clear(id)

  return v
}
