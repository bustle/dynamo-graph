/* @flow */

import type { $Id, $Label, $Key } from '../Types'
import type { Graph, QueryResult } from '../G'

import { TABLE_SYSTEM
       , TABLE_VERTEX
       , INDEX_VERTEX_KEY
       , INDEX_VERTEX_ALL
       } from '../G'

import { invariant } from '../utils'

/**
 * V
 *
 * A vertex is a tuple of an id, type representation, and attribute map:
 *
 *   v = (id, label, λ: k -> v)
 *
 */

type Vertex<a> =
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
 * such that the string representation `label` uniquey identifies the definition
 *
 */

type VertexDef<a> =
  { label: $Label<Vertex<a>>
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

  invariant
    ( label
    , 'Label must be non-empty'
    )

  if (defs[label])
    return defs[label]

  const def =
    { label
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

// V.put :: Graph -> VertexDef a -> Id -> a -> Vertex a
export async function put<a>(g: Graph, def: VertexDef<a>, id: $Id, attrs: a): Promise<Vertex<a>> {
  return putVertex(g, def, id, attrs)
}

// V.putByKey :: Graph -> VertexDef a -> Key a -> a -> Vertex a
export async function putByKey<a>(g: Graph, def: VertexDef<a>, key: $Key<a>, attrs: a): Promise<Vertex<a>> {
  const v: ?Vertex<a> = await findByKey(g, def, key)
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
  await g.batchPut(TABLE_VERTEX, [v])
  return v
}

/**
 *
 * Since the id uniquely identifies the vertex, there exists a mapping
 *
 *   V.find :: Graph -> Id -> Vertex (∃ a) ?
 *   V.findMany :: Graph -> [ Id ] -> [ Vertex (∃ a) ? ]
 *
 */

export async function find(g: Graph, id: $Id): Promise<?Vertex<mixed>> {
  const [ v ]: [?Vertex<mixed>] = await findMany(g, [id])
  return v
}

export async function findMany(g: Graph, ids: [$Id]): Promise<[?Vertex<mixed>]> {
  const keys: { id: $Id }[] = ids.map(id => ({ id }))
  const vertices: [?Vertex<mixed>] = await g.batchGet(TABLE_VERTEX, keys)
  return vertices
}

/**
 * And since the label-key pair uniquely identifies a vertex,
 * there exists a similar mapping:
 *
 *   V.findByKey :: Graph -> VertexDef a -> Key a -> Vertex a ?
 *
 * note however, that due to performance characteristics,
 * this method should only be used for root fields, not for traversals
 */

export async function findByKey<a>
  ( g: Graph
  , { label }: VertexDef<a>
  , key: $Key<a>
  ): Promise<?Vertex<a>> {

    const { items }: QueryResult<?Vertex<a>> =
      await g.query
        ( TABLE_VERTEX
        , INDEX_VERTEX_KEY
        , { KeyConditions:
            { label: { ComparisonOperator: 'EQ', AttributeValueList: [ label ] }
            , key:   { ComparisonOperator: 'EQ', AttributeValueList: [ key   ] }
            }
          , Limit: 1 // we do not want pagination data
          }
        )

    /*
    const test: QueryResult<?Vertex<a>> =
      await g.query
        ( TABLE_VERTEX
        , INDEX_VERTEX_ALL
        , { KeyConditions:
            { label: { ComparisonOperator: 'EQ'
                     , AttributeValueList: [ label ]
                     }
            , updatedAt: { ComparisonOperator: 'GT'
                         , AttributeValueList: [ 1469837733790 ]
                         }
            }
          }
        , 10
        )

    console.log(test)
    */

    return items[0]

  }

/**
 * Also recall that there exists a per-type index of all vertices,
 * we expose this through a paginated method:
 *
 *   V.all :: Graph -> VertexDef a -> Cursor -> Page (Vertex a)
 *
 */

export async function all<a>(g: Graph, { label }: VertexDef<a>, pageInfo: any): Promise<void> {
}
