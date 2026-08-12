import { NextResponse } from "next/server";
import { readState } from "@/lib/db";
import { listOllamaModels } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const connectionId = new URL(request.url).searchParams.get("connectionId");
    const state = readState();
    const connection = state.providerConnections.find((item) => item.id === connectionId && item.provider === "ollama");
    if (!connection) return NextResponse.json({ error: "Connect Ollama before discovering local models." }, { status: 404 });
    const models = await listOllamaModels(connection.endpoint || "http://localhost:11434");
    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ollama could not be reached.";
    console.warn("Ollama model discovery failed", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
