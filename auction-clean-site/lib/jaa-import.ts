export type JaaRow = Record<string, string | null>;

const rankPattern =
  /(^|[^A-Z])(SA|AB|BC|S|A|B|C|D)(?![A-Z])/;

/**
 * 解析CSV。
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];

  let row: string[] = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (quoted && next === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      row.push(value);
      value = '';
    } else if (
      (ch === '\n' || ch === '\r') &&
      !quoted
    ) {
      if (ch === '\r' && next === '\n') {
        i++;
      }

      row.push(value);

      if (row.some(cell => cell.trim())) {
        rows.push(row);
      }

      row = [];
      value = '';
    } else {
      value += ch;
    }
  }

  row.push(value);

  if (row.some(cell => cell.trim())) {
    rows.push(row);
  }

  return rows;
}

/**
 * 用于Rank识别的文本标准化。
 */
function normalized(value: string) {
  return value
    .normalize('NFKC')
    .toUpperCase()
    .trim();
}

/**
 * 普通文本标准化。
 */
function cleanText(value: string) {
  return value
    .normalize('NFKC')
    .trim();
}

/**
 * 从状态详细中提取Rank。
 */
function extractRank(state: string) {
  return (
    normalized(state).match(rankPattern)?.[2] || ''
  );
}

/**
 * 清洗价格。
 *
 * 小于100的数字按照“万”为单位乘以10000。
 */
function cleanMoney(value: string) {
  const compact = value
    .normalize('NFKC')
    .replace(/[¥,\s]/g, '');

  if (!compact) {
    return null;
  }

  // 纯数字
  const fullNumber = Number(compact);

  if (Number.isFinite(fullNumber)) {
    return String(
      fullNumber > 0 && fullNumber < 100
        ? Math.round(fullNumber * 10000)
        : fullNumber
    );
  }

  // “レ8.2”等文字和数字混合的价格
  const converted = compact.replace(
    /\d+(?:\.\d+)?/g,
    function(match) {
      const number = Number(match);

      if (
        match.includes('.') ||
        (number > 0 && number < 100)
      ) {
        return String(
          Math.round(number * 10000)
        );
      }

      return match;
    }
  );

  return converted || null;
}

/**
 * 判断箱番是否有效。
 *
 * 以下内容视为无效：
 * - 空白
 * - -
 * - ー
 * - －－
 * - ー-ー
 */
function isValidBox(box: string) {
  if (!box) {
    return false;
  }

  return !/^[-ー－\s]+$/.test(box);
}

/**
 * 根据文件名和Google表格标签页名称，
 * 识别举办日期和拍卖类型。
 *
 * 例如：
 *
 * 260728JAA下見用データ-0728手競り.csv
 * → 260728手競り
 *
 * 260728JAA下見用データ-0728入札.csv
 * → 260728入札
 *
 * 260612JAA下見用データ-0612.csv
 * → 260612
 */
function eventName(filename: string) {
  const date =
    filename.match(/(\d{6})/)?.[1] || '';

  if (/手競り/.test(filename)) {
    return `${date}手競り`;
  }

  if (/入札/.test(filename)) {
    return `${date}入札`;
  }

  return date;
}

/**
 * 解析JAA表格。
 */
export function prepareJaaCsv(
  text: string,
  filename: string
) {
  const all = parseCsv(
    text.replace(/^\uFEFF/, '')
  );

  const headerIndex = all.findIndex(
    row =>
      row.includes('状態詳細') &&
      row.includes('画像URL')
  );

  if (headerIndex < 0) {
    throw new Error(
      '状態詳細と画像URLを含む表頭が見つかりません。'
    );
  }

  const headers = all[headerIndex].map(
    value => value.trim()
  );

  /*
   * ==========================================
   * 已清洗总表模式
   * ==========================================
   *
   * 已经存在：
   * - 指値
   * - 自社指値
   *
   * 不存在：
   * - 【仮】指値
   */
  if (
    headers.includes('自社指値') &&
    !headers.includes('【仮】指値')
  ) {
    const filenameEvent = eventName(filename);

    const moneyFields = new Set([
      '指値',
      '自社指値',
      '1番手入札',
      '2番手入札',
      '3番手入札'
    ]);

    const rows: JaaRow[] = [];

    let withRank = 0;
    let withoutRank = 0;

    for (
      const source of all.slice(headerIndex + 1)
    ) {
      const getByName = (name: string) => {
        const index = headers.indexOf(name);

        if (index < 0) {
          return '';
        }

        return (source[index] || '').trim();
      };

      const box = getByName('箱番');

      // 跳过空白箱番和“ー-ー”等无效数据
      if (!isValidBox(box)) {
        continue;
      }

      const state = cleanText(
        getByName('状態詳細')
      );

      const rank = extractRank(state);

      if (rank) {
        withRank++;
      } else {
        withoutRank++;
      }

      const row: JaaRow = {};

      for (
        let i = 0;
        i < headers.length;
        i++
      ) {
        const name = headers[i];

        if (
          !name ||
          name === 'id' ||
          name === 'extracted_rank'
        ) {
          continue;
        }

        const raw =
          (source[i] || '').trim();

        if (moneyFields.has(name)) {
          row[name] = cleanMoney(raw);
        } else if (name === '画像URL') {
          row[name] = raw || null;
        } else {
          row[name] =
            cleanText(raw) || null;
        }
      }

      /*
       * 标签页名称含有“入札”或者“手競り”时，
       * 优先使用标签页识别出来的举办日期。
       */
      if (
        /(入札|手競り)/.test(filenameEvent)
      ) {
        row['大会開催日'] = filenameEvent;
        row['upload_batch'] =
          `auto_${filenameEvent}`;
      } else {
        row['大会開催日'] =
          row['大会開催日'] ||
          filenameEvent ||
          null;

        row['upload_batch'] =
          row['upload_batch'] ||
          `auto_${
            row['大会開催日'] ||
            filenameEvent
          }`;
      }

      row['extracted_rank'] =
        rank || null;

      rows.push(row);
    }

    return {
      rows,
      stats: {
        sourceRows: rows.length,
        imported: rows.length,
        visibleWithRank: withRank,
        hiddenWithoutRank: withoutRank,
        mode: 'cleaned_total'
      }
    };
  }

  /*
   * ==========================================
   * 原始拍卖表模式
   * ==========================================
   *
   * 三个价格字段：
   *
   * 1. 原来的指値
   *    → Supabase的指値
   *
   * 2. 【仮】指値前面的指値
   *    → Supabase的自社指値
   *
   * 3. 【仮】指値
   *    → 不导入
   */
  const stateIndex =
    headers.indexOf('状態詳細');

  const boxIndex =
    headers.indexOf('箱番', stateIndex);

  const originalPriceIndex =
    headers.findIndex(
      (value, index) =>
        value === '指値' &&
        index < stateIndex
    );

  const ownPriceIndex =
    headers.findIndex(
      (value, index) =>
        value === '指値' &&
        index > boxIndex
    );

  const temporaryPriceIndex =
    headers.indexOf('【仮】指値');

  if (
    [
      stateIndex,
      boxIndex,
      originalPriceIndex,
      ownPriceIndex,
      temporaryPriceIndex
    ].some(index => index < 0)
  ) {
    throw new Error(
      '指値・自社指値・【仮】指値の列を識別できません。'
    );
  }

  const indexOf = (
    name: string,
    start = 0
  ) => headers.indexOf(name, start);

  const boxNumberIndex =
    indexOf('箱番号');

  const numberIndex =
    indexOf('No');

  const imageIndex =
    indexOf('画像URL');

  const topAmountIndex =
    indexOf('TOP入札額');

  const topCustomerIndex =
    indexOf('TOP入札者');

  const bidder1Index =
    headers.findIndex(
      value =>
        value === '1番手' ||
        value === '1番手業者'
    );

  const amount1Index =
    headers.findIndex(
      value =>
        value === '1番手入札金額'
    );

  const bidder2Index =
    headers.findIndex(
      value =>
        value === '2番手' ||
        value === '2番手業者'
    );

  const amount2Index =
    headers.findIndex(
      value =>
        value === '2番手入札金額'
    );

  const bidder3Index =
    headers.findIndex(
      value =>
        value === '3番手' ||
        value === '3番手業者'
    );

  const amount3Index =
    headers.findIndex(
      value =>
        value === '3番手入札金額'
    );

  const get = (
    row: string[],
    index: number
  ) => {
    if (index < 0) {
      return '';
    }

    return (row[index] || '').trim();
  };

  const event = eventName(filename);
  const output: JaaRow[] = [];

  let withRank = 0;
  let withoutRank = 0;

  for (
    const source of all.slice(headerIndex + 1)
  ) {
    const boxNumber =
      get(source, boxNumberIndex);

    const itemNumber =
      get(source, numberIndex);

    const box =
      boxNumber && itemNumber
        ? `${boxNumber}-${itemNumber}`
        : get(source, boxIndex);

    // 跳过空白箱番和“ー-ー”等无效数据
    if (!isValidBox(box)) {
      continue;
    }

    const state =
      get(source, stateIndex);

    const rank =
      extractRank(state);

    const ownPrice =
      get(source, ownPriceIndex);

    if (rank) {
      withRank++;
    } else {
      withoutRank++;
    }

    const bidder1 =
      bidder1Index >= 0
        ? get(source, bidder1Index)
        : get(source, topCustomerIndex);

    const bidder1Amount =
      amount1Index >= 0
        ? get(source, amount1Index)
        : bidder1Index >= 0
          ? get(source, bidder1Index + 1)
          : get(source, topAmountIndex);

    const bidder2Amount =
      amount2Index >= 0
        ? get(source, amount2Index)
        : bidder2Index >= 0
          ? get(source, bidder2Index + 1)
          : '';

    const bidder3Amount =
      amount3Index >= 0
        ? get(source, amount3Index)
        : bidder3Index >= 0
          ? get(source, bidder3Index + 1)
          : '';

    output.push({
      '箱番':
        cleanText(box),

      'ブランド':
        cleanText(
          get(
            source,
            indexOf('ブランド')
          )
        ),

      '中分類':
        cleanText(
          get(
            source,
            indexOf('中分類')
          )
        ),

      '特徴':
        cleanText(
          get(
            source,
            indexOf('特徴')
          )
        ),

      '指値':
        cleanMoney(
          get(
            source,
            originalPriceIndex
          )
        ),

      '出品者':
        cleanText(
          get(
            source,
            indexOf('出品者')
          )
        ),

      '状態詳細':
        cleanText(state),

      '自社指値':
        cleanMoney(ownPrice),

      '売価予想':
        cleanText(
          get(
            source,
            indexOf('売価予想')
          )
        ) || null,

      '1番手顧客':
        cleanText(bidder1) || null,

      '1番手入札':
        cleanMoney(bidder1Amount),

      '2番手顧客':
        cleanText(
          get(
            source,
            bidder2Index
          )
        ) || null,

      '2番手入札':
        cleanMoney(bidder2Amount),

      '3番手顧客':
        cleanText(
          get(
            source,
            bidder3Index
          )
        ) || null,

      '3番手入札':
        cleanMoney(bidder3Amount),

      '画像URL':
        get(source, imageIndex) || null,

      '大会開催日':
        event,

      'upload_batch':
        `auto_${event}`,

      'extracted_rank':
        rank || null
    });
  }

  return {
    rows: output,
    stats: {
      sourceRows:
        all.length - headerIndex - 1,

      imported:
        output.length,

      visibleWithRank:
        withRank,

      hiddenWithoutRank:
        withoutRank,

      mode: 'raw_auction'
    }
  };
}
