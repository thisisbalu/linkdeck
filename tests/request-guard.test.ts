/**
 * Tests for lib/request-guard.ts
 */

import { describe, it, expect } from "vitest";
import { checkRequest, type GuardInput } from "@/lib/request-guard";

function req(overrides: Partial<GuardInput> = {}): GuardInput {
  return {
    method: "GET",
    pathname: "/",
    host: "localhost:3000",
    origin: null,
    contentType: null,
    ...overrides,
  };
}

const jsonPost = (o: Partial<GuardInput> = {}) =>
  req({ method: "POST", pathname: "/api/bookmarks", contentType: "application/json", ...o });

describe("host check", () => {
  it("allows loopback hosts", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000", "LOCALHOST:3001", "localhost"]) {
      expect(checkRequest(req({ host })).ok).toBe(true);
    }
  });

  it("rejects other hosts (DNS rebinding) and a missing host", () => {
    for (const host of ["evil.com", "evil.com:3000", "9.95.175.88:3000", "localhost.evil.com:3000", null]) {
      expect(checkRequest(req({ host }))).toMatchObject({ ok: false, status: 403 });
    }
  });
});

describe("cross-origin writes", () => {
  it("allows same-origin, extension and no-origin writes", () => {
    expect(checkRequest(jsonPost({ origin: "http://localhost:3000" })).ok).toBe(true);
    expect(checkRequest(jsonPost({ origin: "chrome-extension://abcdef" })).ok).toBe(true);
    expect(checkRequest(jsonPost({ origin: null })).ok).toBe(true);
  });

  it("blocks writes from other origins, including other local ports", () => {
    for (const origin of ["https://evil.com", "http://localhost:5173", "http://127.0.0.1:3000", "null"]) {
      expect(checkRequest(jsonPost({ origin }))).toMatchObject({ ok: false, status: 403 });
    }
    expect(
      checkRequest(req({ method: "DELETE", pathname: "/api/bookmarks/x", origin: "https://evil.com" }))
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("does not restrict reads or non-API pages", () => {
    expect(checkRequest(req({ pathname: "/api/bookmarks", origin: "https://evil.com" })).ok).toBe(true);
    expect(checkRequest(req({ method: "POST", pathname: "/", origin: "https://evil.com" })).ok).toBe(true);
  });
});

describe("content type", () => {
  it("requires JSON for POST/PATCH bodies", () => {
    expect(checkRequest(jsonPost({ contentType: "text/plain" }))).toMatchObject({ ok: false, status: 415 });
    expect(checkRequest(jsonPost({ contentType: null }))).toMatchObject({ ok: false, status: 415 });
    expect(checkRequest(jsonPost({ method: "PATCH", contentType: "application/x-www-form-urlencoded" })))
      .toMatchObject({ ok: false, status: 415 });
    expect(checkRequest(jsonPost({ contentType: "application/json; charset=utf-8" })).ok).toBe(true);
  });

  it("does not require a body type for DELETE", () => {
    expect(checkRequest(req({ method: "DELETE", pathname: "/api/bookmarks/x" })).ok).toBe(true);
  });
});
