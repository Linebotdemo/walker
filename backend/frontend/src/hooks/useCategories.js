import { useState } from 'react';

export function useCategories() {
  const [categories, setCategories] = useState([
    { id: 1, name: 'pothole' },
    { id: 2, name: 'graffiti' },
    { id: 3, name: 'litter' },
    { id: 4, name: 'other' },
  ]);

  const addCategory = (name) => {
    const newCategory = {
      id: Date.now(),
      name,
    };
    setCategories((prev) => [...prev, newCategory]);
    // TODO: 必要に応じてAPIにPOST
  };

  const updateCategory = (id, newName) => {
    setCategories((prev) =>
      prev.map((cat) => (cat.id === id ? { ...cat, name: newName } : cat))
    );
    // TODO: 必要に応じてAPIにPATCH
  };

  return { categories, addCategory, updateCategory };
}
