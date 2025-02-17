import { Page } from 'puppeteer-core';

export async function* getTransactions(page: Page): AsyncGenerator<Transaction, void, boolean | undefined> {
  page.on('error', error => {
    console.error('Page error', error);
  });

  await page.goto(transactionUrl, { waitUntil: 'load' });

  const MinTime = 100;
  let minTime: Promise<unknown> | undefined;

  main: while (true) {
    await minTime;

    // Wait for transactions to load (or login to finish)
    await page.waitForSelector('.apx-transaction-date-container', { timeout: 15000 });

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

              const orderNumber = transactionElement.children[
                ++i
              ]?.children[0]?.children[0]?.children[0]?.textContent?.replace(/^Order #/, '');
              const merchant = transactionElement.children[++i]?.children[0]?.children[0]?.textContent ?? '';

              if (!paymentMethod || !amount || !orderNumber || !orderNumber.match(/^\d{3}-\d{7}-\d{7}$/)) {
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
    });

    // Check if there's a next page button
    const button = await page.$('div.a-span-last input.a-button-input');

    await button?.click();

    minTime = Promise.all([
      // Set timeout flag to prevent spamming the server
      new Promise<void>(resolve => setTimeout(resolve, MinTime)),
      (async () => {
        const spinner = await page.waitForSelector('.pmts-loading-async-widget-spinner-overlay', { timeout: 1000 });
        if (!spinner) throw new Error('Spinner found');
        await page.waitForNetworkIdle();
      })(),
    ]);

    // Yield each transaction individually
    for (const transaction of transactions) {
      const done = yield transaction;
      if (done) break main;
    }

    if (!button) break main;
  }

  return page.close();
}

export interface Transaction {
  date: string;
  amount: string;
  paymentMethod: string;
  orderNumber: string;
  merchant: string;
  status: string;
}

const transactionUrl = 'https://www.amazon.com/cpe/yourpayments/transactions';

// cSpell:ignore pmts
