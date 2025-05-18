// src/hooks/useCompanyAssignments.js
import { useState } from 'react';

export function useCompanyAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchAssignments = async (pageNum = 1) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE}/api/company/assignments?page=${pageNum}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('割り当てレポートの取得に失敗しました');
      const json = await res.json();
      const list = Array.isArray(json) ? json : json.assignments || [];
      setAssignments(list);
      setTotalPages(json.total_pages || 1);
      setPage(pageNum);
    } catch (err) {
      console.error('useCompanyAssignments error:', err);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  };

  return { assignments, loading, page, setPage, totalPages, fetchAssignments };
}
