import test from 'ava'

import { E } from 'dynamo-graph'
import { g, Gen } from '../helpers'


const ROOT = "TEST:BatchingRoot"

const BATCH_TEST = E.define('BatchTest', E.MANY_TO_MANY)

const BATCHES = 10
const BATCH_SIZE = 25


test
  ( 'Batches writes successfully'
  , async t => {

      // clean up existing edges
      const existing = await E.range(g, ROOT, BATCH_TEST, E.OUT)
      await Promise.all(
        existing.map(e =>
          E.remove(g, e.from, BATCH_TEST, E.OUT, e.to)
        )
      )

      const remaining = await E.range(g, ROOT, BATCH_TEST, E.OUT)
      t.is(remaining.length, 0)

      // create a batch of requests
      await Promise.all(
        Gen.array(BATCHES * BATCH_SIZE).map(
          (_, i) => E.set(g, ROOT, BATCH_TEST, E.OUT, Math.random(), `TEST:${i}`)
        )
      )

      const written = await E.range(g, ROOT, BATCH_TEST, E.OUT)
      t.is(written.length, BATCHES * BATCH_SIZE)
    }
  )
