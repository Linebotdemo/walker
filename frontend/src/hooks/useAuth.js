// src/hooks/useAuth.js
import { useMemo } from 'react';
import { jwtDecode } from 'jwt-decode';

export function useAuth() {
  const token = localStorage.getItem('token');
  const user = useMemo(() => {
    if (!token) return null;
    try {
      return jwtDecode(token);
    } catch {
      return null;
    }
  }, [token]);
  return { user };
}
