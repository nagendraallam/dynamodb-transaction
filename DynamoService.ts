import {
  DynamoDBClient,
  ListTablesCommand,
  CreateTableCommand,
  DescribeTableCommand,
} from "@aws-sdk/client-dynamodb";

import {
  GetCommand,
  PutCommand,
  TransactWriteCommand,
  DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { TransactionType } from "./types";

const dynamoClient = new DynamoDBClient({
  region: process.env.AWS_REGION ?? "us-east-1",
  endpoint: process.env.AWS_ENDPOINT ?? "http://localhost:8000",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "key",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "key",
  },
});

const client = DynamoDBDocumentClient.from(dynamoClient);

// create user table if it doesn't exist
export async function createTables() {
  try {
    const tables = await dynamoClient.send(new ListTablesCommand({}));

    if (!tables.TableNames?.includes("Users")) {
      await dynamoClient.send(
        new CreateTableCommand({
          TableName: "Users",
          AttributeDefinitions: [
            { AttributeName: "userId", AttributeType: "S" },
          ],
          KeySchema: [{ AttributeName: "userId", KeyType: "HASH" }],
          BillingMode: "PAY_PER_REQUEST",
        })
      );
      while (true) {
        const { Table } = await dynamoClient.send(
          new DescribeTableCommand({ TableName: "Users" })
        );
        if (Table?.TableStatus === "ACTIVE") break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    if (!tables.TableNames?.includes("Transactions")) {
      await dynamoClient.send(
        new CreateTableCommand({
          TableName: "Transactions",
          AttributeDefinitions: [
            { AttributeName: "idempotentKey", AttributeType: "S" },
          ],
          KeySchema: [{ AttributeName: "idempotentKey", KeyType: "HASH" }],
          BillingMode: "PAY_PER_REQUEST",
        })
      );

      while (true) {
        const { Table } = await dynamoClient.send(
          new DescribeTableCommand({ TableName: "Transactions" })
        );
        if (Table?.TableStatus === "ACTIVE") break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  } catch (error) {
    throw error;
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

export async function transact(
  userId: string,
  amount: number,
  type: TransactionType,
  idempotentKey: string
) {
  try {
    const balanceChange = type === TransactionType.CREDIT ? amount : -amount;

    const expressionAttributeValues: Record<string, any> = {
      ":balanceChange": balanceChange,
    };

    if (type === TransactionType.DEBIT) {
      expressionAttributeValues[":amount"] = amount;
    }

    const transaction = new TransactWriteCommand({
      TransactItems: [
        {
          Update: {
            TableName: "Users",
            Key: { userId: userId },
            UpdateExpression: "ADD currentBalance :balanceChange",
            ConditionExpression:
              type === TransactionType.DEBIT
                ? "currentBalance >= :amount"
                : "attribute_exists(userId)",
            ExpressionAttributeValues: expressionAttributeValues,
          },
        },
        {
          Put: {
            TableName: "Transactions",
            Item: {
              idempotentKey: idempotentKey,
              userId: userId,
              amount: amount,
              type: type,
              timestamp: new Date().toISOString(),
            },
            ConditionExpression: "attribute_not_exists(idempotentKey)",
          },
        },
      ],
    });

    await client.send(transaction);

    const userResult = await getUserBalance(userId);
    const updatedBalance = userResult.Item?.currentBalance;

    return {
      status: "success",
      data: {
        idempotentKey: idempotentKey,
        userId: userId,
        balance: updatedBalance,
      },
    };
  } catch (error: any) {
    if (error.name === "TransactionCanceledException") {
      const cancellationReasons = error.CancellationReasons || [];

      if (cancellationReasons[1]?.Code === "ConditionalCheckFailed") {
        const userResult = await getUserBalance(userId);
        return {
          status: "success",
          message: "Transaction already processed (idempotent)",
          data: {
            idempotentKey: idempotentKey,
            userId: userId,
            balance: userResult.Item?.currentBalance ?? 0,
          },
        };
      }

      if (cancellationReasons[0]?.Code === "ConditionalCheckFailed") {
        if (type === TransactionType.DEBIT) {
          return {
            status: "error",
            message:
              "Insufficient balance. Transaction would result in negative balance.",
          };
        } else {
          return {
            status: "error",
            message: "User does not exist",
          };
        }
      }
    }

    return {
      status: "error",
      message: "Error processing transaction",
      error: error.message || error,
    };
  }
}
