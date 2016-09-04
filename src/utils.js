/* @flow */

export function assign<K, V>(obj: { [key: K]: V }, key: K, val: V): { [key: K]: V } {
  obj[key] = val
  return obj
}

export function invariant(condition: mixed, message: string) : void {
  if (!condition)
    throw new Error(message)
}

export function validateArg<a>(name: string, argument: number, fn: (val: a) => mixed, x: a): void {
  invariant(fn(x), `${name} at argument ${argument}, expected "${fn.name}" got ${JSON.stringify(x) || 'undefined'}`)
}

export function maybe<a>(key: string, value: ?a): { [key: string]: a } {
  if (value === undefined)
    return {  }
  else
    return { [key]: value }
}


export function chunk<a>(arr: Array<a>, n: number): Array<Array<a>> {
  const chunks = []
  for (let i = 0, j = arr.length; i < j; i += n)
    chunks.push(arr.slice(i, i+n))
  return chunks
}

export function flatten<a>(arr: Array<Array<a>>): Array<a> {
  return [].concat(...arr)
}

