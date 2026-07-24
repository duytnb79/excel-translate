const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

export async function exportGoogleSheet(rawUrl: string) {
  const parsedUrl = new URL(rawUrl);
  if (parsedUrl.hostname !== 'docs.google.com') {
    throw new Error('ONLY_GOOGLE_SHEETS_SUPPORTED');
  }

  const match = parsedUrl.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (!match?.[1]) throw new Error('INVALID_GOOGLE_SHEETS_URL');

  const response = await fetch(
    `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`,
    { signal: AbortSignal.timeout(30_000) },
  );
  if (!response.ok) throw new Error('GOOGLE_SHEETS_EXPORT_FAILED');

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_IMPORT_BYTES) throw new Error('GOOGLE_SHEET_TOO_LARGE');

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_IMPORT_BYTES) throw new Error('GOOGLE_SHEET_TOO_LARGE');
  return buffer;
}
