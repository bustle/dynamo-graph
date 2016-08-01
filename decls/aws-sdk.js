declare module 'aws-sdk' {

  declare type Params = any
  declare type Response = any

  declare var config: any

  declare class DocumentClient {
    [key: string]: (params: Params) => Response;
  }

  declare class DynamoDB {
    static DocumentClient: Class<DocumentClient>;
    listTables(params: Params): Response;
    createTable(params: Params): Response;
    waitFor(state: "tableExists" | "tableNotExists", params: Params): Response;
    getItem(params: Params): Response;
    putItem(params: Params): Response;
  }

  declare class Endpoint {

  }
}
