import React, { createContext, useContext, useState, useEffect } from 'react';

// AuthContext の作成
const AuthContext = createContext();

// AuthProvider コンポーネント
export const AuthProvider = ({ children }) => {
  // 認証状態を管理するステート
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // トークンの初期化とユーザー情報の取得
  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          // トークンを使って現在のユーザー情報を取得
          const userData = await fetchUser(token);
          setUser(userData);
        } catch (err) {
          console.error('Failed to fetch user on initialization:', err);
          localStorage.removeItem('token'); // 無効なトークンを削除
          setUser(null);
        }
      }
      setLoading(false);
    };

    initializeAuth();
  }, []);

  // ログイン関数
  const login = async (email, password) => {
    setError(null); // エラーをリセット
    try {
      const response = await fetch('http://localhost:8000/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      // レスポンスが正常でない場合のエラーハンドリング
      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 401) {
          throw new Error('Invalid credentials'); // 認証情報が無効
        } else if (response.status === 500) {
          throw new Error(errorData.detail || 'Server error occurred'); // サーバーエラー
        } else {
          throw new Error(errorData.detail || 'An unexpected error occurred'); // その他のエラー
        }
      }

      const data = await response.json();
      const token = data.token;

      // トークンをローカルストレージに保存
      localStorage.setItem('token', token);

      // ユーザー情報を取得
      const userData = await fetchUser(token);
      setUser(userData);
      return userData;
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message);
      throw err; // エラーを再スローして、呼び出し元で処理可能にする
    }
  };

  // ログアウト関数
  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setError(null);
  };

  // 現在のユーザー情報を取得する関数
  const fetchUser = async (token) => {
    try {
      const response = await fetch('http://localhost:8000/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        if (response.status === 401) {
          throw new Error('Unauthorized: Invalid or expired token');
        } else {
          throw new Error(errorData.detail || 'Failed to fetch user');
        }
      }

      const userData = await response.json();
      return userData;
    } catch (err) {
      console.error('Fetch user error:', err);
      throw err;
    }
  };

  // コンテキストの値
  const value = {
    user,
    loading,
    error,
    login,
    logout,
    fetchUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// カスタムフック
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};