/* @flow */

/*
 * n.b. Although this spec is designed with DynamoDB in mind,
 * it is an abstract spec that can be used with any document store
 * that can emulate an index
 *
 * e.g. An implementation can be created using redis, using sorted sets for indices
 *      An implementation can be done in MongoDB, you know, if you're a "webscale" asshole
 */

import type { DocumentClient } from 'aws-sdk'
import type { $Id, $Weight } from '../Types'

import { DynamoDB } from 'aws-sdk'
import https from 'https'

import { assign, invariant } from '../utils'
import { Id } from '../Types'

/**
 * G
 *
 * A graph is a persistent object G = (V, E, σ)
 *   where V is the set of vertices
 *         E is the set of edges
 *         σ is some object containing meta information
 *             such as the size of the graph, the last unique id, etc.
 */

type Table = "vertex"
           | "edge"
           | "system"

export const TABLE_VERTEX : Table = "vertex"
export const TABLE_EDGE   : Table = "edge"
export const TABLE_SYSTEM : Table = "system"

/**
 * In order to perform the desired graph operations with reasonable performance,
 * we also assume the existence of the following indices:
 */

type Index
  = "hk-weight-index"       // where hk is of the form [id]:[edge_label]
  | "label-key-index"       // used for quick retrieval of significant vertices or mappings
  | "label-updatedAt-index" // used for scanning the entire table for maintenance tasks

export const INDEX_ADJACENCY  : Index = "hk-weight-index"
export const INDEX_VERTEX_KEY : Index = "label-key-index"
export const INDEX_VERTEX_ALL : Index = "label-updatedAt-index"

/*
 * We define the graph type to be some closure containing a partial representation σ',
 * as well as operations which read and write to the respective tables.
 */

export type Graph =
  { name    : string // graph name
  , region  : Region // region
  , env     : Env    // environment (non-production environments will log results)

  , id      : () => Promise<$Id>     // generate a fresh id
  , weight  : () => Promise<$Weight> // generate a fresh weight

/*
 * The graph exposes only batch read, query, and mutation operations,
 * leaving the V, E, and Adj modules responsible for processing the data
 */

  , batchGet:
      ( table: Table
      , keys: [any]
      ) => Promise<[any]>

  , batchPut:
      ( table: Table
      , items: [any]
      ) => Promise<void>

  , batchDel:
      ( table: Table
      , keys: [any]
      ) => Promise<void>

  , query:
      ( table: Table
      , index: Index
      , params: any
      , limit: ?number
      ) => Promise<QueryResult<any>>

  }

export type QueryResult<a> =
  { items: [a]
  , count: number
  , total?: number
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

type Region
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

    const client = dynamoClient(region)

    const TABLES =
      { [TABLE_VERTEX]: `${name}-vertex`
      , [TABLE_EDGE]:   `${name}-edge`
      , [TABLE_SYSTEM]: `${name}-system`
      }

    const graph =
      { name
      , env
      , region

      , async id() {
          const { Attributes } = await dynamo
            ( client
            , 'update'
            , { TableName: TABLES[TABLE_SYSTEM]
              , Key: { key: 'id' }
              , ...incrField('value')
              }
            )
          return Id.fromNat(Attributes.value)
        }

      , async weight() {
          const { Attributes } = await dynamo
            ( client
            , 'update'
            , { TableName: TABLES[TABLE_SYSTEM]
              , Key: { key: 'weight' }
              , ...incrField('value')
              }
            )
          return Attributes.value
        }

      , async batchGet(table, keys) {

          const TableName = TABLES[table]
          // execute gets in parallel
          const reads : Promise<any>[] =
            chunk(keys, 100).map(async chunk => {
              const { Responses } = await dynamo
                ( client
                , 'batchGet'
                , { RequestItems: { [TableName]: { Keys: chunk } }
                  }
                )
              return Responses[TableName]
            })

          const results : any[] = flatten(await Promise.all(reads))
          const resultMap : { [key: string]: any } = {}

          // Dynamo does not guarantee order in the response,
          // so we must reproduce the array oureslves:

          switch (table) {

            case TABLE_VERTEX:
              results.forEach(v => assign(resultMap, v.id, v))
              return keys.map(({ id }) => resultMap[id])

            case TABLE_EDGE:
              results.forEach(e => assign(resultMap, `${e.hk}$${e.to}`, e))
              return keys.map(({ hk, to }) => resultMap[`${hk}$${to}`])

            case TABLE_SYSTEM:
              results.forEach(o => assign(resultMap, o.key, o))
              return keys.map(({ key }) => resultMap[key])

            default:
              return []
          }
        }

      , async batchPut(table, items) {
          const TableName : string = TABLES[table]
          const chunks = chunk(items, 100)
          // execute each mutation chunk in serial
          for (let chunk of chunks) {
            const requests = chunk.map(Item => ({ PutRequest: { Item } }))
            await dynamo
              ( client
              , 'batchWrite'
              , { RequestItems: { [TableName]: requests } }
              )
          }
        }

      , async batchDel(table, keys) {
          const TableName = TABLES[table]
          const chunks = chunk(keys, 100)
          // execute each mutation batch in serial
          for (let chunk of chunks) {
            const requests = chunk.map(Key => ({ DeleteRequest: { Key } }))
            await dynamo
              ( client
              , 'batchWrite'
              , { RequestItems: { [TableName]: requests } }
              )
          }
        }

      // TODO: it would be nice to decouple the query params from dynamodb
      // but for now we'll omit the possibility of multiple adapters
      , async query(table, IndexName, params, limit) {
          const TableName = TABLES[table]
          const { Items: items, Count: count } =
            await dynamo
              ( client
              , 'query'
              , { TableName, IndexName, Limit: limit, ...params }
              )
          if (!limit) return { items, count }

          const { Count: total } =
            await dynamo
              ( client
              , 'query'
              , { TableName, IndexName, Select: 'COUNT', ...params }
              )
          return { items, count, total }
        }
      }

    graphs[name] = { graph, env, region }

    return graph

  }

export { default as generate } from './generate'

// HELPERS:

const INVALID_CHAR = /[^a-zA-Z0-9-_]/

const validateName = (name: string): mixed =>
  name && !name.match(INVALID_CHAR)

function chunk<a>(arr: [a], n: number): [[a]] {
  const chunks = []
  for (let i = 0, j = arr.length; i < j; i += n)
    chunks.push(arr.slice(i, i+n))
  return chunks
}

function flatten<a>(arr: [[a]]): [a] {
  return [].concat(...arr)
}

const httpOptions =
  { agent: new https.Agent
    ( { rejectUnauthorized: true
      , secureProtocol: 'TLSv1_method'
      , ciphers: 'ALL'
      }
    )
  }

const dynamoClient = (region: Region): DocumentClient =>
  new DynamoDB.DocumentClient
  ( { region // TODO: handle the local case
    , httpOptions
    }
  )

const dynamo =
  ( client: DocumentClient
  , job: string
  , params: mixed
  ): Promise<any> =>
    new Promise(
      (resolve, reject) =>
        client[job]
          ( params
          , (err, data) =>
              err ? reject(err)
                  : resolve(data)
          )
    )

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
