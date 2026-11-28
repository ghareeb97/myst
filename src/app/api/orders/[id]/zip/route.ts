import { NextResponse } from "next/server";
import { Zip, ZipPassThrough } from "fflate";
import { requireApiUser } from "@/lib/apiAuth";
import { canHandleOrders } from "@/lib/authz";
import {
  countFileUses,
  designPhotos,
  designSummary,
  zipDesignName,
  zipEntryName,
  zipItemTag,
  zipOriginalName,
} from "@/lib/orders";
import type { GiftDesign } from "@/lib/types";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";

/** Most bytes the zip keeps in memory for files that later lines use again. */
const ZIP_CACHE_LIMIT_BYTES = 40 * 1024 * 1024;

type Context = {
  params: Promise<{ id: string }>;
};

/**
 * Streams every photo of an order (prints and gift photos) as one zip, plus GIFT_TEXT.txt with the names
 * or phrases customers want on their gifts. A designed gift adds its print file (NN_tag_xQ_design.jpg) and the
 * customer's originals (NN_tag_original-K_name), and GIFT_TEXT.txt notes the design. Files are stored, not recompressed (JPEGs don't shrink),
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
      .select("kind, size_cm, gift_slug, personal_text, quantity, file_path, file_name, design")
      .eq("order_id", id)
      .order("line_no", { ascending: true, nullsFirst: false })
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
      const giftText: string[] = [];

      // One photo can be printed in several sizes (one line each). Keep its bytes until its last line so
      // it is downloaded once. The website sends a photo's sizes next to each other, so this is usually one
      // photo; the cache is still capped, because line order comes from the customer: past the cap a file
      // is simply downloaded again for its later lines.
      const usesLeft = countFileUses(items.map((item) => ({ file_path: item.file_path, design: item.design as GiftDesign | null })));
      const cache = new Map<string, Uint8Array | null>();
      let cachedBytes = 0;

      const addFile = async (path: string, entryName: string, label: string) => {
        let bytes = cache.get(path);
        if (bytes === undefined) {
          const { data: blob } = await admin.storage.from("order-uploads").download(path);
          bytes = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
        }
        const left = (usesLeft.get(path) ?? 1) - 1;
        usesLeft.set(path, left);
        const size = bytes?.byteLength ?? 0;
        if (left <= 0) {
          if (cache.delete(path)) cachedBytes -= size;
        } else if (!cache.has(path) && cachedBytes + size <= ZIP_CACHE_LIMIT_BYTES) {
          cache.set(path, bytes);
          cachedBytes += size;
        }

        if (!bytes) {
          missing.push(label);
          return;
        }
        const entry = new ZipPassThrough(entryName);
        zip.add(entry);
        entry.push(bytes, true);
      };

      for (const [index, item] of items.entries()) {
        const tag = zipItemTag(item);
        const design = item.design as GiftDesign | null;
        const originals = designPhotos(design);
        if (item.kind === "gift") {
          giftText.push(`${String(index + 1).padStart(2, "0")}_${tag}_x${item.quantity}: ${item.personal_text ?? "(no text)"}${item.file_path ? "" : " (no photo)"}`);
          if (design) {
            giftText.push(
              `    design: ${designSummary(design)} · print file ${zipDesignName(index, tag, item.quantity, item.file_path ?? "")}` +
                (originals.length ? ` · ${originals.length} ${originals.length === 1 ? "original" : "originals"}` : "")
            );
          }
        }
        if (!item.file_path) continue;
        if (design) {
          // Designed gift: the print-ready render, then the customer's originals.
          await addFile(item.file_path, zipDesignName(index, tag, item.quantity, item.file_path), item.file_name ?? item.file_path);
          for (const p of originals) {
            await addFile(p.path, zipOriginalName(index, tag, p.slot, p.file_name, p.path), p.file_name ?? p.path);
          }
        } else {
          await addFile(item.file_path, zipEntryName(index, tag, item.quantity, item.file_name, item.file_path), item.file_name ?? item.file_path);
        }
      }

      if (giftText.length) {
        const note = new ZipPassThrough("GIFT_TEXT.txt");
        zip.add(note);
        note.push(new TextEncoder().encode(`Text to put on each gift (line_item_xQty: text)\n${giftText.join("\n")}\n`), true);
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
