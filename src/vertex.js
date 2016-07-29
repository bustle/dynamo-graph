/* @flow */

import type { Graph } from './graph'

/**
 * - V -
 *
 * A vertex is persistent object uniquely identified by its id,
 * containing some unique type identifier:
 *
 */

type Id       = string
type Label<a> = string
type Key<a>   = string

type Vertex<a> =
  { id        : Id
  , label     : Label<a>
  , key       : ?Key<a>
  , updatedAt : number
  , attrs     : a
  }

/*
 * such that there exists some unique mapping:
 *
 *   find :: Graph -> Id -> Promise SomeVertex
 *
 * where SomeVertex = forall a. Vertex a
 */

export async function find(g: Graph, id: Id): Promise<Vertex<any>> {
  return await Promise.reject('fuck')
}

export async function findMany(g: Graph, ids: Array<Id>): Promise<Array<Vertex<any>>> {
  return await Promise.reject(null)
}

export function asType<V> ( vertex: Vertex<any>, type: Label<V>): ?Vertex<V> {
  return vertex.label === type
    ? vertex
    : null
}

/*
 * Note that the `Label` type is parameterized over the type of the vertex.
 * This is to say that labels must be globally unique, and the label of a vertex
 * can be used to unify a Vertex with its expected type.
 *
 *   i.e. if we encounter some vertex:
 *          { id: "x3Rc"
 *          , label: "Person"
 *          , attrs: someAttrs
 *          }
 *        we should be gauranteed that `someAttrs` are of type `Person`
 *
 * A vertex may also contain a unique `Key`
 */

export const findByKey = null
