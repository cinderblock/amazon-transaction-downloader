import esMain from 'es-main';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const headless = false;
const userDataDir = 'user-data';

const transactionUrl = 'https://www.amazon.com/cpe/yourpayments/transactions';

interface Transaction {
  date: string;
  amount: string;
  paymentMethod: string;
  orderNumber: string;
}

async function main() {
  const sessionDirs = ['Default/Sessions', 'Default/Session Storage'];

  // Delete saved sessions
  await Promise.all(sessionDirs.map(dir => rm(join(userDataDir, dir), { recursive: true, force: true })));

  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    executablePath,
    headless,
    userDataDir,
    defaultViewport: null,
    args: ['--window-size=1920,1080', '--hide-crash-restore-bubble'],
  });

  // Get first tab
  const page = (await browser.pages())[0];

  page.on('error', error => {
    console.error('Page error', error);
  });

  await page.goto(transactionUrl, { waitUntil: 'networkidle2' });

  // Wait for transactions to load (or login to finish)
  await page.waitForSelector('.apx-transaction-date-container', { timeout: 10000 });

  // TODO: If there is a login prompt, restart without headless

  const transactions = await page.evaluate(() => {
    const transactionElements = document.querySelectorAll('.apx-transactions-line-item-component-container');
    const transactions: Transaction[] = [];

    transactionElements.forEach(container => {
      // Get payment method - keep the full card info including last 4 digits
      const paymentMethodElem = container.querySelector('.a-row .a-text-bold');
      const paymentMethod = paymentMethodElem?.textContent?.trim() ?? '';

      // Get amount from the right-aligned span
      const amountElem = container.querySelector('.a-text-right .a-size-base-plus');
      const amount = amountElem?.textContent?.trim() ?? '';

      // Get order number from the link
      const orderNumberElem = container.querySelector('.a-row a');
      const orderNumber = orderNumberElem?.textContent?.trim() ?? '';

      // Get date - look for the date specifically
      const dateElem = container.querySelector('.a-column:first-child .a-color-secondary');
      const date = dateElem?.textContent?.trim() ?? '';

      transactions.push({
        date,
        amount,
        paymentMethod,
        orderNumber,
      });
    });

    return transactions;
  });

  console.log('Transactions:');
  for (const transaction of transactions) {
    console.log(Object.values(transaction).join(', '));
  }

  await browser.close();
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
