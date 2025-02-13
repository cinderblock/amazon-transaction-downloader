import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Page } from 'puppeteer-core';
import printer from 'pdf-to-printer';

const { print } = printer;

const orderUrl = 'https://www.amazon.com/gp/css/summary/print.html?orderID=';

const tempDir = mkdtemp('amazon-print');

export async function printOrder(page: Page, orderNumber: string) {
  if (!orderNumber || !orderNumber.match(/^\d{3}-\d{7}-\d{7}$/)) {
    throw new Error('Invalid order number');
  }

  await page.goto(`${orderUrl}${orderNumber}`, { waitUntil: 'load' });

  // Wait for specific selectors to load
  await page.waitForSelector('div#pos_view_section', { timeout: 1000 });

  const path = join(await tempDir, `order-${orderNumber}.pdf`);

  await page.pdf({ path });

  // Doesn't work for some reason
  await page.close();

  await print(path);

  await rm(path, { force: true });
}
