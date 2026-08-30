"use client";

import dynamic from "next/dynamic";

// Keep the document shell and loading state in a small entry chunk. The
// operator workspace is intentionally loaded after the first paint because
// the client view contains all of the configuration, history, and rehearsal
// surfaces, while the initial Activity request only needs the live surface.
const Workspace = dynamic(() => import("./client-page"), {
  ssr: false,
  loading: () => (
    <main className="loading-screen">
      <p>Waking your Presence…</p>
    </main>
  ),
});

export default function Page() {
  return <Workspace />;
}
