/* @flow */

import type { $Cursor } from './index'

export type ParsedCursor =
  { RangeCondition: DynamoRangeExpression | void
  , Limit: number | void
  , ScanIndexForward: boolean
  }

type DynamoRangeExpression =
  { ComparisonOperator: 'LT' | 'GT'
  , AttributeValueList: [ number ]
  }

export function parse(cursor: ?$Cursor = {}): ParsedCursor {

  const { first
        , after
        , last
        , before
        } = (cursor : any)

  const reverse: boolean = last > 0 || (before !== undefined && before !== null)

  return {
      RangeCondition:
        (reverse ? before : after)
        ? { ComparisonOperator: reverse ? 'GT' : 'LT'
          , AttributeValueList: [ reverse ? before : after ]
          }
        : undefined
    , ScanIndexForward: reverse
    , Limit: reverse ? last : first
  }
}
