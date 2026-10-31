type BookmarkEnrichment = {
  title: string;
  description: string;
  category: string;
  tags: string[];
};

/**
 * Work-context category inference rules.
 * Order matters — first match wins.
 * Rules are checked against: full URL + page title (lowercased).
 */
const CATEGORY_RULES: Array<{ patterns: RegExp; category: string; tags: string[] }> = [

  // ── Document types (checked first — file= param or known doc hosts) ─────────

  // Sheets — must come before Documents (Excel/Sheets are also "docs")
  {
    patterns: /\.(xlsx|xls|csv)(\?|$)|\/spreadsheet|google\.com\/spreadsheets|sheets\.google|sharepoint.*file=.*\.(xlsx|xls|csv)|excel|office\.com\/excel|onedrive.*xlsx/i,
    category: "Sheets",
    tags: ["spreadsheet", "data"],
  },
  // Slides
  {
    patterns: /\.(pptx|ppt|key)(\?|$)|\/presentation|google\.com\/presentation|slides\.google|sharepoint.*file=.*\.(pptx|ppt)|powerpoint|office\.com\/powerpoint|keynote/i,
    category: "Slides",
    tags: ["presentation", "slides"],
  },
  // Documents — Word, Google Docs, PDFs, Notion pages
  {
    patterns: /\.(docx|doc|pdf)(\?|$)|google\.com\/document|docs\.google|sharepoint.*file=.*\.(docx|doc|pdf)|word|office\.com\/word|onedrive.*docx|notion\.so|notionapp|quip\.com/i,
    category: "Documents",
    tags: ["document"],
  },

  // ── Work tools ───────────────────────────────────────────────────────────────

  // GitHub — repos, PRs, issues, gists, actions
  {
    patterns: /^https?:\/\/(www\.)?github\.com|^https?:\/\/gist\.github\.com/i,
    category: "GitHub",
    tags: ["github", "code"],
  },
  // Jira
  {
    patterns: /\.atlassian\.net\/jira|jira\.|atlassian\.com\/jira|\.atlassian\.net\/browse\/|\.atlassian\.net\/board\//i,
    category: "Jira",
    tags: ["jira", "tickets"],
  },
  // Confluence
  {
    patterns: /\.atlassian\.net\/wiki|confluence\.|atlassian\.com\/confluence|\.atlassian\.net\/pages\//i,
    category: "Confluence",
    tags: ["confluence", "docs"],
  },
  // Slack
  {
    patterns: /slack\.com|app\.slack\.com/i,
    category: "Slack",
    tags: ["slack", "chat"],
  },
  // Mural
  {
    patterns: /mural\.co|app\.mural\.co/i,
    category: "Mural",
    tags: ["mural", "whiteboard"],
  },
  // Box
  {
    patterns: /box\.com|ibm\.box\.com|app\.box\.com/i,
    category: "Box",
    tags: ["box", "files"],
  },
  // Zoom
  {
    patterns: /zoom\.us|us\d+web\.zoom\.us/i,
    category: "Zoom",
    tags: ["zoom", "meeting"],
  },
  // ServiceNow
  {
    patterns: /service-now\.com|servicenow\.com/i,
    category: "ServiceNow",
    tags: ["servicenow", "itsm"],
  },

  // ── Platforms ────────────────────────────────────────────────────────────────

  // IBM — internal tools, w3, ibm.com properties (before generic cloud rules)
  {
    patterns: /\.ibm\.com|ibm-my\.|ibm\.sharepoint|w3\.ibm|w3id\.org|ibm\.enterprise|myibm\.ibm|watsonx|ibm\.biz/i,
    category: "IBM",
    tags: ["ibm"],
  },
  // HashiCorp — all products + terraform cloud
  {
    patterns: /hashicorp\.com|app\.terraform\.io|registry\.terraform\.io|vault\.|consul\.|nomad\.|waypoint\.|boundaryproject\.io|vaultproject\.io|terraform\.io/i,
    category: "HashiCorp",
    tags: ["hashicorp", "infrastructure"],
  },
  // Okta / SSO — identity, auth portals
  {
    patterns: /okta\.com|\.okta\.com|auth0\.com|onelogin\.com|ping\.identity|sso\.|login\.|identity\.|iam\.|saml|oauth/i,
    category: "Okta / SSO",
    tags: ["sso", "auth"],
  },
  // AWS
  {
    patterns: /console\.aws\.amazon\.com|aws\.amazon\.com|\.amazonaws\.com|signin\.aws/i,
    category: "AWS",
    tags: ["aws", "cloud"],
  },
  // Azure
  {
    patterns: /portal\.azure\.com|\.azure\.com|\.azurewebsites\.net|azure\.microsoft\.com/i,
    category: "Azure",
    tags: ["azure", "cloud"],
  },
  // GCP
  {
    patterns: /console\.cloud\.google\.com|cloud\.google\.com|\.googleapis\.com/i,
    category: "GCP",
    tags: ["gcp", "cloud"],
  },

  // ── Engineering ──────────────────────────────────────────────────────────────

  // Infrastructure — monitoring, k8s, CI/CD, observability
  {
    patterns: /kubernetes|k8s|helm|grafana|prometheus|datadog|newrelic|pagerduty|argocd|fluxcd|istio|jenkins|circleci|github\.com.*\/actions|travis|buildkite|sentry\.io|opsgenie|victorops|splunk/i,
    category: "Infrastructure",
    tags: ["infrastructure", "ops"],
  },
  // AI / ML
  {
    patterns: /openai\.com|anthropic\.com|huggingface\.co|langchain|ollama|mistral|gemini|claude|chatgpt|llm|cohere|replicate|together\.ai|deepmind|midjourney|dall-e|pytorch|tensorflow|keras|pinecone|weaviate|watsonx/i,
    category: "AI / ML",
    tags: ["ai", "ml"],
  },

  // ── Content ──────────────────────────────────────────────────────────────────

  // Reading — articles, news, blogs, social, video
  // Signals checked against the full URL + page title (lowercased)
  {
    patterns: new RegExp(
      [
        // ── Known blog / article platforms ──────────────────────────────────────
        "medium\\.com",
        "dev\\.to",
        "hashnode\\.com",
        "hashnode\\.dev",
        "substack\\.com",
        "ghost\\.io",
        "ghost\\.org",
        "beehiiv\\.com",
        "buttondown\\.email",
        "revue\\.email",
        "hacker.news",
        "news\\.ycombinator\\.com",
        "lobste\\.rs",
        "reddit\\.com",
        "twitter\\.com",
        "x\\.com\\/(?!home|explore|messages|notifications)", // x.com posts only
        "youtube\\.com",
        "linkedin\\.com",
        "css-tricks\\.com",
        "smashingmagazine\\.com",
        "alistapart\\.com",
        "scotch\\.io",
        "thenewstack\\.io",
        "infoq\\.com",
        "dzone\\.com",
        "sitepoint\\.com",
        "freecodecamp\\.org",
        "towardsdatascience\\.com",
        "betterprogramming\\.pub",
        "javascript\\.info",
        "kentcdodds\\.com",
        "overreacted\\.io",
        "leerob\\.io",
        "paulgraham\\.com",
        "martinfowler\\.com",
        "architecturenotes\\.co",
        "bytebytego\\.com",
        "newsletter\\.pragmaticengineer\\.com",
        "podcast",
        "newsletter",

        // ── URL path patterns that signal blog/article content ──────────────────
        "\\/blog\\/[^/]+",           // /blog/some-post  (not just /blog/)
        "\\/posts?\\/[^/]+",         // /post/title  or  /posts/title
        "\\/articles?\\/[^/]+",      // /article/title
        "\\/news\\/[^/]+",           // /news/headline
        "\\/stories?\\/[^/]+",       // /story/title
        "\\/writing\\/[^/]+",        // /writing/essay
        "\\/essays?\\/[^/]+",        // /essay/name
        "\\/notes?\\/[^/]+",         // /note/slug  or  /notes/slug
        "\\/tutorials?\\/[^/]+",     // /tutorial/slug
        "\\/guides?\\/[^/]+",        // /guide/slug  or  /guides/slug

        // Date-based slug patterns common on blogs: /2024/03/some-title or /2024-03-12-post
        "\\/20\\d{2}\\/\\d{2}\\/[a-z]",
        "\\/20\\d{2}-\\d{2}-\\d{2}-[a-z]",

        // ── Title-based signals (applied to the page title, not just URL) ────────
        "\\bhow[ -]to\\b",
        "\\bbeginners?[ -]guide\\b",
        "\\bdeep[ -]dive\\b",
        "\\bintroduction to\\b",
        "\\bgetting started with\\b",
        "\\bexplained\\b",
        "\\bunder the hood\\b",
        "\\bbest practices\\b",
        "\\blessons? (i )?learned\\b",
        "\\bthings (i|you|we) (learned?|should|must|need)\\b",
        "\\bwhy (i|we|you)\\b",
        "\\bbuilding [a-z]\\b",
        "\\bcraft(ing)?\\b",
      ].join("|"),
      "i"
    ),
    category: "Reading",
    tags: ["reading"],
  },
];

/** Category names the built-in rules can produce (excluding "General"). */
export const BUILTIN_CATEGORIES: string[] = Array.from(
  new Set(CATEGORY_RULES.map((r) => r.category).filter((c) => c !== "General"))
);

/**
 * Tag extraction — pulls meaningful keywords from domain + title.
 */
function extractTags(domain: string, title: string, category: string): string[] {
  const text = `${domain} ${title}`.toLowerCase();
  const tags = new Set<string>();

  // Add category-specific base tags
  const rule = CATEGORY_RULES.find((r) => r.patterns.test(text));
  if (rule) rule.tags.forEach((t) => tags.add(t));

  // Extract meaningful words from title (4+ chars, not stopwords)
  const stopwords = new Set([
    "the", "and", "for", "with", "from", "this", "that", "your",
    "how", "what", "why", "when", "where", "into", "about", "page",
    "home", "overview", "dashboard", "welcome", "portal", "login",
  ]);
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !stopwords.has(w));

  let added = 0;
  for (const word of words) {
    if (added >= 3) break;
    tags.add(word);
    added++;
  }

  return Array.from(tags).slice(0, 5);
}

/**
 * Fetches the page at `url` and extracts <title> and <meta description>.
 * Returns null if the fetch fails (e.g. auth-required pages).
 */
async function fetchPageMeta(url: string): Promise<{ title: string; description: string } | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Linkdeck/1.0)",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();

    const titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
    const rawTitle = titleMatch?.[1]?.trim() ?? "";
    const title = rawTitle.replace(/\s*[|\-–—]\s*.{3,40}$/, "").trim();

    const descMatch =
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i.exec(html) ??
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i.exec(html) ??
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i.exec(html);
    const description = descMatch?.[1]?.trim() ?? "";

    return { title: title || rawTitle, description };
  } catch {
    return null;
  }
}

/**
 * For GitHub URLs, extract a clean title from the URL structure.
 */
function enrichFromGitHubUrl(parsedUrl: URL): { title: string; description: string } | null {
  const parts = parsedUrl.pathname.replace(/^\//, "").replace(/\/$/, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;

  const owner = parts[0];
  const repo = parts[1];
  const repoTitle = repo.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  if (parts[2] === "blob" || parts[2] === "tree") {
    const filePath = parts.slice(4).join("/");
    return {
      title: filePath ? `${filePath} — ${owner}/${repo}` : `${owner}/${repo}`,
      description: `File in ${owner}/${repo} on GitHub`,
    };
  }
  if (parts[2] === "issues") return { title: `Issues — ${owner}/${repo}`, description: `Issues for ${owner}/${repo}` };
  if (parts[2] === "pull" || parts[2] === "pulls") return { title: `Pull Requests — ${owner}/${repo}`, description: `PRs for ${owner}/${repo}` };
  if (parts[2] === "actions") return { title: `Actions — ${owner}/${repo}`, description: `GitHub Actions for ${owner}/${repo}` };
  if (parts[2] === "discussions") return { title: `Discussions — ${owner}/${repo}`, description: `Discussions for ${owner}/${repo}` };

  return {
    title: `${repoTitle} — ${owner}`,
    description: `${owner}/${repo} on GitHub`,
  };
}

/**
 * URL patterns where page fetching won't work — skip fetch, derive title from URL.
 */
const SKIP_FETCH_PATTERNS = [
  /^https?:\/\/(www\.)?github\.com\//i,
  /^https?:\/\/(www\.)?gitlab\.com\//i,
  /^https?:\/\/app\./i,
  /^https?:\/\/console\./i,
  /^https?:\/\/dashboard\./i,
  /^https?:\/\/admin\./i,
  /\.ibm\.com/i,
  /\.w3\.ibm\.com/i,
  /^https?:\/\/w3\./i,
  /\.sharepoint\.com/i,
  /^https?:\/\/(www\.)?onedrive\.live\.com/i,
  /\.atlassian\.net/i,       // Jira + Confluence — always auth-gated
  /slack\.com/i,             // Slack — auth-gated
  /\.okta\.com/i,            // Okta — auth-gated
  /mural\.co/i,              // Mural — auth-gated
  /\.box\.com/i,             // Box — auth-gated
  /zoom\.us/i,               // Zoom — auth-gated
  /service-now\.com/i,       // ServiceNow — auth-gated
  /console\.aws\.amazon\.com/i,
  /portal\.azure\.com/i,
  /console\.cloud\.google\.com/i,
  /hashicorp\.com/i,
  /app\.terraform\.io/i,
  /terraform\.io/i,
];

/**
 * Derives a human-readable title from a URL path when fetching isn't possible.
 */
function titleFromUrlPath(parsedUrl: URL): string {
  const hostname = parsedUrl.hostname.replace(/^www\./, "");

  // SharePoint / OneDrive / Office Online: file= param has the filename
  const fileParam = parsedUrl.searchParams.get("file");
  if (fileParam) {
    const name = fileParam
      .replace(/\.[^.]+$/, "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_+]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
    return name || hostname;
  }

  // Atlassian: use the last readable path segment (Jira issue key, Confluence page title)
  if (/atlassian\.net/.test(hostname)) {
    const segments = parsedUrl.pathname.split("/").filter(Boolean);
    // Jira: /browse/PROJ-123 or /jira/software/projects/PROJ/boards/1
    const browseIdx = segments.indexOf("browse");
    if (browseIdx !== -1 && segments[browseIdx + 1]) {
      return segments[browseIdx + 1]; // e.g. "ENG-456"
    }
    // Confluence: /wiki/spaces/SPACE/pages/123/Page+Title
    const pagesIdx = segments.indexOf("pages");
    if (pagesIdx !== -1 && segments[pagesIdx + 2]) {
      return decodeURIComponent(segments[pagesIdx + 2]).replace(/[+_]/g, " ");
    }
    // Board/project name
    const projectsIdx = segments.indexOf("projects");
    if (projectsIdx !== -1 && segments[projectsIdx + 1]) {
      return segments[projectsIdx + 1];
    }
  }

  // Slack: /client/TEAM/CHANNEL — not much to derive, just use hostname
  if (/slack\.com/.test(hostname)) return "Slack";

  // Generic fallback: use last meaningful path segments
  const segments = parsedUrl.pathname
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .split("/")
    .filter((s) => Boolean(s) && !/^[0-9]+$/.test(s) && !s.startsWith(":"))
    .filter((s) => !["r", "personal", "_layouts", "doc2.aspx", "15", "wiki",
                      "spaces", "pages", "display", "browse", "jira"].includes(s.toLowerCase()));

  const pathPart = segments
    .slice(-2)
    .map((s) => decodeURIComponent(s).replace(/[-_+]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" — ");

  const viewParam =
    parsedUrl.searchParams.get("view") ??
    parsedUrl.searchParams.get("tab") ??
    parsedUrl.searchParams.get("page");
  const viewPart = viewParam
    ? viewParam.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
    : "";

  const parts = [pathPart || hostname, viewPart].filter(Boolean);
  return parts.join(" — ");
}

/**
 * Main enrichment function.
 * If `prefillTitle` is provided (from browser tab / bookmarklet / extension),
 * skips all URL/page fetching and uses it directly — only category + tags inferred.
 */
export async function enrichBookmark(
  url: string,
  prefillTitle?: string
): Promise<BookmarkEnrichment> {
  let parsedUrl: URL;
  let hostname = "";
  try {
    parsedUrl = new URL(url);
    hostname = parsedUrl.hostname.replace(/^www\./, "");
  } catch {
    return { title: prefillTitle || url, description: "", category: "General", tags: [] };
  }

  let title = hostname;
  let description = "";

  if (prefillTitle) {
    // Real title from browser tab — just infer category + tags
    title = prefillTitle;
    description = hostname;
  } else {
    const isGitHub = /^(www\.)?github\.com$/i.test(parsedUrl.hostname);
    const skipFetch = SKIP_FETCH_PATTERNS.some((p) => p.test(url));

    if (isGitHub) {
      const ghMeta = enrichFromGitHubUrl(parsedUrl);
      if (ghMeta) { title = ghMeta.title; description = ghMeta.description; }
    } else if (skipFetch) {
      title = titleFromUrlPath(parsedUrl);
      description = hostname;
    } else {
      const pageMeta = await fetchPageMeta(url);
      if (pageMeta) {
        title = pageMeta.title || hostname;
        description = pageMeta.description || "";
      }
    }
  }

  // Infer category — check full URL + title together
  const text = `${url} ${title}`.toLowerCase();
  const matchedRule = CATEGORY_RULES.find((r) => r.patterns.test(text));
  const category = matchedRule?.category ?? "General";

  const tags = extractTags(hostname, title, category);

  return { title, description, category, tags };
}
