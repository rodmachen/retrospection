import { describe, it, expect } from "vitest";
import { GET } from "../../../app/api/health/route";

describe("GET /api/health", () => {
  it("returns status ok", async () => {
    const response = GET();
    const data = await response.json();
    expect(data).toEqual({ status: "ok" });
    expect(response.status).toBe(200);
  });
});
