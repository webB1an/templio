import sharp from "sharp";
import { IMAGE_SPEC } from "@templio/shared";

type SharpInstance = ReturnType<typeof sharp>;

/**
 * 3:4 卡片：模糊放大的整页做背景 + 完整页面居中做前景。
 * 这样 16:9 的 PPT 不会因为裁成 3:4 被切掉内容。
 */
async function composeCard(
  slidePng: Buffer,
  width: number,
  height: number,
  quality: number,
  maxBytes: number,
): Promise<Buffer> {
  const blurred = await sharp(slidePng)
    .resize(width, height, { fit: "cover", position: "center" })
    .blur(Math.max(8, Math.round(width / 24)))
    .modulate({ brightness: 0.62, saturation: 0.85 })
    .toBuffer();

  const foreground = await sharp(slidePng)
    .resize({ width: Math.round(width * 0.92) })
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

/** 列表缩略图（360×480） */
export async function makeThumb(slidePng: Buffer): Promise<Buffer> {
  return composeCard(
    slidePng,
    IMAGE_SPEC.thumb.width,
    IMAGE_SPEC.thumb.height,
    IMAGE_SPEC.thumb.quality,
    IMAGE_SPEC.thumb.maxBytes,
  );
}

/** 详情页封面（800×1067） */
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
