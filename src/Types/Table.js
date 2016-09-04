/* @flow */

import type { $Table, $TableRep } from './index'
import type { Vertex } from '../V'
import type { SerializedEdge } from '../E'

export type VertexKey = { id: string }
export type EdgeKey = { hk_out: string, to: string }
export type SystemKey = { key: string }

export const VERTEX : $Table<VertexKey, Vertex<mixed>>       = "vertex"
export const EDGE   : $Table<EdgeKey, SerializedEdge<mixed>> = "edge"
export const SYSTEM : $Table<SystemKey, any>                 = "system"

export const vertexTable = (prefix: string): $TableRep<VertexKey, Vertex<mixed>> => (
  { TableName: `${prefix}-vertex`
  , serialize: ({ id }) => id
  , deserialize: id => ({ id })
  }
)

export const edgeTable = (prefix: string): $TableRep<EdgeKey, SerializedEdge<mixed>> => (
  { TableName: `${prefix}-edge`
  , serialize: ({ hk_out, to }) => `${hk_out}~$~${to}`
  , deserialize: key => {
      const [ hk_out, to ] = key.split('~$~')
      return { hk_out, to }
    }
  }
)

export const systemTable = (prefix: string): $TableRep<SystemKey, any> => (
  { TableName: `${prefix}-system`
  , serialize: ({ key }) => key
  , deserialize: key => ({ key })
  }
)
