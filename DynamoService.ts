import {
  DynamoDBClient,
  ListTablesCommand,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  endpoint: process.env.AWS_ENDPOINT ?? "http://localhost:8000",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "dummy",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "dummy",
  },
});

// create user table if it doesn't exist
export async function createUserTable() {
  const tables = await client.send(new ListTablesCommand({}));

  if (tables.TableNames?.includes("Users")) {
    return;
  }

  await client.send(
    new CreateTableCommand({
      TableName: "Users",
      AttributeDefinitions: [{ AttributeName: "userId", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    })
  );

  while (true) {
    const { Table } = await client.send(
      new DescribeTableCommand({ TableName: "Users" })
    );
    if (Table?.TableStatus === "ACTIVE") break;
    await new Promise((r) => setTimeout(r, 500));
  }
}

// add dummy user to user table for testing
export async function addDummyUser() {
  const command = new PutCommand({
    TableName: "Users",
    Item: {
      userId: "1234",
      currentBalance: 10,
    },
  });
  const result = await client.send(command);
  return result;
}

// get user balance from user table
export async function getUserBalance(userId: string) {
  const command = new GetCommand({
    TableName: "Users",
    Key: { userId: userId },
  });
  const result = await client.send(command);
  return result;
}
