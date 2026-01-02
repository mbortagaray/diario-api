const express = require('express');
const puppeteer = require('puppeteer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => res.json({ ok: true }));

app.get('/screenshot', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url query param required' });

  let browser;
  try {
    browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      headless: 'new'
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    const buffer = await page.screenshot({ fullPage: true });
    res.type('image/png').send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed', details: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
