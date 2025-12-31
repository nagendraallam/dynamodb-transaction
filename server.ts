import express, { Request, Response } from "express";
import dotenv from "dotenv";

dotenv.config();

import { createTables, getUserBalance, transact } from "./DynamoService";
import { TransactionType } from "./types";

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    message: "Hello World",
  });
});

app.get("/users/:userId/balance", async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId;
    if (!userId) {
      return res.status(400).json({
        message: "User ID is required",
        status: "error",
      });
    }

    const result = await getUserBalance(userId);

    if (!result.Item) {
      return res.status(404).json({
        message: "User not found",
        status: "error",
      });
    }

    return res.status(200).json({
      userId: userId,
      balance: result.Item?.currentBalance ?? 0,
      status: "success",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      status: "error",
      error: error,
    });
  }
});

app.post("/users/:userId/transact", async (req: Request, res: Response) => {
  try {
    const { idempotentKey, amount, type } = req.body;
    const userId = req.params.userId;

    if (!idempotentKey || !amount || !type || !userId) {
      return res.status(400).json({
        message: "missing required fields",
        status: "error",
      });
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        message: "Amount must be a positive number",
        status: "error",
      });
    }

    if (type !== TransactionType.CREDIT && type !== TransactionType.DEBIT) {
      return res.status(400).json({
        message: "Type must be either 'credit' or 'debit'",
        status: "error",
      });
    }

    const result = await transact(userId, amountNum, type, idempotentKey);

    if (result.status === "error") {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      message: "Internal server error",
      status: "error",
      error: error,
    });
  }
});

async function startServer() {
  await createTables();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer();
