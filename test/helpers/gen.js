const NAT_CAP = 9223372036854775807
const ALPHABET = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'

const rand = Math.random

const toInt = n => Math.floor(n)

export const array = n => Array(Math.max(0, toInt(n))).fill(0)

export const int = n => toInt(rand() * n)

export const letter = () => ALPHABET[int(64)]

export const id = n => array(int(n - 1) + 1).map(letter).join('')

export const nat = () => int(NAT_CAP - 1) + 1
