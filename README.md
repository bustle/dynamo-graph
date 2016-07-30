# dynamo-graph

Low-level graph database operations implemented in DynamoDB. Logic involving complex traversals, lazy lists, intersections, and unions, are deferred to the consuming client.

Ensure that you have your AWS CLI properly configured, so that the `aws-sdk` dependency can do its magic.

# Documentation

All code is written in a literate style. For more detailed explanations, refer to the source code.
The following type signatures differ slightly from the actual FlowType annotations.
In particular, phantom types are removed, and aliases are kept only to mark "private" types

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

### `.define(name: string, configs: ?{ env?: Env, region?: Region }): Graph`

### `.generate(g: Graph): Promise<Graph>`

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

### `.define<a>(label: string): VertexDef<a>`
### `.create<a>(g: Graph, def: VertexDef<a>, attrs: a): Promise<Vertex<a>>`
### `.update<a>(g: Graph, def: VertexDef<a>, id: string, attrs: a): Promise<Vertex<a>>`
### `.putByKey<a>(g: Graph, def: VertexDef<a>, key: string, attrs: a): Promise<Vertex<a>>`
### `.get(g: Graph, id: string): Promise<?Vertex<*>>`
### `.getMany(g: Graph, ids: [string]): Promise<[?Vertex<*>]>`
### `.getByKey<a>(g: Graph, def: VertexDef<a>, key: string): Promise<?Vertex<a>>`
### `.remove(g: Graph, id: string): Promise<Vertex<*>>`
