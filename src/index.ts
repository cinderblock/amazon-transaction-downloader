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

function filterMatches({ amount, date }: Transaction, unknownTransactions: { amount: string; date: string | Date }[]) {
  return unknownTransactions.some(
    ({ amount: uAmount, date: uDate }) => amount == uAmount && areDatesClose(date, uDate),
  );
}

async function main() {
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

  for (const transaction of transactionsToPrint) {
    console.log(Object.values(transaction).join(', '));
  }

  await Promise.all(transactionsToPrint.map(async t => printOrder(await browser.newPage(), t.orderNumber)));

  if (headless) await browser.close();
}

if (esMain(import.meta)) {
  main().catch(e => {
    console.error(e);
    if (!process.exitCode) {
      process.exitCode = 1;
    }

    setTimeout(() => {
      process.exit(-1);
    }, 100).unref();
  });
}
