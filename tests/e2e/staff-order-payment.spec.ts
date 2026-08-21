import { expect, test } from "@playwright/test";
import { E2E_SEEDED_ORDER_NUMBER, E2E_STAFF } from "./fixtures";
import { loginAs } from "./helpers";

test("staff logs in, confirms an order's final amount, and records a full payment", async ({ page }) => {
  await loginAs(page, E2E_STAFF);

  await page.goto("/admin/orders");
  await page.getByRole("link", { name: E2E_SEEDED_ORDER_NUMBER }).click();
  await expect(page.getByRole("heading", { name: `Order ${E2E_SEEDED_ORDER_NUMBER}` })).toBeVisible();

  // Before confirmation, payments are locked — this is the guarantee added in this phase (the
  // order detail page previously told staff to use "the amount fields" on a status form that had
  // none, making this step unreachable through the real UI).
  await expect(page.getByText(/Confirm the final order amount/)).toBeVisible();

  await page.getByLabel("Final product amount").fill("600.00");
  await page.getByLabel("Status").selectOption("PRICE_CONFIRMED");
  await page.getByRole("button", { name: "Update status" }).click();

  await expect(page.getByText("Confirmed total")).toBeVisible();
  await expect(page.getByLabel(/Amount \(remaining: Rs 600\)/)).toBeVisible();

  await page.getByRole("button", { name: "Record payment" }).click();

  await expect(page.getByText("FULLY PAID")).toBeVisible();
});
