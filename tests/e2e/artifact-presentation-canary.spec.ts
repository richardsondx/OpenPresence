import { expect, test } from "@playwright/test";

test("Chat visibly presents an existing artifact attached by the Agent", async ({ page, request }) => {
  expect((await request.post("/api/state", { data: { type: "reset" } })).ok()).toBeTruthy();
  const created = await request.post("/api/state", {
    data: { type: "createAgent", input: { name: "Artifact Canary", description: "Recover visible artifacts.", audience: "builders", mode: "agent", handle: "@artifact_canary", accent: "#777777" } },
  });
  expect(created.ok()).toBeTruthy();
  const state = await request.get("/api/state").then((response) => response.json());
  const conversation = state.operatorConversations[0];
  const operatorMessage = { id: "artifact-canary-operator", role: "operator", content: "I can't see the image.", timestamp: new Date().toISOString() };
  const presenceMessage = {
    id: "artifact-canary-presence",
    role: "presence",
    content: "I found the existing image and attached it here.",
    timestamp: new Date().toISOString(),
    replyToMessageId: operatorMessage.id,
    attachments: [{ id: "presented_asset_artifact-canary", existingAssetId: "artifact-canary", name: "recovered-image", kind: "image", mimeType: "image/png" }],
  };
  const durableAsset = {
    id: "artifact-canary",
    agentId: state.agent.id,
    presenceId: state.presence.id,
    accessScope: { mode: "selected_presences", presenceIds: [state.presence.id] },
    type: "image",
    status: "ready",
    dataUrl: "data:image/png;base64,AAAA",
    mimeType: "image/png",
    perception: { observation: "A recovered test image.", uncertainty: ["low"] },
    rights: { status: "unknown" },
    retention: "preserved",
    reusePermission: "ready_to_use",
    provenance: { origin: "operator_upload", importedAt: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await page.route("**/api/state**", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const response = await route.fetch();
    const body = await response.json();
    body.assets = [...(body.assets ?? []), durableAsset];
    const target = body.operatorConversations?.find((item: { id: string }) => item.id === conversation.id) ?? body.operatorConversations?.[0];
    if (target) target.messages = [...(target.messages ?? []), operatorMessage, presenceMessage];
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/assets/artifact-canary", async (route) => {
    await route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAwUBAScY42YAAAAASUVORK5CYII=", "base64") });
  });

  await page.goto(`/chat?agentId=${state.agent.id}&presenceId=${state.presence.id}`);
  await expect(page.getByText("I can't see the image.", { exact: true })).toBeVisible();
  await expect(page.getByText("I found the existing image and attached it here.", { exact: true })).toBeVisible();
  await expect(page.locator('img[alt="recovered-image"]')).toBeVisible();
  await expect(page.locator(".operator-chat-message.is-presence").last()).not.toContainText("published");
});
