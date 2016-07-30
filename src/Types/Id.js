/* @flow */

import type { $Id } from './index'

import { assign, invariant } from '../utils'

const ALPHABET : Array<string> =
  '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'
    .split('')
    .sort()

const CHAR_TO_DEC : { [key: string]: number } =
  ALPHABET.reduce(assign, {})

const INVALID = /[^0-9a-zA-Z_-]/
const BASE      : number = 64
const BASE_BITS : number = 6

const isNat = (n: number): boolean =>
  Math.max(Math.floor(n), 1) == n

export function toNat(id: $Id): number {

  invariant
    ( id
    , `Id.toNat may not be called on the empty id`
    )

  invariant
    ( !id.match(INVALID)
    , `Id.toNat called on some non-natural id "${id}", possibly a foreign key`
    )

  return id
    .split('')
    .reduce((n, c) => n * BASE + CHAR_TO_DEC[c], 0)

}

export function fromNat(n: number): $Id {

  invariant
    ( isNat(n)
    , `Id.fromNat called on n "${n}" ∉ ℤ+`
    )

  const length = Math.max(0, Math.floor(Math.log2(n) / BASE_BITS)) + 1
  const chars = new Array(length)

  let i = length - 1
  while (n > 0) {
    chars[i--] = ALPHABET[n % BASE]
    n = Math.floor(n / BASE)
  }
  while (i >= 0)
    chars[i--] = ALPHABET[0]

  return chars.join('')
}
