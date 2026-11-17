import { NextResponse } from "next/server";
import { Zip, ZipPassThrough } from "fflate";
import { requireApiUser } from "@/lib/apiAuth";
import { canHandleOrders } from "@/lib/authz";
import { zipEntryName } from "@/lib/orders";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

type Context = {
  params: Promise<{ id: string }>;
};

/**
 * Streams every photo of an order as one zip. Files are stored, not recompressed (JPEGs don't shrink),
 * and downloaded one at a time so memory stays at roughly one photo.
 */
export async function GET(_request: Request, context: Context) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  if (!canHandleOrders(auth.profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const admin = createSupabaseAdminClient();

  const [{ data: order }, { data: items }] = await Promise.all([
    admin.from("orders").select("code").eq("id", id).single(),
    admin
      .from("order_items")
      .select("size_cm, quantity, file_path, file_name")
      .eq("order_id", id)
      .order("created_at")
  ]);

  if (!order || !items?.length) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const zip = new Zip((err, chunk, final) => {
        if (err) {
          controller.error(err);
          return;
        }
        controller.enqueue(chunk);
        if (final) controller.close();
      });

      const missing: string[] = [];
      for (const [index, item] of items.entries()) {
        const { data: blob } = await admin.storage.from("order-uploads").download(item.file_path);
        if (!blob) {
          missing.push(item.file_name ?? item.file_path);
          continue;
        }
        const entry = new ZipPassThrough(zipEntryName(index, item.size_cm, item.quantity, item.file_name, item.file_path));
        zip.add(entry);
        entry.push(new Uint8Array(await blob.arrayBuffer()), true);
      }

      if (missing.length) {
        const note = new ZipPassThrough("MISSING_FILES.txt");
        zip.add(note);
        note.push(new TextEncoder().encode(`These files could not be found in storage:\n${missing.join("\n")}\n`), true);
      }

      zip.end();
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${order.code}.zip"`,
      "Cache-Control": "no-store"
    }
  });
}
