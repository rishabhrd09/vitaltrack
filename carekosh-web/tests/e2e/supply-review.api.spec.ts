import { expect, test, type Page } from "@playwright/test";
import { supplyFixture } from "../supply-fixtures";
import type { SupplyRun } from "../../src/services/supply-review";

/** Every API is intercepted; these tests never reach a database or provider. */
async function backend(
  page: Page,
  mode:
    | "normal"
    | "lost"
    | "unknown"
    | "stale"
    | "clarify"
    | "disabled"
    | "paused-saved"
    | "batch" = "normal",
) {
  let run = supplyFixture(
    ["clarify", "batch"].includes(mode)
      ? {
          status: "needs_input",
          proposal: null,
          questions: [
            {
              item_id: "test-gloves",
              name: "Gloves",
              unit: "pairs",
              code: "missing_target",
              message: "Choose a target in pairs or exclude this item.",
            },
            ...(mode === "batch"
              ? [
                  {
                    item_id: "test-oxygen",
                    name: "Oxygen cylinder",
                    unit: "cylinders",
                    code: "pending_commitment",
                    message: "Reconcile the pending order or exclude.",
                  },
                  {
                    item_id: "test-mask",
                    name: "Mask",
                    unit: "pieces",
                    code: "backup_target",
                    message: "Choose the backup target or exclude.",
                  },
                ]
              : []),
          ],
        }
      : mode === "paused-saved"
        ? { status: "completed", order_id: "ORD-TEST-0001" }
        : {},
  );
  const confirmations: unknown[] = [],
    answers: unknown[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      method = req.method();
    let data: unknown;
    if (path === "/api/v1/web-auth/refresh")
      data = {
        user: { id: "test-owner", name: "Test caregiver" },
        access_token: "synthetic-access-token",
      };
    else if (path === "/api/v1/items") data = { items: [], total: 0 };
    else if (path === "/api/v1/categories") data = { categories: [], total: 0 };
    else if (path === "/api/v1/orders") data = { orders: [], total: 0 };
    else if (path === "/api/v1/activities") data = { activities: [] };
    else if (path === "/api/v1/supply-reviews/capabilities")
      data = {
        enabled: !["disabled", "paused-saved"].includes(mode),
        has_history: true,
        contract_version: 1,
        ttl_seconds: 900,
        max_items: 500,
      };
    else if (path === "/api/v1/supply-reviews" && method === "GET")
      data = { runs: [summary(run)] };
    else if (path === "/api/v1/supply-reviews" && method === "POST") {
      expect(req.postDataJSON()).toEqual({
        request_id: expect.any(String),
        target_mode: "minimum",
      });
      data = run;
    } else if (
      path === "/api/v1/supply-reviews/test-review" &&
      method === "GET"
    )
      data = run;
    else if (path.endsWith("/test-review/answers")) {
      const body = req.postDataJSON();
      answers.push(body);
      expect(body.answers).toEqual(
        mode === "batch"
          ? [
              { item_id: "test-gloves", exclude: true },
              { item_id: "test-oxygen", exclude: true },
              { item_id: "test-mask", exclude: true },
            ]
          : [{ item_id: "test-gloves", target_quantity: 5 }],
      );
      run = supplyFixture({ version: 2 });
      data = run;
    } else if (path.endsWith("/test-review/refresh")) {
      run = supplyFixture({
        version: run.version + 1,
        proposal: {
          ...supplyFixture().proposal!,
          id: "proposal-refreshed",
          version: 2,
        },
      });
      data = run;
    } else if (path.endsWith("/test-review/cancel")) {
      run = { ...run, status: "cancelled", version: run.version + 1 };
      data = run;
    } else if (path.endsWith("/test-review/confirm")) {
      confirmations.push(req.postDataJSON());
      expect(req.postDataJSON()).not.toHaveProperty("items");
      if (mode === "stale") {
        run = { ...run, status: "stale", version: run.version + 1 };
        await route.fulfill({
          status: 409,
          json: {
            detail: "Inventory changed after review. Refresh and review again.",
          },
        });
        return;
      }
      if (mode === "unknown" && confirmations.length === 1) {
        await route.fulfill({
          status: 500,
          json: { detail: "Simulated uncertain save outcome" },
        });
        return;
      }
      run = {
        ...run,
        status: "completed",
        version: run.version + 1,
        order_id: "ORD-TEST-0001",
      };
      if (mode === "lost") {
        await route.fulfill({
          status: 500,
          json: { detail: "Simulated lost confirmation response" },
        });
        return;
      }
      data = run;
    } else throw new Error(`Unexpected mock request ${method} ${path}`);
    await route.fulfill({ status: 200, json: data });
  });
  return {
    confirmations,
    answers,
    get run() {
      return run;
    },
  };
}
function summary(run: SupplyRun) {
  const { id, version, status, created_at, expires_at, order_id } = run;
  return { id, version, status, created_at, expires_at, order_id };
}
async function capture(page: Page, name: string) {
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  const mobile = ["320", "390"].includes(name);
  if (mobile) {
    const table = page.getByRole("region", {
      name: "Test supplier proposal quantities",
    });
    await table.scrollIntoViewIfNeeded();
    await expect(
      table.getByText("Proposed order: 2 pairs", { exact: true }),
    ).toBeVisible();
  }
  await page.screenshot({
    path: test.info().outputPath(`supply-review-${name}.png`),
    fullPage: !mobile,
  });
}
async function approve(page: Page) {
  await page
    .getByRole("button", {
      name: "Review & confirm pending order",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Save this reviewed pending order?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm pending order", exact: true })
    .click();
}

test("supply review survives refresh and never saves before explicit confirmation", async ({
  page,
}) => {
  const server = await backend(page);
  await page.goto("/supply-review");
  await page
    .getByRole("button", { name: "Review to recorded minimum" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ready for your review" }),
  ).toBeVisible();
  await expect(page.getByRole("table")).toContainText("2 pairs");
  expect(server.confirmations).toHaveLength(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ready for your review" }),
  ).toBeVisible();
  expect(server.confirmations).toHaveLength(0);
  await approve(page);
  await expect(
    page.getByRole("heading", { name: "Pending order saved" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open saved order" }),
  ).toHaveAttribute("href", "/orders/ORD-TEST-0001");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Pending order saved" }),
  ).toBeVisible();
  expect(server.confirmations).toHaveLength(1);
});

test("a lost confirmation response recovers its saved order without a second write", async ({
  page,
}) => {
  const server = await backend(page, "lost");
  await page.goto("/supply-review/test-review");
  await approve(page);
  await expect(
    page.getByRole("heading", { name: "Pending order saved" }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The original pending order was saved and recovered. No duplicate was created.",
    ),
  ).toBeVisible();
  expect(server.confirmations).toHaveLength(1);
});

test("stale confirmation requires a fresh proposal and keyboard-accessible review", async ({
  page,
}) => {
  await backend(page, "stale");
  await page.goto("/supply-review/test-review");
  await approve(page);
  await expect(
    page.getByRole("heading", { name: "Stock or orders changed" }),
  ).toBeVisible();
  await capture(page, "stale");
  await expect(
    page.getByRole("button", {
      name: "Review & confirm pending order",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Refresh stock & review again" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ready for your review" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(
    page.getByRole("region", { name: "Test supplier proposal quantities" }),
  ).toHaveAttribute("tabindex", "0");
  const width = await page.evaluate(() => ({
    body: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(width.body).toBe(width.viewport);
  await capture(page, "320");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Ready for your review" }),
  ).toBeVisible();
  await capture(page, "390");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await capture(page, "desktop");
  await page
    .getByRole("button", { name: "Cancel review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review cancelled" }),
  ).toBeVisible();
});

test("missing targets need a clarification and feature-disabled inventory remains navigable", async ({
  page,
}) => {
  const server = await backend(page, "clarify");
  await page.goto("/supply-review/test-review");
  await expect(
    page.getByRole("heading", { name: "A few details to review" }),
  ).toBeVisible();
  await capture(page, "questions");
  await page.getByLabel("Target stock (pairs)", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Review these answers" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready for your review" }),
  ).toBeVisible();
  expect(server.answers).toHaveLength(1);
  expect(server.confirmations).toHaveLength(0);
});

test("disabled supply reviews leave existing inventory and order navigation available", async ({
  page,
}) => {
  await backend(page, "disabled");
  await page.goto("/supply-review");
  await expect(
    page.getByRole("heading", {
      name: "Supply review is not enabled here yet",
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Supply review navigation" })
      .getByRole("link", { name: "Inventory", exact: true }),
  ).toHaveAttribute("href", "/inventory");
  await expect(
    page.getByRole("button", { name: "Review to recorded minimum" }),
  ).toHaveCount(0);
});

test("uncertain saves keep their key and require explicit check/retry of the original proposal", async ({
  page,
}) => {
  const server = await backend(page, "unknown");
  await page.goto("/supply-review/test-review");
  await approve(page);
  await expect(
    page.getByText("The save outcome was not confirmed.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh stock & review again" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Cancel review", exact: true }),
  ).toBeDisabled();
  await capture(page, "unknown");
  expect(server.confirmations).toHaveLength(1);
  await page
    .getByRole("button", { name: "Retry original confirmation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Check & retry original", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pending order saved" }),
  ).toBeVisible();
  expect(server.confirmations).toHaveLength(2);
  expect(server.confirmations[0]).toEqual(server.confirmations[1]);
});

test("paused features still recover a saved order after browser refresh", async ({
  page,
}) => {
  const server = await backend(page, "paused-saved");
  await page.goto("/supply-review");
  await page
    .getByRole("link", { name: "Pending order saved", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Pending order saved" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open saved order" }),
  ).toHaveAttribute("href", "/orders/ORD-TEST-0001");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Pending order saved" }),
  ).toBeVisible();
  expect(server.confirmations).toHaveLength(0);
});

test("paused reviews can be cancelled without enabling new proposal writes", async ({
  page,
}) => {
  const server = await backend(page, "disabled");
  await page.goto("/supply-review/test-review");
  await expect(
    page.getByRole("heading", { name: "Ready for your review" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review & confirm pending order" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Refresh stock & review again" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Cancel review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review cancelled" }),
  ).toBeVisible();
  expect(server.confirmations).toHaveLength(0);
});

test("multiple unresolved items are explicitly excluded in one batch revision", async ({
  page,
}) => {
  const server = await backend(page, "batch");
  await page.goto("/supply-review/test-review");
  await page
    .getByRole("button", { name: "Exclude all unresolved items" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Exclude Gloves from this proposal" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", {
      name: "Exclude Oxygen cylinder from this proposal",
    }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Exclude Mask from this proposal" }),
  ).toBeChecked();
  expect(server.answers).toHaveLength(0);
  await page.getByRole("button", { name: "Review these answers" }).click();
  await expect(
    page.getByRole("heading", { name: "Ready for your review" }),
  ).toBeVisible();
  expect(server.answers).toHaveLength(1);
  expect(server.confirmations).toHaveLength(0);
});

test("large text at 320px keeps review controls and a keyboard-scrollable table reachable", async ({
  page,
}) => {
  await backend(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/supply-review/test-review");
  await expect(
    page.getByRole("heading", { name: "Ready for your review" }),
  ).toBeVisible();
  await page.addStyleTag({ content: "html {font-size: 24px !important}" });
  const region = page.getByRole("region", {
    name: "Test supplier proposal quantities",
  });
  await region.focus();
  await expect(region).toBeFocused();
  const before = await region.evaluate((el) => el.scrollLeft);
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => region.evaluate((el) => el.scrollLeft))
    .toBeGreaterThan(before);
  const size = await page.evaluate(() => ({
    body: document.documentElement.scrollWidth,
    width: innerWidth,
  }));
  expect(size.body).toBe(size.width);
  await capture(page, "320-large-text");
  await page
    .getByRole("button", { name: "Cancel review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review cancelled" }),
  ).toBeVisible();
});

test("cross-tab logout discards a delayed review result", async ({ page }) => {
  await backend(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/supply-reviews/test-review", async (route) => {
    await gate;
    try {
      await route.fulfill({ status: 200, json: supplyFixture() });
    } catch {
      /* Request was cancelled at logout. */
    }
  });
  const pending = page.waitForRequest("**/api/v1/supply-reviews/test-review");
  await page.goto("/supply-review/test-review");
  await pending;
  await page.evaluate(() => {
    const channel = new BroadcastChannel("carekosh-session");
    channel.postMessage("logout");
    channel.close();
  });
  await expect(page).toHaveURL(/\/login/);
  release();
  await expect(
    page.getByRole("heading", { name: "Ready for your review" }),
  ).toHaveCount(0);
});
