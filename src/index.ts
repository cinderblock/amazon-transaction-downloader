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
  // TODO: Is this redundant with the --hide-crash-restore-bubble?
  await Promise.all(sessionDirs.map(dir => rm(join(userDataDir, dir), { recursive: true, force: true })));

  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    executablePath,
    headless,
    userDataDir,

    // Don't lock the viewport size (to something other than the window size)
    defaultViewport: null,

    args: [
      '--window-size=1920,1080',
      // Prevent "Restore session" dialog
      '--hide-crash-restore-bubble',
    ],
  });

  // Get first tab
  const page = (await browser.pages())[0];

  page.on('error', error => {
    console.error('Page error', error);
  });

  await page.goto(transactionUrl);

  // Wait for transactions to load
  await page.waitForSelector('.apx-transaction-date-container', { timeout: 3000 });

  const transactions: Transaction[] = [];

  // Get all transaction date containers
  const dateContainers = await page.$$('.apx-transaction-date-container');

  for (const dateContainer of dateContainers) {
    // Get the date
    const date = await dateContainer.$eval('span', el => el.textContent?.trim() || '');

    // Get the next sibling element(s) after the date container
    const transactionRows = await dateContainer.evaluateHandle(el => el.nextElementSibling);

    // Find all transaction containers within this sibling
    const containers = await transactionRows.$$('.apx-transactions-line-item-component-container');

    for (const container of containers) {
      const amount = await container.$eval('.a-text-right span.a-size-base-plus', el => el.textContent?.trim() || '');

      // Get payment method - it's in a div with class a-row, containing payment info
      const paymentMethod = await container.$eval('.a-row', el => {
        const text = el.textContent?.trim() || '';
        console.log('Payment row text:', text); // Debug log
        return text;
      });

      // Get order number - it's in a link within the first column
      const orderNumber = await container.$eval('.a-column', el => el.textContent?.trim() || '');

      transactions.push({
        date,
        amount,
        paymentMethod,
        orderNumber,
      });
    }
  }

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
