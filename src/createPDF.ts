import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Page } from 'puppeteer-core';
import printer from 'pdf-to-printer';
import { tmpdir } from 'node:os';

const { print } = printer;

const orderUrl = 'https://www.amazon.com/gp/css/summary/print.html?orderID=';

let tempDir: Promise<string>;

// Standard Normal variate using Box-Muller transform.
function gaussianRandom(mean = 0, standardDeviation = 1) {
  const u = 1 - Math.random(); // Converting [0,1) to (0,1]
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  // Transform to the desired mean and standard deviation:
  return z * standardDeviation + mean;
}

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
  const labelText = await page.evaluate(
    async randoms => {
      const stamp = document.createElement('div');
      stamp.style.position = 'absolute';
      stamp.style.bottom = `${300 + 10 * randoms[0]}px`;
      stamp.style.right = `${30 + 3 * randoms[1]}px`;
      stamp.style.color = 'red';
      stamp.style.opacity = '0.7';
      stamp.style.fontSize = '3rem';
      stamp.style.lineHeight = '1.2';
      stamp.style.transform = `rotate(${-2 + 2 * randoms[2]}deg)`;
      stamp.contentEditable = 'false';
      stamp.textContent = 'Double click to edit. Shift+Enter to commit.';
      stamp.style.cursor = 'move';

      let isDragging = false;
      let initialBottom: number;
      let initialRight: number;
      let initialMouseX: number;
      let initialMouseY: number;

      stamp.addEventListener('mousedown', e => {
        if (e.target !== stamp) return;
        if (stamp.isContentEditable) return;

        isDragging = true;
        document.body.style.userSelect = 'none';

        // Store initial bottom/right values
        initialBottom = parseFloat(stamp.style.bottom) || 20;
        initialRight = parseFloat(stamp.style.right) || 20;

        // Store initial mouse position
        initialMouseX = e.clientX;
        initialMouseY = e.clientY;
      });

      document.addEventListener('mousemove', e => {
        if (!isDragging) return;

        e.preventDefault();

        // Calculate the delta of mouse movement
        const deltaX = initialMouseX - e.clientX;
        const deltaY = initialMouseY - e.clientY;

        // Update position using bottom/right
        stamp.style.bottom = `${initialBottom + deltaY}px`;
        stamp.style.right = `${initialRight + deltaX}px`;
      });

      document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = '';
      });

      stamp.addEventListener('dblclick', () => {
        const next = !stamp.isContentEditable;
        stamp.contentEditable = next.toString();
        stamp.style.cursor = next ? 'auto' : 'move';
      });

      const posViewContent = document.querySelector('div#pos_view_content') as HTMLElement;
      if (!posViewContent) throw new Error('No div#pos_view_content');
      posViewContent.appendChild(stamp);
      posViewContent.style.position = 'relative';

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

      stamp.contentEditable = 'false';

      return stamp.textContent;
    },
    Array.from({ length: 3 }, gaussianRandom),
  );

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
