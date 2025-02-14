import esMain from 'es-main';
import puppeteer from 'puppeteer-core';
import { getTransactions, Transaction } from './getTransactions.js';
import { printOrder } from './createPDF.js';

const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const autoClose = false;
const userDataDir = 'user-data';

function areDatesClose(date1: string | Date, date2: string | Date) {
  const a = new Date(date1);
  const b = new Date(date2);

  const maxTimeDelta = 1000 * 60 * 60 * 24 * 4; // 4 days

  return Math.abs(a.getTime() - b.getTime()) < maxTimeDelta;
}

function negate(amount: string) {
  if (!amount.startsWith('-')) return `-${amount}`;
  return amount.slice(1);
}

function filterMatches({ amount, date }: Transaction, unknownTransactions: { amount: string; date: string | Date }[]) {
  return unknownTransactions.some(
    ({ amount: uAmount, date: uDate }) => negate(amount) === uAmount && areDatesClose(date, uDate),
  );
}

async function main(unknownTransactions: { amount: string; date: string | Date }[]) {
  const earliestDate = unknownTransactions.reduce((acc, { date }) => {
    if (!acc || new Date(date) < new Date(acc)) return date;
    return acc;
  }, unknownTransactions[0].date);

  const earliestSearch = new Date(new Date(earliestDate).getTime() - 1000 * 60 * 60 * 24 * 4);

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

  const transactions = await getTransactions(page, earliestSearch);

  const transactionsToPrint = transactions
    // Ignore non-completed orders
    .filter(({ status }) => status === 'Completed')
    // Remove duplicate order numbers
    .filter(({ orderNumber }, index, self) => self.findIndex(t => t.orderNumber === orderNumber) === index)
    // Select only orders that have amounts (and approximate dates) that match unknown transactions
    .filter(t => filterMatches(t, unknownTransactions));

  for (const transaction of transactionsToPrint) {
    console.log(Object.values(transaction).join(', '));
  }

  for (const transaction of transactionsToPrint) {
    const page = await browser.newPage();
    try {
      await printOrder(page, transaction.orderNumber);
      await page.close();
    } catch (e) {
      console.error(e);
    }
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
