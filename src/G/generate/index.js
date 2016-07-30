/* @flow */

import type { Graph } from '../index'
import type { Context } from './utils'

import { DynamoDB } from 'aws-sdk'
import https from 'https'

import generateSystem from './system'
import generateVertex from './vertex'

const httpOptions =
  { agent: new https.Agent
    ( { rejectUnauthorized: true
      , secureProtocol: 'TLSv1_method'
      , ciphers: 'ALL'
      }
    )
  }

const indent = (ctx : Context): Context =>
  ( { ...ctx
    , out: ctx.out.bind(console, '>')
    }
  )

export default async function(g: Graph): Promise<Graph> {

  const ddb : DynamoDB =
    new DynamoDB
      ( { region: g.region
        , httpOptions
        }
      )

  const ctx : Context =
    { out: console.log.bind(console)
    , ddb
    , g
    }

  ctx.out(`Generating tables for ${g.name}`)

  // TODO: handle the >100 tables case
  const { TableNames: tables } = await ddb.listTables().promise()

  await generateSystem(indent(ctx), tables)
  await generateVertex(indent(ctx), tables)

  return g

}
