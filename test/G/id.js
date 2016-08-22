import test from 'ava'

import { G } from 'dynamo-graph'
import * as Gen from '../helpers/gen'
import g from '../helpers/g'

test
  ( 'generates fresh ids'
  , async t => {

      // generate
      const ids = await Promise.all(
        Gen.array(10).map(g.id)
      )

      // type check
      ids.forEach(id => t.true(typeof id === 'string'))

      // pairwise equality
      for (let i = 0; i < 9; i++)
        for (let j = i + 1; j < 10; j++)
          t.not(ids[i], ids[j])
    }
  )

test
  ( 'generates fresh serial ids'
  , async t => {

      // generate
      await g.putCounter('test', 0)

      const ids = await Promise.all(
        Gen.array(10).map(() => g.incrCounter('test'))
      )

      // type check
      ids.forEach(id => t.true(typeof id === 'number'))

      // pairwise equality
      for (let i = 0; i < 9; i++)
        for (let j = i + 1; j < 10; j++)
          t.not(ids[i], ids[j])

    }
  )
