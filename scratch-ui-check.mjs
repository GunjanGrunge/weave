import { chromium } from "playwright";

const browser = await chromium.launch();
const page = await browser.newPage();

const logs = [];
page.on("console", (msg) => logs.push(`[console.${msg.type()}] ${msg.text()}`));
page.on("pageerror", (err) => logs.push(`[pageerror] ${err.message}`));

await page.goto("http://localhost:5173/books", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1500);

console.log("=== /books page loaded ===");
console.log("URL:", page.url());

const newBookLink = page.locator('a:has-text("New book")').first();
const exists = await newBookLink.count();
console.log("New book link count:", exists);

if (exists > 0) {
  const href = await newBookLink.getAttribute("href");
  console.log("href attr:", href);
  await newBookLink.click();
  await page.waitForTimeout(1500);
  console.log("URL after click:", page.url());
}

console.log("=== console/page errors so far ===");
console.log(logs.length ? logs.join("\n") : "(none)");

if (page.url().includes("/books/new")) {
  console.log("=== testing Enter key in intake textarea ===");
  const textarea = page.locator("textarea").first();
  await textarea.click();
  await textarea.fill("A mystery novel");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1000);
  const messageCountAfterEnter = await page.locator("text=Who is the main character?").count();
  console.log("Advanced after Enter (should be >0 if Enter submits):", messageCountAfterEnter);

  // now verify clicking Send actually works as the baseline
  await textarea.fill("Another line");
  const sendBtn = page.locator('button:has-text("Send")').first();
  await sendBtn.click();
  await page.waitForTimeout(1000);
  console.log("Messages after clicking Send:", await page.locator(".flex.justify-end").count());
}

console.log("=== final console/page errors ===");
console.log(logs.length ? logs.join("\n") : "(none)");

await browser.close();
