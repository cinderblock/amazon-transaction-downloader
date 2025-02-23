# Amazon Transaction Labeler

Tool for finding and labeling transactions on Amazon.

## Theory of Operation

When purchasing things from Amazon and trying to match up expenses to orders, it's easy to forget to print (and code) receipts.

My accountant gives me a list of unknown transaction amounts and a date that my bank reported.

This tool takes that list and finds the matching Amazon order number.

This scans your Amazon transaction history (different from your order history) and finds the order number that matches the transaction amount and date.
This tool then gives a simple interface to add a label to the order and automatically generates a PDF with the order details and prints it.

## Usage

### Setup

```bash
npm install
```

### Add unknown transactions to `index.ts`

```ts
const unknownTransactions: Transaction[] = [
  { date: '2024-02-22', amount: '$69.62' },
  // ...
];
```

### Run

```bash
npm run dev
```
