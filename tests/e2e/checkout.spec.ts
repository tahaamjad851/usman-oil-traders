import { expect, test } from "@playwright/test";
import { E2E_CHECKOUT_PRODUCT_SLUG, E2E_OUT_OF_STOCK_PRODUCT_SLUG } from "./fixtures";

test("guest browses the catalog, adds a product to the cart, and places an order", async ({ page }) => {
  await page.goto("/products");
  await page.getByRole("link", { name: /E2E Checkout Engine Oil/ }).click();
  await expect(page).toHaveURL(new RegExp(`/products/${E2E_CHECKOUT_PRODUCT_SLUG}`));

  await page.getByRole("button", { name: "Add to Cart" }).click();
  await expect(page.getByRole("button", { name: "Added ✓" })).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByText("E2E Checkout Engine Oil 4L")).toBeVisible();
  await page.getByRole("link", { name: "Continue to Checkout" }).click();
  await expect(page).toHaveURL(/\/checkout/);

  await page.getByLabel("Full name").fill("Playwright Test Customer");
  await page.getByLabel("WhatsApp / phone number").fill("03001234567");
  await page.getByLabel(/Delivery address/).fill("123 Test Street, Kot Samaba");

  await page.getByRole("button", { name: "Place Order" }).click();

  await expect(page.getByRole("heading", { name: "Order Placed" })).toBeVisible();
  await expect(page.getByText(/^UOT-\d+$/)).toBeVisible();
  await expect(page.getByText("E2E Checkout Engine Oil 4L", { exact: false })).toBeVisible();
});

test("an out-of-stock product cannot be added to the cart", async ({ page }) => {
  await page.goto(`/products/${E2E_OUT_OF_STOCK_PRODUCT_SLUG}`);
  await expect(page.getByRole("button", { name: "Out of Stock" })).toBeDisabled();
});
