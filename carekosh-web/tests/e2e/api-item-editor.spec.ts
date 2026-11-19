import { test, expect, type Page } from "@playwright/test";
import type { Item } from "../../src/domain";

// All API-mode requests are intercepted; this suite never reaches a database.
async function mockedWorkspace(page: Page) {
  let item: Item = {
    id: "test-gloves",
    name: "Gloves",
    categoryId: "test-supplies",
    quantity: 2,
    minimumStock: 5,
    unit: "pairs",
    isActive: true,
    isCritical: false,
    version: 1,
    createdAt: "2026-10-25T00:00:00Z",
    updatedAt: "2026-10-25T00:00:00Z",
  };
  let reads = 0;
  const writes: Array<Record<string, unknown>> = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    let data: unknown;
    if (path === "/api/v1/web-auth/refresh")
      data = {
        user: { id: "test-user", name: "Test caregiver" },
        access_token: "mock-access-token",
      };
    else if (path === "/api/v1/items" && request.method() === "GET") {
      reads++;
      data = { items: [item], total: 1 };
    } else if (
      path === "/api/v1/items/test-gloves" &&
      request.method() === "PUT"
    ) {
      const body = request.postDataJSON() as Record<string, unknown>;
      writes.push(body);
      if (body.name === "Already taken") {
        await route.fulfill({
          status: 409,
          json: { detail: "An item named 'Already taken' already exists" },
        });
        return;
      }
      if (body.version !== item.version) {
        await route.fulfill({
          status: 409,
          json: {
            error: "Version conflict",
            message:
              "This item was modified by someone else. Please refresh and try again.",
            server_version: item.version,
          },
        });
        return;
      }
      item = { ...item, ...body, version: item.version + 1 };
      data = item;
    } else if (path === "/api/v1/categories")
      data = {
        categories: [
          {
            id: "test-supplies",
            name: "Supplies",
            displayOrder: 0,
            updatedAt: item.updatedAt,
          },
        ],
      };
    else if (path === "/api/v1/orders") data = { orders: [], total: 0 };
    else if (path === "/api/v1/activities") data = { activities: [] };
    else if (path === "/api/v1/supply-reviews/capabilities")
      data = {
        enabled: false,
        has_history: false,
        contract_version: 1,
        ttl_seconds: 900,
        max_items: 500,
      };
    else
      throw new Error(`Unexpected mock request: ${request.method()} ${path}`);
    await route.fulfill({ status: 200, json: data });
  });
  return {
    writes,
    get reads() {
      return reads;
    },
    get item() {
      return item;
    },
    updateElsewhere() {
      item = {
        ...item,
        quantity: 9,
        version: 2,
        updatedAt: "2026-10-25T01:00:00Z",
      };
    },
  };
}

test("background refresh cannot give stale edits a newer stock version", async ({
  page,
}) => {
  const server = await mockedWorkspace(page);
  await page.goto("/item/test-gloves");
  await page.getByLabel("Item name").fill("Gloves with my unsaved edit");
  server.updateElsewhere();
  await page.clock.install();
  await page.clock.fastForward(16_000);
  await page.evaluate(() =>
    window.dispatchEvent(new Event("visibilitychange")),
  );
  await expect.poll(() => server.reads).toBeGreaterThan(1);
  await expect(
    page.getByLabel("Current quantity", { exact: true }),
  ).toHaveValue("2");
  await expect(page.getByLabel("Item name")).toHaveValue(
    "Gloves with my unsaved edit",
  );
  await expect(
    page.getByRole("button", { name: "Save item", exact: true }),
  ).toBeDisabled();
  expect(server.writes).toHaveLength(0);
  expect(server.item.quantity).toBe(9);

  await page.getByRole("button", { name: "Load latest item" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Item name")).toHaveValue(
    "Gloves with my unsaved edit",
  );
  await page.getByRole("button", { name: "Load latest item" }).click();
  await page
    .getByRole("button", { name: "Discard edits & load latest" })
    .click();
  await expect(
    page.getByLabel("Current quantity", { exact: true }),
  ).toHaveValue("9");
  await expect(page.getByLabel("Item name")).toHaveValue("Gloves");
  await page.getByLabel("Item name").fill("Gloves reviewed after reload");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect.poll(() => server.writes.length).toBe(1);
  expect(server.writes[0]).toMatchObject({
    version: 2,
    quantity: 9,
    name: "Gloves reviewed after reload",
  });
  expect(server.item.quantity).toBe(9);
});

test("an unseen concurrent update rejects the pinned edit version and retains edits", async ({
  page,
}) => {
  const server = await mockedWorkspace(page);
  await page.goto("/item/test-gloves");
  await page.getByLabel("Item name").fill("Keep my unsaved text");
  server.updateElsewhere();
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "modified by someone else",
  );
  expect(server.writes[0]).toMatchObject({ version: 1, quantity: 2 });
  expect(server.item.quantity).toBe(9);
  await expect(page.getByLabel("Item name")).toHaveValue(
    "Keep my unsaved text",
  );
  await expect(
    page.getByLabel("Current quantity", { exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByRole("button", { name: "Load latest item" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save item", exact: true }),
  ).toBeDisabled();
});

test("a duplicate-name rejection keeps edits available for correction", async ({
  page,
}) => {
  const server = await mockedWorkspace(page);
  await page.goto("/item/test-gloves");
  await page.getByLabel("Item name").fill("Already taken");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("already exists");
  await expect(
    page.getByRole("button", { name: "Save item", exact: true }),
  ).toBeEnabled();
  await expect(page.getByLabel("Item name")).toHaveValue("Already taken");
  await page.getByLabel("Item name").fill("Corrected name");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect.poll(() => server.writes.length).toBe(2);
  expect(server.item).toMatchObject({ name: "Corrected name", quantity: 2 });
});

test("item text can be saved at the API boundaries and typing cannot exceed them", async ({
  page,
}) => {
  const server = await mockedWorkspace(page);
  await page.goto("/item/test-gloves");
  const values = [
    ["Description", "d".repeat(1000)],
    ["Notes", "n".repeat(1000)],
    ["Purchase link", "https://example.com/" + "p".repeat(480)],
  ];
  for (const [label, text] of values) {
    const field = page.getByRole("textbox", { name: label, exact: true });
    await field.fill(text);
    await field.press("End");
    await field.press("x");
    await expect(field).toHaveValue(text);
  }
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect.poll(() => server.writes.length).toBe(1);
  expect(server.writes[0]).toMatchObject({
    description: values[0][1],
    notes: values[1][1],
    purchaseLink: values[2][1],
  });
});

test("mobile assistant shows account consent and only confirms revocation after it saves", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockedWorkspace(page);
  let fail = true;
  let scopes = ["groq_text", "groq_audio"];
  await page.route("**/api/v1/ai/capabilities", (route) =>
    route.fulfill({
      json: {
        interpret: true,
        interpret_contracts: [3],
        consent_version: "voice-2026-10-06",
        consented: true,
        scopes,
      },
    }),
  );
  await page.route("**/api/v1/ai/consent", async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        json: { detail: "Test consent service unavailable" },
      });
      return;
    }
    const body = route.request().postDataJSON();
    expect(body.scopes).toEqual(["groq_audio"]);
    scopes = body.scopes;
    await route.fulfill({ json: { consented: true, scopes } });
  });
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("button", { name: "Ask CareKosh" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Ask CareKosh" });
  await expect(dialog.locator(".coach-mode")).toContainText(
    "Online understanding enabled",
  );
  await expect(dialog.getByText(/shared with Android/)).toBeVisible();
  await dialog.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(
    dialog.getByText("Test consent service unavailable"),
  ).toBeVisible();
  await expect(dialog.locator(".coach-mode")).toContainText(
    "Online understanding enabled",
  );
  await dialog.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(dialog.locator(".coach-mode")).toContainText(
    "Local inventory understanding",
  );
});

for (const required of [false, true])
  test(`registration explains actual email requirement (${required})`, async ({
    page,
  }) => {
    await page.route("**/api/v1/**", async (route) => {
      if (route.request().url().endsWith("/web-auth/refresh")) {
        await route.fulfill({ status: 401, json: { detail: "No session" } });
      } else if (route.request().url().endsWith("/web-auth/register")) {
        await route.fulfill({
          status: 201,
          json: {
            verificationRequired: required,
            user: { id: "new", name: "New user" },
          },
        });
      } else throw new Error("Unexpected registration request");
    });
    await page.goto("/register");
    await page.getByLabel("Your name").fill("Test caregiver");
    await page.getByLabel("Email address").fill("local@example.com");
    await page.getByLabel("Password", { exact: true }).fill("LocalPass123");
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await expect(
      page.getByText(
        required
          ? "Account created. Check your email for a verification link, then sign in."
          : "Account created. You can sign in now.",
        { exact: true },
      ),
    ).toBeVisible();
  });
