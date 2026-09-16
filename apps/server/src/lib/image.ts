import sharp from 'sharp';
import { config } from '../config.ts';

export interface ProcessedImage {
  data: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  extension: 'png' | 'jpg';
  width: number;
  height: number;
  byteSize: number;
}

export class ImageRejected extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'ImageRejected';
    this.code = code;
  }
}

/**
 * Validate a reporter's screenshot by actually decoding it, then re-encode it.
 *
 * Content decides the outcome, not the filename or the declared Content-Type.
 * Re-encoding drops EXIF/ICC/XMP metadata (including GPS) and any trailing
 * payload smuggled after the image data. Decoded pixel count and dimensions are
 * bounded independently of the byte limit so a small "zip bomb" style image
 * cannot exhaust memory.
 */
export async function processScreenshot(input: Buffer): Promise<ProcessedImage> {
  const cfg = config();
  if (input.byteLength === 0) throw new ImageRejected('The image file is empty.', 'empty');
  if (input.byteLength > cfg.MAX_UPLOAD_BYTES) {
    throw new ImageRejected('The image is larger than the allowed size.', 'too_large');
  }

  let pipeline = sharp(input, {
    limitInputPixels: cfg.MAX_IMAGE_PIXELS,
    sequentialRead: true,
    animated: false,
  });

  let metadata;
  try {
    metadata = await pipeline.metadata();
  } catch {
    throw new ImageRejected('The file is not a readable PNG or JPEG image.', 'undecodable');
  }

  if (metadata.format !== 'png' && metadata.format !== 'jpeg') {
    throw new ImageRejected('Only PNG and JPEG screenshots are accepted.', 'unsupported_format');
  }
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width < 1 || height < 1) {
    throw new ImageRejected('The image has no usable dimensions.', 'invalid_dimensions');
  }
  if (width > cfg.MAX_IMAGE_DIMENSION || height > cfg.MAX_IMAGE_DIMENSION) {
    throw new ImageRejected(
      `Image dimensions must be at most ${cfg.MAX_IMAGE_DIMENSION}px on each side.`,
      'dimensions_too_large',
    );
  }
  if (width * height > cfg.MAX_IMAGE_PIXELS) {
    throw new ImageRejected('The image has too many pixels.', 'too_many_pixels');
  }

  // Re-encode from decoded pixels; `withMetadata` is deliberately not used.
  pipeline = pipeline.rotate();
  const isPng = metadata.format === 'png';
  const data = isPng
    ? await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer()
    : await pipeline.jpeg({ quality: 82, mozjpeg: false }).toBuffer();

  if (data.byteLength > cfg.MAX_UPLOAD_BYTES) {
    throw new ImageRejected('The re-encoded image is larger than the allowed size.', 'too_large');
  }

  return {
    data,
    mimeType: isPng ? 'image/png' : 'image/jpeg',
    extension: isPng ? 'png' : 'jpg',
    width,
    height,
    byteSize: data.byteLength,
  };
}
