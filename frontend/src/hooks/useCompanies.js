// src/hooks/useCompanies.js
import { useState, useEffect, useCallback } from 'react';

export function useCompanies() {
  const [companies, setCompanies] = useState([]);

  const fetchCompanies = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE}/api/company/linked_companies`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('企業リストの取得に失敗しました');
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('useCompanies error:', err);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  return { companies, fetchCompanies };
}
