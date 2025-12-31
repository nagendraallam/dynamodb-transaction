import dotenv from "dotenv";
dotenv.config();

import { createTables, getUserBalance, transact } from "../DynamoService";
import { TransactionType } from "../types";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

// Helper to create test user
async function createTestUser(userId: string, initialBalance: number) {
  const dynamoClient = new DynamoDBClient({
    region: process.env.AWS_REGION ?? "us-east-1",
    endpoint: process.env.AWS_ENDPOINT ?? "http://localhost:8000",
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "key",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "key",
    },
  });

  const client = DynamoDBDocumentClient.from(dynamoClient);
  const command = new PutCommand({
    TableName: "Users",
    Item: { userId, currentBalance: initialBalance },
  });
  await client.send(command);
}

describe("Transaction System", () => {
  beforeAll(async () => {
    await createTables();
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  describe("Basic Operations", () => {
    test("should credit amount to user balance", async () => {
      const userId = "test-credit-1";
      const initialBalance = 100;
      await createTestUser(userId, initialBalance);

      const result = await transact(
        userId,
        50,
        TransactionType.CREDIT,
        `credit-${Date.now()}`
      );

      expect(result.status).toBe("success");
      const balanceResult = await getUserBalance(userId);
      expect(balanceResult.Item?.currentBalance).toBe(initialBalance + 50);
    });

    test("should debit amount from user balance", async () => {
      const userId = "test-debit-1";
      const initialBalance = 100;
      await createTestUser(userId, initialBalance);

      const result = await transact(
        userId,
        30,
        TransactionType.DEBIT,
        `debit-${Date.now()}`
      );

      expect(result.status).toBe("success");
      const balanceResult = await getUserBalance(userId);
      expect(balanceResult.Item?.currentBalance).toBe(initialBalance - 30);
    });
  });

  describe("Idempotency", () => {
    test("should handle duplicate idempotent keys", async () => {
      const userId = "test-idempotent-1";
      const initialBalance = 100;
      const idempotentKey = `idempotent-${Date.now()}`;
      await createTestUser(userId, initialBalance);

      const result1 = await transact(
        userId,
        25,
        TransactionType.CREDIT,
        idempotentKey
      );
      expect(result1.status).toBe("success");

      const result2 = await transact(
        userId,
        25,
        TransactionType.CREDIT,
        idempotentKey
      );
      expect(result2.status).toBe("success");
      expect(result2.message).toContain("already processed");

      const balanceResult = await getUserBalance(userId);
      expect(balanceResult.Item?.currentBalance).toBe(initialBalance + 25);
    });
  });

  describe("Negative Balance Prevention", () => {
    test("should prevent negative balance on debit", async () => {
      const userId = "test-negative-1";
      const initialBalance = 50;
      await createTestUser(userId, initialBalance);

      const result = await transact(
        userId,
        100,
        TransactionType.DEBIT,
        `debit-over-${Date.now()}`
      );

      expect(result.status).toBe("error");
      expect(result.message).toContain(
        "Insufficient balance. Transaction would result in negative balance."
      );

      const balanceResult = await getUserBalance(userId);
      expect(balanceResult.Item?.currentBalance).toBe(initialBalance);
    });

    test("should allow debit to exactly zero", async () => {
      const userId = "test-zero-1";
      const initialBalance = 50;
      await createTestUser(userId, initialBalance);

      const result = await transact(
        userId,
        initialBalance,
        TransactionType.DEBIT,
        `debit-zero-${Date.now()}`
      );

      expect(result.status).toBe("success");
      const balanceResult = await getUserBalance(userId);
      expect(balanceResult.Item?.currentBalance).toBe(0);
    });
  });

  describe("Race Conditions", () => {
    test("should handle concurrent transactions correctly", async () => {
      const userId = "test-concurrent-1";
      const initialBalance = 100;
      await createTestUser(userId, initialBalance);

      const concurrentCount = 10;
      const amount = 10;
      const promises = [];

      for (let i = 0; i < concurrentCount; i++) {
        promises.push(
          transact(
            userId,
            amount,
            TransactionType.CREDIT,
            `concurrent-${Date.now()}-${i}`
          )
        );
      }

      const results = await Promise.all(promises);
      results.forEach((result) => {
        expect(result.status).toBe("success");
      });

      const balanceResult = await getUserBalance(userId);
      expect(balanceResult.Item?.currentBalance).toBe(
        initialBalance + amount * concurrentCount
      );
    });

    test("should handle concurrent requests with same idempotent key", async () => {
      const userId = "test-concurrent-idempotent-1";
      const initialBalance = 100;
      const idempotentKey = `concurrent-idempotent-${Date.now()}`;
      await createTestUser(userId, initialBalance);

      const concurrentCount = 5;
      const amount = 20;
      const promises = [];

      for (let i = 0; i < concurrentCount; i++) {
        promises.push(
          transact(userId, amount, TransactionType.CREDIT, idempotentKey)
        );
      }

      const results = await Promise.all(promises);
      results.forEach((result) => {
        expect(result.status).toBe("success");
      });

      const balanceResult = await getUserBalance(userId);
      expect(balanceResult.Item?.currentBalance).toBe(initialBalance + amount);
    });
  });

  describe("Error Handling", () => {
    test("should handle non-existent user for credit", async () => {
      const userId = "non-existent-user";

      const result = await transact(
        userId,
        50,
        TransactionType.CREDIT,
        `test-${Date.now()}`
      );

      expect(result.status).toBe("error");
      expect(result.message).toContain("User does not exist");
    });

    test("should handle multiple sequential debits", async () => {
      const userId = "test-sequential-1";
      const initialBalance = 200;
      await createTestUser(userId, initialBalance);

      await transact(
        userId,
        20,
        TransactionType.DEBIT,
        `debit-1-${Date.now()}`
      );
      await transact(
        userId,
        30,
        TransactionType.DEBIT,
        `debit-2-${Date.now()}`
      );
      await transact(
        userId,
        15,
        TransactionType.DEBIT,
        `debit-3-${Date.now()}`
      );

      const balanceResult = await getUserBalance(userId);
      expect(balanceResult.Item?.currentBalance).toBe(
        initialBalance - 20 - 30 - 15
      );
    });
  });
});
