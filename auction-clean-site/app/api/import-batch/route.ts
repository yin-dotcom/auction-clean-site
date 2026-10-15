import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertImportSecret } from '@/lib/server-auth';
import type { JaaRow } from '@/lib/jaa-import';

export const runtime = 'nodejs';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

export async function POST(request: Request) {
  try {
    assertImportSecret(request);
    const body = await request.json() as { rows?: JaaRow[] };
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 25) {
      return NextResponse.json({ error: '1回につき1～25件です。' }, { status: 400 });
    }

    // 核心修改：完全不连接 Cloudflare R2，直接保留原始图片 URL
    const rows = body.rows.map(row => {
      const originalUrl = String(row['画像URL'] || '').trim();
      return {
        ...row,
        '画像URL': originalUrl ? originalUrl : null
      };
    });

    const supabase = createClient(
      required('SUPABASE_URL'), 
      required('SUPABASE_SERVICE_ROLE_KEY'), 
      { auth: { persistSession: false } }
    );

    const { error } = await supabase
      .from('jaa_items')
      .upsert(rows, { onConflict: '大会開催日,箱番' });

    if (error) throw error;

    return NextResponse.json({ imported: rows.length, rows });
  } catch (e) {
    const message = e instanceof Error ? e.message : '処理に失敗しました。';
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 500 });
  }
}
