export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startTemporalEngine } = await import("./lib/temporal");
    startTemporalEngine();
  }
}

