import { describe, expect, it } from "vitest";
import { classifyMessage, describeError, SourceFailure } from "../../src/pipeline/failure.js";

describe("classifyMessage", () => {
  it.each([
    ["HTTP 429", "rate_limited"],
    ["Too Many Requests", "rate_limited"],
    ["HTTP 401 Unauthorized", "no_search_key"],
    ["invalid api key", "no_search_key"],
    ["HTTP 403", "bot_blocked"],
    ["got a captcha page", "bot_blocked"],
    ["fetch failed", "service_down"],
    ["HTTP 503", "service_down"],
    ["request timed out", "service_down"],
    ["something odd", "unknown"],
  ])("%s -> %s", (message, reason) => {
    expect(classifyMessage(message)).toBe(reason);
  });
});

describe("describeError", () => {
  it("uses the reason carried by a SourceFailure", () => {
    expect(describeError(new SourceFailure("HTTP 503", "bot_blocked"))).toEqual({
      error: "HTTP 503",
      reason: "bot_blocked",
    });
  });

  it("classifies plain errors and non-errors", () => {
    expect(describeError(new Error("HTTP 429")).reason).toBe("rate_limited");
    expect(describeError("ENOTFOUND host")).toEqual({ error: "ENOTFOUND host", reason: "service_down" });
  });
});
