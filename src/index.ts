import esMain from 'es-main';
import puppeteer from 'puppeteer-core';
import { getTransactions } from './getTransactions.js';
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

  const transactions = getTransactions(page);
  const processedOrders: string[] = [];

  for await (const transaction of transactions) {
    if (!unknownTransactions.length) break;

    // Ignore non-completed orders
    if (transaction.status !== 'Completed') continue;

    // Remove orders that used known personal payment method
    if (transaction.paymentMethod === 'Mastercard ****4798') continue;

    // Remove duplicate order numbers
    if (processedOrders.includes(transaction.orderNumber)) continue;

    // break if transaction is significantly older than oldest unknown
    if (timeDelta(oldestUnknown.date, transaction.date) > 1000 * 60 * 60 * 24 * 7) {
      break;
    }

    function distanceToKnown(t1: UnknownTransaction, t2: UnknownTransaction) {
      return absTimeDelta(t1.date, transaction.date) - absTimeDelta(t2.date, transaction.date);
    }

    function isDateClose({ date }: UnknownTransaction) {
      return areDatesClose(date, transaction.date);
    }

    // Select unknown transaction with same amount and closest date
    const closestUnknownIndex = unknownTransactions.indexOf(
      unknownTransactions
        .filter(({ amount }) => negate(amount) === transaction.amount)
        .filter(isDateClose)
        .sort(distanceToKnown)[0],
    );

    if (closestUnknownIndex === -1) {
      console.log(
        `No matching transaction found for: ${transaction.orderNumber} ${transaction.date} ${transaction.amount}`,
      );
      continue;
    }

    // Some orders have multiple transactions
    processedOrders.push(transaction.orderNumber);

    // Remove the matched unknown transaction
    const { date, amount } = unknownTransactions.splice(closestUnknownIndex, 1)[0];

    // Log the match
    console.log(`Matched ${transaction.orderNumber} with ${date}: ${amount}`);

    await printOrder(browser, transaction.orderNumber, false).catch(e => console.error(e));
  }

  // Close the transaction generator
  transactions.next(false);

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
