import { describe, expect, it } from "vitest";
import { GET } from "../app/api/state/route";

describe("Live Activity payload budget", () => {
  it("keeps the current bounded workspace below the operator-read budget", async () => {
    const response = await GET(new Request("http://localhost/api/state?projection=activity"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(body).responseProjection).toBe("activity");
    expect(Buffer.byteLength(body)).toBeLessThan(400_000);
  });
});
