import { NextResponse } from 'next/server';
import { prepareJaaCsv } from '@/lib/jaa-import';
import { assertImportSecret } from '@/lib/server-auth';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertImportSecret(request);
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'CSVがありません。' }, { status: 400 });
    return NextResponse.json(prepareJaaCsv(await file.text(), file.name));
  } catch (e) {
    const message = e instanceof Error ? e.message : '処理に失敗しました。';
    return NextResponse.json({ error: message }, { status: message === 'UNAUTHORIZED' ? 401 : 400 });
  }
}
