declare module 'aws-sdk' {

  declare class DocumentClient {

  }

  declare class DynamoDB {
    static DocumentClient: Class<DocumentClient>
  }
}
