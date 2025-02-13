import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Page } from 'puppeteer-core';
import printer from 'pdf-to-printer';
import { tmpdir } from 'node:os';

const { print } = printer;

const orderUrl = 'https://www.amazon.com/gp/css/summary/print.html?orderID=';

let tempDir: Promise<string>;

async function getTempDir() {
  if (tempDir) return tempDir;

  tempDir = mkdtemp(join(tmpdir(), 'amazon-print'));

  tempDir.then(dir => console.log(`Created temp dir: ${dir}`));

  tempDir.then(dir => process.on('beforeExit', async () => rmdir(dir)));

  return tempDir;
}

export async function printOrder(page: Page, orderNumber: string) {
  if (!orderNumber || !orderNumber.match(/^\d{3}-\d{7}-\d{7}$/)) {
    throw new Error('Invalid order number');
  }

  await page.goto(`${orderUrl}${orderNumber}`, { waitUntil: 'load' });

  // Wait for specific selectors to load
  await page.waitForSelector('div#pos_view_section', { timeout: 1000 });

  // A place to add a stamp to the page with some message
  const labelText = await page.evaluate(async () => {
    const stamp = document.createElement('div');
    stamp.style.position = 'absolute';
    stamp.style.top = '100px';
    stamp.style.left = '100px';
    stamp.style.color = 'red';
    stamp.style.backgroundColor = 'white';
    stamp.style.opacity = '0.7';
    stamp.style.fontSize = '50px';
    stamp.contentEditable = 'true';
    stamp.textContent = 'Placeholder';

    document.body.appendChild(stamp);

    // Wait for user to add a message to the stamp and hit shift+enter
    await new Promise<void>(resolve => {
      document.addEventListener('keydown', e => {
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          resolve();
        }
      });
    });

    return stamp.textContent;
  });

  console.log(`Order ${orderNumber} is ${labelText}`);

  if (!labelText) {
    throw new Error('No label text');
  }

  const path = join(await getTempDir(), `order-${orderNumber}.pdf`);

  await page.pdf({ path });

  await print(path);

  await rm(path, { force: true });

  return labelText;
}
