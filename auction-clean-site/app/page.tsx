'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

const rawUrl = 'https://dqspprzxyqwtgkwzuweg.supabase.co';
const rawKey = 'sb_publishable_xWVmfXjPbBM45y9xyhlcLA_y-Jz8cx-';
const supabase = createClient(rawUrl, rawKey);

const MAIN_CAT_MAPPING: { [key: string]: string[] } = {
  "アパレル": ["ジャケット・ブルゾン", "コート", "スーツ・セットアップ", "ダウンジャケット・コート", "トップス", "ワンピース", "Tシャツ", "ポロシャツ", "シャツ", "パンツ", "スカート", "ニット・セーター", "カーディガン", "アンサンブル", "パーカー", "ベスト", "ジャージ・スウェット", "キャミソール・チュニック", "オールインワン", "その他"],
  "靴": ["レザーシューズ", "スニーカー", "ブーツ", "サンダル", "パンプス", "ローファー", "スリッポン", "フラットシューズ", "その他"],
  "小物": ["マフラー・ストール", "カレ・スカーフ", "メガネ・サングラス", "帽子", "ネクタイ", "手袋", "ベルト・バックル", "アクセサリー", "ネックレス", "リング", "ピアス・イヤリング", "ブレスレット・バングル", "財布・マネークリップ", "カードケース・コインケース", "ペン・筆記用具", "キーリング・キーホルダー・キーケース", "ポーチ", "傘", "その他"],
  "バッグ": ["ショルダーバッグ", "ハンドバッグ", "リュック", "ボストンバッグ", "ウエストバッグ", "セカンドバッグ", "トートバッグ", "クラッチバッグ", "エコバッグ", "かごバッグ", "バニティバッグ", "その他"],
  "時計": ["腕時計", "置き時計", "掛け時計", "懐中時計", "時計ベルト・コマ", "その他"],
  "毛皮": ["コート", "ショール", "その他"]
};

export default function Home() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [typedSearchTerm, setTypedSearchTerm] = useState('');
  const [activeSearchTerm, setActiveSearchTerm] = useState('');
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredBrands, setFilteredBrands] = useState<string[]>([]);
  const skipSuggest = useRef(false); 

  const [selectedMainCat, setSelectedMainCat] = useState('ALL');
  const [selectedSubCat, setSelectedSubCat] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const [itemsPerPage, setItemsPerPage] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);
  const [priceSortState, setPriceSortState] = useState<'none' | 'asc' | 'desc'>('none');
  const [dateSortState, setDateSortState] = useState<'none' | 'asc' | 'desc'>('none');

  const [activeModalItem, setActiveModalItem] = useState<any | null>(null);
  const [selectedIndexes, setSelectedIndexes] = useState<number[]>([]);

  const extractSortPrice = (val: any): number => {
    if (!val) return 0;
    const strVal = String(val).replace(/[¥,\s]/g, '');
    const match = strVal.match(/-?\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
  };

  const formatPrice = (val: any) => {
    if (!val) return '-';
    const strVal = String(val);
    if (/[a-zA-Zぁ-んァ-ン一-龥]/.test(strVal)) return strVal;
    
    const num = parseFloat(strVal.replace(/[¥,]/g, '').trim());
    return !isNaN(num) && num > 0 ? `¥${num.toLocaleString()}` : strVal;
  };

  useEffect(() => {
    if (skipSuggest.current) {
      skipSuggest.current = false;
      return;
    }
    if (!typedSearchTerm.trim()) {
      setShowSuggestions(false);
      setFilteredBrands([]);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const val = typedSearchTerm.trim();
        const { data, error } = await supabase
          .from('brands')
          .select('en_name, jp_name')
          .or(`jp_name.ilike.%${val}%,en_name.ilike.%${val}%`)
          .limit(8);

        if (!error && data && data.length > 0) {
          const uniqueBrands = Array.from(new Set(data.map(d => d.en_name).filter(Boolean)));
          setFilteredBrands(uniqueBrands);
          setShowSuggestions(true);
        } else {
          setShowSuggestions(false);
        }
      } catch (err) {
        console.error("Brand fetch error:", err);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [typedSearchTerm]);

  const handleSelectBrand = (brandEn: string) => {
    skipSuggest.current = true;
    setTypedSearchTerm(brandEn);
    setShowSuggestions(false);
    setActiveSearchTerm(brandEn);
    setCurrentPage(1);
  };

  const fetchRealData = async () => {
    try {
      setLoading(true);
      setError(null);
      setSelectedIndexes([]);

      // 🚀 优化 1：只拉取需要的字段，节省 90% 流量
     let query = supabase.from('jaa_items').select('箱番, ブランド, 中分類, 特徴, 指値, 出品者, 状態詳細, 自社指値, 売価予想, 1番手顧客, 1番手入札, 2番手顧客, 2番手入札, 3番手顧客, 3番手入札, 画像URL, 大会開催日', { count: 'exact' });

      // 🚀 优化 2：支持多关键词空格搜索 (例如: "シャネル 黒 バッグ")
      if (activeSearchTerm.trim()) {
        const keywords = activeSearchTerm.trim().split(/[\s ]+/);
        keywords.forEach(keyword => {
          const t = `%${keyword}%`;
          query = query.or(`ブランド.ilike.${t},特徴.ilike.${t},中分類.ilike.${t},箱番.ilike.${t}`);
        });
      }

      if (selectedMainCat !== 'ALL') {
        const validSubCats = MAIN_CAT_MAPPING[selectedMainCat] || [];
        if (validSubCats.length > 0) query = query.in('中分類', validSubCats);
      }
      if (selectedSubCat !== 'ALL') query = query.eq('中分類', selectedSubCat);

      if (selectedStatus !== 'ALL') {
        query = query.ilike('状態詳細', `%${selectedStatus}%`);
        if (selectedStatus === 'A') query = query.not('状態詳細', 'ilike', '%SA%').not('状態詳細', 'ilike', '%AB%');
        else if (selectedStatus === 'B') query = query.not('状態詳細', 'ilike', '%AB%').not('状態詳細', 'ilike', '%BC%');
        else if (selectedStatus === 'C') query = query.not('状態詳細', 'ilike', '%BC%');
        else if (selectedStatus === 'S') query = query.not('状態詳細', 'ilike', '%SA%');
      }
      
      if (startDate) {
        const dbStartDate = startDate.substring(2).replace(/-/g, '');
        query = query.gte('大会開催日', dbStartDate);
      }
      if (endDate) {
        const dbEndDate = endDate.substring(2).replace(/-/g, '');
        query = query.lte('大会開催日', dbEndDate + '퟿'); 
      }

      // 🚀 优化 3：把排序交给数据库，抛弃低效循环
      if (priceSortState !== 'none') {
        query = query.order('自社指値', { ascending: priceSortState === 'asc', nullsFirst: false });
      } else if (dateSortState !== 'none') {
        query = query.order('大会開催日', { ascending: dateSortState === 'asc', nullsFirst: false });
      }
      
      const from = (currentPage - 1) * itemsPerPage;
      const to = from + itemsPerPage - 1;
      query = query.range(from, to);

      const { data, error: dbError, count } = await query;
      if (dbError) throw dbError;

      setItems(data || []);
      setTotalCount(count || 0);

    } catch (err: any) {
      console.error('Fetch Error:', err);
      setError(err.message || 'データベースエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRealData();
  }, [ activeSearchTerm, selectedMainCat, selectedSubCat, selectedStatus, startDate, endDate, currentPage, itemsPerPage, priceSortState, dateSortState ]);

  const executeSearch = () => {
    setActiveSearchTerm(typedSearchTerm);
    setCurrentPage(1);
    setShowSuggestions(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') executeSearch();
  };

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus('CSVを読み込んでいます...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error('読み込めませんでした。');

        const parsedRows: string[][] = [];
        let currentRow: string[] = [];
        let currentVal = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          const nextChar = text[i + 1];

          if (char === '"') {
            if (inQuotes && nextChar === '"') {
              currentVal += '"'; 
              i++; 
            } else {
              inQuotes = !inQuotes; 
            }
          } else if (char === ',' && !inQuotes) {
            currentRow.push(currentVal);
            currentVal = '';
          } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') i++; 
            currentRow.push(currentVal);
            
            if (currentRow.some(val => val.trim() !== '')) {
              parsedRows.push(currentRow);
            }
            currentRow = [];
            currentVal = '';
          } else {
            currentVal += char;
          }
        }
        if (currentVal || currentRow.length > 0) {
          currentRow.push(currentVal);
          if (currentRow.some(val => val.trim() !== '')) parsedRows.push(currentRow);
        }

        if (parsedRows.length < 2) throw new Error('データがありません。');

        const headers = parsedRows[0].map(h => h.replace(/^["']|["']$/g, '').trim());
        const priceColumns = ['自社指値', '指値', '指値2', '1番手入札', '2番手入札', '3番手入札'];
        const batchId = `batch_${new Date().getTime()}`;

        const jsonRows: any[] = [];
        for (let i = 1; i < parsedRows.length; i++) {
          const matches = parsedRows[i];
          const rowData: any = {};
          
          headers.forEach((header, index) => {
            let val = matches[index] ? matches[index].trim() : '';
            val = val.replace(/^["']|["']$/g, ''); 
            
            if (priceColumns.includes(header)) {
               const cleanedVal = val.replace(/[¥,]/g, '').trim();
               rowData[header] = cleanedVal === '' ? null : Number(cleanedVal);
            } 
            else if (header === '画像URL' || header === '画像') {
               const imgMatch = val.match(/=IMAGE\(['"]?(.*?)['"]?\)/i);
               rowData[header] = imgMatch ? imgMatch[1] : val;
            } 
            else {
               rowData[header] = val;
            }
          });

          rowData['upload_batch'] = batchId;
          jsonRows.push(rowData);
        }

        setUploadStatus(`Supabaseへ ${jsonRows.length} 件登録中...`);

        const { error: insertError } = await supabase.from('jaa_items').insert(jsonRows);
        if (insertError) throw insertError;

        setUploadStatus('🎉 アップロード成功！');
        setTimeout(() => setUploadStatus(null), 4000);
        
        fetchRealData(); 
      } catch (err: any) {
        console.error(err);
        alert(`失敗: ${err.message}`);
        setUploadStatus(null);
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    
    reader.readAsText(file, 'utf-8');
  };

  const handleDownloadCSV = () => {
    if (selectedIndexes.length === 0) return;

    const selectedItems = items.filter((_, index) => selectedIndexes.includes(index));
    if (selectedItems.length === 0) return;

    const headers = Object.keys(selectedItems[0]).filter(k => k !== 'id');

    const csvRows = [];
    csvRows.push(headers.join(',')); 

    selectedItems.forEach(item => {
      const row = headers.map(header => {
        let val = item[header] === null || item[header] === undefined ? '' : String(item[header]);
        if (val.includes(',') || val.includes('\n') || val.includes('"')) {
          val = `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      });
      csvRows.push(row.join(','));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `選択商品_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleDateSort = () => {
    setPriceSortState('none');
    setCurrentPage(1);
    setDateSortState(prev => prev === 'none' ? 'desc' : (prev === 'desc' ? 'asc' : 'none'));
  };

  const togglePriceSort = () => {
    setDateSortState('none');
    setCurrentPage(1);
    setPriceSortState(prev => prev === 'none' ? 'asc' : (prev === 'asc' ? 'desc' : 'none'));
  };

  const availableSubCategories = ['ALL'];
  if (selectedMainCat !== 'ALL') {
    if (MAIN_CAT_MAPPING[selectedMainCat]) {
      availableSubCategories.push(...MAIN_CAT_MAPPING[selectedMainCat]);
    }
  } else {
    const allSubs = Object.values(MAIN_CAT_MAPPING).flat();
    availableSubCategories.push(...Array.from(new Set(allSubs)).sort());
  }

  const handleMainCatChange = (val: string) => {
    setSelectedMainCat(val);
    setSelectedSubCat('ALL');
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalCount / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, totalCount);

  return (
    <div className="container">
      <div className="search-panel">
        <div className="search-row">
          
          <div className="search-group" style={{ position: 'relative' }}>
            <input
              type="text"
              placeholder="ブランド、特徴、箱番などを入力..."
              value={typedSearchTerm}
              onChange={(e) => setTypedSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            />
            <button className="btn-search" onClick={executeSearch}>検索</button>

            {showSuggestions && filteredBrands.length > 0 && (
              <div className="suggestions-dropdown">
                {filteredBrands.map((brand, idx) => (
                  <div 
                    key={idx} 
                    className="suggestion-item"
                    onMouseDown={() => handleSelectBrand(brand)}
                  >
                    🔍 <b>{brand}</b> に変換
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div style={{ marginLeft: '10px', display: 'flex', gap: '6px' }}>
            <button 
              className="btn-search" 
              style={{ background: '#78909c' }} 
              onClick={() => {
                if (selectedIndexes.length === items.length && items.length > 0) {
                  setSelectedIndexes([]); 
                } else {
                  setSelectedIndexes(items.map((_, idx) => idx)); 
                }
              }}
            >
              {selectedIndexes.length === items.length && items.length > 0 ? "全解除" : "全選択"}
            </button>

            <button 
              className="btn-search" 
              style={{ background: selectedIndexes.length > 0 ? '#42a5f5' : '#bbdefb', cursor: selectedIndexes.length > 0 ? 'pointer' : 'not-allowed' }} 
              onClick={handleDownloadCSV}
              disabled={selectedIndexes.length === 0}
            >
              CSVダウンロード ({selectedIndexes.length})
            </button>

            <input type="file" accept=".csv" ref={fileInputRef} style={{ display: 'none' }} onChange={handleCSVUpload} disabled={uploading}/>
            <button className="btn-search" style={{ background: '#ec407a' }} onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? "処理中..." : "CSVアップ"}
            </button>
          </div>
        </div>

        {uploadStatus && (
          <div style={{ background: '#fff3f6', color: '#d81b60', padding: '10px 15px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', marginBottom: '15px', border: '1px dashed #f8bbd0' }}>
            ℹ️ {uploadStatus}
          </div>
        )}

        <div className="filter-row">
          <div className="filter-item">
            <span>大分類:</span>
            <select value={selectedMainCat} onChange={(e) => handleMainCatChange(e.target.value)}>
              <option value="ALL">すべて (ALL)</option>
              <option value="アパレル">アパレル</option>
              <option value="靴">靴</option>
              <option value="小物">小物</option>
              <option value="バッグ">バッグ</option>
              <option value="時計">時計</option>
              <option value="毛皮">毛皮</option>
            </select>
          </div>
          <div className="filter-item">
            <span>小分類:</span>
            <select value={selectedSubCat} onChange={(e) => { setSelectedSubCat(e.target.value); setCurrentPage(1); }}>
              {availableSubCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </div>
          <div className="filter-item">
            <span>ランク:</span>
            <select value={selectedStatus} onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}>
              {["ALL", "S", "SA", "A", "AB", "B", "BC", "C", "D"].map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div className="filter-item">
            <span>表示件数:</span>
            <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}>
              <option value="50">50件</option>
              <option value="100">100件</option>
            </select>
          </div>
          <div className="filter-item">
            <span>開始日:</span>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }} />
          </div>
          <div className="filter-item">
            <span>終了日:</span>
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }} />
          </div>

          <div className="filter-item" style={{ marginLeft: 'auto', gap: '10px' }}>
            <button className={`btn-sort ${priceSortState !== 'none' ? 'active' : ''}`} onClick={togglePriceSort}>
              {priceSortState === 'none' && "価格順: 指定なし"}
              {priceSortState === 'asc' && "価格: 低 → 高 ↑"}
              {priceSortState === 'desc' && "価格: 高 → 低 ↓"}
            </button>
            <button className={`btn-sort ${dateSortState !== 'none' ? 'active' : ''}`} onClick={toggleDateSort}>
              {dateSortState === 'none' && "日付順: 指定なし"}
              {dateSortState === 'desc' && "日付: 新しい順 ↓"}
              {dateSortState === 'asc' && "日付: 古い順 ↑"}
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginBottom: '15px', fontSize: '13px', color: '#4a4a4a', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          📊 検索結果: <span style={{ color: '#f06292', fontSize: '16px' }}>{totalCount}</span> 件 
          {totalCount > 0 && ` （${startIndex + 1} 〜 ${endIndex} 件目を表示）`}
        </div>
        {loading && <div style={{ color: '#f06292', fontSize: '12px' }}>🔄 読み込み中...</div>}
      </div>

      {error ? (
        <div className="status-msg" style={{ color: 'red' }}>⚠️ {error}</div>
      ) : (
        <div className="results" style={{ opacity: loading ? 0.6 : 1, transition: '0.2s' }}>
          {items.length > 0 ? (
            items.map((item, index) => {
              const brand = item['ブランド'] || '不明';
              const subCategory = item['中分類'] || '-';
              const feature = item['特徴'] || item['商品名'] || '-';
              
              const status = item['状態詳細'] || item['ランク'] || '';
              const boxNumber = item['箱番'] || item['商品番号'] || '-';
              const eventDate = item['大会開催日'] || item['日付'] || '';

              const ourSashine = formatPrice(item['自社指値'] || item['指値2'] || item['指値']);
              const imgUrl = item['画像URL'] || 'https://via.placeholder.com/400x300?text=No+Image';

              const c1Name = item['1番手顧客'] || '';
              const c1Bid = formatPrice(item['1番手入札']);
              const c2Name = item['2番手顧客'] || '';
              const c2Bid = formatPrice(item['2番手入札']);
              const c3Name = item['3番手顧客'] || '';
              const c3Bid = formatPrice(item['3番手入札']);

              const isSelected = selectedIndexes.includes(index);

              return (
                <div 
                  key={item.id || index} 
                  className={`item-card ${isSelected ? 'selected' : ''}`} 
                  onClick={() => setActiveModalItem(item)}
                >
                  <div 
                    className="checkbox-wrapper" 
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIndexes(prev => 
                        prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
                      );
                    }}
                  >
                    <input type="checkbox" checked={isSelected} readOnly />
                  </div>

                  <div className="brand-badge">{brand}</div>
                  
                  {/* 🚀 优化 4：添加懒加载 loading="lazy" */}
                  <img src={imgUrl} alt={brand} loading="lazy" onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x300?text=No+Image'; }}/>
                  
                  <div className="item-info">
                    <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                      <span className="tag-box">📦 {boxNumber}</span>
                      {eventDate && <span className="tag-date">🗓 {eventDate}</span>}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="item-cat">{subCategory}</span>
                    </div>

                    <div className="item-feat" title={feature}>{feature}</div>

                    <div className="tags-container">
                      {status && <span className="tag-rank">{status}</span>}
                      {item['出品者'] && <span className="tag-normal">{item['出品者']}</span>}
                    </div>

                    <div className="price-list">
                      <div className="price-row">
                        <span className="label">自社指値</span>
                        <span className="val-red">{ourSashine}</span>
                      </div>
                    </div>

                    {(c1Name || c2Name || c3Name) && (
                      <div className="bid-list-card">
                        {c1Name && <div className="bid-row"><span className="bid-user">① {c1Name}</span><span className="bid-val">{c1Bid}</span></div>}
                        {c2Name && <div className="bid-row"><span className="bid-user">② {c2Name}</span><span className="bid-val">{c2Bid}</span></div>}
                        {c3Name && <div className="bid-row"><span className="bid-user">③ {c3Name}</span><span className="bid-val">{c3Bid}</span></div>}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            !loading && <div className="status-msg">該当する商品は見つかりませんでした。</div>
          )}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button className="page-btn" disabled={currentPage === 1 || loading} onClick={() => { setCurrentPage(prev => Math.max(prev - 1, 1)); window.scrollTo(0,0); }}>前のページ</button>
          <span className="page-info">{currentPage} / {totalPages}</span>
          <button className="page-btn" disabled={currentPage === totalPages || loading} onClick={() => { setCurrentPage(prev => Math.min(prev + 1, totalPages)); window.scrollTo(0,0); }}>次のページ</button>
        </div>
      )}

      {/* 弹窗 */}
      {activeModalItem && (
        <div className="modal-overlay" style={{ display: 'flex' }} onClick={() => setActiveModalItem(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setActiveModalItem(null)}>×</button>
            {/* 🚀 优化 4：添加懒加载 loading="lazy" */}
            <img 
              className="modal-img" 
              style={{ objectFit: 'contain', backgroundColor: '#fafafa' }} 
              src={activeModalItem['画像URL'] || 'https://via.placeholder.com/400x300?text=No+Image'} 
              alt="画像" 
              loading="lazy"
              onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x300?text=No+Image'; }}
            />
            <div className="modal-title">{activeModalItem['特徴'] || activeModalItem['商品名'] || "無題の商品"}</div>
            <div className="modal-details">
              <p><b>ブランド:</b> {activeModalItem['ブランド'] || 'なし'}</p>
              <p><b>カテゴリ:</b> {activeModalItem['大分類'] || ''} &gt; {activeModalItem['中分類'] || ''}</p>
              <p><b>ランク:</b> <span style={{ color: '#f06292', fontWeight: 'bold' }}>{activeModalItem['状態詳細'] || activeModalItem['ランク'] || 'なし'}</span></p>
              <p><b>箱番:</b> {activeModalItem['箱番'] || activeModalItem['商品番号'] || 'なし'}</p>
              <p><b>出品者:</b> {activeModalItem['出品者'] || 'なし'}</p>
              <p><b>大会開催日:</b> {activeModalItem['大会開催日'] || activeModalItem['日付'] || 'なし'}</p>
              
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #fce4ec' }}>
                <p><b>指値:</b> {formatPrice(activeModalItem['指値'])}</p>
                <p><b>自社指値:</b> <span style={{ color: '#e74c3c', fontWeight: 'bold', fontSize: '15px' }}>{formatPrice(activeModalItem['自社指値'] || activeModalItem['指値2'] || activeModalItem['指値'])}</span></p>
                <p><b>売価予想:</b> {activeModalItem['売価予想'] || '-'}</p>
              </div>

              <div style={{ marginTop: '10px', padding: '8px', background: '#fff0f5', borderRadius: '8px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>① {activeModalItem['1番手顧客'] || '-'}</span><b style={{ marginLeft: 'auto' }}>{formatPrice(activeModalItem['1番手入札'])}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}><span>② {activeModalItem['2番手顧客'] || '-'}</span><b style={{ marginLeft: 'auto' }}>{formatPrice(activeModalItem['2番手入札'])}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}><span>③ {activeModalItem['3番手顧客'] || '-'}</span><b style={{ marginLeft: 'auto' }}>{formatPrice(activeModalItem['3番手入札'])}</b></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        :root { --primary-color: #f48fb1; --primary-hover: #f06292; --bg-color: #fff0f5; --text-main: #4a4a4a; --text-muted: #8e9eab; --card-bg: #ffffff; --border-color: #fce4ec; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background-color: var(--bg-color); color: var(--text-main); margin: 0; padding: 20px; }
        .container { max-width: 1200px; margin: 0 auto; }
        .search-panel { background: var(--card-bg); border-radius: 16px; padding: 24px; box-shadow: 0 4px 20px rgba(244, 143, 177, 0.1); margin-bottom: 20px; border: 1px solid var(--border-color); }
        .search-row { display: flex; gap: 10px; margin-bottom: 20px; align-items: center; }
        .search-group { display: flex; flex: 1; background: #fafafa; padding: 2px; border-radius: 8px; border: 1px solid var(--border-color); align-items: center; }
        input[type="text"] { flex: 1; border: none; background: transparent; padding: 10px 15px; font-size: 14px; outline: none; color: var(--text-main); }
        .btn-search { background-color: var(--primary-color); color: white; border: none; border-radius: 6px; padding: 10px 20px; font-weight: 600; cursor: pointer; transition: background 0.2s; margin-right: 2px; outline: none; white-space: nowrap; border: 1px solid transparent; }
        .btn-search:hover { filter: brightness(0.95); }
        .btn-search:disabled { opacity: 0.6; cursor: not-allowed; }
        .suggestions-dropdown { position: absolute; top: calc(100% + 5px); left: 0; right: 0; background: white; border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 15px rgba(244,143,177,0.2); z-index: 100; max-height: 250px; overflow-y: auto; overflow-x: hidden; }
        .suggestion-item { padding: 12px 15px; cursor: pointer; font-size: 14px; border-bottom: 1px solid #fdfdfd; color: var(--text-main); transition: 0.2s; }
        .suggestion-item:last-child { border-bottom: none; }
        .suggestion-item:hover { background: var(--bg-color); color: var(--primary-hover); font-weight: bold; padding-left: 20px; }
        .filter-row { display: flex; flex-wrap: wrap; gap: 15px; align-items: center; }
        .filter-item { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #555; }
        select, input[type="date"] { padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color); background: white; outline: none; color: #4a4a4a; font-size: 13px; }
        .btn-sort { background: white; border: 1px solid var(--primary-color); color: var(--primary-hover); padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer; transition: 0.2s; outline: none; }
        .btn-sort:hover { background: var(--border-color); }
        .btn-sort.active { background: var(--primary-color); color: white; }
        .results { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; }
        
        .item-card { background: white; border-radius: 12px; overflow: hidden; border: 2px solid var(--border-color); transition: 0.3s; padding: 10px; position: relative; cursor: pointer; display: flex; flex-direction: column; }
        .item-card:hover { box-shadow: 0 5px 15px rgba(244,143,177,0.2); transform: translateY(-2px); }
        .item-card.selected { border: 2px solid #42a5f5; background: #e3f2fd; box-shadow: 0 4px 12px rgba(66, 165, 245, 0.3); }
        
        .checkbox-wrapper { position: absolute; top: 12px; left: 12px; z-index: 20; background: rgba(255, 255, 255, 0.95); padding: 6px; border-radius: 6px; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); cursor: pointer; transition: 0.2s; }
        .checkbox-wrapper:hover { transform: scale(1.1); border-color: #42a5f5; }
        .checkbox-wrapper input { cursor: pointer; transform: scale(1.3); margin: 0; pointer-events: none; }
        
        .brand-badge { position: absolute; top: 12px; left: 45px; background: rgba(255, 255, 255, 0.9); padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; color: var(--text-main); border: 1px solid var(--border-color); backdrop-filter: blur(4px); z-index: 10; }
        
        .item-card img { width: 100%; height: 180px; object-fit: cover; border-radius: 8px; background: #fdfdfd; margin-bottom: 10px; }
        .tag-box { background: #e0e0e0; color: #333; padding: 3px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; font-family: monospace; }
        .tag-date { background: #fce4ec; color: #d81b60; padding: 3px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; border: 1px solid #f8bbd0; }
        
        .item-info { padding: 5px; display: flex; flex-direction: column; flex: 1; }
        .item-cat { font-size: 11px; color: var(--primary-hover); font-weight: bold; }
        .item-feat { font-size: 13px; margin: 8px 0; height: 3em; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.5; color: var(--text-main); }
        .tags-container { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; font-size: 11px; margin-top: auto; }
        .tag-rank { background: #fff0f5; color: #d81b60; padding: 3px 6px; border-radius: 4px; font-weight: bold; border: 1px solid #f8bbd0; }
        .tag-normal { background: #f5f5f5; color: #666; padding: 3px 6px; border-radius: 4px; max-w: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .price-list { margin-top: 8px; border-top: 1px dashed var(--border-color); padding-top: 8px; }
        .price-row { display: flex; justify-content: space-between; align-items: center; }
        .label { font-size: 12px; color: var(--text-muted); }
        .val-red { color: #e74c3c; font-weight: bold; font-size: 15px; }
        .bid-list-card { margin-top: 8px; padding: 6px 8px; background: #fff0f5; border-radius: 6px; font-size: 11px; display: flex; flex-direction: column; gap: 2px; }
        .bid-row { display: flex; justify-content: space-between; align-items: center; }
        .bid-user { color: #4a4a4a; font-weight: 500; }
        .bid-val { color: #d81b60; font-weight: bold; }
        .status-msg { grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted); font-size: 14px; font-weight: bold; background: white; border-radius: 12px; border: 1px solid var(--border-color); }
        .pagination { display: flex; justify-content: center; align-items: center; gap: 15px; margin-top: 30px; padding-bottom: 20px; grid-column: 1 / -1; }
        .page-btn { background: white; border: 1px solid var(--primary-color); color: var(--primary-hover); padding: 8px 20px; border-radius: 8px; font-weight: bold; cursor: pointer; transition: 0.2s; outline: none; }
        .page-btn:hover:not(:disabled) { background: var(--primary-color); color: white; border-color: var(--primary-color); }
        .page-btn:disabled { opacity: 0.4; cursor: not-allowed; background: #fafafa; color: #999; border-color: #eee; }
        .page-info { font-size: 14px; color: var(--text-main); font-weight: bold; }
        .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.4); justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(4px); }
        .modal-content { background: white; border-radius: 16px; padding: 24px; max-width: 450px; width: 90%; position: relative; box-shadow: 0 10px 25px rgba(0,0,0,0.1); border: 1px solid var(--border-color); max-height: 85vh; overflow-y: auto; }
        .modal-close { position: absolute; top: 15px; right: 15px; font-size: 24px; cursor: pointer; color: var(--text-muted); border: none; background: none; outline: none; padding: 0; line-height: 1; }
        .modal-img { width: 100%; height: 300px; border-radius: 12px; margin-bottom: 15px; }
        .modal-title { font-size: 15px; font-weight: bold; margin-bottom: 12px; color: var(--text-main); line-height: 1.5; }
        .modal-details { font-size: 13px; line-height: 1.8; color: #555; }
        .modal-details p { margin: 4px 0; }
      `}</style>
    </div>
  );
}
