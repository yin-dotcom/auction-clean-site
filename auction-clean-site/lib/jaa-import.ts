export type JaaRow = Record<string, string | null>;

const rankPattern = /(^|[^A-Z])(SA|AB|BC|S|A|B|C|D)(?![A-Z])/;

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i], next = text[i + 1];
    if (ch === '"') {
      if (quoted && next === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(value); value = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i++;
      row.push(value);
      if (row.some(v => v.trim())) rows.push(row);
      row = []; value = '';
    } else value += ch;
  }
  row.push(value);
  if (row.some(v => v.trim())) rows.push(row);
  return rows;
}

function normalized(value: string) {
  return value.normalize('NFKC').toUpperCase().trim();
}

function cleanText(value: string) { return value.normalize('NFKC').trim(); }

function extractRank(state: string) {
  return normalized(state).match(rankPattern)?.[2] || '';
}

function cleanMoney(value: string) {
  const v = value.replace(/[¥,\s]/g, '');
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return value.trim() || null;
  return String(n > 0 && n < 100 ? Math.round(n * 10000) : n);
}

function eventName(filename: string) {
  const date = filename.match(/(\d{6})/)?.[1] || '';
  if (/手競り/.test(filename)) return `${date}手競り`;
  if (/入札/.test(filename)) return `${date}入札`;
  return date;
}

export function prepareJaaCsv(text: string, filename: string) {
  const all = parseCsv(text.replace(/^\uFEFF/, ''));
  const headerIndex = all.findIndex(r => r.includes('状態詳細') && r.includes('画像URL'));
  if (headerIndex < 0) throw new Error('状態詳細と画像URLを含む表頭が見つかりません。');
  const h = all[headerIndex].map(v => v.trim());
  const stateI = h.indexOf('状態詳細');
  const boxI = h.indexOf('箱番', stateI);
  const originalPriceI = h.findIndex((v, i) => v === '指値' && i < stateI);
  const ownPriceI = h.findIndex((v, i) => v === '指値' && i > boxI);
  const tempPriceI = h.indexOf('【仮】指値');
  if ([stateI, boxI, originalPriceI, ownPriceI, tempPriceI].some(i => i < 0)) {
    throw new Error('指値・自社指値・【仮】指値の列を識別できません。');
  }
  const idx = (name: string, start = 0) => h.indexOf(name, start);
  const boxNumberI = idx('箱番号');
  const noI = idx('No');
  const imageI = idx('画像URL');
  const topAmountI = idx('TOP入札額');
  const topCustomerI = idx('TOP入札者');
  const bidder1I = h.findIndex(v => v === '1番手' || v === '1番手業者');
  const amount1I = h.findIndex(v => v === '1番手入札金額');
  const bidder2I = h.findIndex(v => v === '2番手' || v === '2番手業者');
  const amount2I = h.findIndex(v => v === '2番手入札金額');
  const bidder3I = h.findIndex(v => v === '3番手' || v === '3番手業者');
  const amount3I = h.findIndex(v => v === '3番手入札金額');
  const get = (r: string[], i: number) => i >= 0 ? (r[i] || '').trim() : '';
  const event = eventName(filename);
  const output: JaaRow[] = [];
  let withRank = 0, withoutRank = 0;

  for (const source of all.slice(headerIndex + 1)) {
    const state = get(source, stateI), rank = extractRank(state), own = get(source, ownPriceI);
    if (rank) withRank++; else withoutRank++;
    const box = get(source, boxNumberI) && get(source, noI) ? `${get(source, boxNumberI)}-${get(source, noI)}` : get(source, boxI);
    if (!box) continue;
    const bid1 = bidder1I >= 0 ? get(source, bidder1I) : get(source, topCustomerI);
    const bid1Amount = amount1I >= 0 ? get(source, amount1I) : bidder1I >= 0 ? get(source, bidder1I + 1) : get(source, topAmountI);
    const bid2Amount = amount2I >= 0 ? get(source, amount2I) : bidder2I >= 0 ? get(source, bidder2I + 1) : '';
    const bid3Amount = amount3I >= 0 ? get(source, amount3I) : bidder3I >= 0 ? get(source, bidder3I + 1) : '';
    output.push({
      '箱番': cleanText(box), 'ブランド': cleanText(get(source, idx('ブランド'))), '中分類': cleanText(get(source, idx('中分類'))),
      '特徴': cleanText(get(source, idx('特徴'))), '指値': cleanMoney(get(source, originalPriceI)),
      '出品者': cleanText(get(source, idx('出品者'))), '状態詳細': cleanText(state), '自社指値': cleanMoney(own),
      '売価予想': cleanText(get(source, idx('売価予想'))) || null,
      '1番手顧客': cleanText(bid1) || null, '1番手入札': cleanMoney(bid1Amount),
      '2番手顧客': cleanText(get(source, bidder2I)) || null, '2番手入札': cleanMoney(bid2Amount),
      '3番手顧客': cleanText(get(source, bidder3I)) || null, '3番手入札': cleanMoney(bid3Amount),
      '画像URL': get(source, imageI), '大会開催日': event, 'upload_batch': `auto_${event}`,
      'extracted_rank': rank || null,
    });
  }
  return { rows: output, stats: { sourceRows: all.length - headerIndex - 1, imported: output.length, visibleWithRank: withRank, hiddenWithoutRank: withoutRank } };
}
