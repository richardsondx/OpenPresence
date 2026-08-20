import { NextResponse } from "next/server";
import { getBrowserBody, readStateForContext, upsertBrowserBody } from "@/lib/db";
import { closeManagedBrowser, launchManagedBrowser, verifyBrowserIdentity } from "@/lib/managed-browser";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { presenceId, action } = body as { presenceId?: string; action: "launch" | "verify" | "seal" | "close" };

    if (!presenceId) {
      return NextResponse.json({ error: "presenceId is required" }, { status: 400 });
    }

    const state = readStateForContext({ presenceId });
    const presence = state.presences.find((p) => p.id === presenceId);
    const expectedIdentity = presence?.handle;

    if (action === "launch") {
      // Launch headed Chrome for operator interactive sign-in
      const session = await launchManagedBrowser(presenceId, {
        headless: false,
        expectedIdentity,
      });
      if (session.page) {
        await session.page.goto("https://x.com/login", { waitUntil: "domcontentloaded" }).catch(() => {});
      }
      return NextResponse.json({
        ok: true,
        message: "Headed browser launched. Please sign into X.",
        presenceId,
        expectedIdentity,
      });
    }

    if (action === "verify") {
      const session = await launchManagedBrowser(presenceId, {
        headless: false,
        expectedIdentity,
      });
      if (!session.page) {
        return NextResponse.json({ error: "No active browser page found" }, { status: 500 });
      }
      const check = await verifyBrowserIdentity(session.page, expectedIdentity);
      const browserBody = getBrowserBody(presenceId);
      if (browserBody) {
        browserBody.state = check.verified ? "healthy" : "needs_auth";
        browserBody.verifiedIdentity = check.observedIdentity;
        browserBody.lastHealthyAt = check.verified ? new Date().toISOString() : browserBody.lastHealthyAt;
        browserBody.updatedAt = new Date().toISOString();
        upsertBrowserBody(browserBody);
      }
      return NextResponse.json({
        ok: true,
        verified: check.verified,
        observedIdentity: check.observedIdentity,
        expectedIdentity,
      });
    }

    if (action === "seal" || action === "close") {
      const browserBody = getBrowserBody(presenceId);
      if (browserBody && action === "seal") {
        if (!browserBody.verifiedIdentity || !expectedIdentity || browserBody.verifiedIdentity.replace(/^@/, "").toLowerCase() !== expectedIdentity.replace(/^@/, "").toLowerCase()) {
          return NextResponse.json({ error: "Verify the expected X identity before sealing this browser profile." }, { status: 409 });
        }
      }
      await closeManagedBrowser(presenceId);
      if (browserBody && action === "seal") {
        browserBody.state = "healthy";
        browserBody.verifiedIdentity = expectedIdentity;
        browserBody.lastHealthyAt = new Date().toISOString();
        upsertBrowserBody(browserBody);
      }
      return NextResponse.json({
        ok: true,
        message: action === "seal" ? "Browser profile verified and sealed." : "Browser closed.",
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
