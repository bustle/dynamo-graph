/* @flow */

/*
 * n.b. Although this spec is designed with DynamoDB in mind,
 * it is an abstract spec that can be used with any document store
 * that can emulate an index
 *
 * e.g. An implementation can be created using redis, using sorted sets for indices
 *      An implementation can be done in MongoDB, you know, if you're a "webscale" asshole
 */

import type { $Id, $Weight, $PageInfo, $Table, $TableRep } from '../Types'

import type { VertexKey, EdgeKey } from '../Types/Table'
import type { Vertex } from '../V'
import type { SerializedEdge } from '../E'

import DataLoader from 'dataloader'

import { assign, invariant, chunk, flatten } from '../utils'
import { Id, Table } from '../Types'

import { documentClient, TableAdapter } from './adapter'

/**
 * G
 *
 * A graph is a persistent object G = (V, E, σ)
 *   where V is the set of vertices
 *         E is the set of edges
 *         σ is some object containing meta information
 *             such as the size of the graph, the last unique id, etc.
 *
 * In order to perform the desired graph operations with reasonable performance,
 * we also assume the existence of the following indices:
 */

type Index
  = "hk_out-weight-index"   // where hk is of the form [label]>from
  | "hk_in-weight-index"    // where hk is of the form [label]<to
  | "from-index"            // used to determine all edges pointing from a vertex
  | "to-index"              // used to determine all edges pointing to a vertex
  | "label-key-index"       // used for quick retrieval of significant vertices or mappings
  | "label-updatedAt-index" // used for scanning the entire table for maintenance tasks

export const INDEX_EDGE_OUT   : Index = "hk_out-weight-index"
export const INDEX_EDGE_IN    : Index = "hk_in-weight-index"
export const INDEX_EDGE_FROM  : Index = "from-index"
export const INDEX_EDGE_TO    : Index = "to-index"
export const INDEX_VERTEX_KEY : Index = "label-key-index"
export const INDEX_VERTEX_ALL : Index = "label-updatedAt-index"

/*
 * We define the graph type to be some closure containing a partial representation σ',
 * as well as operations which read and write to the respective tables.
 */

export type Graph =
  { __GRAPH__ : true   // type validator
  , name      : string // graph name
  , region    : Region // region
  , env       : Env    // environment (non-production environments will log results)

  , id        : () => Promise<$Id>     // generate a fresh id
  , weight    : () => Promise<$Weight> // generate a fresh weight

  // create a counter
  , putCounter  : (key: string, value: number) => Promise<number>
  // increment a created counter
  , incrCounter : (key: string) => Promise<$Weight>

  , V: TableAdapter<VertexKey,Vertex>
  , E: TableAdapter<EdgeKey,SerializedEdge>

  , query<K,V>
      ( table: $Table<K,V>
      , index: Index
      , params: any
      ): Promise<Array<V>>

  , count<K,V>
      ( table: $Table<K,V>
      , index: Index
      , params: any
      ): Promise<$PageInfo>
  }

/**
 * This module exposes a graph constructor:
 *
 *   G.define :: string -> GraphConfigs -> Graph
 *
 */

type GraphConfigs =
  { env?    : Env
  , region? : Region
  }

type Env
  = "production"
  | "beta"
  | "development"

export const ENV_PRODUCTION  : Env = "production"
export const ENV_BETA        : Env = "beta"
export const ENV_DEVELOPMENT : Env = "development"

export type Region
  = "us-east-1"
  | "us-west-1"
  | "us-west-2"
  | "ap-south-1"
  | "ap-northeast-1"
  | "ap-northeast-2"
  | "ap-southeast-1"
  | "ap-southeast-2"
  | "eu-central-1"
  | "eu-west-1"
  | "sa-east-1"
  | "local"

/*
 * As well as a method
 *
 *   G.generate :: Graph -> Promise<void>
 *
 * which ensures that all AWS resources are created
 *
 * // example usage:
 *
 * import { G } from 'dynamo-graph'
 *
 * const g = G.define
 *   ( 'my-graph-name'
 *   , { env: G.ENV_PRODUCTION
 *     , region:
 *     }
 *   )
 *
 * task = async () => {
 *   await G.generate(g)
 *   const id = await g.incrId()
 *   console.log('Generated id:', id)
 * }
 */

// IMPLEMENTATIONS:

const graphs :
  { [key: string]:
    { graph  : Graph
    , env    : Env
    , region : Region
    }
  } = {}

// Webpack treats the word `define` as a magical global due to the way AMD modules work
// and confuses the exports of babel for being "indirect usage"
// TODO: come up with a better name or let this be an es6 module
export { define$ as define }
function define$
  ( name: string
  , { env    = "development"
    , region = "us-east-1"
    } : GraphConfigs = {}
  ): Graph {

    invariant
      ( validateName(name)
      , 'Invalid character in graph name'
      )

    // if the name is already occupied, return a reference to the same graph
    if (graphs[name]) {
      const g = graphs[name]
      invariant
        ( g.env === env && g.region === region
        , `There already exists a distcint graph named "${name}"`
        )
      // we want to create a new graph instance each time
      // return g.graph
    }

    const client = documentClient(region)

    const VertexTable = Table.vertexTable(name)
    const EdgeTable   = Table.edgeTable(name)
    const SystemTable = Table.systemTable(name)

    const reps: any =
      { [Table.VERTEX]: VertexTable
      , [Table.EDGE]:   EdgeTable
      , [Table.SYSTEM]: SystemTable
      }

    const isProd: boolean = env === ENV_PRODUCTION

    const QueryLoader: DataLoader<any, any> =
      new DataLoader
        ( async queries => {
            let op
            if (!isProd) {
              op = `batch of ${queries.length} queries (opId: ${Math.floor(Math.random() * 99999) + 1})`
              console.log(`Dispatching ${op}`)
              console.time(op)
            }
            const result = await Promise.all(
              queries.map(q => client.queryAsync(q))
            )
            if (!isProd) {
              console.timeEnd(op)
            }
            return result
          }
        , { cache: false }
        )

    // TODO: EdgeLoader (that accounts for direction)

    const graph =
      { __GRAPH__: true
      , name
      , env
      , region

      , async id() {
          const { Attributes } = await client.updateAsync(
            { TableName: reps[Table.SYSTEM].TableName
            , Key: { key: 'id' }
            , ...incrField('value')
            }
          )
          return Id.fromNat(Attributes.value)
        }

      , async weight() {
          const { Attributes } = await client.updateAsync(
            { TableName: reps[Table.SYSTEM].TableName
            , Key: { key: 'weight' }
            , ...incrField('value')
            }
          )
          return Attributes.value
        }

      , async putCounter(key: string, value: number) {
          const counter = await client.putAsync(
            { TableName: reps[Table.SYSTEM].TableName
            , Item: { key: `counter:${key}`
                    , value
                    }
            }
          )
          return counter.value
        }

      , async incrCounter(key: string) {
          const { Attributes } = await client.updateAsync(
            { TableName: reps[Table.SYSTEM].TableName
            , Key: { key: `counter:${key}` }
            , ...incrField('value')
            }
          )
          return Attributes.value
        }

      , V: new TableAdapter(client, reps[Table.VERTEX], isProd)
      , E: new TableAdapter(client, reps[Table.EDGE], isProd)

      // TODO: it would be nice to decouple the query params from dynamodb
      // but for now we'll omit the possibility of multiple adapters
      , async query<K,V>(table: $Table<K,V>, IndexName, params): Promise<Array<V>> {
          const { TableName } = reps[table]
          const items = []
          const cursor = { Limit: params.Limit, ExclusiveStartKey: undefined }
          do { // iterate until everything is fetched
            const { Items, Count, LastEvaluatedKey } =
              await QueryLoader.load(
                { TableName
                , IndexName
                , ...params
                , ...cursor
                }
              )
            items.push(...Items)
            cursor.ExclusiveStartKey = LastEvaluatedKey
            if (cursor.Limit) {
              cursor.Limit -= Count
            }
          } while (cursor.ExclusiveStartKe )
          return items
      }

      , async count<K,V>(table: $Table<K,V>, IndexName, params): Promise<$PageInfo> {
          const { TableName } = reps[table]
          let count = 0
          const cursor = {}
          do { // iterate until everything is fetched
            const { Count, LastEvaluatedKey } =
              await QueryLoader.load(
                { TableName
                , IndexName
                , Select: 'COUNT'
                , ...params
                }
              )
            count += Count
            cursor.ExclusiveStartKey = LastEvaluatedKey
          } while (cursor.ExclusiveStartKey)
          return { count }
        }
      }

    graphs[name] = { graph, env, region }

    return graph

  }

export { default as generate } from './generate'

// HELPERS:

const INVALID_CHAR = /[^a-zA-Z0-9-_]/

const normalizeVertexKey = ({ id }): string => id
const normalizeEdgeKey = ({ hk, to }): string => `${hk}~$~${to}`
const normalizeSystemKey = ({ key }): string => key

const validateName = (name: string): mixed =>
  name && !name.match(INVALID_CHAR)

const incrField =
  ( name: string
  , amount: number = 1
  ) =>
  ( { UpdateExpression: 'SET #a = #a + :amount'
    , ExpressionAttributeNames: { '#a': name }
    , ExpressionAttributeValues: { ':amount': amount }
    , ReturnValues: 'ALL_NEW'
    }
  )
