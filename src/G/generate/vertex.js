/* @flow */

import type { Context } from './utils'

import { INDEX_VERTEX_KEY, INDEX_VERTEX_ALL } from '../index'
import { indent, createTable } from './utils'

export default async function(ctx: Context, tables: Array<string>) {

  const TableName = `${ctx.g.name}-vertex`

  ctx.out('Generating vertex table...')

  await createTable
    ( indent(ctx)
    , tables
    , { TableName
      , AttributeDefinitions:
        [ { AttributeName: 'id'
          , AttributeType: 'S'
          }
        , { AttributeName: 'label'
          , AttributeType: 'S'
          }
        , { AttributeName: 'key'
          , AttributeType: 'S'
          }
        , { AttributeName: 'updatedAt'
          , AttributeType: 'N'
          }
        ]
      , KeySchema:
        [ { AttributeName: 'id'
          , KeyType: 'HASH'
          }
        ]
      , ProvisionedThroughput:
        { ReadCapacityUnits: 5
        , WriteCapacityUnits: 5
        }
      , GlobalSecondaryIndexes:
        [ { IndexName: INDEX_VERTEX_KEY
          , KeySchema:
            [ { AttributeName: 'label'
              , KeyType: 'HASH'
              }
            , { AttributeName: 'key'
              , KeyType: 'RANGE'
              }
            ]
          , Projection: { ProjectionType: 'ALL' }
          , ProvisionedThroughput:
            { ReadCapacityUnits: 5
            , WriteCapacityUnits: 5
            }
          }
        , { IndexName: INDEX_VERTEX_ALL
          , KeySchema:
            [ { AttributeName: 'label'
              , KeyType: 'HASH'
              }
            , { AttributeName: 'updatedAt'
              , KeyType: 'RANGE'
              }
            ]
          , Projection: { ProjectionType: 'ALL' }
          , ProvisionedThroughput:
            { ReadCapacityUnits: 5
            , WriteCapacityUnits: 5
            }
          }
        ]
      }
    )

  // TODO: confirm indices exist
}
