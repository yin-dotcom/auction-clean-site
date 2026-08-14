const JAA_HEADERS = ['箱番','ブランド','中分類','特徴','指値','出品者','状態詳細','自社指値','売価予想','1番手顧客','1番手入札','2番手顧客','2番手入札','3番手顧客','3番手入札','画像URL','大会開催日','upload_batch'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('JAA自動化')
    .addItem('初期設定シートを作成', 'setupJaaAutomation')
    .addItem('現在の原始シートを処理', 'processActiveRawSheet')
    .addItem('本次拍卖表を一键处理', 'runConfiguredJaaImports')
    .addToUi();
  SpreadsheetApp.getUi().createMenu('自定义工具')
    .addItem('1. 一键标准化 (保留星号)', 'normalizeText')
    .addItem('2. T列加年份 (参照S列)', 'addYearToColumnT')
    .addItem('3. H列小数乘一万 (保留文字)', 'multiplySmallNumbers')
    .addItem('4. 极速检查R列图片是否破图', 'checkImageInColumnR')
    .addToUi();
}

function setupJaaAutomation() {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName('JAA設定') || ss.insertSheet('JAA設定');
  s.getRange(1, 1, 1, 6).setValues([['有効','スプレッドシートURL','シート名','最終ハッシュ','最終処理日時','状態']]);
  s.setFrozenRows(1);
  s.getRange('A2:A').insertCheckboxes();
  SpreadsheetApp.getUi().alert('JAA設定を作成しました。URLとシート名を入力し、有効にチェックしてください。');
}

function getJaaConfig_() {
  const p = PropertiesService.getScriptProperties();
  const base = p.getProperty('IMPORT_API_BASE');
  const secret = p.getProperty('IMPORT_SECRET');
  if (!base || !secret) throw new Error('Script PropertiesにIMPORT_API_BASEとIMPORT_SECRETを設定してください。');
  return { base: base.replace(/\/$/, ''), secret: secret };
}

function csvFromValues_(values) {
  return values.map(row => row.map(value => {
    const s = value == null ? '' : String(value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(',')).join('\r\n');
}

function apiJson_(url, options) {
  const response = UrlFetchApp.fetch(url, Object.assign({ muteHttpExceptions: true }, options));
  const body = JSON.parse(response.getContentText() || '{}');
  if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) throw new Error(body.error || ('HTTP ' + response.getResponseCode()));
  return body;
}

function prepareSheet_(sourceSpreadsheet, sourceSheet) {
  const cfg = getJaaConfig_();
  const csv = csvFromValues_(sourceSheet.getDataRange().getDisplayValues());
  const name = sourceSpreadsheet.getName() + '-' + sourceSheet.getName() + '.csv';
  const blob = Utilities.newBlob(csv, 'text/csv', name);
  const prepared = apiJson_(cfg.base + '/api/prepare', { method: 'post', headers: { Authorization: 'Bearer ' + cfg.secret }, payload: { file: blob } });
  return { prepared: prepared, csv: csv };
}

function importRows_(rows) {
  const cfg = getJaaConfig_(), completed = [], size = 20;
  for (let i = 0; i < rows.length; i += size) {
    const result = apiJson_(cfg.base + '/api/import-batch', {
      method: 'post', contentType: 'application/json', headers: { Authorization: 'Bearer ' + cfg.secret },
      payload: JSON.stringify({ rows: rows.slice(i, i + size) })
    });
    (result.rows || []).forEach(row => completed.push(row));
  }
  return completed;
}

function upsertTotalSheet_(rows) {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName('总表') || ss.insertSheet('总表');
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, JAA_HEADERS.length).setValues([JAA_HEADERS]);
  const current = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, JAA_HEADERS.length).getValues() : [];
  const index = {};
  current.forEach((row, i) => index[String(row[16]) + '|' + String(row[0])] = i);
  rows.forEach(item => {
    const row = JAA_HEADERS.map(h => item[h] == null ? '' : item[h]);
    const key = String(row[16]) + '|' + String(row[0]);
    if (index[key] == null) { index[key] = current.length; current.push(row); }
    else current[index[key]] = row;
  });
  if (current.length) sheet.getRange(2, 1, current.length, JAA_HEADERS.length).setValues(current);
}

function processOneSheet_(sourceSpreadsheet, sourceSheet) {
  const result = prepareSheet_(sourceSpreadsheet, sourceSheet);
  const imported = importRows_(result.prepared.rows);
  upsertTotalSheet_(imported);
  return { stats: result.prepared.stats, hash: Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, result.csv, Utilities.Charset.UTF_8)) };
}

function processActiveRawSheet() {
  const ss = SpreadsheetApp.getActive(), sheet = ss.getActiveSheet();
  if (['总表','JAA設定'].indexOf(sheet.getName()) >= 0) throw new Error('原始データのシートを選択してください。');
  const result = processOneSheet_(ss, sheet);
  SpreadsheetApp.getUi().alert('完了：' + result.stats.sourceRows + '件中 ' + result.stats.selected + '件を登録しました。');
}

function runConfiguredJaaImports() {
  const settings = SpreadsheetApp.getActive().getSheetByName('JAA設定');
  if (!settings) throw new Error('先にJAA設定シートを作成してください。');
  const last = settings.getLastRow();
  if (last < 2) return;
  const values = settings.getRange(2, 1, last - 1, 6).getValues();
  values.forEach((row, i) => {
    if (row[0] !== true || !row[1]) return;
    try {
      const source = SpreadsheetApp.openByUrl(String(row[1]));
      const sheet = row[2] ? source.getSheetByName(String(row[2])) : source.getSheets()[0];
      if (!sheet) throw new Error('シートが見つかりません。');
      const csv = csvFromValues_(sheet.getDataRange().getDisplayValues());
      const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, csv, Utilities.Charset.UTF_8));
      if (hash === row[3]) { settings.getRange(i + 2, 6).setValue('変更なし'); return; }
      const result = processOneSheet_(source, sheet);
      settings.getRange(i + 2, 1).setValue(false);
      settings.getRange(i + 2, 4, 1, 3).setValues([[result.hash, new Date(), '完了 ' + result.stats.selected + '件（処理済み）']]);
    } catch (e) { settings.getRange(i + 2, 6).setValue('失敗: ' + e.message); }
  });
}
