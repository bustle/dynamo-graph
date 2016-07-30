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
const POST = V.define('Post')
const NOTE = V.define('Note')

const ENTITY = V.union(USER, POST, NOTE)
const WRITING = V.union(POST, NOTE)

// create edge definitions

const AUTHORED = E.define('Authored', E.ONE_TO_MANY)
const SPONSORED = E.define('Sponsored', E.MANY_TO_MANY)

const overview = async () => {

  // if this is our first time using the graph
  // G.generate will instantiate all the DynamoDB tables, indices, and system objects
  await G.generate(g)

  const me = await V.create(g, USER, { name: "James", job: "Intern" })
  const boss = await V.create(g, USER, { name: "Tyler", job: "CTO" })

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

### Multiplicities

Defining an Edge requires the use of one of the following multiplicities:

- `E.MANY_TO_MANY`
- `E.ONE_TO_MANY`
- `E.MANY_TO_ONE`
- `E.ONE_TO_ONE`

### `E.define(label, multiplicity)`
### `E.get(from, label, direction, to)`
### `E.range(from, label, direction, cursor)`
### `E.set(from, label, direction, weight, to, attrs)`
### `E.remove(from, label, direction, to)`
