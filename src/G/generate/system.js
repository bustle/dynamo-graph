/* @flow */

import type { Context } from './utils'

import { indent, createTable } from './utils'

export default async function(ctx: Context, tables: Array<string>) {

  const TableName = `${ctx.g.name}-system`

  ctx.out('Generating systems table...')

  await createTable
    ( indent(ctx)
    , tables
    , { TableName
      , AttributeDefinitions:
        [ { AttributeName: 'key'
          , AttributeType: 'S'
          }
        , { AttributeName: 'value'
          , AttributeType: 'N'
          }
        ]
      , KeySchema:
        [ { AttributeName: 'key'
          , KeyType: 'HASH'
          }
        ]
      , ProvisionedThroughput:
        { ReadCapacityUnits: 5
        , WriteCapacityUnits: 5
        }
      }
    )

  await createSystemObjects(indent(ctx), TableName)

}

async function createSystemObjects(ctx: Context, TableName: string) {

  ctx.out(`Generating system objects...`)

  await createSystemIncr(indent(ctx), TableName, 'id')
  await createSystemIncr(indent(ctx), TableName, 'weight')

}

// probably don't need to generalize this any futher
async function createSystemIncr({ out, ddb }: Context, TableName: string, key: string): Promise<void> {
  const { Item } = await ddb.getItem(
    { TableName, Key: { key: { S: key } }}
  ).promise()
  if (Item) {
    out(`${TableName}.${key} exists with value ${Item.value.N}`)
  } else {
    await ddb.putItem(
      { TableName, Item: { key: { S: key }, value: { N: '0' } } }
    ).promise()
    out(`Created ${TableName}.${key}`)
  }
}
