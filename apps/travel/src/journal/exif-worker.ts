import exifr from 'exifr';
import {
  coordsFromGps,
  orientationAppliedDims,
  type InspectedPhoto,
  type PhotoProvenance,
} from '@/journal/import-group';

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function parseOffsetMinutes(offset: unknown): number | undefined {
  if (typeof offset === 'number' && Number.isFinite(offset)) return offset;
  if (typeof offset !== 'string') return undefined;
  const m = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) return undefined;
  const sign = m[1] === '-' ? -1 : 1;
  return sign * (Number(m[2]) * 60 + Number(m[3]));
}

function exifWallTimeString(raw: unknown): string | null {
  if (raw instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${raw.getFullYear()}:${pad(raw.getMonth() + 1)}:${pad(raw.getDate())} ${pad(raw.getHours())}:${pad(raw.getMinutes())}:${pad(raw.getSeconds())}`;
  }
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return null;
}

/** Build UTC instant when EXIF supplies wall time plus offset evidence. */
export function instantFromWallAndOffset(
  wall: string,
  offsetMinutes: number
): string | undefined {
  const m = wall.match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const utcMs = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6])
  );
  return new Date(utcMs - offsetMinutes * 60_000).toISOString();
}

async function bitmapDims(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      const dims = { width: bmp.width, height: bmp.height };
      bmp.close?.();
      return dims;
    } catch {
      /* fall through */
    }
  }
  return { width: 0, height: 0 };
}

export async function inspectFile(file: File | Blob): Promise<InspectedPhoto> {
  const bytes = await file.arrayBuffer();
  const checksum = await sha256Hex(bytes);
  const mime = file.type || 'application/octet-stream';
  const fileLastModified =
    'lastModified' in file && typeof file.lastModified === 'number'
      ? new Date(file.lastModified).toISOString()
      : new Date().toISOString();

  let raw: Record<string, unknown> = {};
  try {
    const parsed = await exifr.parse(file, { tiff: true, reviveValues: true });
    if (parsed && typeof parsed === 'object') raw = parsed as Record<string, unknown>;
  } catch {
    raw = {};
  }

  const orientation = typeof raw.Orientation === 'number' ? raw.Orientation : undefined;
  let width = Number(raw.ImageWidth ?? raw.ExifImageWidth ?? raw.PixelXDimension ?? 0);
  let height = Number(raw.ImageHeight ?? raw.ExifImageHeight ?? raw.PixelYDimension ?? 0);
  if (!width || !height) {
    const dims = await bitmapDims(file);
    width = dims.width;
    height = dims.height;
  }
  const applied = orientationAppliedDims(width, height, orientation);

  const wall =
    exifWallTimeString(raw.DateTimeOriginal) ??
    exifWallTimeString(raw.CreateDate) ??
    exifWallTimeString(raw.ModifyDate);

  const offsetMinutes =
    parseOffsetMinutes(raw.OffsetTimeOriginal) ??
    parseOffsetMinutes(raw.OffsetTimeDigitized) ??
    parseOffsetMinutes(raw.OffsetTime);

  const lat = typeof raw.latitude === 'number' ? raw.latitude : undefined;
  const lon = typeof raw.longitude === 'number' ? raw.longitude : undefined;
  const coordinates = coordsFromGps(lat, lon);

  const hasExifCapture = Boolean(wall);
  let capture_wall_time: string | null = hasExifCapture ? wall : null;
  let capture_time_source: PhotoProvenance['capture_time_source'] = hasExifCapture
    ? 'exif'
    : 'none';
  let needs_date = !hasExifCapture;
  let needs_timezone = false;
  let instant: string | undefined;
  let offset_minutes: number | undefined;

  if (hasExifCapture && wall) {
    if (offsetMinutes != null) {
      offset_minutes = offsetMinutes;
      instant = instantFromWallAndOffset(wall, offsetMinutes);
      needs_timezone = false;
    } else {
      needs_timezone = true;
    }
  }

  if (!hasExifCapture) {
    capture_wall_time = null;
    capture_time_source = 'none';
  }

  const provenance: PhotoProvenance = {
    capture_time_source,
    file_last_modified: fileLastModified,
    gps_source: coordinates ? 'exif' : 'none',
  };

  if (raw.ModifyDate && wall && exifWallTimeString(raw.ModifyDate) !== wall) {
    raw._note_modification_not_capture = true;
  }

  return {
    checksum,
    mime,
    width: applied.width,
    height: applied.height,
    capture_wall_time,
    offset_minutes,
    coordinates,
    raw_metadata: raw,
    provenance,
    instant,
    needs_timezone: needs_timezone || undefined,
    needs_date: needs_date || undefined,
  };
}
