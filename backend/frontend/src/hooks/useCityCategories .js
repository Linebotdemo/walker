// src/hooks/useCityCategories.js
import { useState, useEffect } from 'react';
const API = import.meta.env.VITE_API_BASE;

export function useCityCategories() {
  const [cityCats, setCityCats] = useState([]);
  useEffect(() => {
    (async () => {
      const res = await fetch(`${API}/api/city/categories`);
      if (res.ok) setCityCats(await res.json());
    })();
  }, []);
  return cityCats;
}
