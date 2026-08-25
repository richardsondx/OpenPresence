import { expect, test } from "@playwright/test";

test("Chat renders link preview images through the same-origin proxy", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  await page.route("**/api/link-preview?**", async (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({
      url: "https://example.com/story",
      site: "Example",
      title: "Example story",
      description: "A preview with an image.",
      image: "/api/link-preview/image?url=https%3A%2F%2Fexample.com%2Fhero.png",
    }),
  }));
  await page.route("**/api/link-preview/image?**", async (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"),
  }));

  await page.goto("/");
  await page.getByLabel("Agent name").fill("Genny");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.goto("/chat");
  await page.getByPlaceholder("Message Genny…").fill("Please consider https://example.com/story");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const image = page.locator(".operator-link-preview img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((node) => { const imageNode = node as HTMLImageElement; return { complete: imageNode.complete, width: imageNode.naturalWidth }; })).toEqual({ complete: true, width: 1 });
});
