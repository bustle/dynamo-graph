/* @flow */

import type { Region } from './index.js'
import type { $TableRep } from '../Types'

import { config as AWSConfig, DynamoDB, Endpoint } from 'aws-sdk'
import Promise from 'bluebird'
import https from 'https'

import DataLoader from 'dataloader'
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


export class TableAdapter<K,V> {

  client: DocumentClientAsync;
  table: $TableRep<K,V>;
  omitLogs: boolean;
  getLoader: DataLoader<string,V>;
  putLoader: DataLoader<V,string>;
  delLoader: DataLoader<K,string>;


  constructor(client: DocumentClientAsync, table: $TableRep<K,V>, omitLogs: boolean = false) {
    this.client = client
    this.table = table
    this.omitLogs = omitLogs

    this.getLoader = new DataLoader
      ( (keys: Array<string>): Promise<Array<V>> =>
          this.batchGet(keys.map(table.deserialize))
      )

    this.putLoader = new DataLoader
      ( (items: Array<V>): Promise<Array<string>> =>
          this.batchPut(items)
      , { cache: false }
      )

    this.delLoader = new DataLoader
      ( (keys: Array<K>): Promise<Array<string>> =>
          this.batchDel(keys)
      , { cache: false }
      )
  }

  get(key: K): Promise<?V> {
    return this.getLoader.load(this.table.serialize(key))
  }

  getMany(keys: Array<K>): Promise<Array<?V>> {
    return Promise.all(keys.map(k => this.get(k)))
  }

  async put(item: V): Promise<V> {
    await this.putLoader.load(item)
    this.prime(item)
    return item
  }

  putMany(items: Array<V>): Promise<Array<V>> {
    return Promise.all(items.map(i => this.put(i)))
  }

  async del(key: K): Promise<K> {
    await this.delLoader.load(key)
    this.getLoader
        .clear(this.table.serialize(key))
    return key
  }

  delMany(keys: Array<K>): Promise<Array<K>> {
    return Promise.all(keys.map(k => this.del(k)))
  }

  prime(item: V): V {
    this.getLoader
        .clear(this.table.serialize(item))
        .prime(this.table.serialize(item), item)
    return item
  }

  primeMany(items: Array<V>): Array<V> {
    return items.map(item => this.prime(item))
  }

  // PRIVATE:

  // implementation of batching


  async batchGet(keys: Array<K>): Promise<Array<V>> {

    const log = this.startLog(`batch get \`${this.table.TableName}\` with ${keys.length} keys`)

    // batch reads into groups of 100
    const reads : Array<Array<V>> = await Promise.all(
      chunk(keys, 100).map(async chunk => {
        const { Responses } = await this.client.batchGetAsync(
          { RequestItems: { [this.table.TableName]: { Keys: chunk } } }
        )
        return Responses[this.table.TableName]
      })
    )

    this.endLog(log)

    // flatten results into a normalized map
    // dynamo `BatchGetItem`s do not guarantee order
    const results : Array<V> = flatten(reads)
    const resultMap : { [key: string]: V } = {}

    results.forEach(
      v => resultMap[this.table.serialize(v)] = v
    )

    // console.log('yes hello:', resultMap)

    // map keys to their results
    return keys.map(key => resultMap[this.table.serialize(key)])

  }

  async batchPut(rawItems: Array<V>): Promise<Array<string>> {

    // deduplicate items, preferring later items
    const items: Array<V> = this.dedupe(rawItems)

    // deduplicate items, preferring later items
    const log = this.startLog(`batch put \`${this.table.TableName}\` with ${items.length} items`)

    // chunk into groups of 25
    const chunks = chunk(items, 25)

    // execute each mutation chunk in serial
    for (let chunk of chunks) {
      const requests = chunk.map(
        Item => ({ PutRequest: { Item } })
      )
      await this.client.batchWriteAsync(
        { RequestItems: { [this.table.TableName]: requests } }
      )
    }

    this.endLog(log)

    return rawItems.map(() => "OK")

  }

  async batchDel(rawKeys: Array<K>): Promise<Array<string>> {

    // deduplicate items, preferring later items
    const keys: Array<K> = this.dedupe(rawKeys)

    const log = this.startLog(`batch del \`${this.table.TableName}\` with ${keys.length} keys`)

    // chunk into groups of 25
    const chunks = chunk(keys, 25)

    // execute each mutation batch in serial
    for (let chunk of chunks) {
      const requests = chunk.map(
        Key => ({ DeleteRequest: { Key } })
      )
      await this.client.batchWriteAsync(
        { RequestItems: { [this.table.TableName]: requests } }
      )
    }

    this.endLog(log)

    return rawKeys.map(() => "OK")

  }

  // helpers

  startLog(name: string): ?string {
    if (!this.omitLogs) {
      const op = `${name} (opId: ${Math.floor(Math.random() * 99999) + 1})`
      console.log(`Dispatching ${op}`)
      console.time(op)
      return op
    }
  }

  endLog(op: ?string): void {
    if (!this.omitLogs && op) {
      console.timeEnd(op)
    }
  }

  dedupe<T: K|V>(objs: Array<T>): Array<T> {
    const invIndex: { [key: string]: number } = {}
    const deduped: Array<T> = []
    objs.forEach(obj => {
      const ser: string = this.table.serialize(obj)
      if (invIndex[ser] || invIndex[ser] === 0) {
        deduped[invIndex[ser]] = obj
      } else {
        invIndex[ser] = deduped.length
        deduped.push(obj)
      }
    })
    return deduped
  }
}
