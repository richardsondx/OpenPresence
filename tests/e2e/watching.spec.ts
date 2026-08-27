import { expect, test } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  const response = await request.post("/api/state", { data: { type: "reset" } });
  expect(response.ok()).toBeTruthy();
});

test("Watching opens on Explorations and places it first", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();

  await expect(page.locator('[role="tab"]').first()).toContainText("Explorations");
  await expect(page.getByRole("tab", { name: /Explorations/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Watchlist/ })).toHaveAttribute("aria-selected", "false");
});

test("Watching lets a Presence review and persist a creator Watch", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Watching", exact: true })).toBeVisible();
  await expect(page.getByText("Give Jenny a reason to look around.")).toBeVisible();

  await page.getByRole("tab", { name: /Watchlist/ }).click();
  await page.getByRole("button", { name: "Add watch", exact: true }).first().click();
  await page.getByLabel("What should this Presence watch?").fill("https://x.com/AlexHormozi");
  await expect(page.getByText("Here's what Jenny will watch")).toBeVisible();
  await expect(page.getByText("Creator", { exact: true })).toBeVisible();
  await page.getByLabel("Why should this Presence watch this?").fill("Learn from strong offers without imitating the voice.");
  await page.getByRole("button", { name: "Start watching", exact: true }).click();

  await expect(page.getByText("@AlexHormozi", { exact: true })).toBeVisible();
  await expect(page.locator(".watch-card").filter({ hasText: "@AlexHormozi" }).locator(".watch-card-intent p")).toHaveText("Learn selectively from their ideas without copying their voice.");
  await expect(page.locator(".watch-status")).toHaveText(/Watching/);
  await expect(page.getByText("Waiting for first observation", { exact: true })).toBeVisible();
  await expect(page.getByText(/This Watch is active\. No action is needed yet; Jenny will show signals here when the connected source supplies them\./)).toBeVisible();
  await expect(page.getByText(/Performance baseline|Not started/, { exact: false })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit @AlexHormozi", exact: true }).click();
  await page.getByLabel("Edit what @AlexHormozi follows").fill("@new_creator");
  await page.getByLabel("Edit instructions for @AlexHormozi").fill("Interact with his post that would attract our target audience and bring some fun humour and jokes. Make people in the conversation feel involved. Mention them and build the conversation until it doesn't make sense to continue.");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("@new_creator", { exact: true })).toBeVisible();
  const editedCard = page.locator(".watch-card").filter({ hasText: "@new_creator" });
  await expect(editedCard.locator(".watch-card-intent p")).toHaveText(/Build a genuine relationship while creating conversations that attract/);
  await expect(editedCard.getByText(/Posts likely to interest .* where Genny can add insight, light humor/)).toBeVisible();
  await expect(editedCard.getByText(/Mention others only when it improves the discussion/)).toBeVisible();
  await expect(editedCard.getByText(/Only when worthwhile/)).toBeVisible();
  await expect(page.getByText("Learn selectively from their ideas without copying their voice.", { exact: true })).toHaveCount(0);
  await page.getByText("Why?", { exact: true }).click();
  await expect(page.getByText(/Interact with his post that would attract our target audience/)).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("tab", { name: /Watchlist/ }).click();
  await expect(page.getByText("@new_creator", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove @new_creator", exact: true }).click();
  await expect(page.getByText("No known things yet.")).toBeVisible();
});

test("Presence Settings keeps public Requests denied until the operator opts in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("tab", { name: /Watchlist/ }).click();

  await expect(page.getByRole("heading", { name: "Who is allowed to ask Jenny to do work?", exact: true })).toHaveCount(0);
  await expect(page.getByText("Request access is managed in Presence Settings.", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: /Open Presence Settings/ }).click();
  await expect(page.getByRole("heading", { name: "Presence settings", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who is allowed to ask Jenny to do work?", exact: true })).toBeVisible();
  await expect(page.locator(".watch-policy-security")).toContainText("Nobody can ask");
  await page.locator(".watch-policy-options button").filter({ hasText: "Anyone" }).click();
  await page.getByRole("button", { name: "Save request policy", exact: true }).click();
  await expect(page.locator(".watch-policy-security")).toContainText("Anyone can submit a request for review");
});

test("Watchlist plans stay distinct and scannable after the original instruction is hidden", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("tab", { name: /Watchlist/ }).click();

  const addWatch = async (query: string, purpose: string) => {
    await page.getByRole("button", { name: "Add watch", exact: true }).first().click();
    await page.getByLabel("What should this Presence watch?").fill(query);
    await page.getByLabel("Why should this Presence watch this?").fill(purpose);
    await page.getByRole("button", { name: "Start watching", exact: true }).click();
    await expect(page.locator(".watch-card").filter({ hasText: query })).toBeVisible();
  };

  await addWatch("@learn_source", "Learn selectively from their ideas without copying their voice.");
  await addWatch("@playful_friend", "Build a playful friendship and challenge them sometimes.");
  await addWatch("@founder_conversations", "Engage with posts that attract founders and bring others into the conversation.");

  const learnCard = page.locator(".watch-card").filter({ hasText: "@learn_source" });
  const playfulCard = page.locator(".watch-card").filter({ hasText: "@playful_friend" });
  const founderCard = page.locator(".watch-card").filter({ hasText: "@founder_conversations" });
  await expect(learnCard.locator(".watch-card-intent p")).toHaveText(/Learn selectively from their ideas/);
  await expect(learnCard.locator(".watch-plan-guidance > div").first().locator("p")).toHaveText(/Strong frameworks, examples, or ideas/);
  await expect(playfulCard.locator(".watch-card-intent p")).toHaveText(/Build a genuine, playful relationship/);
  await expect(playfulCard.locator(".watch-plan-guidance > div").first().locator("p")).toHaveText(/Natural openings for humor, useful disagreement, or sincere support/);
  await expect(founderCard.locator(".watch-card-intent p")).toHaveText(/creating conversations that attract/);
  await expect(founderCard.locator(".watch-plan-guidance > div").first().locator("p")).toHaveText(/Posts likely to interest/);
  await expect(founderCard.locator(".watch-plan-guidance > div").nth(1).locator("p")).toHaveText(/Mention others only when it improves the discussion/);
  await expect(page.getByText(/Keep up with @/)).toHaveCount(0);
  await expect(page.locator(".watch-operator-instruction[open]")).toHaveCount(0);
});

test("Watching keeps topic and opportunity inputs as attention, not commands", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("tab", { name: /Watchlist/ }).click();
  await page.getByRole("button", { name: "Add watch", exact: true }).first().click();
  await page.getByLabel("What should this Presence watch?").fill("conversations involving AI agents, introductions, and founder problems");
  await expect(page.getByText("Opportunity", { exact: true })).toBeVisible();
  await expect(page.getByText("Notice relevant material", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Start watching", exact: true }).click();
  await expect(page.getByText("Manual source", { exact: true })).toBeVisible();
  await expect(page.getByText("Waiting for source material", { exact: true })).toBeVisible();
  await expect(page.getByText(/This Watch is saved, but it needs connected or manually supplied material before Jenny can notice anything\./)).toBeVisible();
});

test("Watching keeps autonomous attention out of the explicit attention list", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();

  await expect(page.getByText("Genny's own attention", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Run attention test", exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Tests/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Manage .*'s attention/ })).toBeVisible();
});

test("Attention & Rhythm exposes concrete resource presets without social quotas", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("button", { name: /Manage .*'s attention/ }).click();

  await expect(page.getByRole("heading", { name: "How actively should Jenny look around?", exact: true })).toBeVisible();
  await expect(page.getByText("~60 X reads · ~40 model calls", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Qualified follows per day")).toHaveCount(0);
  await page.getByRole("button", { name: /Curious/ }).click();
  await expect(page.getByText("~150 X reads · ~90 model calls", { exact: true })).toBeVisible();
});

test("Attention settings expose safe resume and audit-preserving reset controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create Agent + Presence" }).click();
  await page.getByRole("button", { name: "Watching", exact: true }).first().click();
  await page.getByRole("button", { name: /Manage .*'s attention/ }).click();
  await page.getByText("Advanced limits Most people can use the presets.", { exact: true }).click();

  await expect(page.getByRole("button", { name: "Resume autonomy now", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reset today’s autonomy budget", exact: true })).toBeVisible();
  await expect(page.getByText(/Reset starts a new active usage epoch while preserving the audit history/)).toBeVisible();
});
