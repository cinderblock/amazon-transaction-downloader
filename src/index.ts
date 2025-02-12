import esMain from 'es-main';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const headless = true;
const userDataDir = 'user-data';

const transactionUrl = 'https://www.amazon.com/cpe/yourpayments/transactions';

interface Transaction {
  date: string;
  amount: string;
  paymentMethod: string;
  orderNumber: string;
  marketplace: string;
  status: string;
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

  page.on('error', error => {
    console.error('Page error', error);
  });

  await page.goto(transactionUrl, { waitUntil: 'networkidle2' });

  // Wait for transactions to load (or login to finish)
  await page.waitForSelector('.apx-transaction-date-container', { timeout: 10000 });

  // TODO: If there is a login prompt, restart without headless, if necessary

  // Simplified Document Tree
  // ...
  // div
  //   div.apx-transactions-sleeve-header-container
  //     div (only-child)
  //       span: "Completed" or "In Progress" (only-child)
  //   div (.a-box.a-spacing-base) (only-child)
  //     div (.a-box-inner.a-padding-none) (only-child)
  //       div.apx-transaction-date-container
  //         span: date (only-child)
  //       div.pmts-portal-component
  //         div.apx-transactions-line-item-component-container
  //           div
  //             div
  //               span: Payment Method (only-child)
  //             div
  //               span: Amount (only-child)
  //           div (only if status is "In Progress")
  //             div
  //               span: Status (only-child)
  //           div
  //             div
  //               div
  //                 a: Order Number (only-child)
  //           div
  //             div
  //               div
  //                 span: Marketplace (only-child)
  //         div (transaction separator)
  //           hr
  //         div.apx-transactions-line-item-component-container (multiple transactions in one day)
  //           ...
  //       div.apx-transaction-date-container
  //         ...
  //       div.pmts-portal-component
  //         ...
  //       div.apx-transaction-date-container
  //         ...
  //       div.pmts-portal-component
  //         ...
  // div
  //   div.apx-transactions-sleeve-header-container (repeated for each category)

  const transactions = await page.evaluate(() => {
    const transactions: Transaction[] = [];

    const categoryHeaders = document.querySelectorAll('.apx-transactions-sleeve-header-container');

    for (const categoryHeader of categoryHeaders) {
      const category = categoryHeader.children[0]?.children[0]?.textContent;

      if (category !== 'Completed' && category !== 'In Progress') throw new Error('Invalid status');

      const groupParentElement = categoryHeader.parentElement;
      if (!groupParentElement) throw new Error('Unexpected state');

      let date: string | null = null;

      for (const dateOrTransactions of groupParentElement.children[1]?.children[0]?.children) {
        if (date === null) {
          // expect date
          if (!dateOrTransactions.classList.contains('apx-transaction-date-container')) {
            throw new Error('Unexpected state');
          }

          date = dateOrTransactions.children[0].textContent;
          if (!date) {
            throw new Error('Invalid date');
          }
        } else {
          // expect transactions
          if (!dateOrTransactions.classList.contains('pmts-portal-component')) {
            throw new Error('Unexpected state');
          }

          const transactionElements = dateOrTransactions.children;

          for (const transactionElement of transactionElements) {
            if (!transactionElement.classList.contains('apx-transactions-line-item-component-container')) continue;

            let i = 0;

            const paymentMethod = transactionElement.children[i]?.children[0]?.children[0]?.textContent;
            const amount = transactionElement.children[i]?.children[1]?.children[0]?.textContent;

            let status;
            if (category === 'Completed') {
              status = 'Completed';
            } else {
              // In Progress transactions have an extra status element
              status = transactionElement.children[++i]?.children[0]?.textContent;
            }

            if (!status) throw new Error('Invalid status');

            const orderNumber = transactionElement.children[++i]?.children[0]?.children[0]?.children[0]?.textContent;
            const marketplace = transactionElement.children[++i]?.children[0]?.children[0]?.textContent;

            if (!paymentMethod || !amount || !orderNumber || !marketplace) {
              throw new Error('Invalid transaction');
            }

            transactions.push({
              date,
              amount,
              paymentMethod,
              orderNumber,
              marketplace,
              status,
            });
          }

          date = null;
        }
      }
    }

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
