import { NextRequest, NextResponse } from "next/server";
import { deleteCategoryRule, readCategoryRules, ruleHost, setCategoryRules } from "@/lib/category-rules";
import { parseRuleHost, parseRuleInput } from "@/lib/bookmark-input";
import { withStorageErrors } from "@/lib/api-errors";

/** GET /api/category-rules → { rules: { [host]: category } } */
async function handleGET() {
  return NextResponse.json({ rules: await readCategoryRules() });
}

/** PUT /api/category-rules  { url, category } → files future bookmarks from url's site under category */
async function handlePUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body" }, { status: 400 });
  }
  const parsed = parseRuleInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const host = ruleHost(parsed.value.url);
  const rules = await setCategoryRules([{ host, category: parsed.value.category }]);
  return NextResponse.json({ host, rules });
}

/** DELETE /api/category-rules?host=figma.com */
async function handleDELETE(request: NextRequest) {
  const parsed = parseRuleHost(request.nextUrl.searchParams.get("host"));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  return NextResponse.json({ rules: await deleteCategoryRule(parsed.value) });
}

export const GET = withStorageErrors(handleGET);
export const PUT = withStorageErrors(handlePUT);
export const DELETE = withStorageErrors(handleDELETE);
