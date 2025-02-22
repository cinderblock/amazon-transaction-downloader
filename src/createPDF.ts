import { mkdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Browser } from 'puppeteer-core';
import printer from 'pdf-to-printer';
import { gaussianRandom } from './gaussianRandom.js';
import { NormalOrderUrl, DigitalOrderUrl, isOrderId, isDigitalOrderId } from './AmazonConstants.js';
const { print } = printer;

const SkipPrint = false;
const OrderDir = 'coded-orders';

export async function printOrder(browser: Browser, orderNumber: string, rePrint = true) {
  if (!isOrderId(orderNumber)) {
    throw new Error('Invalid order number');
  }

  const path = join(OrderDir, `order-${orderNumber}.pdf`);

  function doPrint() {
    if (SkipPrint) return;

    void print(path).catch(e => {
      console.error(`Error printing ${path}`);
      console.error(e);
    });
  }

  // If the file exists, print it if rePrint is true
  if (await stat(path).catch(() => {})) {
    if (rePrint) doPrint();
    return;
  }

  const page = await browser.newPage();

  const baseUrl = isDigitalOrderId(orderNumber) ? DigitalOrderUrl : NormalOrderUrl;

  await page.goto(`${baseUrl}${orderNumber}`, { waitUntil: 'load' });

  // Wait for specific selectors to load
  const found = await Promise.race(
    ['div#pos_view_content', 'div.orderSummary'].map(sel =>
      page.waitForSelector(sel, { timeout: 1000 }).catch(() => {}),
    ),
  );

  if (!found) throw new Error('Failed to find expected content');

  // A place to add a stamp to the page with some message
  const labelText = await page.evaluate(
    async randoms => {
      const normalView = document.querySelector('div#pos_view_content') as HTMLDivElement | null;
      const digitalView = document.querySelector('div.orderSummary') as HTMLDivElement | null;

      const stamp = document.createElement('div');
      stamp.style.position = 'absolute';
      stamp.style.bottom = `${(normalView ? 300 : -200) + 10 * randoms[0]}px`;
      stamp.style.right = `${30 + 3 * randoms[1]}px`;
      stamp.style.color = 'red';
      stamp.style.opacity = '0.7';
      stamp.style.fontSize = '3rem';
      stamp.style.lineHeight = '1.2';
      stamp.style.transform = `rotate(${-2 + 2 * randoms[2]}deg)`;
      stamp.contentEditable = 'true';
      stamp.textContent = 'Double click to move. Shift+Enter to commit.';
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

      const posViewContent = normalView || digitalView;
      if (!posViewContent) throw new Error('No div#pos_view_content or div.orderSummary');
      posViewContent.appendChild(stamp);
      posViewContent.style.position = 'relative';

      // Select all the text in the stamp
      stamp.focus();
      const range = document.createRange();
      range.selectNodeContents(stamp);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);

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

      return stamp.innerText;
    },
    Array.from({ length: 3 }, gaussianRandom),
  );

  console.log(`Order ${orderNumber} is ${labelText.replaceAll('\n', ' ')}`);

  if (!labelText) {
    throw new Error('No label text');
  }

  await mkdir(dirname(path), { recursive: true });

  await page.pdf({ path });

  void page.close();

  doPrint();

  return labelText;
}
