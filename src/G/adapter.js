/* @flow */

import type { Region } from './index.js'
import type { $TableRep } from '../Types'

import { config as AWSConfig, DynamoDB, Endpoint } from 'aws-sdk'
import Promise from 'bluebird'
import https from 'https'
import { maybe, chunk, flatten } from '../utils'

AWSConfig.setPromisesDependency(Promise)

// TODO: properly document the expected input/output
declare class DocumentClientAsync {
  putAsync<K,V>(params: K): Promise<V>;
  batchGetAsync<K,V>(params: K): Promise<V>;
  batchWriteAsync<K,V>(params: K): Promise<V>;
  updateAsync<K,V>(params: K): Promise<V>;
  queryAsync<K,V>(params: K): Promise<V>;
}

export const httpOptions =
  { agent: new https.Agent
    ( { rejectUnauthorized: true
      , secureProtocol: 'TLSv1_method'
      , ciphers: 'ALL'
      }
    )
  }

export const documentClient = (region: Region): DocumentClientAsync =>
  Promise.promisifyAll( // hopefully the dynamodb document client is updated soon to support promises
    new DynamoDB.DocumentClient
      ( { ...maybe('region', region === "local" ? undefined : region)
        , ...maybe('endpoint', region === "local" ? new Endpoint('http://localhost:8000') : undefined)
        , httpOptions
        }
      )
  )

// TODO: consider cross-table batching? Probably not worth it
export async function batchGet<K, V>
  ( client: DocumentClientAsync
  , { TableName, serialize }: $TableRep<K, V>
  , keys: Array<K>
  ): Promise<Array<V>> {

    // batch reads into groups of 100
    const reads : Array<Array<V>> = await Promise.all(
      chunk(keys, 100).map(async chunk => {
        const { Responses } = await client.batchGetAsync(
          { RequestItems: { [TableName]: { Keys: chunk } } }
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
  ( client: DocumentClientAsync
  , { TableName, serialize }: $TableRep<K, V>
  , items: Array<V>
  ): Promise<void> {

    // chunk into groups of 100
    const chunks = chunk(items, 100)

    // execute each mutation chunk in serial
    for (let chunk of chunks) {
      const requests = chunk.map(Item => ({ PutRequest: { Item } }))
      await client.batchWriteAsync({ RequestItems: { [TableName]: requests } })
    }

  }

export async function batchDel<K, V>
  ( client: DocumentClientAsync
  , { TableName }: $TableRep<K, V>
  , keys: Array<K>
  ): Promise<void> {

    // chunk into groups of 100
    const chunks = chunk(keys, 100)

    // execute each mutation batch in serial
    for (let chunk of chunks) {
      const requests = chunk.map(Key => ({ DeleteRequest: { Key } }))
      await client.batchWriteAsync({ RequestItems: { [TableName]: requests } })
    }

  }
