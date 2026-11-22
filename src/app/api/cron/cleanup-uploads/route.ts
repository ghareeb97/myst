import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

/**
 * Deletes website uploads that no order uses after 24 hours: photos removed before submitting,
 * abandoned orders and junk uploads through the public anon key. Runs daily from vercel.json.
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; without CRON_SECRET set this route refuses to run.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  let removed = 0;

  // A few batches per run keeps the function well inside its time limit; leftovers go next run.
  for (let batch = 0; batch < 5; batch++) {
    const { data: paths, error } = await admin.rpc("orphan_upload_paths", {
      p_older_than: "24 hours",
      p_limit: 500
    });
    if (error) {
      return NextResponse.json({ error: error.message, removed }, { status: 500 });
    }
    const list = (paths ?? []) as string[];
    if (!list.length) break;

    const { error: removeError } = await admin.storage.from("order-uploads").remove(list);
    if (removeError) {
      return NextResponse.json({ error: removeError.message, removed }, { status: 500 });
    }
    removed += list.length;
    if (list.length < 500) break;
  }

  return NextResponse.json({ ok: true, removed });
}
