import { NextResponse, type NextRequest } from "next/server";
import { checkRequest } from "@/lib/request-guard";

export function middleware(request: NextRequest) {
  const result = checkRequest({
    method: request.method,
    pathname: request.nextUrl.pathname,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    contentType: request.headers.get("content-type"),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
