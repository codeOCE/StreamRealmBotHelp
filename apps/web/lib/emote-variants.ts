/**
 * Client-side 1x–4x variant generation, the free stand-in for 7TV's server
 * image pipeline.
 *
 * A canvas only ever yields a single frame, so animated emotes (GIF / animated
 * WebP / APNG) are deliberately skipped — the CDN serves their original at
 * every size path instead. Static emotes get real, correctly-scaled webp, which
 * is where the bandwidth and crispness actually matter.
 */

/** Rendered heights 7TV uses for 1x–4x. */
const SIZE_PX: Record<string, number> = { "1x": 32, "2x": 64, "3x": 96, "4x": 128 };

const ANIMATED = /\.(gif|apng)$/i;

/** Animated WebP can't be detected by extension alone — sniff for the ANIM chunk. */
async function isAnimatedWebp(file: File): Promise<boolean> {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const text = new TextDecoder("latin1").decode(head);
  return text.startsWith("RIFF") && text.includes("WEBP") && text.includes("ANIM");
}

export async function isAnimated(file: File): Promise<boolean> {
  if (ANIMATED.test(file.name)) return true;
  if (/\.webp$/i.test(file.name)) return isAnimatedWebp(file);
  return false;
}

/**
 * Returns `{ "1x": Blob, ... }` for a static image, or `null` when the image is
 * animated or the browser can't decode it — in both cases the caller just
 * uploads the original and the emote goes without variants.
 */
export async function buildVariants(file: File): Promise<Record<string, Blob> | null> {
  if (await isAnimated(file)) return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  const out: Record<string, Blob> = {};
  for (const [size, px] of Object.entries(SIZE_PX)) {
    // Preserve aspect ratio; never upscale past the source, which would just
    // ship bigger files with no extra detail.
    const scale = Math.min(px / bitmap.height, 1);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.92));
    if (!blob) return null; // webp unsupported → fall back to no variants at all
    out[size] = blob;
  }
  bitmap.close();
  return out;
}
