import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const evidenceDir = path.resolve("qa-learnings/v2-simplification-2026-10-01");
const storeKey = "openpresence.v2.conversation.v2";

test("V2 conversation builds a post chronologically and requires fresh review after changes", async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  const socialRequests: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  page.on("request", request => {
    if (/^https:\/\/(?:[^/]+\.)?(?:x\.com|twitter\.com|linkedin\.com|instagram\.com|facebook\.com)\//.test(request.url())) socialRequests.push(request.url());
  });
  await page.goto("/v2");
  const conversation = page.getByRole("log", { name: "Example conversation" });
  await expect(page.getByText("Interactive example", { exact: true })).toBeVisible();
  await expect(page.getByText("Scripted example. No accounts connected, posts published, or reminders created.")).toBeVisible();
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(conversation.locator(".v2-chat-user")).toHaveText(["Help me build an audience around easy weeknight cooking."]);
  await expect(page.getByRole("button", { name: "Busy home cooks", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Instagram", exact: true })).toHaveCount(0);
  await expect(page.locator(".v2-journey, .v2-inspector, .v2-account-select")).toHaveCount(0);
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${testInfo.project.name}-landing.png`), fullPage: true });

  await page.getByRole("button", { name: "Busy home cooks", exact: true }).click();
  await page.getByRole("button", { name: "Instagram", exact: true }).click();
  await page.getByRole("button", { name: "Make it more direct", exact: true }).click();
  const firstPost = conversation.getByRole("article", { name: "Example post" }).last();
  await expect(firstPost).toContainText("A weeknight dinner worth repeating");
  const photo = firstPost.getByRole("img");
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  await expect(firstPost).toContainText("Example only · not published");
  await page.getByRole("button", { name: "Keep the photo", exact: true }).click();
  await expect(conversation.locator(".v2-chat-agent").last()).toContainText("Shall we approve this one post?");
  await page.getByRole("button", { name: "Approve this example post", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidenceDir, `${testInfo.project.name}-single-post-review.png`), fullPage: true });
  await page.getByRole("button", { name: "Approve this example post", exact: true }).click();
  await expect(conversation.locator(".v2-chat-agent").last()).toContainText("Approved in the demo. Nothing was published.");
  let durable = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), storeKey);
  expect(durable.review).toBe("approved");

  await page.getByRole("button", { name: "Twice a week", exact: true }).click();
  await expect(conversation.locator(".v2-chat-agent").last()).toContainText("bring each post to you for review");
  await expect(conversation.locator(".v2-chat-agent").last()).toContainText("No reminder has been created in this demo");
  await page.getByRole("button", { name: "Show me what we learned", exact: true }).click();
  await expect(conversation.locator(".v2-chat-agent").last()).toContainText("imagine we have these results");
  await page.getByRole("button", { name: "What if the next one flops?", exact: true }).click();
  await expect(conversation.locator(".v2-chat-agent").last()).toContainText("compare another pair of posts");
  const expectedUserTurns = ["Help me build an audience around easy weeknight cooking.", "Busy home cooks", "Instagram", "Make it more direct", "Keep the photo", "Approve this example post", "Twice a week", "Show me what we learned", "What if the next one flops?"];
  await expect(conversation.locator(".v2-chat-user")).toHaveText(expectedUserTurns);
  await page.reload();
  await expect(conversation.locator(".v2-chat-user")).toHaveText(expectedUserTurns);
  await expect(conversation.locator(".v2-chat-agent")).toHaveCount(expectedUserTurns.length);
  await page.getByRole("link", { name: "Try it with your own agent" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidenceDir, `${testInfo.project.name}-learning.png`), fullPage: true });

  await page.getByRole("textbox", { name: "Message the demo" }).fill("Change my voice to warm and friendly");
  await page.getByRole("button", { name: "Send demo message" }).click();
  await expect(conversation.getByRole("article", { name: "Example post" }).last()).toContainText("Dinner doesn’t need a big plan");
  durable = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), storeKey);
  expect(durable.review).toBe("pending");
  expect(durable.step).toBe(3);
  await expect(page.getByRole("button", { name: "Approve this example post", exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Message the demo" }).fill("Restore my previous voice");
  await page.getByRole("button", { name: "Send demo message" }).click();
  await expect(conversation.locator(".v2-chat-agent").last()).toContainText("Restored your previous direct and simple voice");
  await expect(conversation.getByRole("article", { name: "Example post" }).last()).toContainText("A weeknight dinner worth repeating");
  durable = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), storeKey);
  expect(durable.voice).toBe("Direct and simple");
  expect(durable.review).toBe("pending");
  expect(durable.step).toBe(3);
  await page.getByRole("button", { name: "Make it text-only", exact: true }).click();
  const revisedPost = conversation.getByRole("article", { name: "Example post" }).last();
  await expect(revisedPost.getByRole("img")).toHaveCount(0);
  // Earlier photos remain in the chronological history; only the new draft changes.
  await expect(conversation.getByRole("article", { name: "Example post" }).first().getByRole("img")).toHaveCount(1);
  await expect(conversation.locator(".v2-chat-agent").last()).toContainText("An Instagram feed post still needs a photo or video");
  await expect(page.getByRole("button", { name: "Approve this example post", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Keep the caption as a draft", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidenceDir, `${testInfo.project.name}-instagram-caption-draft.png`), fullPage: true });
  // Even explicit typed approval cannot make a caption-only Instagram feed post valid.
  await page.getByRole("textbox", { name: "Message the demo" }).fill("Approve this example post");
  await page.getByRole("button", { name: "Send demo message" }).click();
  await expect(conversation.locator(".v2-chat-agent").last()).toContainText("Kept as a draft. Nothing was published.");
  durable = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), storeKey);
  expect(durable.review).toBe("skipped");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // X supports a text-only post, with its own single-post review.
  await page.getByRole("button", { name: "Reset demo" }).click();
  await page.getByRole("button", { name: "Busy home cooks", exact: true }).click();
  await page.getByRole("button", { name: "X", exact: true }).click();
  await page.getByRole("button", { name: "That sounds like me", exact: true }).click();
  await page.getByRole("button", { name: "Make it text-only", exact: true }).click();
  await expect(conversation.getByRole("article", { name: "Example post" }).last().getByRole("img")).toHaveCount(0);
  await page.getByRole("button", { name: "Approve this example post", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(evidenceDir, `${testInfo.project.name}-x-text-only-review.png`), fullPage: true });
  await page.getByRole("button", { name: "Approve this example post", exact: true }).click();
  await expect(conversation.locator(".v2-chat-agent").last()).toContainText("Approved in the demo. Nothing was published.");
  durable = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || "null"), storeKey);
  expect(durable.channel).toBe("X");
  expect(durable.review).toBe("approved");
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(conversation.locator(".v2-chat-user")).toHaveText([expectedUserTurns[0]]);
  await expect(conversation.getByRole("article", { name: "Example post" })).toHaveCount(0);
  expect(socialRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test("V2 connection is a copy-and-paste flow with secure identity and action instructions", async ({ page, context }, testInfo) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/v2/connect");
  await expect(page.getByRole("heading", { name: "Connect your agent." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Copy the prompt." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Paste it into your agent." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approve sign-in." })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(0);
  const copy = page.getByRole("button", { name: "Copy connection prompt" });
  if (!process.env.OPENPRESENCE_V2_PUBLIC_URL && !process.env.NEXT_PUBLIC_OPENPRESENCE_V2_MCP_URL) {
    await expect(copy).toBeDisabled();
    await expect(page.getByText("Connection isn’t available here yet. You can still explore the demo.")).toBeVisible();
    await expect(page.getByText("Copied. Paste it into your agent.", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await mkdir(evidenceDir, { recursive: true });
    await page.screenshot({ path: path.join(evidenceDir, `${testInfo.project.name}-unconfigured-connection.png`), fullPage: true });
    return;
  }
  await expect(copy).toBeEnabled();
  await copy.click();
  await expect(page.getByText("Copied. Paste it into your agent.", { exact: true })).toBeVisible();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("https://isolated.example/api/v2/mcp");
  expect(prompt).toContain("never ask me to paste passwords or connection keys into chat");
  expect(prompt).toContain("Ask which social account I want to use");
  expect(prompt).toContain("verify its exact connected identity before acting");
  expect(prompt).toContain("never substitute another account");
  expect(prompt).toContain("explicit confirmation before every public action");
  expect(prompt).toContain("Keep scheduling, account connections, approvals, and public execution in your own tools");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await mkdir(evidenceDir, { recursive: true });
  await page.screenshot({ path: path.join(evidenceDir, `${testInfo.project.name}-connection-guide.png`), fullPage: true });
});
