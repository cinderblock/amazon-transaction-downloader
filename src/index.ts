import esMain from 'es-main';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { getTransactions, Transaction } from './getTransactions.js';
import { printOrder } from './createPDF.js';

const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const headless = false;
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
  // Delete saved sessions
  // await Promise.all(['Sessions', 'Session Storage'].map(dir => rm(join(userDataDir, 'Default', dir), { recursive: true, force: true })));

  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    executablePath,
    headless,
    userDataDir,
    defaultViewport: null,
    args: ['--hide-crash-restore-bubble'],
  });

  // Get first tab
  const page = (await browser.pages())[0];

  const transactions = await getTransactions(page);

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

  await Promise.all(transactionsToPrint.map(async t => printOrder(await browser.newPage(), t.orderNumber)));

  if (headless) await browser.close();
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
