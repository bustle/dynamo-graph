import test from 'ava'

import { Types } from 'dynamo-graph'
import { Gen } from '../helpers'

const { Id } = Types

const genId = () => Gen.id(24)

// toNat

test
  ( 'Id.toNat rejects invalid strings'
  , t => {
      t.throws(() => Id.toNat(''))
      t.throws(() => Id.toNat('article:10'))
      t.is(Id.toNat('A'), 11)
    }
  )

test
  ( 'Id.toNat is complete over valid strings'
  , t => {
      const nats = Gen.array(100).map(genId).map(Id.toNat)
      nats.forEach(nat => nat === 0 || t.truthy(nat))
    }
  )

// fromNat

test
  ( 'Id.fromNat fails on n ∉ ℤ+'
  , t => {
      t.throws(() => Id.fromNat(-1))
      t.throws(() => Id.fromNat(0))
      t.throws(() => Id.fromNat(11.5))
      t.throws(() => Id.fromNat(-123.142))
      t.is(Id.fromNat(11.0), 'A')
    }
  )

test
  ( 'Id.fromNat is complete over ℤ+'
  , t => {
      const ids = Gen.array(100).map(Gen.nat).map(Id.fromNat)
      ids.forEach(id => t.truthy(id))
    }
  )

// correctness

test
  ( 'Id.toNat is the inverse of Id.fromNat'
  , t => {
      const ints = Gen.array(100).map(Gen.nat)
      const ids  = ints.map(Id.fromNat)
      ints.forEach(
        (i, idx) => t.is(i, Id.toNat(ids[idx]))
      )
    }
  )

test
  ( 'Id.fromNat is a surjective and injective map'
  , t => {
      const ints = Gen.array(50).map(Gen.nat)
      const ids = ints.map(Id.fromNat)
      for (let i = 0; i < 50; i++)
        for (let j = i; j < 50; j++)
          if (ints[i] != ints[j] && ids[i] === ids[j])
            t.fail(`Expected either ${ints[i]} === ${ints[j]} or ${ids[i]} != ${ids[j]}`)
    }
  )
