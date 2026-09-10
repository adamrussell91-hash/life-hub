export type DrivePickResult =
  | { kind: 'mirror'; file: File; provider_file_id: string; title: string }
  | {
      kind: 'link';
      title: string;
      provider_file_id: string;
      preview_url: string;
    };

/** Tasks Hub does not wire Google Drive. Editors fall back to URL / file fields. */
export async function openDrivePicker(): Promise<DrivePickResult | null> {
  throw new Error('Google Drive is not configured on Tasks Hub. Paste a URL or upload a file.');
}
