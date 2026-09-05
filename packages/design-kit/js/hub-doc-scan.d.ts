export type DocScanResult = {
  blob: Blob;
  width: number;
  height: number;
  scanned: boolean;
  reason?: string;
};

export function ensureOpenCv(opts?: {
  loadOpenCv?: () => Promise<any>;
}): Promise<any>;

export function scanDocumentFromImage(
  input: Blob | File,
  opts?: {
    loadOpenCv?: () => Promise<any>;
    loadJscanify?: () => Promise<any>;
    quality?: number;
  }
): Promise<DocScanResult>;
