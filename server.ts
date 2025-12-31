import express, { Request, Response } from "express";
import dotenv from "dotenv";

dotenv.config();

import { createUserTable, addDummyUser, getUserBalance } from "./DynamoService";

const PORT = process.env.PORT || 3000;
const app = express();

app.get("/", (req: Request, res: Response) => {
  res.status(200).json({
    message: "Hello World",
    status: "success",
  });
});

app.get("/user/:userId/balance", async (req: Request, res: Response) => {
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

async function startServer() {
  await createUserTable();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

startServer();
