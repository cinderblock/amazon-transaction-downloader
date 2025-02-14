import { Page } from 'puppeteer-core';

export async function getTransactions(page: Page, earliestDate?: Date) {
  page.on('error', error => {
    console.error('Page error', error);
  });

  await page.goto(transactionUrl, { waitUntil: 'load' });

  const result: Transaction[] = [];

  while (true) {
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
    const newTransactions = await page.evaluate(() => {
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
              const merchant = transactionElement.children[++i]?.children[0]?.children[0]?.textContent;

              if (!paymentMethod || !amount || !orderNumber || !merchant || !orderNumber.match(/^\d{3}-\d{7}-\d{7}$/)) {
                throw new Error('Invalid transaction');
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

    result.push(...newTransactions);

    if (!earliestDate) break;

    if (new Date(newTransactions[newTransactions.length - 1].date) < earliestDate) break;

    const button = await page.$('div.a-span-last input.a-button-input');

    await button?.click();
  }

  return result;
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
