/* @flow */

/**
 * Id
 *
 * We define an Id to be some string which uniquely identifies a vertex
 */

export type $Id = string

// The Id type has the following partial methods:
//
//   Id.fromNat :: (id: $Id) -> number  where `id` is a radix64 string
//   Id.toNat   :: (n: number) -> $Id   where `n` is a positive integer
//
// both of which raise an error on invalid input

export * as Id from './Id'

/**
 * Label
 *
 * A type representation that uniquely identifies the type of some element
 *
 *   i.e. ∀x : x ∈ x.label
 */

export type $Label<a> = string

/**
 * Key
 *
 * A unique string identifier for some typed element
 */

export type $Key<a> = string

/**
 * Weight
 *
 * dynamo-graph describes a weighted graph, so the weight type is
 * any ordered value which can be used to sort the index
 */

export type $Weight = number

/**
 *
 * TODO:
 * Schema
 *
 * dynamo-graph will perform data validations before persisting an element
 * We define a Schema type to describe the shape of data
 */

export type $Schema = { [key: string]: $Schema } | "NoAttrs"

/**
 * Cursor and Page
 *
 * dynamo-graph follows the relay-like specification for pagination
 */

export type $Cursor
  = ForwardCursor
  | ReverseCursor
  | {}

export * as Cursor from './Cursor'

type ForwardCursor =
  { first: number
  , after?: number
  }

type ReverseCursor =
  { last: number
  , before?: number
  }

export type $Page<a> =
  { items: Array<a>
  , count: number
  , total?: number
  }
