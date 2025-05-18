import { useState } from 'react';

export function useAssignments() {
  const [assignments, setAssignments] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchAssignments = async (page = 1) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/city/assignments?page=${page}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error('Failed to fetch assignments');

      const json = await res.json();
      const data = Array.isArray(json) ? json : json.assignments || [];

      setAssignments(data);
      setTotalPages(json.total_pages || 1);
      setPage(page);
    } catch (err) {
      console.error('Error fetching assignments:', err);
    } finally {
      setLoading(false);
    }
  };

  return {
    assignments,
    loading,
    page,
    setPage,
    totalPages,
    fetchAssignments,
  };
}
