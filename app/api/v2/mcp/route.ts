import { handleV2McpRequest } from "@/lib/v2/mcp";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = handleV2McpRequest;
export const GET = handleV2McpRequest;
export const DELETE = handleV2McpRequest;
