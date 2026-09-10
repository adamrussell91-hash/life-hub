export function isHeicLike(input: Blob | File | null | undefined): boolean;

export function convertHeicNatively(
  input: Blob,
  opts?: { quality?: number; mimeType?: string }
): Promise<File | null>;

export function convertHeicWithLgpl(
  input: Blob,
  opts?: { quality?: number }
): Promise<File>;

export function ensureWebImage(
  file: File,
  opts?: {
    enableLgplConverter?: boolean;
    quality?: number;
    convertNatively?: typeof convertHeicNatively;
    convertWithLgpl?: typeof convertHeicWithLgpl;
  }
): Promise<{
  file: File;
  converted: boolean;
  method?: 'native' | 'lgpl' | 'passthrough';
}>;
