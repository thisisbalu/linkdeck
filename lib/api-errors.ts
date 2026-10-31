import { NextResponse } from "next/server";
import { StorageUnavailableError } from "./paths";

/**
 * Turns "storage folder unavailable" into a clear 503 instead of a crash, so
 * the page can show what's wrong (e.g. Box not running) rather than an error.
 */
export function withStorageErrors<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof StorageUnavailableError) {
        return NextResponse.json({ error: err.message, storageUnavailable: true }, { status: 503 });
      }
      throw err;
    }
  };
}
