// Captures the README pictures from the running site and frames them.
//
//   npm install --no-save puppeteer-core          # once; needs a local Chrome
//   node scripts/readme-shots.mjs https://trovedesk.xyz assets/readme
//
// Pass a local copy (http://127.0.0.1:8765) to capture before publishing: the request-link box
// then shows the local origin, and the script swaps that text for the public domain so the
// picture reads the way the published page does. Nothing else on the page is changed.
// Each capture is full page at 1440 px, light scheme, then framed once: rounded corners, one
// shadow, the brand ink as ground. Output: <out>/<page>.png (framed) only.
import puppeteer from "puppeteer-core";
import { readFileSync, unlinkSync } from "node:fs";

const [base = "https://trovedesk.xyz", out = "assets/readme"] = process.argv.slice(2);
const PUBLIC = "https://trovedesk.xyz";
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const LINK = "trove1.2000000.500.da4fe456e343b589.8A8mfYzzFY4xgpE32FoM7TpVY7SCShejHWMp6g9yowo5";
const PAYTO = LINK.split(".").pop();
const GROUND = "#12151A"; // brand.json brandColor

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new" });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);

const open = async (route) => {
  await page.goto(`${base}/${route}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 600));
};
const capture = async (name) => {
  if (base !== PUBLIC) {
    await page.evaluate((from, to) => {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = walk.nextNode()); ) if (n.nodeValue.includes(from)) n.nodeValue = n.nodeValue.split(from).join(to);
      for (const el of document.querySelectorAll("input")) if (el.value.includes(from)) el.value = el.value.split(from).join(to);
    }, base, PUBLIC);
  }
  const raw = `${out}/${name}.raw.png`;
  await page.screenshot({ path: raw, fullPage: true });
  return raw;
};
const frame = async (raw, name) => {
  const data = readFileSync(raw).toString("base64");
  const html = `<html><body style="margin:0;background:${GROUND}">
    <div id="card" style="display:inline-block;padding:48px;background:${GROUND}">
      <img src="data:image/png;base64,${data}" style="display:block;width:1440px;border-radius:12px;box-shadow:0 24px 64px rgba(0,0,0,.45)">
    </div></body></html>`;
  const p = await browser.newPage();
  await p.setViewport({ width: 1600, height: 900, deviceScaleFactor: 1 });
  await p.setContent(html, { waitUntil: "load" });
  const card = await p.$("#card");
  await card.screenshot({ path: `${out}/${name}.png` });
  await p.close();
  unlinkSync(raw);
  console.log(`${out}/${name}.png`);
};

await open("#/borrow");
await page.waitForSelector("#zec");
for (const [sel, v] of [["#zec", "0.02"], ["#bor", "5"], ["#payto", PAYTO]]) {
  await page.click(sel, { clickCount: 3 });
  await page.type(sel, v);
}
await page.click("button.btn");
await page.waitForSelector("a.lock-next");
await frame(await capture("borrow"), "borrow");

await open(`#/lock/${LINK.split(".").slice(0, 4).join(".")}`);
await frame(await capture("lock"), "lock");
await open(`#/lend/${LINK}`);
await frame(await capture("lend"), "lend");
await open("#/limits");
await frame(await capture("limits"), "limits");
await browser.close();
