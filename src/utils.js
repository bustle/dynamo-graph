/* @flow */

export function assign<K, V>(obj: { [key: K]: V }, key: K, val: V): { [key: K]: V } {
  obj[key] = val
  return obj
}

export function invariant(condition: mixed, message: string) : void {
  if (!condition)
    throw new Error(message)
}
