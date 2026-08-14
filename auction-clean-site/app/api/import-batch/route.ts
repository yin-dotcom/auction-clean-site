import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, createHmac } from 'node:crypto';
import { assertImportSecret } from '@/lib/server-auth';
import type { JaaRow } from '@/lib/jaa-import';

export const runtime = 'nodejs';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function safePart(value: string) { return value.normalize('NFKC').replace(/[^\w.-]+/g, '_'); }

function sha256(value: Uint8Array | string) { return createHash('sha256').update(value).digest('hex'); }
function hmac(key: Buffer | string, value: string) { return createHmac('sha256', key).update(value).digest(); }

async function putR2(key: string, bytes: Uint8Array, contentType: string) {
  const account = required('R2_ACCOUNT_ID'), bucket = required('R2_BUCKET_NAME');
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const now = new Date(), amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, ''), date = amzDate.slice(0, 8);
  const payloadHash = sha256(bytes);
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = `PUT\n${path}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  const scope = `${date}/auto/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${sha256(canonicalRequest)}`;
  const kDate = hmac(`AWS4${required('R2_SECRET_ACCESS_KEY')}`, date);
  const kRegion = hmac(kDate, 'auto'), kService = hmac(kRegion, 's3'), kSigning = hmac(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${required('R2_ACCESS_KEY_ID')}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(`https://${host}${path}`, { method: 'PUT', headers: { 'content-type': contentType, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate, authorization }, body: bytes });
  if (!response.ok) throw new Error(`R2 upload ${response.status}: ${(await response.text()).slice(0, 200)}`);
}

async function moveImage(row: JaaRow) {
  const source = String(row['画像URL'] || '').trim();

  // 没有图片：保留商品数据，跳过R2上传
  if (!source) {
    return {
      ...row,
      '画像URL': null
    };
  }

  try {
    const res = await fetch(source);

    // 图片失效：跳过图片，但继续上传商品数据
    if (!res.ok) {
      console.warn(
        `${row['箱番']}: 画像取得失敗 ${res.status}`
      );

      return {
        ...row,
        '画像URL': null
      };
    }

    const contentType =
      res.headers.get('content-type') ||
      'image/jpeg';

    const ext = contentType.includes('png')
      ? 'png'
      : contentType.includes('webp')
        ? 'webp'
        : 'jpg';

    const key =
      `jaa/${safePart(String(row['大会開催日']))}/` +
      `${safePart(String(row['箱番']))}.${ext}`;

    await putR2(
      key,
      new Uint8Array(await res.arrayBuffer()),
      contentType
    );

    return {
      ...row,
      '画像URL':
        `${required('R2_PUBLIC_URL').replace(/\/$/, '')}/${key}`
    };
  } catch (error) {
    // 网络异常或图片服务器拒绝访问时，也继续保存商品数据
    console.warn(
      `${row['箱番']}: 画像をスキップしました`,
      error
    );

    return {
      ...row,
      '画像URL': null
    };
  }
}

export async function POST(request: Request) {
  try {
    assertImportSecret(request);
    const body = await request.json() as { rows?: JaaRow[] };
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 25) {
      return NextResponse.json({ error: '1回につき1～25件です。' }, { status: 400 });
    }
    const rows = await Promise.all(body.rows.map(row => moveImage(row)));
    const supabase = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const { error } = await supabase.from('jaa_items').upsert(rows, { onConflict: '大会開催日,箱番' });
    if (error) throw error;
    return NextResponse.json({ imported: rows.length, rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : '処理に失敗しました。';
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 500 });
  }
}
