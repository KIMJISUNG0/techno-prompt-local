import fs from 'node:fs/promises';
import path from 'node:path';
import { google } from 'googleapis';
import { ensureManifest, hashFile, memPaths, isoNow } from './store';

function isEnabled() {
  return process.env.GOOGLE_DRIVE_ENABLED === '1';
}

function getAuth() {
  const base64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64;
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  let creds: any;
  if (base64) creds = JSON.parse(Buffer.from(base64, 'base64').toString('utf8'));
  else if (file) creds = require(path.resolve(file));
  else throw new Error('No service account cred');
  // googleapis (google-auth-library) newer versions expect an options object rather than positional args.
  // Use object form for forward compatibility; also normalize escaped newlines in private key.
  const privateKey: string = (creds.private_key || '').replace(/\\n/g, '\n');
  const jwt = new google.auth.JWT({
    email: creds.client_email,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  return jwt;
}

export async function syncFiles(relativePaths: string[]) {
  if (!isEnabled()) return { enabled: false, uploaded: 0 };
  const auth = getAuth();
  const drive = google.drive({ version: 'v3', auth });
  const ROOT_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!ROOT_ID) return { enabled: true, uploaded: 0, warn: 'Missing GOOGLE_DRIVE_ROOT_FOLDER_ID' };

  const manifest = await ensureManifest();
  let uploaded = 0;

  for (const rel of relativePaths) {
    const abs = path.resolve(rel);
    const stat = await fs.stat(abs).catch(() => null);
    if (!stat || !stat.isFile()) continue;
    const hash = await hashFile(abs);
    const key = rel.replace(/\\/g, '/');
    const prev = (manifest.files as any)[key];
    if (prev && prev.hash === hash) continue;
    const media: any = { mimeType: 'text/plain', body: await fs.readFile(abs) };
    let fileId = prev?.id;
    if (!fileId) {
      const meta: any = { name: path.basename(key), parents: [ROOT_ID] };
      const { data } = await drive.files.create({ requestBody: meta, media, fields: 'id' });
      fileId = data.id!;
    } else {
      await drive.files.update({ fileId, media });
    }
    (manifest.files as any)[key] = { id: fileId!, hash };
    uploaded++;
  }
  (manifest as any).updated = isoNow();
  await fs.writeFile(memPaths.manifest(), JSON.stringify(manifest, null, 2), 'utf8');
  return { enabled: true, uploaded };
}
