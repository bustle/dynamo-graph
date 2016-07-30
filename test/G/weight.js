import test from 'ava'

import { G } from 'dynamo-graph'
import * as Gen from '../helpers/gen'
import g from '../helpers/g'

test
  ( 'generates fresh weights'
  , async t => {

      const weights = await Promise.all(
        Gen.array(10).map(g.weight)
      )

      // type check
      weights.forEach(w => t.true(typeof w === 'number'))

      // pairwise quality
      for (let i = 0; i < 9; i++)
        for (let j = i + 1; j < 10; j++)
          t.not(weights[i], weights[j])
    }
  )
