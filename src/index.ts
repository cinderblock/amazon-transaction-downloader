import esMain from 'es-main';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { getTransactions } from './getTransactions.js';

const executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const headless = false;
const userDataDir = 'user-data';

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

  const transactions = await getTransactions(page);

  for (const transaction of transactions) {
    console.log(Object.values(transaction).join(', '));
  }

  if (headless) await browser.close();
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
