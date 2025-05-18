import { useState, useEffect } from 'react';
import { toast } from 'react-toastify';

export const useProfile = (mode = 'city') => {
  const [areas, setAreas] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchAreas = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const basePath = mode === 'company' ? 'company' : 'city';

      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/${basePath}/areas`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(`Failed to fetch areas: ${error.detail || res.status}`);
      }

      const data = await res.json();
      if (!Array.isArray(data)) {
        throw new Error('Unexpected area response: not an array');
      }

      console.log('🎯 fetched areas:', data);
      setAreas(data);

    } catch (error) {
      console.error('Error fetching areas:', error.message);
      toast.error(error.message || 'エリアの取得に失敗しました');
      setAreas([]); // フォールバック
    } finally {
      setLoading(false);
    }
  };

  const updateAreas = (newAreas) => {
    setAreas(newAreas);
  };

  useEffect(() => {
    fetchAreas();
  }, []);

  return { areas, categories, updateAreas, fetchAreas, loading };
};
