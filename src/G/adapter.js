/* @flow */

import type { Region } from './index.js'
import type { $TableRep } from '../Types'
import type { DocumentClient } from 'aws-sdk'
import type { Agent } from 'https'

import { DynamoDB, Endpoint } from 'aws-sdk'
import https from 'https'
import { maybe, chunk, flatten } from '../utils'

export const httpOptions: { agent: Agent } =
  { agent: new https.Agent
    ( { rejectUnauthorized: true
      , secureProtocol: 'TLSv1_method'
      , ciphers: 'ALL'
      }
    )
  }

export const documentClient = (region: Region): DocumentClient =>
  new DynamoDB.DocumentClient
    ( { ...maybe('region', region === "local" ? undefined : region)
      , ...maybe('endpoint', region === "local" ? new Endpoint('http://localhost:8000') : undefined)
      , httpOptions
      }
    )

// hopefully the dynamodb document client is updated soon to support promises
export const dynamo = (client: DocumentClient, job: string, params: mixed): Promise<any> =>
  new Promise(
    (resolve, reject) =>
      client[job](params, (err, data) => err ? reject(err) : resolve(data))
  )

// TODO: consider cross-table batching? Probably not worth it
export async function batchGet<K, V>
  ( client: DocumentClient
  , { TableName, serialize }: $TableRep<K, V>
  , keys: Array<K>
  ): Promise<Array<V>> {

    // batch reads into groups of 100
    const reads : Array<Array<V>> = await Promise.all(
      chunk(keys, 100).map(async chunk => {
        const { Responses } = await dynamo
          ( client
          , 'batchGet'
          , { RequestItems: { [TableName]: { Keys: chunk } } }
          )
        return Responses[TableName]
      })
    )

    // flatten results into a normalized map
    // dynamo `BatchGetItem`s do not guarantee order
    const results : Array<V> = flatten(reads)
    const resultMap : { [key: string]: V } = {}

    results.forEach(
      v => resultMap[serialize(v)] = v
    )

    // map keys to their results
    return keys.map(key => resultMap[serialize(key)])

  }

export async function batchPut<K, V>
  ( client: DocumentClient
  , { TableName, serialize }: $TableRep<K, V>
  , items: Array<V>
  ): Promise<void> {

    // chunk into groups of 100
    const chunks = chunk(items, 100)

    // execute each mutation chunk in serial
    for (let chunk of chunks) {
      const requests = chunk.map(Item => ({ PutRequest: { Item } }))
      await dynamo(client, 'batchWrite', { RequestItems: { [TableName]: requests } })
    }

  }

export async function batchDel<K, V>
  ( client: DocumentClient
  , { TableName }: $TableRep<K, V>
  , keys: Array<K>
  ): Promise<void> {

    // chunk into groups of 100
    const chunks = chunk(keys, 100)

    // execute each mutation batch in serial
    for (let chunk of chunks) {
      const requests = chunk.map(Key => ({ DeleteRequest: { Key } }))
      await dynamo(client, 'batchWrite', { RequestItems: { [TableName]: requests } })
    }

  }
