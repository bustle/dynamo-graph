/* @flow */

import type { Context } from './utils'

import { INDEX_EDGE_FROM, INDEX_ADJACENCY } from '../index'
import { indent, createTable } from './utils'

export default async function(ctx: Context, tables: Array<string>) {

  const TableName = `${ctx.g.name}-edge`

  ctx.out('Generating edge table...')

  await createTable
    ( indent(ctx)
    , tables
    , { TableName
      , AttributeDefinitions:
        [ { AttributeName: 'hk'
          , AttributeType: 'S'
          }
        , { AttributeName: 'from'
          , AttributeType: 'S'
          }
        , { AttributeName: 'weight'
          , AttributeType: 'N'
          }
        , { AttributeName: 'to'
          , AttributeType: 'S'
          }
        ]
      , KeySchema:
        [ { AttributeName: 'hk'
          , KeyType: 'HASH'
          }
        , { AttributeName: 'to'
          , KeyType: 'RANGE'
          }
        ]
      , ProvisionedThroughput:
        { ReadCapacityUnits: 10
        , WriteCapacityUnits: 10
        }
      , GlobalSecondaryIndexes:
        [ { IndexName: INDEX_EDGE_FROM
          , KeySchema:
            [ { AttributeName: 'from'
              , KeyType: 'HASH'
              }
            ]
          , Projection:
            { ProjectionType: 'INCLUDE'
            , NonKeyAttributes:
              [ 'label'
              , 'out'
              , 'to'
              ]
            }
          , ProvisionedThroughput:
            { ReadCapacityUnits: 10
            , WriteCapacityUnits: 10
            }
          }
        ]
      , LocalSecondaryIndexes:
        [ { IndexName: INDEX_ADJACENCY
          , KeySchema:
            [ { AttributeName: 'hk'
              , KeyType: 'HASH'
              }
            , { AttributeName: 'weight'
              , KeyType: 'RANGE'
              }
              ]
          , Projection: { ProjectionType: 'ALL' }
          }
        ]
      }
    )

  // TODO: confirm indices exist
}
