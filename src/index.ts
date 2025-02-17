import esMain from 'es-main';
import puppeteer from 'puppeteer-core';
import { getTransactions, Transaction } from './getTransactions.js';
import { printOrder } from './createPDF.js';
import { absTimeDelta, timeDelta } from './timeDelta.js';

const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const autoClose = true;
const userDataDir = 'user-data';

function areDatesClose(date1: string | Date, date2: string | Date, days = 4) {
  const maxTimeDelta = 1000 * 60 * 60 * 24 * days;
  const delta = absTimeDelta(date1, date2);

  return delta < maxTimeDelta;
}

function negate(amount: string) {
  if (!amount.startsWith('-')) return `-${amount}`;
  return amount.slice(1);
}

type UnknownTransaction = { amount: string; date: string | Date };

async function main(unknownTransactions: UnknownTransaction[]) {
  if (!unknownTransactions.length) {
    console.log('No unknown transactions');
    return;
  }

  const oldestUnknown = unknownTransactions.sort((a, b) => timeDelta(a.date, b.date))[0];

  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    executablePath,
    headless: false,
    userDataDir,
    defaultViewport: null,
    protocolTimeout: 2e9,
    args: ['--hide-crash-restore-bubble'],
  });

  // Get first tab
  const page = (await browser.pages())[0];

  const transactionGenerator = getTransactions(page);
  const processedOrders: string[] = [];
  const transactions: Transaction[] = [];

  for await (const transaction of transactionGenerator) {
    if (!unknownTransactions.length) break;

    transactions.push(transaction);

    // Ignore non-completed orders
    if (transaction.status !== 'Completed') continue;

    // Remove orders that used known personal payment method
    if (transaction.paymentMethod === 'Mastercard ****4798') continue;

    // break if transaction is significantly older than oldest unknown
    if (timeDelta(oldestUnknown.date, transaction.date) > 1000 * 60 * 60 * 24 * 7) {
      break;
    }

    function distanceToKnown(t1: UnknownTransaction, t2: UnknownTransaction) {
      return absTimeDelta(t1.date, transaction.date) - absTimeDelta(t2.date, transaction.date);
    }

    function isDateClose({ date }: UnknownTransaction) {
      return areDatesClose(date, transaction.date, 6);
    }

    // Select unknown transaction with same amount and closest date
    const closestUnknownIndex = unknownTransactions.indexOf(
      unknownTransactions
        .filter(({ amount }) => negate(amount) === transaction.amount)
        .filter(isDateClose)
        .sort(distanceToKnown)[0],
    );

    if (closestUnknownIndex === -1) {
      // console.log(`No match: ${transaction.orderNumber} ${transaction.date} ${transaction.amount}`);
      continue;
    }

    // Remove the matched unknown transaction
    const { date, amount } = unknownTransactions.splice(closestUnknownIndex, 1)[0];

    // Remove transactions that are from an order that has already been processed
    if (processedOrders.includes(transaction.orderNumber)) {
      continue;
    }

    // Some orders have multiple transactions
    processedOrders.push(transaction.orderNumber);

    // Log the match
    console.log(`Matched ${transaction.orderNumber} with ${date}: ${amount}`);

    await printOrder(browser, transaction.orderNumber, false).catch(e => console.error(e));
  }

  console.log(`Unmatched transactions: ${unknownTransactions.length}`);
  for (const unknown of unknownTransactions) {
    const possibleMatch = transactions.find(({ amount }) => negate(amount) === unknown.amount);

    console.log(
      `${unknown.date}: ${unknown.amount}${possibleMatch ? ` Identical amount: ${possibleMatch.orderNumber} on ${possibleMatch.date} (${(timeDelta(unknown.date, possibleMatch.date) / 1000 / 60 / 60 / 24).toFixed(0)} day delta)` : ''}`,
    );
  }

  if (autoClose) await browser.close();
}

const unknownTransactions = [
];

if (esMain(import.meta)) {
  main(unknownTransactions).catch(e => {
    console.error(e);
    if (!process.exitCode) {
      process.exitCode = 1;
    }

    setTimeout(() => {
      process.exit(-1);
    }, 100).unref();
  });
}
