/* @flow */

import { DynamoDB } from 'aws-sdk'
import https from 'https'
import { invariant } from './utils'

/**
 * G
 *
 * Note that, although this specification is designed with DynamoDB in mind,
 * it is an abstract specification that can be used with any key-value store
 * that has some notion of sorted indices
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
 * We define the Graph type to be some closure containing a partial representation σ',
 * as well as operations which read and write to the respective tables.
 *
 * The graph exposes only batch read, query, and mutation operations,
 * leaving the V, E, and Adj modules responsible for processing the data
 */

type Key = string

export type Graph =

  // σ
  { name: string
  , env: Env
  , incrId: () => Promise<string>

  // G
  , batchGet: (table: Table, keys: Array<Key>) => Promise<Array<any>>
  , batchPut: (table: Table) => Promise<Array<any>>
  , batchDel: (table: Table) => Promise<Array<any>>
  }

type GraphMap =
  { [key: string]:
    { graph  : Graph
    , env    : Env
    , region : Region
    }
  }

const graphs : GraphMap = {}

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

    // return reference to the same graph
    if (graphs[name]) {
      const g = graphs[name]
      invariant
        ( g.env === env && g.region === region
        , `There already exists a distcint graph named "${name}"`
        )
      return g.graph
    }

    const client = new DynamoDB.DocumentClient
      ( region
      , { httpOptions:
          { agent: new https.Agent
            ( { rejectUnauthorized: true
              , secureProtocol: 'TLSv1_method'
              , ciphers: 'ALL'
              }
            )
          }
        }
      )

    const TABLES =
      { [TABLE_VERTEX]: `${name}-vertex`
      , [TABLE_EDGE]:   `${name}-edge`
      , [TABLE_SYSTEM]: `${name}-system`
      }

    async function incrId() {
      return Promise.resolve('fuck')
    }

    async function batchGet(table) {
      await Promise.reject('fuck')
      return [ 'fuck' ]
    }

    async function batchPut(table) {
      await Promise.reject('fuck')
      return [ 'fuck' ]
    }

    async function batchDel(table) {
      await Promise.reject('fuck')
      return [ 'fuck' ]
    }

    const graph =
      { name
      , env
      , incrId
      , batchGet
      , batchPut
      , batchDel
      }

    graphs[name] = { graph, env, region }

    return graph

  }

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

// HELPERS:

const INVALID_CHAR = /[^a-zA-Z0-9-_]/

const validateName = (name: string): mixed =>
  name && !name.match(INVALID_CHAR)
