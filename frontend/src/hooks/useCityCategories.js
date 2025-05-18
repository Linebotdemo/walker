// src/hooks/useCityCategories.js
import { useState, useEffect } from 'react';
const API_BASE = import.meta.env.VITE_API_BASE;

export function useCityCategories() {
  const [cityCats, setCityCats] = useState([]);
  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_BASE}/api/city/categories`);
      if (res.ok) setCityCats(await res.json());
    })();
  }, []);
  return cityCats;
}
