# JAA Search – R2 Automatic Import

原始JAA CSV（12日版、16/28日手競り、16/28日入札）を直接アップロードできます。

処理内容:

1. `状態詳細`からRankを抽出（全角/半角対応）
2. 全行にRank解析を実行し、`extracted_rank`へ保存（damageだけの行はnull）
3. 三つの指値を識別（原始指値、自社指値、仮指値）
4. 原画像をCloudflare R2へコピー
5. `画像URL`をR2公開URLへ置換
6. `大会開催日 + 箱番`でSupabaseをupsertし、サイト表示時はRankありだけを取得

## 初期設定

Supabase SQL Editorで `supabase_setup.sql` を一度だけ実行します。

Vercel Environment Variables:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL
IMPORT_SECRET
```

Secret類に `NEXT_PUBLIC_` を付けないでください。

```bash
npm install
npm run build
```

デプロイ後、画面の `CSVアップ` から原始CSVを選び、`IMPORT_SECRET`を入力します。処理前に選別件数を確認できます。1回20件ずつ処理するため、途中で失敗しても同じCSVを再実行すれば上書き修正されます。

## 注意

- R2とSupabaseの設定が完了するまで旧Supabase Storage画像を削除しないでください。
- 既存データに同一の `大会開催日 + 箱番` が複数ある場合、unique index作成前に重複整理が必要です。
- 自動処理後の大会名は `260728手競り`、`260728入札`、`260612` の形式です。
