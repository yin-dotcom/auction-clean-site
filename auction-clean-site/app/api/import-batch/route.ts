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

// ✅ 新增：后端正则提取级别的函数（与你的前端逻辑一致）
const extractRankFromStatus = (statusStr: string | undefined | null) => {
  if (!statusStr) return null;
  const safeStr = String(statusStr).trim();
  const rankRegex = /^(?:ヴィン(?:テージ)?\s*)?[a-zA-Zａ-ｚＡ-Ｚ\+\-\~\～\＋\－]+(?:\s+[a-zA-Zａ-ｚＡ-Ｚ\+\-\~\～\＋\－]+)*/i;
  const match = safeStr.match(rankRegex);
  return match ? match[0].trim().toUpperCase() : null;
};

export async function POST(request: Request) {
  try {
    assertImportSecret(request);
    const body = await request.json() as { rows?: JaaRow[] };
    if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 25) {
      return NextResponse.json({ error: '1回につき1～25件です。' }, { status: 400 });
    }

    // ✅ 核心修复：解析状态并强制生成 extracted_rank 写入数据库
    const rows = body.rows.map(row => {
      const originalUrl = String(row['画像URL'] || '').trim();
      
      // 兼容原始字段名为 '状態詳細' 或 'ランク'
      const rawStatus = row['状態詳細'] || row['ランク']; 
      
      // 提取级别，如果从 prepare 传过来了就用原来的，否则现场提取
      const extractedRank = row['extracted_rank'] || extractRankFromStatus(rawStatus);

      return {
        ...row,
        '画像URL': originalUrl ? originalUrl : null,
        'extracted_rank': extractedRank || null // 写入数据库，这样前端就不会把它当 null 隐藏了
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
