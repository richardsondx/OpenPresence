import Link from "next/link";
import { ArrowLeft, Feather } from "lucide-react";
import ConnectClient from "./connect-client";

export const dynamic = "force-dynamic";

function connectionEndpoint(): string | null {
  try {
    const explicit = process.env.NEXT_PUBLIC_OPENPRESENCE_V2_MCP_URL;
    const origin = process.env.OPENPRESENCE_V2_PUBLIC_URL;
    if (!explicit && !origin) return null;
    const url = explicit ? new URL(explicit) : new URL("/api/v2/mcp", origin);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return null;
    return url.href;
  } catch { return null; }
}

export default function ConnectPage() {
  return <>
    <header className="v2-header">
      <Link href="/v2" className="v2-brand"><span className="v2-mark"><Feather size={18} /></span>OpenPresence<span className="v2-brand-version">V2</span></Link>
    </header>
    <main className="v2-connect v2-connect-simple">
      <Link href="/v2" className="v2-back"><ArrowLeft size={13} /> Back to OpenPresence</Link>
      <h1>Connect your agent.</h1>
      <p className="v2-connect-intro">Bring OpenPresence into the conversation you already use.</p>
      <ConnectClient endpoint={connectionEndpoint()} />
    </main>
  </>;
}
