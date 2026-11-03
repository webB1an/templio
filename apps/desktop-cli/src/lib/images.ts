import sharp from "sharp";
import { IMAGE_SPEC } from "@templio/shared";

type SharpInstance = ReturnType<typeof sharp>;

/**
 * 16:9 封面/缩略图：
 * - 16:9 页面直接铺满画布，不产生上下模糊留白；
 * - 4:3 / 竖版 Word 页面仍用模糊背景 + 完整页面居中，避免裁掉内容。
 */
async function composeCard(
  slidePng: Buffer,
  width: number,
  height: number,
  quality: number,
  maxBytes: number,
): Promise<Buffer> {
  const metadata = await sharp(slidePng).metadata();
  const sourceWidth = metadata.width || 16;
  const sourceHeight = metadata.height || 9;
  const aspect = sourceWidth / sourceHeight;

  if (aspect >= 1.45) {
    const fullBleed = sharp(slidePng).resize(width, height, {
      fit: "cover",
      position: "centre",
    });
    return encodeWebpUnderBudget(fullBleed, quality, maxBytes);
  }

  const blurred = await sharp(slidePng)
    .resize(width, height, { fit: "cover", position: "center" })
    .blur(Math.max(8, Math.round(width / 24)))
    .modulate({ brightness: 0.62, saturation: 0.85 })
    .toBuffer();

  const foreground = await sharp(slidePng)
    .resize({
      width: Math.round(width * 0.92),
      height: Math.round(height * 0.92),
      fit: "inside",
    })
    .toBuffer();

  const composed = await sharp(blurred)
    .composite([{ input: foreground, gravity: "center" }])
    .toBuffer();

  return encodeWebpUnderBudget(sharp(composed), quality, maxBytes);
}

async function encodeWebpUnderBudget(
  image: SharpInstance,
  quality: number,
  maxBytes: number,
): Promise<Buffer> {
  const candidates = [...new Set([quality, Math.max(50, quality - 8), Math.max(45, quality - 16), 45])];
  let last: Buffer | null = null;
  for (const candidate of candidates) {
    last = await image.clone().webp({ quality: candidate }).toBuffer();
    if (last.length <= maxBytes) return last;
  }
  return last ?? (await image.clone().webp({ quality: 45 }).toBuffer());
}

/** 列表缩略图（360×203，16:9） */
export async function makeThumb(slidePng: Buffer): Promise<Buffer> {
  return composeCard(
    slidePng,
    IMAGE_SPEC.thumb.width,
    IMAGE_SPEC.thumb.height,
    IMAGE_SPEC.thumb.quality,
    IMAGE_SPEC.thumb.maxBytes,
  );
}

/** 详情页封面（800×450，16:9） */
export async function makeCover(slidePng: Buffer): Promise<Buffer> {
  return composeCard(
    slidePng,
    IMAGE_SPEC.cover.width,
    IMAGE_SPEC.cover.height,
    IMAGE_SPEC.cover.quality,
    IMAGE_SPEC.cover.maxBytes,
  );
}

/** 详情页预览页（宽 800，等比） */
export async function makePreview(pagePng: Buffer): Promise<Buffer> {
  const resized = sharp(pagePng).resize({
    width: IMAGE_SPEC.preview.width,
    withoutEnlargement: true,
  });
  return encodeWebpUnderBudget(resized, IMAGE_SPEC.preview.quality, IMAGE_SPEC.preview.maxBytes);
}
