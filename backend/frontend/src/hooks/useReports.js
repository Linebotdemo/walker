// hooks/useReports.js
import { useState } from "react";

/* ------------------------------------------------------------
 * features[] を必ず
 *   - f.geometry.coordinates = [lng, lat]
 *   - f.properties が無い API でも p として同じキーで参照可
 * に“正規化”して返すヘルパ
 * ---------------------------------------------------------- */
const normalizeFeatures = (features = []) =>
  features.map((f) => {
    // GeoJSON 形式なら .properties がある、無ければそのまま
    const p = f.properties ?? f;

    /* ---------- geometry 補完 ---------- */
    const hasGeometry =
      f.geometry &&
      Array.isArray(f.geometry.coordinates) &&
      f.geometry.coordinates.length === 2 &&
      !isNaN(f.geometry.coordinates[0]) &&
      !isNaN(f.geometry.coordinates[1]);

    if (!hasGeometry) {
      // フィールド名の揺れを全部吸収
      const lat =
        p.lat ?? p.latitude ?? p.lat_deg ?? p.Latitude ?? p.LAT ?? null;
      const lng =
        p.lng ??
        p.lon ??
        p.longitude ??
        p.long_deg ??
        p.Longitude ??
        p.LON ??
        null;

      if (
        lat !== null &&
        lng !== null &&
        !isNaN(parseFloat(lat)) &&
        !isNaN(parseFloat(lng))
      ) {
        f.geometry = {
          type: "Point",
          coordinates: [Number(lng), Number(lat)],
        };
      }
    }

    // 最低限 p に geometry だけは同期させる
    if (!p.geometry && f.geometry) p.geometry = f.geometry;

    return f; // ※ f 自体を書き換えているので返すのは f
  });

/* ------------------------------------------------------------
 * メイン Hook
 * ---------------------------------------------------------- */
export function useReports() {
  const [reports, setReports] = useState([]);
  const [filters, setFilters] = useState({
    category: "",
    status: "",
    area: "",
    dateFrom: "",
    dateTo: "",
    search: "",
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [categoriesInReports, setCategoriesInReports] = useState([]);

  /* ---------------------------- */
  /* レポート取得                 */
  /* ---------------------------- */
  const fetchReports = async (pageNum = 1, filterParams = filters) => {
    setLoading(true);
    try {
      const token = localStorage.getItem("token");

      // 空文字はクエリに送らない＝API 側で undefined 扱い
      const params = new URLSearchParams(
        Object.fromEntries(
          Object.entries({ ...filterParams, page: pageNum }).filter(
            ([, v]) => v !== ""
          )
        )
      );

      const res = await fetch(
        `${import.meta.env.VITE_API_BASE}/api/city/reports?${params.toString()}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("レポートの取得に失敗しました");

      const data = await res.json();
      console.log("📦 レポートAPIレスポンス:", data);
      console.log("🔍 area フィルター値:", filterParams.area);

      /* ------ ① 正規化してから state へ ------ */
      const normalized = normalizeFeatures(data.features || []);

      setReports(normalized);
      setPage(pageNum);
      setTotalPages(data.total_pages || 1);

      /* ------ ② 一覧に出てきたカテゴリを抽出 ------ */
      const uniqueCategories = [
        ...new Set(
          normalized.map((r) => (r.properties ?? r).category).filter(Boolean)
        ),
      ];
      setCategoriesInReports(uniqueCategories);
    } catch (err) {
      console.error("レポート取得エラー:", err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  /* ---------------------------- */
  /* expose                       */
  /* ---------------------------- */
  return {
    reports,
    filters,
    setFilters,
    loading,
    page,
    setPage,
    totalPages,
    fetchReports,
    categoriesInReports,
  };
}
