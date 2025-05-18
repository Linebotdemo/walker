// src/hooks/useCompanyReports.js
import { useState } from 'react';

/**
 * GeoJSON / フラットオブジェクトを
 * f.geometry.coordinates = [lng, lat] 形式に正規化するヘルパ
 */
const normalizeFeatures = (features = []) =>
  features.map((f) => {
    const p = f.properties ?? f;
    const hasGeo =
      f.geometry &&
      Array.isArray(f.geometry.coordinates) &&
      f.geometry.coordinates.length === 2 &&
      !isNaN(f.geometry.coordinates[0]);
    if (!hasGeo) {
      const lat = p.lat ?? p.latitude ?? null;
      const lng = p.lng ?? p.lon ?? null;
      if (lat != null && lng != null && !isNaN(lat)) {
        f.geometry = { type: 'Point', coordinates: [Number(lng), Number(lat)] };
      }
    }
    if (!p.geometry && f.geometry) p.geometry = f.geometry;
    return f;
  });

export function useCompanyReports() {
  const [reports, setReports] = useState([]);
  const [filters, setFilters] = useState({
    category: '', status: '', area: '', dateFrom: '', dateTo: '', search: ''
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [categoriesInReports, setCategoriesInReports] = useState([]);

  const fetchReports = async (pageNum = 1, filterParams = filters) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const params = new URLSearchParams(
        Object.entries({ ...filterParams, page: pageNum }).filter(([, v]) => v !== '')
      );
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE}/api/company/reports?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('レポートの取得に失敗しました');
      const data = await res.json();
      const norm = normalizeFeatures(data.features || []);
      setReports(norm);
      setPage(pageNum);
      setTotalPages(data.total_pages || 1);
      setCategoriesInReports([...new Set(norm.map(r => (r.properties ?? r).category).filter(Boolean))]);
    } catch (err) {
      console.error('レポート取得エラー:', err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  return {
    reports, filters, setFilters, loading,
    page, setPage, totalPages, fetchReports, categoriesInReports
  };
}
