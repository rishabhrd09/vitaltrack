import { test, expect } from "@playwright/test";
test("real API: login, CRUD, refresh cookie restoration and cross-tab logout", async ({
  page,
  request,
  context,
}) => {
  test.skip(
    !process.env.CAREKOSH_LIVE_API_TEST,
    "Run against the documented disposable local API setup.",
  );
  const email = `carekosh_web_${Date.now()}@example.com`;
  const registered = await request.post(
    "http://127.0.0.1:8019/api/v1/auth/register",
    { data: { name: "Local API Test", email, password: "PreviewTest123" } },
  );
  expect(registered.status()).toBe(201);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5189/login");
  await page.getByLabel("Email or username").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("PreviewTest123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Inventory overview" }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) =>
        /token|session|user|inventory/i.test(k),
      ),
    ),
  ).toEqual([]);
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "carekosh_refresh")).toMatchObject({
    httpOnly: true,
    sameSite: "Strict",
    path: "/api/v1/web-auth",
  });
  await page.goto("http://127.0.0.1:5189/builder");
  await page.getByRole("button", { name: "New category", exact: true }).click();
  await page.getByLabel("Category name").fill("Local API supplies");
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Local API supplies", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("banner")
    .getByRole("link", { name: "Add item", exact: true })
    .click();
  await page.getByLabel("Item name").fill("Live API test gloves");
  await page.getByLabel("Current quantity", { exact: true }).fill("2");
  await page.getByLabel("Minimum stock").fill("5");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your inventory" }),
  ).toBeVisible();
  await expect(page.locator(".inventory-row")).toHaveCount(1);
  await page.reload();
  await expect(page.locator(".inventory-row")).toHaveCount(1);
  await page.goto("http://127.0.0.1:5189/orders/create");
  await page.getByRole("button", { name: "Review suggested items" }).click();
  await page.getByRole("button", { name: "Save order", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save order", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your order is ready." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View saved order" }).click();
  await page
    .getByRole("button", { name: "Mark received", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Mark received", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apply to stock", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Apply to stock", exact: true })
    .click();
  await expect(
    page.getByText(
      "These quantities have already been added to your inventory.",
    ),
  ).toBeVisible();
  await page.goto("http://127.0.0.1:5189/inventory");
  await expect(page.locator(".table-quantity")).toContainText("5");
  const other = await context.newPage();
  await other.goto("http://127.0.0.1:5189/");
  await expect(
    other.getByRole("heading", { name: "Inventory overview" }),
  ).toBeVisible();
  await page.goto("http://127.0.0.1:5189/profile");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  const loggedOut = page.waitForResponse(
    (r) => r.url().endsWith("/web-auth/logout") && r.status() === 200,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Sign out", exact: true })
    .click();
  await loggedOut;
  await expect(page).toHaveURL(/login/);
  await expect(other).toHaveURL(/login/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(
    (await context.cookies()).some((c) => c.name === "carekosh_refresh"),
  ).toBe(false);
  expect(errors).toEqual([]);
});
