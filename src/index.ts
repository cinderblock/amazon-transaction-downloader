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

  // Wait for transactions to load
  await page.waitForSelector('.apx-transaction-date-container', { timeout: 10000 });

  // Extract transactions using page.evaluate
  const transactions: Transaction[] = await page.evaluate(() => {
    const transactionElements = document.querySelectorAll('.apx-transactions-line-item-component-container');
    const extractedTransactions: Transaction[] = [];

    transactionElements.forEach(container => {
      const dateElem = container.closest('.apx-transaction-date-container')?.querySelector('span');
      const date = dateElem?.textContent?.trim() ?? '';

      const amountElem = container.querySelector('.a-text-right .a-size-base-plus');
      const amount = amountElem?.textContent?.trim() ?? '';

      const paymentMethodElem = container.querySelector('.a-row .a-color-secondary');
      let paymentMethod = paymentMethodElem?.textContent?.trim().split('•')[0].trim() ?? '';

      const orderNumberElem = container.querySelector('.a-column a');
      const orderNumber = orderNumberElem?.textContent?.trim() ?? '';

      extractedTransactions.push({
        date,
        amount,
        paymentMethod,
        orderNumber,
      });
    });

    return extractedTransactions;
  });

  console.log(transactions);

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
