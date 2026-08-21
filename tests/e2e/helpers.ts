import type { Page } from "@playwright/test";

export async function loginAs(page: Page, credentials: { username: string; password: string }) {
  await page.goto("/admin/login");
  await page.getByLabel("Username").fill(credentials.username);
  await page.getByLabel("Password").fill(credentials.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("/admin");
}
