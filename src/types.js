/* @flow */

// dynamo-graph stores a property graph.
// As such, each node and vertex contains an attribute map

// A schema defines a validation for attributes
// dynamo-graph will ensure that the data matches the schema
// before writing to the database

type Schema<a> = AttributeMap<a>
               | NoAttributeSchema

type AttributeMap<a>   = { __ATTR_MAP__ : number }
type NoAttributeSchema = { __NO_ATTRS__ : boolean }

export const NoAttrs : NoAttributeSchema = { __NO_ATTRS__ : true }

type VertexDefinition<a> =
  { label  : string
  , schema : ?Schema<a>
  }

export function Vertex<a>( label : string, schema : ?Schema<a> ) : VertexDefinition<a> {
  const def : VertexDefinition<a> =
    { label
    , schema
    }
  return def
}

type EdgeDefinition<a> =
  { label    : string
  , invLabel : string
  , schema   : ?Schema<a>
  }

export function Edge<a>
  ( label    : string
  , invLabel : string = `${label}Inv`
  , schema   : ?Schema<a>
  ) : EdgeDefinition<a> {

  const def : EdgeDefinition<a> =
    { label
    , invLabel
    , schema
    }

  return def
}
