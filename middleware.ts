import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const routeViews: Record<string, string> = {
  "/activity": "live",
  "/chat": "chat",
  "/watching": "watching",
  "/people": "people",
  "/feed": "feed",
  "/growth": "growth",
  "/schedule": "schedule",
  "/settings": "presence",
  "/playground": "playground",
  "/rehearsal": "rehearsal",
  "/teach": "teach",
  "/knowledge": "knowledge",
  "/assets": "assets",
  "/usage": "usage",
  "/agent": "brain",
  "/calendar": "calendar",
};

export function middleware(request: NextRequest) {
  const view = routeViews[request.nextUrl.pathname];
  if (!view) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/";
  url.searchParams.set("view", view);
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/activity", "/chat", "/watching", "/people", "/feed", "/growth", "/schedule", "/settings", "/rehearsal", "/playground", "/teach", "/knowledge", "/assets", "/usage", "/agent", "/calendar"],
};
