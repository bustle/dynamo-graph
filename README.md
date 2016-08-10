# dynamo-graph

Low-level graph database operations implemented in DynamoDB. Logic involving complex traversals, lazy lists, intersections, and unions, are deferred to the consuming client.

Ensure that you have your AWS CLI properly configured, so that the `aws-sdk` dependency can do its magic.

# Documentation (TODO)

All code is written in a literate style. For more detailed explanations, refer to the source code.

### Example

```js
import { G, V, E } from 'dynamo-graph'

// create a graph instance

const g = G.define('my-graph')

// create vertex definitions

const USER = V.define('User')
const NOTE = V.define('Note')

// create edge definitions

const AUTHORED = E.define('Authored', E.ONE_TO_MANY)

const overview = async () => {

  // if this is our first time using the graph
  // G.generate will instantiate all the DynamoDB tables, indices, and system objects
  await G.generate(g)

  // V.create

  const me = await V.create(g, USER, { name: "James", job: "Intern" })
    // => { id: '3Rx', label: 'User', updatedAt: 14699502051042, attrs: { name: "James", job: "Intern" } }
  const boss = await V.create(g, USER, { name: "Tyler", job: "CTO" })
    // => { id: '3Ry', label: 'User', updatedAt: 14699502056492, attrs: { name: "Tyler", job: "CTO" }}
  const note = await V.create(g, NOTE, { message: "some note" })
    // => { id: '3Rz', label: 'Note', updatedAt: 14699502285314, attrs: { message: "some note" }}

  // V.all

  await V.all(g, USER)
    // => TODO: document

  // V.update

  await V.update(g, USER, me.id, { name: "James", job: "Engineer" })
    // => { id: '3Rx', label: 'User', updatedAt: 14699502496014, attrs: { name: "James", job: "Engineer" } }

  // V.putByKey

  await V.putByKey(g, NOTE, 'important', { message: 'Publish dynamo-graph!' })
    // => { id: 'd7', label: 'Note', updatedAt: 1469950262268, key: 'important', attrs: { message: 'Publish dynamo-graph!' } }

  // n.b. the id remains the same, the key uniquely identifies the vertex
  const important = await V.putByKey(g, NOTE, 'important', { message: 'Published' })
    // => { id: 'd7', label: 'Note', updatedAt: 1469950309677, key: 'important', attrs: { message: 'Published' } }

  // E.set

  const e1 = await E.set(g, important.id, AUTHORED, E.IN, E.GENERATE, me.id)
    // => { from: 'd7', label: 'Authored', direction: '<', weight: 1042, to: '3Rx', updatedAt: 1469950464801 }

  const e2 = await E.set(g, me.id, AUTHORED, E.OUT, +Date.now(), note.id)
    // => { from: '3Rx', label: 'Authored', direction: '>', weight: 1469950468427, to: '3Rz', updatedat: 1469950468427 }

  // E.get

  await E.get(g, note.id, AUTHORED, E.IN, +Date.now(), me.id)
    // => { from: '3Rz', label: 'Authored', direction: '<', weight: 1469950468427, to: '3Rx', updatedat: 1469950468427 }

  // E.range

  await E.range(g, me.id, AUTHORED, E.OUT)
    // => [ e2, e1 ]
  await E.range(g, me.id, AUTHORED, E.OUT, { first: 1, after: 99999 })
    // => [ e1 ]
  await E.range(g, me.id, AUTHORED, E.OUT, { last: 1, before: -1 })
    // => [ e1 ]

  // Edge multiplicities are respected:
  
  await E.set(g, boss.id, AUTHORED, E.OUT, E.GENERATE, important.id)
    // => { from: '3Ry', label: 'Authored', direction: '>', weight: 1043, to: 'd7', updatedAt: 1469981321205 }
  await E.get(g, me.id, AUTHORED, E.OUT, important.id)
    // => null
  await E.get(g, important.id, AUTHORED, E.IN, me.id)
    // => null

  // E.remove
  await E.remove(g, boss.id, AUTHORED, E.OUT, important.id)
    // => { from: '3Ry', label: 'Authored', direction: '>', weight: 1043, to: 'd7', updatedAt: 1469981321205 }

}
```

## G

A graph is an abstraction over the database, containing meta information as well as exposure to the raw operations

```js
type Graph =
  { name: string
  , env: "production" | "beta" | "development"
  , region: "us-east-1" | "us-west-1" | ... | "local"
  , id: () => Promise<Id>
  , weight: () => Promise<Weight>
  }
```

### `G.define(name[, { env, region }]): Graph`
### `G.generate(g): Promise<Graph>`

## V

A vertex is a tuple `(id, label, attrs, key?, updatedAt)` such that the id uniquely determines the vertex,
the label uniquely determines the type of the attributes, and the label-key pair uniquely determines a vertex

```js
type Vertex<a> =
  { id        : string
  , label     : Label
  , attrs     : a
  , key?      : string
  , updatedAt : number
  }
```

### `V.define(label)`
### `V.create(g, def, attrs)`
### `V.update(g, def, id, attrs)`
### `V.putByKey(g, def, key, attrs)`
### `V.get(g, id)`
### `V.getMany(g, ids)`
### `V.getByKey(g, def, key)`
### `V.all(g, def, cursor)`
### `V.count(g, def, cursor)`
### `V.remove(g, id)`

## E

An edge is a tuple `(from, label, direction, weight, to, attrs, updatedAt)` such that
`(from, label, direction, to)` and `(from, label, direction, weight)` both uniquely identify the edge.

```js
type Edge<a> =
  { from       : string
  , label      : Label
  , direction  : ">" | "<"
  , weight     : number
  , to         : string
  , attrs      : a
  , updatedAt  : number
  }
```

### Directions

Edge operations require a direction: `E.OUT`, or `E.IN`

### Multiplicities

Defining an Edge requires the use of one of the following multiplicities:

- `E.MANY_TO_MANY`: no restrictions, describes a simple graph
- `E.ONE_TO_MANY`: a vertex may have many `OUT` edges, but only one `IN` edge, typically surjective
- `E.MANY_TO_ONE`: a vertex may have many `IN` edges, but many `OUT` edge, i.e. an injective mapping
- `E.ONE_TO_ONE`: a vertex may have only one `IN` or `OUT` edge, i.e. a bipartition

### `E.define(label, multiplicity)`
### `E.get(g, from, def, direction, to)`
### `E.range(g, from, def, direction, cursor)`
### `E.count(g, from, def, direction, cursor)`
### `E.set(g, from, def, direction, weight, to, attrs)`
### `E.remove(g, from, def, to)`
