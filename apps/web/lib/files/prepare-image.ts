"use client";

/** Больше этого по длинной стороне на экране всё равно не видно. */
const MAX_SIDE = 2560;
/** Фото тяжелее перекодируем даже без уменьшения. */
const REENCODE_OVER = 3 * 1024 * 1024;
const JPEG_QUALITY = 0.86;

const PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const HEIC = /\.hei[cf]$/i;

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function renamed(name: string, ext: string): string {
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}${ext}`;
}

/**
 * Shrinks a big photo before upload: 12-megapixel shots from a phone become a
 * few hundred kilobytes, which matters on mobile data. Drawing through a
 * canvas also applies the EXIF rotation and drops the metadata (the server
 * strips it anyway). HEIC from a Mac is converted to JPEG where the browser can
 * decode it. Anything else, or any failure, returns the file untouched.
 */
export async function prepareForUpload(file: File): Promise<File> {
  const heic =
    file.type === "image/heic" ||
    file.type === "image/heif" ||
    HEIC.test(file.name);
  const photo = PHOTO_TYPES.has(file.type) || heic;
  const png = file.type === "image/png";
  if (!photo && !png) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (heic) {
      throw new Error(
        "Этот браузер не открывает HEIC — сохраните фото как JPG и попробуйте снова",
      );
    }
    return file;
  }
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    // PNG — обычно скриншот с текстом: перекодировать в JPEG нельзя, только уменьшить.
    if (!heic && scale === 1 && (png || file.size <= REENCODE_OVER)) {
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = png ? "image/png" : "image/jpeg";
    const blob = await toBlob(canvas, type, png ? undefined : JPEG_QUALITY);
    if (!blob || (!heic && blob.size >= file.size)) return file;
    return new File([blob], renamed(file.name, png ? ".png" : ".jpg"), {
      type,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}
