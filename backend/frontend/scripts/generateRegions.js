// scripts/generateRegions.js

const fs   = require('fs');
const path = require('path');
const xlsx = require('xlsx');

// ————————————————
// 1) Excel ファイル（.xlsx）のパス
const EXCEL_PATH = path.resolve(__dirname, '../data/jichitai.xlsx');
// 2) 出力先 regions.js のパス
const OUT_PATH   = path.resolve(__dirname, '../src/data/regions.js');
// ————————————————

// 日本標準の都道府県順
const PREF_ORDER = [
  "北海道","青森県","岩手県","宮城県","秋田県","山形県","福島県",
  "茨城県","栃木県","群馬県","埼玉県","千葉県","東京都","神奈川県",
  "新潟県","富山県","石川県","福井県","山梨県","長野県","岐阜県",
  "静岡県","愛知県","三重県","滋賀県","京都府","大阪府","兵庫県",
  "奈良県","和歌山県","鳥取県","島根県","岡山県","広島県","山口県",
  "徳島県","香川県","愛媛県","高知県","福岡県","佐賀県","長崎県",
  "熊本県","大分県","宮崎県","鹿児島県","沖縄県"
];

const workbook  = xlsx.readFile(EXCEL_PATH);
const sheetName = workbook.SheetNames[0];
const sheet     = workbook.Sheets[sheetName];
const data      = xlsx.utils.sheet_to_json(sheet, { header: 1 });

// ヘッダー行で列を自動検出
const headers = data[0].map(String);
const prefIdx = headers.findIndex(h => h.trim() === '都道府県名（漢字）');
const cityIdx = headers.findIndex(h => h.trim() === '市区町村名（漢字）');

if (prefIdx < 0 || cityIdx < 0) {
  console.error('‼️ ヘッダーに「都道府県名（漢字）」または「市区町村名（漢字）」が見つかりませんでした。');
  process.exit(1);
}

// 2行目以降を取り出し
const rows = data.slice(1)
  .map(r => ({
    pref: String(r[prefIdx] || '').trim(),
    city: String(r[cityIdx] || '').trim()
  }))
  // 「市」または「区」で終わるものだけ
  .filter(({ pref, city }) => pref && city && /(?:市|区)$/.test(city));

// 都道府県ごとに市区を集める
const grouped = rows.reduce((acc, { pref, city }) => {
  if (!acc[pref]) acc[pref] = new Set();
  acc[pref].add(city);
  return acc;
}, {});

// PREF_ORDER に従って並び替え＆整形
const regions = PREF_ORDER
  .filter(pref => Boolean(grouped[pref]))        // データにある都道府県だけ
  .map(pref => ({
    name:   pref,
    cities: Array.from(grouped[pref]).sort((a, b) => a.localeCompare(b, 'ja'))
  }));

// ファイル書き出し
const fileContent =
  `// このファイルは generateRegions.js で自動生成されています。\n` +
  `export default ${JSON.stringify(regions, null, 2)};\n`;

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, fileContent, 'utf8');

console.log(`✅ ${regions.length} 件の都道府県を出力しました。`);
