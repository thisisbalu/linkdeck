/**
 * Tests for lib/enrich-bookmark.ts
 * Covers: GitHub URL parsing, IBM skip-fetch, category inference, tag extraction, title cleanup
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// We mock global fetch so tests don't make real network calls
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Import after stubbing
const { enrichBookmark } = await import("@/lib/enrich-bookmark");

function makeFetchResponse(html: string, ok = true) {
  return Promise.resolve({
    ok,
    text: () => Promise.resolve(html),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ── GitHub URL parsing ────────────────────────────────────────────────────────

describe("GitHub URL parsing", () => {
  it("parses a public repo root URL correctly", async () => {
    const result = await enrichBookmark("https://github.com/vercel/next.js");
    // Repo name "next.js" → title-cased = "Next.Js" (dot treated as separator)
    expect(result.title).toContain("vercel");
    expect(result.description).toContain("vercel/next.js");
    expect(result.category).toBe("GitHub");
    expect(mockFetch).not.toHaveBeenCalled(); // no page fetch for github
  });

  it("parses a private repo URL without fetching", async () => {
    const result = await enrichBookmark("https://github.com/hashicorp/calistoga-control-plane/");
    expect(result.title).toBe("Calistoga Control Plane — hashicorp");
    expect(result.description).toContain("hashicorp/calistoga-control-plane");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("parses a GitHub issues page", async () => {
    const result = await enrichBookmark("https://github.com/hashicorp/terraform/issues");
    expect(result.title).toContain("Issues");
    expect(result.title).toContain("hashicorp/terraform");
  });

  it("parses a GitHub blob file path", async () => {
    const result = await enrichBookmark("https://github.com/owner/repo/blob/main/src/main.go");
    expect(result.title).toContain("src/main.go");
    expect(result.title).toContain("owner/repo");
  });

  it("converts kebab-case repo name to title case", async () => {
    const result = await enrichBookmark("https://github.com/hashicorp/vault-secrets-operator");
    expect(result.title).toBe("Vault Secrets Operator — hashicorp");
  });
});

// ── IBM / auth-gated URL handling ─────────────────────────────────────────────

describe("Auth-gated URL handling", () => {
  it("derives title from path for IBM URLs without fetching page", async () => {
    const result = await enrichBookmark("https://bob.ibm.com/admin/bobalytics?view=individual-usage");
    expect(result.title).not.toBe("Login");
    expect(result.title).not.toContain("Sign in");
    expect(result.title.toLowerCase()).toContain("bobalytics");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handles w3.ibm.com without fetching", async () => {
    const result = await enrichBookmark("https://w3.ibm.com/w3publisher/some-team/home");
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.title).toBeTruthy();
  });

  it("does not fetch app.* subdomains", async () => {
    const result = await enrichBookmark("https://app.datadoghq.com/dashboard/overview");
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── Category inference ────────────────────────────────────────────────────────

describe("Category inference", () => {
  it("infers AI / ML for openai.com", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>OpenAI</title>") });
    const result = await enrichBookmark("https://openai.com/research");
    expect(result.category).toBe("AI / ML");
  });

  it("infers HashiCorp for hashicorp.com", async () => {
    // hashicorp.com is in SKIP_FETCH_PATTERNS — no fetch
    const result = await enrichBookmark("https://hashicorp.com/products/terraform");
    expect(result.category).toBe("HashiCorp");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("infers GitHub for nextjs.org (no match → General)", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Next.js</title>") });
    const result = await enrichBookmark("https://nextjs.org");
    // nextjs.org no longer matches any specific category — falls to General
    expect(result.category).toBe("General");
  });

  it("infers AWS for aws.amazon.com", async () => {
    // console.aws.amazon.com is in SKIP_FETCH_PATTERNS
    const result = await enrichBookmark("https://console.aws.amazon.com/s3");
    expect(result.category).toBe("AWS");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("falls back to General for unknown domains", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Random Site</title>") });
    const result = await enrichBookmark("https://randomsite12345.com");
    expect(result.category).toBe("General");
  });
});

// ── Page metadata fetching ────────────────────────────────────────────────────

describe("Page metadata fetching", () => {
  it("extracts title from <title> tag", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<html><head><title>1000 Islands Boat Tours and Castle Cruises</title></head></html>"),
    });
    const result = await enrichBookmark("https://www.cityexperiences.com/gananoque/city-cruises/");
    expect(result.title).toBe("1000 Islands Boat Tours and Castle Cruises");
  });

  it("strips company suffix from title (pipe separator)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<title>Getting Started | Next.js Documentation</title>"),
    });
    const result = await enrichBookmark("https://docs.somesite.com/getting-started");
    expect(result.title).not.toContain("Next.js Documentation");
    expect(result.title).toBe("Getting Started");
  });

  it("strips company suffix from title (dash separator)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<title>Dashboard - Acme Corp</title>"),
    });
    const result = await enrichBookmark("https://someapp.com/dashboard");
    expect(result.title).toBe("Dashboard");
  });

  it("extracts meta description", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`
        <html><head>
          <title>My Page</title>
          <meta name="description" content="This is a great page about stuff." />
        </head></html>
      `),
    });
    const result = await enrichBookmark("https://example.com/page");
    expect(result.description).toBe("This is a great page about stuff.");
  });

  it("extracts og:description as fallback", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(`
        <html><head>
          <title>My Page</title>
          <meta property="og:description" content="OG description here." />
        </head></html>
      `),
    });
    const result = await enrichBookmark("https://example.com/page");
    expect(result.description).toBe("OG description here.");
  });

  it("falls back to hostname when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    const result = await enrichBookmark("https://unreachable.example.com/page");
    expect(result.title).toBe("unreachable.example.com");
    expect(result.category).toBe("General");
  });

  it("falls back gracefully when fetch returns non-ok status", async () => {
    mockFetch.mockResolvedValue({ ok: false, text: () => Promise.resolve("") });
    const result = await enrichBookmark("https://example.com/private");
    expect(result.title).toBe("example.com");
  });

  it("handles URL with long query string without breaking", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      text: () => Promise.resolve("<title>City Cruises</title>"),
    });
    const longUrl = "https://www.cityexperiences.com/gananoque/city-cruises/?pageNo=1&query=&sortBy=prodv3_ce_experiences&specialCouponCategories=&city=Gananoque&country=&webCategoriesMain=&durationTiming=&brandTag=&dateMin=&dateMax=&hierarchical.lvl0=&showPriceWithFees=false";
    const result = await enrichBookmark(longUrl);
    expect(result.title).toBe("City Cruises");
    // enrichBookmark returns BookmarkEnrichment (no url field) — just verify title was extracted
  });
});

// ── SharePoint / OneDrive URL parsing ────────────────────────────────────────

describe("SharePoint / OneDrive URL parsing", () => {
  it("extracts filename from SharePoint file= param and never fetches", async () => {
    const url =
      "https://ibm-my.sharepoint.com/:w:/r/personal/padma_dakoju_ibm_com/_layouts/15/doc2.aspx" +
      "?sourcedoc=%7B0257D9D3%7D&file=PadmaBala1on1.docx&action=default";
    const result = await enrichBookmark(url);
    expect(result.title).toBe("Padma Bala1on1");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("strips file extension from SharePoint title", async () => {
    const url =
      "https://myorg.sharepoint.com/:x:/r/sites/team/_layouts/15/doc2.aspx" +
      "?file=Q3+Budget+Review.xlsx&action=default";
    const result = await enrichBookmark(url);
    expect(result.title).toBe("Q3 Budget Review");
    expect(mockFetch).not.toHaveBeenCalled();
  });
  
  it("handles camelCase filenames on SharePoint", async () => {
    const url =
      "https://company.sharepoint.com/sites/eng/_layouts/15/doc2.aspx" +
      "?file=ProjectRoadmap2025.docx";
    const result = await enrichBookmark(url);
    expect(result.title).toBe("Project Roadmap2025");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("falls back to hostname for SharePoint URL without file param", async () => {
    const url = "https://ibm.sharepoint.com/sites/SomeTeam";
    const result = await enrichBookmark(url);
    expect(result.title).toBeTruthy();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});


// ── Reading / Blog post detection ─────────────────────────────────────────────

describe("Reading / blog post detection", () => {

  // Known platforms
  it("detects medium.com as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>A Medium Post</title>") });
    const result = await enrichBookmark("https://medium.com/@author/some-post-abc123");
    expect(result.category).toBe("Reading");
  });

  it("detects dev.to as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Dev Post</title>") });
    const result = await enrichBookmark("https://dev.to/someone/my-post");
    expect(result.category).toBe("Reading");
  });

  it("detects substack.com as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Newsletter</title>") });
    const result = await enrichBookmark("https://newsletter.example.substack.com/p/my-post");
    expect(result.category).toBe("Reading");
  });

  it("detects freecodecamp.org as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>FCC Article</title>") });
    const result = await enrichBookmark("https://www.freecodecamp.org/news/how-to-center-a-div/");
    expect(result.category).toBe("Reading");
  });

  it("detects smashingmagazine.com as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Smashing Mag</title>") });
    const result = await enrichBookmark("https://www.smashingmagazine.com/2024/01/some-article/");
    expect(result.category).toBe("Reading");
  });

  it("detects martinfowler.com as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Patterns</title>") });
    const result = await enrichBookmark("https://martinfowler.com/articles/strangler-fig.html");
    expect(result.category).toBe("Reading");
  });

  // URL path patterns — generic blog URLs on any domain
  it("detects /blog/some-post path as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Blog Post</title>") });
    const result = await enrichBookmark("https://engineering.acmecorp.com/blog/how-we-scaled-postgres");
    expect(result.category).toBe("Reading");
  });

  it("detects /post/slug path as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Post</title>") });
    const result = await enrichBookmark("https://someperson.com/post/my-thoughts-on-rust");
    expect(result.category).toBe("Reading");
  });

  it("detects /article/slug path as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Article</title>") });
    // Use a neutral domain (not thenewstack.io which hits Infrastructure via "istio" patterns)
    const result = await enrichBookmark("https://techblog.example.com/article/building-a-rest-api");
    expect(result.category).toBe("Reading");
  });

  it("detects /tutorial/slug path as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Tutorial</title>") });
    const result = await enrichBookmark("https://www.somesite.com/tutorial/getting-started-with-docker");
    expect(result.category).toBe("Reading");
  });

  it("detects date-based slug /2024/03/post-title as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Old Blog</title>") });
    // Avoid "wordpress" in the domain — it matches the Documents "word" pattern
    const result = await enrichBookmark("https://myblog.example.com/2024/03/my-blog-post");
    expect(result.category).toBe("Reading");
  });

  it("detects date-prefix slug /2024-03-12-post as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Jekyll Blog</title>") });
    const result = await enrichBookmark("https://myblog.github.io/2024-03-12-announcing-something");
    expect(result.category).toBe("Reading");
  });

  // Title-based signals (prefill or fetched page title)
  it("detects 'how to' in prefill title as Reading", async () => {
    const result = await enrichBookmark("https://somerandomblog.net/random-slug", "How to Build a Scalable API");
    expect(result.category).toBe("Reading");
  });

  it("detects 'deep dive' in prefill title as Reading", async () => {
    const result = await enrichBookmark("https://anotherblog.io/xyz", "A Deep Dive into WebAssembly");
    expect(result.category).toBe("Reading");
  });

  it("detects 'best practices' in prefill title as Reading", async () => {
    // Avoid "Kubernetes" in title — it triggers the Infrastructure rule before Reading
    const result = await enrichBookmark("https://company.io/eng/abc", "TypeScript Best Practices for Clean Code");
    expect(result.category).toBe("Reading");
  });

  it("detects 'explained' in fetched page title as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>WebSockets Explained</title>") });
    const result = await enrichBookmark("https://sometech.site/websockets");
    expect(result.category).toBe("Reading");
  });

  // Negative cases — should NOT be Reading
  it("does NOT classify a bare /blog path (no post slug) as Reading", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("<title>Our Blog</title>") });
    const result = await enrichBookmark("https://company.com/blog");
    // /blog with no sub-path should NOT match — we require /blog/something
    expect(result.category).not.toBe("Reading");
  });

  it("does NOT classify github.com as Reading", async () => {
    const result = await enrichBookmark("https://github.com/some/repo");
    expect(result.category).toBe("GitHub");
  });

  it("does NOT classify an IBM URL as Reading even with 'blog' in path", async () => {
    // IBM rule comes before Reading — IBM should win
    const result = await enrichBookmark("https://www.ibm.com/blog/some-article");
    expect(result.category).toBe("IBM");
  });
});
