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
import type { Vertex } from '../V'

import DataLoader from 'dataloader'

import { assign, invariant, chunk, flatten } from '../utils'
import { Id, Table } from '../Types'

import { documentClient, batchGet, batchPut, batchDel } from './adapter'

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
  = "hk-weight-index"       // where hk is of the form [id]:[edge_label]
  | "from-index"            // used to determine all adjacencies to a vertex
  | "label-key-index"       // used for quick retrieval of significant vertices or mappings
  | "label-updatedAt-index" // used for scanning the entire table for maintenance tasks

export const INDEX_ADJACENCY  : Index = "hk-weight-index"
export const INDEX_EDGE_FROM  : Index = "from-index"
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

/*
 * The graph exposes only batch read, query, and mutation operations,
 * leaving the V and E modules responsible for processing the data
 */

  , batchGet<K,V>(table: $Table<K,V>, keys: Array<K>): Promise<Array<V>>
  , batchPut<K,V>(table: $Table<K,V>, items: Array<any>): Promise<void>
  , batchDel<K,V>(table: $Table<K,V>, keys: Array<any>): Promise<void>

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

/*
 * For performance, we also expose a DataLoader instance for vertices
 */
  , VertexLoader: DataLoader<string,Vertex<any>>
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

export function define
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
      return g.graph
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

    const logStart = name => {
      if (!isProd) {
        const opId = Math.floor(Math.random() * 99999) + 1
        console.log(`Dispatching ${name} (opId: ${opId})`)
        console.time(`${name} (opId: ${opId})`)
        return opId
      }
    }

    const logEnd = (name, opId) => {
      if (!isProd && opId) {
        console.timeEnd(`${name} (opId: ${opId})`)
      }
    }

    const VertexLoader: DataLoader<string, Vertex<any>> =
      new DataLoader(async ids => {
        const keys = ids.map(VertexTable.deserialize)
        const numKeys = isProd || keys.length
        const log = logStart(`vertex loader (${numKeys} keys)`)
        const result = await batchGet(client, VertexTable, keys)
        logEnd(`vertex loader (${numKeys} keys)`, log)
        return result
      })

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

      , async batchGet<K,V>(table: $Table<K,V>, keys: Array<K>): Promise<Array<V>> {
          const log = logStart(`batch get \`${table}\``)
          const result = await batchGet(client, reps[table], keys)
          logEnd(`batch get \`${table}\``, log)
          return result
        }
      , async batchPut<K,V>(table: $Table<K,V>, items: Array<V>): Promise<void> {
          const log = logStart(`batch put \`${table}\``)
          const result = await batchPut(client, reps[table], items)
          logEnd(`batch put \`${table}\``)
          return result
        }
      , async batchDel<K,V>(table: $Table<K,V>, keys: Array<K>): Promise<void> {
          const log = logStart(`batch del \`${table}\``)
          const result = await batchDel(client, reps[table], keys)
          logEnd(`batch del \`${table}\``, log)
          return result
        }

      // TODO: it would be nice to decouple the query params from dynamodb
      // but for now we'll omit the possibility of multiple adapters
      , async query<K,V>(table: $Table<K,V>, IndexName, params): Promise<Array<V>> {
          // TODO: iterate until all results are fetched
          const { TableName } = reps[table]

          const log = logStart(`query \`${table}:${IndexName}\``)
          const { Items } =
            await client.queryAsync(
              { TableName
              , IndexName
              , ...params
              }
            )

          logEnd(`query \`${table}:${IndexName}\``, log)

          return Items
      }

      , async count<K,V>(table: $Table<K,V>, IndexName, params): Promise<$PageInfo> {
          const { TableName } = reps[table]
          const { Count: count } =
            await client.queryAsync(
              { TableName
              , IndexName
              , Select: 'COUNT'
              , ...params
              }
            )
          return { count }
        }

      , VertexLoader
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
