import { test, expect } from "@playwright/test";
test("dashboard, inventory editing, category creation, order receive and apply", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Inventory overview" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item name").fill("Demo wound dressing");
  await page.getByLabel("Current quantity", { exact: true }).fill("2");
  await page.getByLabel("Minimum stock").fill("5");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your inventory" }),
  ).toBeVisible();
  await page.getByLabel("Search inventory").fill("Demo wound");
  await page
    .getByRole("link")
    .filter({ hasText: "Demo wound dressing" })
    .click();
  await page.getByLabel("Current quantity", { exact: true }).fill("3");
  await page.getByRole("button", { name: "Save item", exact: true }).click();
  await page.goto("/builder");
  await page.getByRole("button", { name: "New category", exact: true }).click();
  await page.getByLabel("Category name").fill("Travel supplies");
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Travel supplies", exact: true }),
  ).toBeVisible();
  await page.goto("/orders/create");
  await page.getByRole("button", { name: "Start with a blank order" }).click();
  await page.getByLabel("Find items for order").fill("Demo wound");
  await page
    .getByRole("button")
    .filter({ hasText: "Demo wound dressing" })
    .click();
  await page.getByRole("button", { name: "Done · 1 items" }).click();
  await page.getByLabel("Order quantity for Demo wound dressing").fill("4");
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
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Apply to stock", exact: true }),
  ).toHaveCount(0);
  await page.goto("/inventory?q=Demo+wound");
  await expect(page.locator(".table-quantity")).toContainText("7");
  expect(errors).toEqual([]);
});
test("Coach creates only an unsaved draft; escaped print report opens", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".coach-entry").click();
  await page
    .getByRole("button", { name: "Prepare a draft for all low-stock items" })
    .click();
  await expect(
    page.getByRole("heading", { name: "An order draft for your review" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Review order draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Create an order", exact: true }),
  ).toBeVisible();
  // Standard low stock excludes a one-unit item already at its minimum;
  // backup attention is a separately selected, explicitly marked policy.
  await expect(page.locator(".draft-line")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Save order", exact: true }),
  ).toBeEnabled();
  await page.goto("/orders");
  await expect(page.locator(".order-list-row")).toHaveCount(3);
  await page.locator(".order-list-row").first().click();
  const reportPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print / Save PDF" }).click();
  const report = await reportPromise;
  await expect(
    report.getByRole("button", { name: "Print / Save as PDF" }),
  ).toBeVisible();
});
test("backup download contains orders; search dialog supports escape", async ({
  page,
}) => {
  await page.goto("/profile");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(
    "carekosh-full-backup.json",
  );
  await page.getByRole("button", { name: /Search anything/ }).click();
  await page
    .getByPlaceholder("Search items, brands, or categories…")
    .fill("oxygen");
  await expect(page.locator(".search-result")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
for (const width of [320, 390, 768, 1440])
  test(`responsive routes at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of [
      "/",
      "/inventory",
      "/builder",
      "/orders",
      "/item/new",
      "/profile",
      "/login",
    ]) {
      // Signed-in visitors are redirected from /login; check its layout signed out.
      if (path === "/login")
        await page.evaluate(() =>
          sessionStorage.setItem("carekosh-demo-signed-out", "1"),
        );
      await page.goto(path);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      if (path === "/") {
        await expect(
          page.getByRole("button", { name: "Search anything", exact: true }),
        ).toBeVisible();
        await expect(page.locator(".coach-entry")).toBeVisible();
        await expect(
          page.getByRole("link", { name: "Add item", exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: `test-results/dashboard-${width}.png`,
          fullPage: true,
          animations: "disabled",
        });
      }
    }
    await page.evaluate(() =>
      sessionStorage.removeItem("carekosh-demo-signed-out"),
    );
    if (width === 1440) {
      await page.goto("/");
      await page
        .getByRole("button", { name: "Light appearance", exact: true })
        .click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
      await page.screenshot({
        path: "test-results/dashboard-light.png",
        fullPage: true,
        animations: "disabled",
      });
    }
  });

test("signed-in visitors go from sign-in and registration to the workspace", async ({
  page,
}) => {
  for (const path of ["/login", "/register"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("heading", { name: "Inventory overview" }),
    ).toBeVisible();
  }
});

test("clicking the quantity caption focuses the field without changing stock", async ({
  page,
}) => {
  await page.goto("/item/new");
  const quantity = page.getByLabel("Current quantity", { exact: true });
  await quantity.fill("2");
  await page
    .locator("label.field")
    .filter({ has: quantity })
    .locator("span")
    .first()
    .click();
  await expect(quantity).toHaveValue("2");
  await expect(quantity).toBeFocused();
});

test("deleting a custom category backs up the current data first", async ({
  page,
}) => {
  await page.goto("/builder");
  await page.getByRole("button", { name: "New category", exact: true }).click();
  await page.getByLabel("Category name").fill("Travel kit");
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Travel kit", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Delete Travel kit", exact: true })
    .click();
  const backup = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back up & delete", exact: true })
    .click();
  expect((await backup).suggestedFilename()).toBe(
    "carekosh-before-category-delete.json",
  );
  await expect(page.getByText("Category deleted.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Travel kit", exact: true }),
  ).toHaveCount(0);
});

test("builder protects catalog categories, restores suggestions, and resets with a backup", async ({
  page,
}) => {
  await page.goto("/builder");
  await expect(
    page.getByRole("button", {
      name: "Delete Ventilator & Respiratory",
      exact: true,
    }),
  ).toBeDisabled();
  await page.getByLabel("Select Catheter Mount", { exact: true }).check();
  await page
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  const backup = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back up & delete", exact: true })
    .click();
  await backup;
  await expect(
    page.getByRole("button", { name: "Catheter Mount", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Catheter Mount", exact: true })
    .click();
  await expect(
    page.getByLabel("Select Catheter Mount", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start fresh", exact: true }).click();
  const resetBackup = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back up & start fresh", exact: true })
    .click();
  await resetBackup;
  await expect(
    page.getByText("Inventory reset complete. Essential equipment kept."),
  ).toBeVisible();
  await page.goto("/inventory");
  await expect(page.locator(".inventory-row")).toHaveCount(8);
  await page.goto("/builder");
  await page
    .getByRole("button", { name: "Replace all with defaults", exact: true })
    .click();
  const replaceBackup = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back up & replace", exact: true })
    .click();
  await replaceBackup;
  await expect(page.getByText("Missing essentials added.")).toBeVisible();
  await page.goto("/inventory");
  await expect(page.locator(".inventory-row")).toHaveCount(32);
  await expect(page.locator(".table-quantity b").first()).toHaveText("0");
  await page.goto("/orders");
  await expect(page.locator(".order-list-row")).toHaveCount(3);
});

test("mobile can close an unapplied received order before deleting it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/orders/create");
  await page.getByRole("button", { name: "Review suggested items" }).click();
  await page.getByRole("button", { name: "Save order", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save order", exact: true })
    .click();
  await page.getByRole("button", { name: "View saved order" }).click();
  await page
    .getByRole("button", { name: "Mark received", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Mark received", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Delete order", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Decline order", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Decline order", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Apply to stock", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Delete order", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete order", exact: true })
    .click();
  await expect(page).toHaveURL(/\/orders$/);
});
