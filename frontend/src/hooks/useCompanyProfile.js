// src/hooks/useCompanyProfile.js
import { useState, useEffect, useRef } from 'react';
const API_BASE = import.meta.env.VITE_API_BASE;

export function useCompanyProfile() {
  const [areas, setAreas]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const warned404 = useRef(false);

  const fetchAreas = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/company/areas`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.status === 404) {
        // エンドポイント が無い場合は一度だけ警告してフォールバック
        if (!warned404.current) {
          console.warn('Company areas endpoint not found (404)');
          warned404.current = true;
        }
        setAreas([]);
        return;
      }

      if (!res.ok) {
        throw new Error(`${res.status} ${res.statusText}`);
      }

      const data = await res.json();
      setAreas(data);
    } catch (err) {
      // 通信エラーや500などはこちらへ
      if (err instanceof Error) {
        setError(err);
      } else {
        setError(new Error('Unknown error'));
      }
      setAreas([]);
    } finally {
      setLoading(false);
    }
  };

  const updateAreas = async (newAreas) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/api/company/areas`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ areas: newAreas }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      await fetchAreas();
    } catch (err) {
      if (err instanceof Error) {
        setError(err);
      }
    }
  };

  useEffect(() => {
    fetchAreas();
    // StrictMode の二重呼び出しでも fetchAreas は問題ないはずです
  }, []);

  return {
    areas,
    loading,
    error,
    fetchAreas,
    updateAreas,
  };
}
