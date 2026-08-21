import { expect, test } from "@playwright/test";
import { E2E_STAFF } from "./fixtures";
import { loginAs } from "./helpers";

test("staff searches for a product, adds it to the ticket, and completes a POS sale", async ({ page }) => {
  await loginAs(page, E2E_STAFF);

  await page.goto("/admin/pos");
  await page.getByPlaceholder(/Scan barcode/).fill("E2E POS Brake Fluid");

  const result = page.getByRole("button", { name: /E2E POS Brake Fluid/ });
  await expect(result).toBeVisible();
  await result.click();

  await expect(page.getByText("E2E POS Brake Fluid 1L")).toBeVisible();

  await page.getByRole("button", { name: "Complete Sale" }).click();

  await expect(page).toHaveURL(/\/admin\/pos\/receipt\//);
  await expect(page.getByText(/Paid via CASH/)).toBeVisible();
});
