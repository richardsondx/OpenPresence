"use client";

import dynamic from "next/dynamic";

// The workspace is a client-routed control room. Keep every deep link on the
// same entry point so direct loads and refreshes do not fall through to a
// Next.js 404 before the client can resolve the requested view.
const Workspace = dynamic(() => import("../client-page"), {
  ssr: false,
  loading: () => (
    <main className="loading-screen">
      <p>Waking your Presence…</p>
    </main>
  ),
});

export default function WorkspaceRoute() {
  return <Workspace />;
}
