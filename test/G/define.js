import test from 'ava'

import { G } from 'dynamo-graph'

import g from '../helpers/g'

test
  ( 'should produce a sensible output'
  , t => {
      t.is(g.name, 'dynamo-graph-test')
      t.is(g.env, G.ENV_DEVELOPMENT)
    }
  )

// validations

test
  ( 'only valid characters are allowed in the name'
  , t => {
      t.throws(() => G.define(''))
      t.throws(() => G.define('My Graph'))
      t.throws(() => G.define('My:Graph'))
    }
  )

/*
test
  ( 'library prevents naming conflicts'
  , t => {
      t.throws(() => G.define('dynamo-graph-test', { env: G.ENV_PRODUCTION }))
      t.throws(() => G.define('dynamo-graph-test', { region: "local" }))
      t.is(G.define('dynamo-graph-test'), g)
    }
  )
*/
