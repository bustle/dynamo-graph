import type { DynamoDB } from 'aws-sdk'
import type { Graph } from '../index'

/* @flow */

export type Logger = (...args : Array<string>) => void

export type Context =
  { out: Logger
  , ddb: DynamoDB
  , g: Graph
  }

export const indent = (ctx : Context): Context =>
  ( { ...ctx
    , out: ctx.out.bind(console, '>')
    }
  )

export async function createTable({ out, ddb }: Context, tables: Array<string>, params: any): Promise<void> {
  if (~tables.indexOf(params.TableName)) {
    out(`Table "${params.TableName}" already exists`)
  } else {
    await ddb.createTable(params).promise()
    await ddb.waitFor('tableExists', { TableName: params.TableName }).promise()
    out (`Table "${params.TableName}" created`)
  }
}
