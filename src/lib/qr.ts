// The decoder is the largest dependency, so it loads only when someone scans.
let decoder: Promise<typeof import('jsqr').default> | null = null;
export function loadDecoder() {
  decoder ??= import('jsqr').then((m) => m.default);
  return decoder;
}

const MAX_SIDE = 1600;

function canvasFor(width: number, height: number, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas is unavailable');
  return { canvas, ctx };
}

function decode(
  jsQR: Awaited<ReturnType<typeof loadDecoder>>,
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number,
): string | null {
  const { canvas, ctx } = canvasFor(width, height, maxSide);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
}

/** Finds a QR code in an image file or pasted screenshot. Tries several scales because large
 * screenshots with a small QR code decode better at full size, and blurry ones when shrunk. */
export async function decodeImageBlob(blob: Blob): Promise<string | null> {
  const jsQR = await loadDecoder();
  const bitmap = await createImageBitmap(blob);
  try {
    return (
      decode(jsQR, bitmap, bitmap.width, bitmap.height, MAX_SIDE) ??
      decode(jsQR, bitmap, bitmap.width, bitmap.height, 2600) ??
      decode(jsQR, bitmap, bitmap.width, bitmap.height, 900)
    );
  } finally {
    bitmap.close();
  }
}

export async function decodeVideoFrame(video: HTMLVideoElement): Promise<string | null> {
  if (!video.videoWidth || !video.videoHeight) return null;
  return decode(await loadDecoder(), video, video.videoWidth, video.videoHeight, 1400);
}
