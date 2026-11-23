const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const url = process.argv[2] || "https://localhost:8443";
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname))
    throw Error("Only the isolated loopback deployment is permitted.");
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page.getByRole("button", { name: "닫기", exact: true }).click();
    await page
      .getByRole("button", { name: "서버 계산·저장", exact: true })
      .click();
    await page.waitForFunction(
      () => !serverPlanBusy && serverPlanId !== null && !planSaves.get(),
    );
    const cookie = (await context.cookies()).find(
      (c) => c.name === "moneylife_guest",
    );
    assert.ok(cookie?.secure && cookie.httpOnly);
    await page.getByRole("button", { name: "계산 결과", exact: true }).click();
    await page.locator("#runmonths tr").first().waitFor({ state: "attached" });
    assert.equal(await page.locator("#runmonths tr").count(), 121);
    assert.deepEqual(errors, []);
    console.log("HTTPS browser save and result checks passed.");
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
