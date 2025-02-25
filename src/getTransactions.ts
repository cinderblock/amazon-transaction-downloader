import { Page } from 'puppeteer-core';
import { OrderRegex, TransactionUrl } from './AmazonConstants.js';

export async function* getTransactions(page: Page): AsyncGenerator<Transaction, void, boolean | undefined> {
  page.on('error', error => {
    console.error('Page error', error);
  });

  await page.goto(TransactionUrl, { waitUntil: 'load' });

  // TODO: If there is a login prompt, restart without headless, if necessary
  let nextPageReady: Promise<unknown> | undefined = page.waitForSelector('.apx-transaction-date-container', {
    timeout: 15000,
  });

  while (true) {
    // Wait for transactions to load (or login to finish)
    await nextPageReady;

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
    const transactions: Transaction[] = await page.evaluate((orderRegex: string): Transaction[] => {
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
              const amount = transactionElement.children[i]?.children[1]?.children[0]?.textContent?.replace(/^\+/, '');

              let status;
              if (category === 'Completed') {
                status = 'Completed';
              } else {
                // In Progress transactions have an extra status element
                status = transactionElement.children[++i]?.children[0]?.textContent;
              }

              if (!status) throw new Error('Invalid status');

              const orderNumber = transactionElement.children[
                ++i
              ]?.children[0]?.children[0]?.children[0]?.textContent?.replace(/^(Refund: )?Order #/, '');
              const merchant = transactionElement.children[++i]?.children[0]?.children[0]?.textContent ?? '';

              if (!paymentMethod || !amount || !orderNumber || !orderNumber.match(new RegExp(orderRegex))) {
                throw new Error(`Invalid transaction: ${paymentMethod} ${amount} ${orderNumber} ${merchant}`);
              }

              transactions.push({
                date,
                amount,
                paymentMethod,
                orderNumber,
                merchant,
                status,
              });
            }

            date = null;
          }
        }
      }

      return transactions;
    }, OrderRegex.source);

    // Get the next page button
    const button = await page.$('div.a-span-last input.a-button-input');

    // Click it and get a promise that resolves when the next page loads
    nextPageReady = button
      ?.click()
      .then(() => page.waitForSelector('.pmts-loading-async-widget-spinner-overlay', { timeout: 1000 }))
      .then(() => page.waitForSelector('.pmts-loading-async-widget-spinner-overlay', { hidden: true }))
      .catch(() => {});

    // Yield each transaction individually
    for (const transaction of transactions) {
      const done = yield transaction;
      if (done) return;
    }

    if (!button) throw new Error('No next page button');
  }
}

export interface Transaction {
  date: string;
  amount: string;
  paymentMethod: string;
  orderNumber: string;
  merchant: string;
  status: string;
}

// cSpell:ignore pmts
