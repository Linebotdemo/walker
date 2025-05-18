/* ───────────── src/pages/CompanyDashboard.jsx ───────────── */
import React, { useEffect, useState, useRef, Fragment, Component } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster';
import 'leaflet.heat';
import CATEGORY_LABELS from '../constants/categoryLabels';
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.heat/dist/leaflet-heat.js';
/* ====== フック & コンポーネント ====== */
import { useAuth } from '../hooks/useAuth';
import { useCompanies } from '../hooks/useCompanies';
import { useCompanyReports as useReports } from '../hooks/useCompanyReports';
import { useCompanyAssignments as useAssignments } from '../hooks/useCompanyAssignments';
import { useCompanyProfile as useProfile } from '../hooks/useCompanyProfile';
import { useCompanyChat as useChat } from '../hooks/useCompanyChat';
import { useCityCategories } from '../hooks/useCityCategories';
import { useCategories } from '../hooks/useCategories';
import Sidebar from '../components/Sidebar';
import regions from '../data/regions'; // regions.js に [{ name: '東京都', cities: [...] }]
import { Disclosure } from '@headlessui/react';
import { ChevronUpIcon, ChevronDownIcon } from 'lucide-react';
const API_BASE = import.meta.env.VITE_API_BASE;
const STATUS_LABELS = {
 new: '新規',
 resolved: '解決済み',
 ignored: '無視',
 shared: '共有済み',
};

// エラーバウンダリコンポーネント
class ErrorBoundary extends Component {
 state = { hasError: false };
 static getDerivedStateFromError(error) { return { hasError: true }; }
 componentDidCatch(error, errorInfo) {
 console.error('Error caught in ErrorBoundary:', error, errorInfo);
 }
 render() {
 if (this.state.hasError) {
 return (
 <div className="p-6 text-red-500">
 <h2>エラーが発生しました</h2>
 <p>ページをリロードするか、サポートにお問い合わせください。</p>
 </div>
 );
 }
 return this.props.children;
 }
}

const reportIcon = L.icon({
 iconUrl: '/marker-report.svg',
 iconSize: [30, 40],
 iconAnchor: [15, 40],
 popupAnchor: [0, -40],
});
function CompanyDashboard() {
  const { user } = useAuth();
  const {
    reports,
    categoriesInReports,
    loading: reportsLoading,
    page: reportsPage,
    setPage: setReportsPage,
    totalPages: reportsTotalPages,
    filters,
    setFilters,
    fetchReports,
  } = useReports();

  // ① currentSection, selectedCities などの state を先に宣言
  const [currentSection, setCurrentSection] = useState('handleReports');
  const [selectedCities, setSelectedCities] = useState([]);
  // ... 他の useState フックがあればここ

  // ② パラメータ合成ユーティリティを宣言
  const buildParams = (baseFilters) => {
    const p = { ...baseFilters };
    if (selectedCities.length) p.areaKeywords = selectedCities.join('|');
    if (baseFilters.area) p.areaKeywords = baseFilters.area;
    if (p.dateFrom) p.date_from = p.dateFrom;
    if (p.dateTo) p.date_to = p.dateTo;
    return p;
  };

  // ③ そのあとで useEffect を置く
  useEffect(() => {
    if (['reportList','handleReports','mapView'].includes(currentSection)) {
      fetchReports(1, buildParams(filters));
    }
  }, [currentSection, filters]);

 // --- 追加開始: 汎用 onChange ハンドラ ---
 const handleSelectFilter = (key) => (e) => {
 const next = { ...filters, [key]: e.target.value };
 setFilters(next);
 setReportsPage(1);
 fetchReports(1, buildParams(next));
 };
 // --- 追加ここまで ---
 const [isModalOpen, setIsModalOpen] = useState(false);
 const [selectedReport, setSelectedReport] = useState(null);
 const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
 const [newCategory, setNewCategory] = useState('');
 const [mapTab, setMapTab] = useState('pin');
 const mapRef = useRef(null);
 const markersRef = useRef(null);
 const [reportsReady, setReportsReady] = useState(false);
 const [focusCoords, setFocusCoords] = useState(null);

 // 都道府県・市区町村フィルタ
 const [selectedPref, setSelectedPref] = useState('');
 const [searchCity, setSearchCity] = useState('');
 const [focusReportId, setFocusReportId] = useState(null);

 // --- 先頭付近の useEffect（初回マウント時のフィルタ復元） ---

 /* ---------- サーバーへ保存 → 再取得して state を同期 ---------- */
 const updateCities = async (nextCities) => {
 setSelectedCities(nextCities);

 const token = localStorage.getItem('token');
 if (!token) return;

 try {
 console.log('➡️ POST /filter/cities', nextCities);
 await fetch(`${API_BASE}/api/company/filter/cities`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${token}`,
 },
 body: JSON.stringify({ selected_cities: nextCities }),
 });

 console.log('➡️ GET /filter/cities');
 const res = await fetch(`${API_BASE}/api/company/filter/cities`, {
 headers: { Authorization: `Bearer ${token}` },
 });
 const data = await res.json();
 console.log('▶ reports API raw data:', data);
 console.log('GET result:', data);
 setSelectedCities(data.selected_cities || []);
 } catch (err) {
 console.error('❌ updateCities error:', err);
 }
 };

 /* ---------- チェックボックス 1 個の ON/OFF ---------- */
 const toggleCity = (name) => {
 const next = selectedCities.includes(name)
 ? selectedCities.filter((n) => n !== name)
 : [...selectedCities, name];
 updateCities(next);
 };

 /* ----- カスタムフック ----- */
  const {
    assignments,
    loading: assignmentsLoading,
    page: assignmentsPage,
    setPage: setAssignmentsPage,
    totalPages: assignmentsTotalPages,
    fetchAssignments,
  } = useAssignments();

 // チェックが０のとき一覧を空にするフラグ
 const [emptySelection, setEmptySelection] = useState(false);




useEffect(() => {
  if (currentSection === 'assignments') {
    fetchAssignments(1);
  }
}, [currentSection]);

 // 実際に表示する配列／総ページ数
 const displayedReports = emptySelection ? [] : reports;
 const displayedTotalPages = emptySelection ? 0 : reportsTotalPages;



const {
  areas,
  loading: profileLoading,
  error: profileError,    // ← ここを追加
  fetchAreas,
  updateAreas,
} = useProfile();

 const { categories, addCategory, updateCategory } = useCategories();

 /* ===================================================================== */
 /* ハンドラー関数群 */
 /* ===================================================================== */

 // 通知送信
 const sendNotification = async (reportId, content) => {
 const token = localStorage.getItem('token');
 if (!token) {
 toast.error('認証トークンが見つかりません');
 return false;
 }

 try {
 const res = await fetch(
 `${import.meta.env.VITE_API_BASE}/api/company/notifications`,
 {
 method: 'POST',
 headers: {
 Authorization: `Bearer ${token}`,
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ report_id: reportId, content }),
 }
 );
 const data = await res.json().catch(() => ({}));
 if (!res.ok) {
 console.error('PATCH /reports/:id 失敗時のレスポンス:', data);
 toast.error(data.detail || JSON.stringify(data.errors || data));
 return;
 }

 return true;
 } catch (err) {
 console.error('Error sending notification:', err);
 toast.error(err.message || '通知の送信に失敗しました');
 return false;
 }
 };

 // フィルタ変更
 const handleFilterChange = (e) => {
 const { name, value } = e.target;
 setFilters((prev) => ({
 ...prev,
 [name]: value,
 }));
 };

 // マップ初期化
 const initializeMap = () => {
 if (mapRef.current) {
 mapRef.current.remove();
 mapRef.current = null;
 }

 const mapElement = document.getElementById('map-view');
 if (!mapElement) {
 console.warn('Map container not found, retrying...');
 setTimeout(initializeMap, 100);
 return;
 }

 try {
 const mapInstance = L.map('map-view').setView([35.6895, 139.6917], 10);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
 attribution: '© OpenStreetMap contributors',
 }).addTo(mapInstance);

 const filtered = (reports || []).filter((f) => {
 const p = f.properties || f;
 const matchesCategory = !filters.category || p.category === filters.category;
 const matchesDateFrom = !filters.dateFrom || new Date(p.created_at) >= new Date(filters.dateFrom);
 const matchesDateTo = !filters.dateTo || new Date(p.created_at) <= new Date(filters.dateTo);
 const matchesSearch = !filters.search || (p.title && p.title.includes(filters.search));
 const matchesArea = !filters.area || (p.address && p.address.toLowerCase().includes(filters.area.toLowerCase()));

 return matchesCategory && matchesDateFrom && matchesDateTo && matchesSearch && matchesArea;
 });

 if (mapTab === 'pin') {
 const markers = L.markerClusterGroup();
 filtered.forEach((f) => {
 const coordinates = f.geometry?.coordinates;
 if (!coordinates || coordinates.length !== 2 || isNaN(coordinates[0]) || isNaN(coordinates[1])) {
 console.warn(`Invalid coordinates for report ID ${f.id || 'unknown'}`);
 return;
 }
 const [lng, lat] = coordinates;
 const p = f.properties || f;
 const marker = L.marker([lat, lng], {
 icon: reportIcon,
 reportId: p.id,
 });
 marker.bindPopup(`
 <div style="max-width: 240px;">
 <strong>${CATEGORY_LABELS[p.category] || p.category || 'カテゴリ不明'}</strong><br>
 <p>${p.description || '説明なし'}</p>
 <p><strong>住所:</strong> ${p.address || '不明'}</p>
 <p><strong>ステータス:</strong> ${STATUS_LABELS[p.status] || '不明'}</p>
 ${
 p.image_paths && p.image_paths.length > 0
 ? `<img src="${import.meta.env.VITE_API_BASE}/static/uploads/${p.image_paths[0]}" alt="画像" style={{ width: "100%", height: "auto", marginTop: "8px", borderRadius: "4px" }} />`
 : ''
 }
 </div>
 `);
 markers.addLayer(marker);
 });
 mapInstance.addLayer(markers);
 markersRef.current = markers;
 } else if (mapTab === 'heatmap') {
 const heatData = filtered
 .map((f) => {
 const coordinates = f.geometry?.coordinates;
 if (!coordinates || coordinates.length !== 2 || isNaN(coordinates[0]) || isNaN(coordinates[1])) {
 return null;
 }
 const [lng, lat] = coordinates;
 return [lat, lng, 1];
 })
 .filter(Boolean);
 if (heatData.length > 0) {
 L.heatLayer(heatData, { radius: 25, blur: 15, maxZoom: 17 }).addTo(mapInstance);
 } else {
 console.warn('No valid data for heatmap');
 }
 }

 // フォーカス座標があればズームして popup を開く
 if (focusCoords) {
 mapInstance.setView(focusCoords, 16, { animate: true });
 if (focusReportId && markersRef.current) {
 markersRef.current.eachLayer((layer) => {
 if (layer.options?.reportId === focusReportId) {
 layer.openPopup();
 }
 });
 }
 setFocusReportId(null);
 }
 mapRef.current = mapInstance;
 } catch (error) {
 console.error('Failed to initialize map:', error);
 toast.error('マップの初期化に失敗しました');
 }
 };

 // 詳細モーダルを開く
 const openReportModal = (report) => {
 const p = report.properties || report;
 const normalizedReport = {
 id: p.id ?? null,
 title: p.title ?? '不明',
 description: p.description ?? '不明',
 address: p.address ?? '不明',
 category: p.category ?? '不明',
 status: p.status ?? '不明',
 user: p.user ?? { name: '不明' },
 created_at: p.created_at ?? new Date().toISOString(),
 image_paths: Array.isArray(p.image_paths) ? p.image_paths : [],
 geometry: p.geometry ?? { coordinates: [null, null] },
 };
 setSelectedReport(normalizedReport);
 setIsModalOpen(true);
 };

 // ページネーション
 const handleReportsPageChange = (newPage) => {
 setReportsPage(newPage);
 fetchReports(newPage, buildParams(filters));
 };

 const handleAssignmentsPageChange = (newPage) => {
 setAssignmentsPage(newPage);
 fetchAssignments(newPage);
 };

 // カテゴリ追加
 const handleAddCategory = () => {
 if (!newCategory.trim()) {
 toast.error('カテゴリ名を入力してください');
 return;
 }
 addCategory(newCategory);
 setNewCategory('');
 setIsCategoryModalOpen(false);
 };

 // マップ更新用 useEffect
 useEffect(() => {
 if (currentSection === 'mapView' && mapTab !== 'stats') {
 const timer = setTimeout(() => {
 if (reports.length > 0) {
 initializeMap();
 }
 }, 100);
 return () => clearTimeout(timer);
 }
 }, [currentSection, mapTab, reports]);

 return (
 <ErrorBoundary>
 <div className="flex min-h-screen">
 <Sidebar userType="company" onSectionChange={setCurrentSection} />
 <div className="flex-1 p-6 bg-gray-100">
 {['reportList', 'handleReports', 'mapView'].includes(currentSection) ? (
 <div className="mb-6 bg-white p-6 rounded-lg shadow-lg">
 <h3 className="text-lg font-semibold mb-4">フィルタ</h3>
 {reportsLoading ? (
 <div className="text-center">フィルタを読み込み中...</div>
 ) : (
 <>
 <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
 {/* カテゴリ */}
 <div>
 <label htmlFor="category" className="block text-gray-700 mb-2">
 カテゴリ
 </label>
 <select
 id="category"
 name="category"
 value={filters.category}
 onChange={handleSelectFilter('category')}
 className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
 aria-label="カテゴリフィルタ"
 >
 <option value="">すべて</option>
 {(categoriesInReports || []).map((cat) => (
 <option key={cat} value={cat}>
 {CATEGORY_LABELS[cat] || cat}
 </option>
 ))}
 </select>
 </div>

 {/* ステータス */}
 <div>
 <label htmlFor="status" className="block text-gray-700 mb-2">
 ステータス
 </label>
 <select
 id="status"
 name="status"
 value={filters.status}
 onChange={handleSelectFilter('status')}
 className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
 aria-label="ステータスフィルタ"
 >
 <option value="">すべて</option>
 <option value="new">新規</option>
 <option value="resolved">解決済み</option>
 <option value="ignored">無視</option>
 <option value="shared">共有済み</option>
 </select>
 </div>

{/* エリア */}
<div>
  <label htmlFor="area" className="block text-gray-700 mb-2">
    エリア
  </label>
{profileLoading ? (
  <div className="text-center text-gray-500">エリアを読み込み中…</div>
) : profileError ? (
  <div className="text-red-500 text-sm">
    エリアの取得に失敗しました: {profileError.message}
    <button
      onClick={fetchAreas}
      className="ml-2 text-blue-500 hover:underline"
      aria-label="エリアの再読み込み"
    >
      再試行
    </button>
  </div>
) : (
  <select
    id="area"
    name="area"
    value={filters.area}
    onChange={handleSelectFilter('area')}
    className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
    aria-label="エリアフィルタ"
  >
    <option value="">すべて</option>
    {areas.map((area) => (
      <option key={area.id} value={area.name}>
        {area.name}
      </option>
    ))}
  </select>
)}

</div>


 {/* 月選択 */}
 <div>
 <label htmlFor="monthSelect" className="block text-gray-700 mb-2">
 月で絞り込み
 </label>
 <input
 id="monthSelect"
 type="month"
 value={filters.dateFrom?.slice(0, 7) || ''}
 onChange={(e) => {
 const [y, m] = e.target.value.split('-');
 const dateFrom = `${y}-${m}-01`;
 const dateTo = new Date(y, m, 0).toISOString().split('T')[0];
 const next = { ...filters, dateFrom, dateTo };
 setFilters(next);
 setReportsPage(1);
 fetchReports(1, {
 ...next,
 ...(next.dateFrom && { date_from: next.dateFrom }),
 ...(next.dateTo && { date_to: next.dateTo }),
 });
 }}
 className="w-full px-3 py-2 border border-gray-300 rounded focus:outline -none focus:ring-2 focus:ring-blue-400"
 aria-label="月選択フィルタ"
 />
 </div>

 {/* 投稿日（開始） */}
 <div>
 <label htmlFor="dateFrom" className="block text-gray-700 mb-2">
 投稿日（開始）
 </label>
 <input
 id="dateFrom"
 name="dateFrom"
 type="date"
 value={filters.dateFrom}
 onChange={(e) => {
 const next = { ...filters, dateFrom: e.target.value };
 setFilters(next);
 setReportsPage(1);
 fetchReports(1, {
 ...next,
 ...(next.dateFrom && { date_from: next.dateFrom }),
 ...(next.dateTo && { date_to: next.dateTo }),
 });
 }}
 className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
 />
 </div>

 {/* 投稿日（終了） */}
 <div>
 <label htmlFor="dateTo" className="block text-gray-700 mb-2">
 投稿日（終了）
 </label>
 <input
 id="dateTo"
 name="dateTo"
 type="date"
 value={filters.dateTo}
 onChange={(e) => {
 const next = { ...filters, dateTo: e.target.value };
 setFilters(next);
 setReportsPage(1);
 fetchReports(1, {
 ...next,
 ...(next.dateFrom && { date_from: next.dateFrom }),
 ...(next.dateTo && { date_to: next.dateTo }),
 });
 }}
 className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
 />
 </div>
 </div>

 {/* タイトル検索 */}
 <div className="mt-4">
 <label htmlFor="search" className="block text-gray-700 mb-1">タイトル検索</label>
 <div className="flex">
 <input
 id="search"
 type="text"
 value={filters.search}
 onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
 onKeyDown={(e) => {
 if (e.key === 'Enter') {
 setReportsPage(1);
 fetchReports(1, filters);
 }
 }}
 className="flex-1 px-3 py-2 border border-gray-300 rounded-l focus:outline-none focus:ring-2 focus:ring-blue-400"
 placeholder="タイトルを入力"
 />
 </div>
 </div>

 {/* ボタン群 */}
 <div className="mt-4 flex space-x-4">
 <button
 onClick={() => {
 const reset = {
 category: '',
 status: '',
 area: '',
 dateFrom: '',
 dateTo: '',
 search: '',
 };
 setFilters(reset);
 setReportsPage(1);
 fetchReports(1, reset);
 }}
 className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
 >
 フィルタをリセット
 </button>
 <button
 onClick={() => {
 setReportsPage(1);
 fetchReports(1, filters);
 }}
 className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
 >
 検索
 </button>
 </div>
 </>
 )}
 </div>
 ) : null}

 {/* 割り当て済みレポート */}
 {currentSection === 'assignments' ? (
 <div>
 <h2 className="text-2xl font-semibold mb-4">割り当て済みレポート</h2>
 {assignmentsLoading && assignmentsPage === 1 ? (
 <div className="text-center">読み込み中...</div>
 ) : assignments.length > 0 ? (
 <>
 <table className="w-full bg-white shadow rounded overflow-hidden">
 <thead>
 <tr className="bg-gray-100">
 <th scope="col" className="px-4 py-2 font-semibold text-gray-700 text-left">ID</th>
 <th scope="col" className="px-4 py-2 font-semibold text-gray-700 text-left">レポートタイトル</th>
 <th scope="col" className="px-4 py-2 font-semibold text-gray-700 text-left">ステータス</th>
 <th scope="col" className="px-4 py-2 font-semibold text-gray-700 text-left">作成日</th>
 <th scope="col" className="px-4 py-2 font-semibold text-gray-700 text-left">詳細</th>
 </tr>
 </thead>
 <tbody>
 {assignments.map((assignment) => (
 <tr key={`${assignment.report_id}-${assignment.company_id}`} className="border-t">
 <td className="px-4 py-2">{assignment.report_id}</td>
 <td className="px-4 py-2">{assignment.title || '-'}</td>
 <td className="px-4 py-2">
 <span
 className={
 assignment.status === 'new'
 ? 'status-new text-blue-500'
 : assignment.status === 'resolved'
 ? 'status-resolved text-green-500'
 : assignment.status === 'ignored'
 ? 'status-ignored text-gray-500'
 : 'status-shared text-purple-500'
 }
 >
 {STATUS_LABELS[assignment.status] || '不明'}
 </span>
 </td>
 <td className="px-4 py-2">{assignment.created_at ? new Date(assignment.created_at).toLocaleDateString() : '-'}</td>
 <td className="px-4 py-2">
 <button
 onClick={() => openReportModal({ ...assignment, id: assignment.report_id })}
 className="text-blue-500 hover:underline"
 aria-label={`レポート ${assignment.title || 'ID ' + assignment.report_id} の詳細を表示`}
 >
 詳細
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 <div className="mt-4 flex justify-between items-center">
 <button
 onClick={() => handleAssignmentsPageChange(assignmentsPage - 1)}
 disabled={assignmentsPage === 1}
 className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-300"
 >
 前へ
 </button>
 <span>ページ {assignmentsPage} / {assignmentsTotalPages}</span>
 <button
 onClick={() => handleAssignmentsPageChange(assignmentsPage + 1)}
 disabled={assignmentsPage === assignmentsTotalPages}
 className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-300"
 >
 次へ
 </button>
 </div>
 </>
 ) : (
 <p className="text-gray-600">割り当て済みレポートがありません</p>
 )}
 </div>
 ) : null}

 {['reportList', 'handleReports'].includes(currentSection) ? (
 <div>
 <h2 className="text-2xl font-semibold mb-4">
 レポート{currentSection === 'reportList' ? '一覧' : '対応'}
 </h2>
 <table className="w-full bg-white shadow rounded overflow-hidden">
 <thead>
 <tr className="bg-gray-100">
 <th className="px-4 py-2 text-left">ID</th>
 <th className="px-4 py-2 text-left">タイトル</th>
 <th className="px-4 py-2 text-left">ステータス</th>
 <th className="px-4 py-2 text-left">作成日</th>
 <th className="px-4 py-2 text-left">住所</th>
 <th className="px-4 py-2 text-left">詳細/チャット</th>
 </tr>
 </thead>
 <tbody>
 {displayedReports.map((report, rowIdx) => {
 const p = report.properties || report;
 console.log(
 `[row ${rowIdx}] id=${p.id}`,
 'address=',
 p.address,
 'coords=',
 p.geometry?.coordinates
 );
 return (
 <tr key={p.id} className="border-t">
 <td className="px-4 py-2">{p.id}</td>
 <td className="px-4 py-2">{p.title}</td>
 <td className="px-4 py-2">
 <span
 className={
 p.status === 'new'
 ? 'text-blue-500'
 : p.status === 'resolved'
 ? 'text-green-500'
 : p.status === 'ignored'
 ? 'text-gray-500'
 : 'text-purple-500'
 }
 >
 {STATUS_LABELS[p.status] || '不明'}
 </span>
 </td>
 <td className="px-4 py-2">
 {p.created_at ? new Date(p.created_at).toLocaleDateString() : '-'} 
 </td>
 <td className="px-4 py-2">
 {p.geometry?.coordinates?.length === 2 ? (
 <button
 type="button"
 className="text-blue-600 hover:underline"
 onClick={() => {
 const [lng, lat] = p.geometry.coordinates;
 console.log('📍 click coords', { id: p.id, lng, lat });
 if (isNaN(lat) || isNaN(lng) || lat === null || lng === null) {
 toast.error('このレポートには座標がありません');
 return;
 }
 setFocusCoords([lat, lng]);
 setFocusReportId(p.id);
 setMapTab('pin');
 setCurrentSection('mapView');
 }}
 >
 {p.address || '位置を表示'}
 </button>
 ) : (
 '—'
 )}
 </td>
 <td className="px-4 py-2">
 <button
 onClick={() => openReportModal(report)}
 className="text-blue-500 hover:underline"
 >
 詳細
 </button>
 </td>
 </tr>
 );
 })}
 </tbody>
 </table>
 <div className="mt-4 flex justify-between items-center">
 <button
 onClick={() =>
 handleReportsPageChange(
 currentSection === 'reportList' ? reportsPage - 1 : assignmentsPage - 1
 )
 }
 disabled={
 (currentSection === 'reportList' ? reportsPage : assignmentsPage) === 1
 }
 className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-300"
 >
 前へ
 </button>
 <span>
 ページ{' '}
 {currentSection === 'reportList' ? reportsPage : assignmentsPage} /{' '}
 {currentSection === 'reportList'
 ? displayedTotalPages
 : assignmentsTotalPages}
 </span>
 <button
 onClick={() =>
 handleReportsPageChange(
 currentSection === 'reportList' ? reportsPage + 1 : assignmentsPage + 1
 )
 }
 disabled={
 (currentSection === 'reportList' ? reportsPage : assignmentsPage) ===
 (currentSection === 'reportList'
 ? displayedTotalPages
 : assignmentsTotalPages)
 }
 className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-gray-300"
 >
 次へ
 </button>
 </div>
 </div>
 ) : null}

 {currentSection === 'mapView' ? (
 <div>
 <h2 className="text-2xl font-semibold mb-4">マップ表示</h2>
 <div className="mb-4 flex space-x-4">
 <button
 onClick={() => setMapTab('pin')}
 className={`px-4 py-2 rounded ${
 mapTab === 'pin' ? 'bg-blue-500 text-white' : 'bg-gray-300'
 }`}
 >
 ピン表示
 </button>
 <button
 onClick={() => setMapTab('heatmap')}
 className={`px-4 py-2 rounded ${
 mapTab === 'heatmap' ? 'bg-blue-500 text-white' : 'bg-gray-300'
 }`}
 >
 ヒートマップ表示
 </button>
 </div>
 {profileError && (
 <div className="mb-4 text-red-500">
 エリアデータの読み込みに失敗しました。マップにエリアが表示されません。
 <button
 onClick={fetchAreas}
 className="ml-2 text-blue-500 hover:underline"
 aria-label="エリアの再読み込み"
 >
 再試行
 </button>
 </div>
 )}
 <div id="map-view" className="map-container h-[600px] w-full"></div>
 </div>
 ) : null}

 {currentSection === 'categoryManagement' ? (
 <div>
 <h2 className="text-2xl font-semibold mb-4">カテゴリ管理</h2>
 <button
 onClick={() => setIsCategoryModalOpen(true)}
 className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 mb-4"
 >
 新規カテゴリ追加
 </button>
 {categories.length > 0 ? (
 <table className="w-full bg-white shadow rounded overflow-hidden">
 <thead>
 <tr className="bg-gray-100">
 <th scope="col" className="px-4 py-2 font-semibold text-gray-700 text-left">ID</th>
 <th scope="col" className="px-4 py-2 font-semibold text-gray-700 text-left">カテゴリ名</th>
 <th scope="col" className="px-4 py-2 font-semibold text-gray-700 text-left">操作</th>
 </tr>
 </thead>
 <tbody>
 {(Array.isArray(categories) ? categories : []).map((category) => (
 <tr key={category.id} className="border-t">
 <td className="px-4 py-2">{category.id}</td>
 <td className="px-4 py-2">{category.name}</td>
 <td className="px-4 py-2">
 <button
 onClick={() => {
 const newName = prompt('新しいカテゴリ名を入力:', category.name);
 if (newName && newName.trim()) updateCategory(category.id, newName);
 }}
 className="text-blue-500 hover:underline"
 aria-label={`カテゴリ ${category.name} を編集`}
 >
 編集
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 ) : (
 <p className="text-gray-600">カテゴリが登録されていません</p>
 )}
 </div>
 ) : null}

 {currentSection === 'areaManagement' ? (
 <div>
 <h2 className="text-2xl font-semibold mb-4">エリア管理</h2>
 {selectedCities.length > 0 && (
 <div className="mb-4 flex flex-wrap gap-2">
 {selectedCities.map((name) => (
 <span
 key={name}
 className="inline-flex items-center bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-sm"
 >
 {name}
 <button
 onClick={() => toggleCity(name)}
 className="ml-1 text-blue-500 hover:text-blue-700"
 >
 ×
 </button>
 </span>
 ))}
 </div>
 )}
 <div className="flex space-x-4 mb-4">
 <select
 className="border rounded px-3 py-2"
 value={selectedPref}
 onChange={(e) => {
 const pref = e.target.value;
 setSelectedPref(pref);
 setSearchCity('');
 const cities = regions.find((r) => r.name === pref)?.cities || [];
 const allChecked = cities.every((c) => selectedCities.includes(c));
 const next = allChecked
 ? selectedCities.filter((c) => !cities.includes(c))
 : [...new Set([...selectedCities, ...cities])];
 updateCities(next);
 }}
 >
 <option value="">都道府県を選択</option>
 {regions.map((r) => (
 <option key={r.name} value={r.name}>
 {r.name}
 </option>
 ))}
 </select>
 {selectedPref && (
 <input
 className="flex-1 border rounded px-3 py-2"
 placeholder="市区町村を絞り込み"
 value={searchCity}
 onChange={(e) => setSearchCity(e.target.value)}
 />
 )}
 </div>
 <div className="max-h-[60vh] overflow-y-auto border rounded p-2">
 {regions
 .filter((r) => !selectedPref || r.name === selectedPref)
 .map((pref) => {
 const cities = pref.cities;
 const allChecked = cities.every((c) => selectedCities.includes(c));
 return (
 <Disclosure key={pref.name} as="div" className="mb-2">
 {({ open }) => (
 <>
 <Disclosure.Button className="flex w-full justify-between items-center px-4 py-2 bg-gray-100 rounded">
 <label className="flex items-center space-x-2">
 <input
 type="checkbox"
 checked={allChecked}
 onChange={() => {
 const next = allChecked
 ? selectedCities.filter((c) => !cities.includes(c))
 : [...new Set([...selectedCities, ...cities])];
 updateCities(next);
 }}
 className="form-checkbox h-4 w-4 text-blue-600"
 />
 <span className="font-medium">{pref.name}</span>
 </label>
 {open ? <ChevronUpIcon className="w-5 h-5" /> : <ChevronDownIcon className="w-5 h-5" />}
 </Disclosure.Button>
 <Disclosure.Panel className="px-4 pt-2 pb-4">
 <div className="grid grid-cols-3 gap-2">
 {cities
 .filter((city) => city.includes(searchCity))
 .map((city) => (
 <label key={city} className="flex items-center space-x-2">
 <input
 type="checkbox"
 checked={selectedCities.includes(city)}
 onChange={() => toggleCity(city)}
 className="form-checkbox h-4 w-4 text-blue-600"
 />
 <span className="text-sm">{city}</span>
 </label>
 ))}
 </div>
 </Disclosure.Panel>
 </>
 )}
 </Disclosure>
 );
 })}
 </div>
 </div>
 ) : null}

 {selectedReport && (
 <ReportModal
 isOpen={isModalOpen}
 onClose={() => setIsModalOpen(false)}
 report={selectedReport}
 user={user}
 />
 )}

 <Transition appear show={isCategoryModalOpen} as={Fragment}>
 <Dialog as="div" className="relative z-50" onClose={() => setIsCategoryModalOpen(false)}>
 <Transition.Child
 as={Fragment}
 enter="ease-out duration-300"
 enterFrom="opacity-0"
 enterTo="opacity-100"
 leave="ease-in duration-200"
 leaveFrom="opacity-100"
 leaveTo="opacity-0"
 >
 <div className="fixed inset-0 bg-black bg-opacity-50" />
 </Transition.Child>
 <div className="fixed inset-0 overflow-y-auto">
 <div className="flex min-h-full items-center justify-center p-4 text-center">
 <Transition.Child
 as={Fragment}
 enter="ease-out duration-300"
 enterFrom="opacity-0 scale-95"
 enterTo="opacity-100 scale-100"
 leave="ease-in duration-200"
 sells="opacity-100 scale-100"
 leaveTo="opacity-0 scale-95"
 >
 <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
 <Dialog.Title as="h3" className="text-lg font-medium g-6 text-gray-900">
 新規カテゴリ追加
 </Dialog.Title>
 <div className="mt-4">
 <label htmlFor="newCategory" className="block text-gray-700 mb-2">
 カテゴリ名
 </label>
 <input
 id="newCategory"
 type="text"
 value={newCategory}
 onChange={(e) => setNewCategory(e.target.value)}
 className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
 aria-label="新しいカテゴリ名"
 />
 </div>
 <div className="mt-4 flex space-x-4">
 <button
 onClick={handleAddCategory}
 className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
 >
 追加
 </button>
 <button
 onClick={() => setIsCategoryModalOpen(false)}
 className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
 >
 キャンセル
 </button>
 </div>
 </Dialog.Panel>
 </Transition.Child>
 </div>
 </div>
 </Dialog>
 </Transition>

 <ToastContainer
 position="top-right"
 autoClose={3000}
 hideProgressBar={false}
 newestOnTop={false}
 closeOnClick
 rtl={false}
 pauseOnFocusLoss
 draggable
 pauseOnHover
 />
 </div>
 </div>
 </ErrorBoundary>
 );
}

function ReportModal({ isOpen, onClose, report, user }) {
 const { messages, newMessage, setNewMessage, setMessages } = useChat(report .id, isOpen);
 const [activeTab, setActiveTab] = useState('details');
 const [imageFile, setImageFile] = useState(null);
 const messagesEndRef = useRef(null);

 // ReportModal 内の handleSendMessage 関数
 const handleSendMessage = async () => {
 if (!newMessage.trim() && !imageFile) {
 toast.error('メッセージまたは画像を入力してください');
 return;
 }
 const token = localStorage.getItem('token');
 if (!token) {
 toast.error('認証トークンが見つかりません');
 return;
 }

 const chatUrl = `${API_BASE}/api/company/chats/${report.id}/messages`;
 console.log('[DEBUG] Chat send URL:', chatUrl);
 console.log('[DEBUG] Chat payload:', { text: newMessage, file: imageFile });

 const optimisticMessage = {
 id: Date.now(),
 text: newMessage.trim() || null,
 image: imageFile ? URL.createObjectURL(imageFile) : null,
 sender_id: user.id,
 created_at: new Date().toISOString(),
 };
 setMessages((prev) => [...prev, optimisticMessage]);

 const formData = new FormData();
 formData.append('text', newMessage.trim());
 if (imageFile) formData.append('file', imageFile);

 try {
 const res = await fetch(chatUrl, {
 method: 'POST',
 headers: { Authorization: `Bearer ${token}` },
 body: formData,
 });

 console.log('[DEBUG] Chat response status:', res.status, res.statusText);
 const raw = await res.clone().text();
 console.log('[DEBUG] Chat response body:', raw);

 if (!res.ok) {
 const err = await res.json().catch(() => ({}));
 throw new Error(err.detail || 'メッセージ送信に失敗しました');
 }

 toast.success('メッセージを送信しました');
 setNewMessage('');
 setImageFile(null);
 } catch (error) {
 console.error('メッセージ送信エラー:', error);
 toast.error(error.message || 'メッセージの送信に失敗しました');
 setMessages((prev) =>
 prev.filter((msg) => msg.created_at !== optimisticMessage.created_at)
 );
 }
 };

 // 新着メッセージにスクロール
 useEffect(() => {
 messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
 }, [messages]);

 return (
 <Transition appear show={isOpen} as={Fragment}>
 <Dialog as="div" className="relative z-50" onClose={onClose}>
 <Transition.Child
 as={Fragment}
 enter="ease-out duration-300"
 enterFrom="opacity-0"
 enterTo="opacity-100"
 leave="ease-in duration-200"
 leaveFrom="opacity-100"
 leaveTo="opacity-0"
 >
 <div className="fixed inset-0 bg-black bg-opacity-50" />
 </Transition.Child>
 <div className="fixed inset-0 overflow-y-auto">
 <div className="flex min-h-full items-center justify-center p-4 text-center">
 <Transition.Child
 as={Fragment}
 enter="ease-out duration-300"
 enterFrom="opacity-0 scale-95"
 enterTo="opacity-100 scale-100"
 leave="ease-in duration-200"
 leaveFrom="opacity-100 scale-100"
 leaveTo="opacity-0 scale-95"
 >
 <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
 <Dialog.Title as="h3" className="text-lg font-medium leading-6 text-gray-900">
 レポート: {report.title}
 </Dialog.Title>
 <div className="mt-2">
 <div className="flex border-b">
 <button
 className={`px-4 py-2 ${
 activeTab === 'details' ? 'border-b-2 border-blue-500' : 'text-gray-600'
 }`}
 onClick={() => setActiveTab('details')}
 >
 詳細
 </button>
 <button
 className={`px-4 py-2 ${
 activeTab === 'chat' ? 'border-b-2 border-blue-500' : 'text-gray-600'
 }`}
 onClick={() => setActiveTab('chat')}
 >
 チャット
 </button>
 <button
 className={`px-4 py-2 ${
 activeTab === 'images' ? 'border-b-2 border-blue-500' : 'text-gray-600'
 }`}
 onClick={() => setActiveTab('images')}
 >
 画像
 </button>
 </div>
 {activeTab === 'details' && (
 <div className="mt-4 space-y-2">
 <p>
 <strong>説明:</strong> {report.description}
 </p>
 <p>
 <strong>住所:</strong> {report.address}
 </p>
 <p>
 <strong>カテゴリ:</strong> {CATEGORY_LABELS[report.category] || report.category}
 </p>
 <p>
 <strong>ステータス:</strong>{' '}
 <span className={`status-${report.status}`}>
 {STATUS_LABELS[report.status] || '不明'}
 </span>
 </p>
 <p>
 <strong>投稿者:</strong> {report.user?.name ?? '不明'}
 </p>
 <p>
 <strong>作成日:</strong> {new Date(report.created_at).toLocaleDateString()}
 </p>
 </div>
 )}
 {activeTab === 'chat' && (
 <div className="mt-4 flex flex-col h-96 bg-gray-50 rounded-lg">
 <div className="flex-1 overflow-y-auto p-4 space-y-4">
 {Array.isArray(messages) && messages.length > 0 ? (
 messages.map((msg, index) => {
 const isMine = msg.sender === user.id || msg.sender_id === user.id;
 const content = msg.text || '';
 const hasImage = !!msg.image;
 const createdAt = msg.created_at;

 if (!content && !hasImage) return null;

 return (
 <div
 key={msg.id || index}
 className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-2`}
 >
 <div
 className={`max-w-xs px-4 py-2 rounded-2xl shadow text-sm ${
 isMine ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-800'
 }`}
 >
 {content && <p>{content}</p>}
 {hasImage && (
 <img
 src={msg.image}
 alt="画像メッセージ"
 className="mt-2 w-40 h-auto rounded"
 onError={(e) =>
 console.warn(`画像読み込みエラー: ${msg.image}`)
 }
 />
 )}
 <p className="text-xs mt-1 text-right opacity-70">
 {new Date(new Date(createdAt).getTime() + 9 * 60 * 60 * 1000).toLocaleTimeString(
 [],
 {
 hour: '2-digit',
 minute: '2-digit',
 }
 )}
 </p>
 </div>
 </div>
 );
 })
 ) : (
 <p className="text-gray-600 text-center">メッセージがありません</p>
 )}
 <div ref={messagesEndRef} />
 </div>
 <div className="p-4 border-t bg-white flex items-center">
 <input
 type="file"
 accept="image/*"
 onChange={(e) => setImageFile(e.target.files[0])}
 className="mr-2"
 aria-label="画像ファイルを選択"
 />
 <input
 type="text"
 value={newMessage}
 onChange={(e) => setNewMessage(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter') {
 e.preventDefault();
 handleSendMessage();
 }
 }}
 className="flex-1 px-3 py-2 border rounded-l-lg focus:ring-2 focus:ring-blue-500"
 placeholder="メッセージを入力..."
 aria-label="チャットメッセージ入力"
 />
 <button
 onClick={handleSendMessage}
 className="bg-blue-500 text-white px-4 py-2 rounded-r-lg hover:bg-blue-600 transition-colors"
 aria-label="メッセージを送信"
 >
 送信
 </button>
 </div>
 </div>
 )}
 {activeTab === 'images' && (
 <div className="mt-4 grid grid-cols-3 gap-4">
 {report.image_paths && report.image_paths.length > 0 ? (
 report.image_paths.map((path, index) => (
 <img
 key={index}
 src={path}
 alt={`レポート画像 ${index + 1}`}
 className="w-full h-32 object-cover rounded"
 />
 ))
 ) : (
 <p className="text-gray-600">画像がありません</p>
 )}
 </div>
 )}
 </div>
 <div className="mt-4">
 <button
 type="button"
 className="inline-flex justify-center rounded-md border border-transparent bg-blue-100 px-4 py-2 text-sm font-medium text-blue-900 hover:bg-blue-200"
 onClick={onClose}
 >
 閉じる
 </button>
 </div>
 </Dialog.Panel>
 </Transition.Child>
 </div>
 </div>
 </Dialog>
 </Transition>
 );
}

export default CompanyDashboard;