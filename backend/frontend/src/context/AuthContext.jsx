// src/context/AuthContext.jsx

import React, { createContext, useContext, useState, useEffect } from 'react';

// 環境変数 VITE_API_URL がセットされていればそれを、
// されていなければ相対パス（''）で API を叩く
const API_URL = import.meta.env.VITE_API_URL ?? '';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // ローカルストレージからトークンを読んで /auth/me でユーザー情報を初期化
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const userData = await fetchUser(token);
          setUser(userData);
        } catch (err) {
          console.error('initializeAuth: invalid token, removing', err);
          localStorage.removeItem('token');
          setUser(null);
        }
      }
      setLoading(false);
    };
    initializeAuth();
  }, []);

  // fetch /auth/me
  const fetchUser = async (token) => {
    const res = await fetch(`${API_URL}/auth/me`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type':  'application/json',
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) throw new Error('Unauthorized: invalid or expired token');
      throw new Error(err.detail || 'Failed to fetch user');
    }
    return res.json();
  };

  // login: POST /auth/login
  const login = async (email, password) => {
    setError(null);
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new Error('Invalid credentials');
      } else {
        throw new Error(err.detail || `Login failed (${res.status})`);
      }
    }
    const { token } = await res.json();
    localStorage.setItem('token', token);

    // トークン取得後にユーザー情報をフェッチ
    const userData = await fetchUser(token);
    setUser(userData);
    return userData;
  };

  // logout
  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
};

// カスタムフック
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within <AuthProvider>');
  }
  return ctx;
};
