import { beginAuthorization, approveAuthorization } from "@/lib/v2/oauth";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = beginAuthorization;
export const POST = approveAuthorization;
