export type CompressOptions = {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  mimeType?: string;
  preserveOriginalBelowBytes?: number;
};

export type CompressResult = {
  blob: Blob;
  width: number;
  height: number;
  skipped: boolean;
  reason?: string;
  exifStripped?: boolean;
};

export function compressImageForUpload(
  input: Blob | File,
  options?: CompressOptions
): Promise<CompressResult>;

export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number };

export function compressAndStripExif(
  input: Blob | File,
  options?: CompressOptions
): Promise<CompressResult>;
