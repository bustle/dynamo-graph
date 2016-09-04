/* @flow */

import type { Context } from './utils'

import { INDEX_EDGE_OUT
       , INDEX_EDGE_IN
       , INDEX_EDGE_FROM
       , INDEX_EDGE_TO
       } from '../index'
import { indent, createTable } from './utils'

export default async function(ctx: Context, tables: Array<string>) {

  const TableName = `${ctx.g.name}-edge`

  ctx.out('Generating edge table...')

  await createTable
    ( indent(ctx)
    , tables
    , { TableName
      , AttributeDefinitions:
        [ { AttributeName: 'hk_out'
          , AttributeType: 'S'
          }
        , { AttributeName: 'hk_in'
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
        [ { AttributeName: 'hk_out'
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
      , LocalSecondaryIndexes:
        [ { IndexName: INDEX_EDGE_OUT
          , KeySchema:
            [ { AttributeName: 'hk_out'
              , KeyType: 'HASH'
              }
            , { AttributeName: 'weight'
              , KeyType: 'RANGE'
              }
            ]
          , Projection: { ProjectionType: 'ALL' }
          }
        ]
      , GlobalSecondaryIndexes:
        [ { IndexName: INDEX_EDGE_IN
          , KeySchema:
            [ { AttributeName: 'hk_in'
              , KeyType: 'HASH'
              }
            , { AttributeName: 'weight'
              , KeyType: 'RANGE'
              }
            ]
          , Projection: { ProjectionType: 'ALL' }
          , ProvisionedThroughput:
            { ReadCapacityUnits: 10
            , WriteCapacityUnits: 10
            }
          }
        , { IndexName: INDEX_EDGE_FROM
          , KeySchema:
            [ { AttributeName: 'from'
              , KeyType: 'HASH'
              }
            ]
          , Projection: { ProjectionType: 'KEYS_ONLY' }
          , ProvisionedThroughput:
            { ReadCapacityUnits: 10
            , WriteCapacityUnits: 10
            }
          }
        , { IndexName: INDEX_EDGE_TO
          , KeySchema:
            [ { AttributeName: 'to'
              , KeyType: 'HASH'
              }
            ]
          , Projection: { ProjectionType: 'KEYS_ONLY' }
          , ProvisionedThroughput:
            { ReadCapacityUnits: 10
            , WriteCapacityUnits: 10
            }
          }
        ]
      }
    )

  // TODO: confirm indices exist
}
