# DynamoTransaction System

Ts Project to build an Idempotent system for transactions. I have written minimal comments to ensure that this work is not mistaken for done using AI. Also written core logic in 2 files [sever.ts and DynamoService.ts] and 1 test file written in jest to ensure all functionality as stated in the document.

To quickly test this project, You can run

```
  bun run docker:up
```

## API Endpoints

### GET `/users/:userId/balance`

Get the current balance for a specific user.

**Parameters:**

- `userId` (path parameter) - The user ID

**Response (Success):**

```json
{
  "userId": "1234",
  "balance": 100,
  "status": "success"
}
```

**Response (User Not Found):**

```json
{
  "message": "User not found",
  "status": "error"
}
```

### POST `/users/:userId/transact`

Process a transaction (credit or debit) for a user. Transactions are idempotent and handle race conditions atomically.

**Parameters:**

- `userId` (path parameter) - The user ID

**Request Body:**

```json
{
  "idempotentKey": "unique-transaction-key-123",
  "amount": 50,
  "type": "credit"
}
```

**Fields:**

- `idempotentKey` (required) - Unique identifier to prevent duplicate transactions
- `amount` (required) - Positive number representing the transaction amount
- `type` (required) - Either `"credit"` or `"debit"`

**Response (Success):**

```json
{
  "status": "success",
  "data": {
    "idempotentKey": "unique-transaction-key-123",
    "userId": "1234",
    "balance": 150
  }
}
```

**Response (Error - Insufficient Balance):**

```json
{
  "status": "error",
  "message": "Insufficient balance. Transaction would result in negative balance."
}
```

**Response (Error - Duplicate Transaction):**

```json
{
  "status": "success",
  "message": "Transaction already processed (idempotent)",
  "data": {
    "idempotentKey": "unique-transaction-key-123",
    "userId": "1234",
    "balance": 150
  }
}
```
