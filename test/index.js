import test from 'ava'

import { foo } from 'dynamo-graph'

test('test suite runs', t => t.pass())

test('async tests run', async t => {
  const r = Promise.resolve(foo)
  t.is(await r, 'foo')
})
