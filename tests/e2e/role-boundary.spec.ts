import { expect, test } from "@playwright/test";
import { E2E_STAFF } from "./fixtures";
import { loginAs } from "./helpers";

test("a STAFF-role user is redirected away from SUPER_ADMIN-only admin pages", async ({ page }) => {
  await loginAs(page, E2E_STAFF);

  await page.goto("/admin/staff");
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/settings");
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto("/admin/audit-log");
  await expect(page).toHaveURL(/\/admin$/);
});
