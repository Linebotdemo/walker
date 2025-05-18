// src/components/CityLink.jsx

import React, { useState, useEffect } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAuth } from '../context/AuthContext.jsx';

const API_BASE = import.meta.env.VITE_API_BASE;

export default function CityLink() {
  const { user } = useAuth();              // user.user_type === 'city' であることを想定
  const [orgCode, setOrgCode] = useState('');       // 入力する企業の組織コード（C-XXXXXX）
  const [linkedCompanies, setLinkedCompanies] = useState([]);
  const [loading, setLoading] = useState(false);

  /** 連携済み企業一覧を取得 */
  const fetchLinkedCompanies = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/city/linked_companies`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('連携企業一覧の取得に失敗しました');
      }
      const data = await res.json();
      setLinkedCompanies(data);
    } catch (err) {
      console.error(err);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLinkedCompanies();
  }, []);

  /** 新しい企業と連携 */
  const handleLink = async (e) => {
    e.preventDefault();
    const code = orgCode.trim();
    if (!code) {
      toast.error('企業の組織コードを入力してください (例: C-123ABC)');
      return;
    }

    try {
      console.log('→ 送信する code:', code);
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/city/linked_companies`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || '連携に失敗しました');
      }
      toast.success('企業と連携しました');
      setOrgCode('');
      await fetchLinkedCompanies();
    } catch (err) {
      console.error(err);
      toast.error(err.message);
    }
  };

  /** 指定 ID の連携を解除 */
  const handleUnlink = async (id) => {
    if (!window.confirm('この企業との連携を解除しますか？')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_BASE}/api/city/linked_companies/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || '解除に失敗しました');
      }
      toast.success('連携を解除しました');
      await fetchLinkedCompanies();
    } catch (err) {
      console.error(err);
      toast.error(err.message);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-semibold mb-4">企業連携（市向け）</h2>

      <form onSubmit={handleLink} className="mb-6 flex space-x-2">
        <input
          type="text"
          placeholder="企業の組織コードを入力 (例: C-ABC123)"
          value={orgCode}
          onChange={(e) => setOrgCode(e.target.value)}
          className="flex-1 px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
          aria-label="企業の組織コード入力"
        />
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          連携
        </button>
      </form>

      <h3 className="text-xl font-semibold mb-2">連携済み企業一覧</h3>

      {loading ? (
        <p>読み込み中...</p>
      ) : linkedCompanies.length > 0 ? (
        <ul className="space-y-2">
          {linkedCompanies.map((c) => (
            <li
              key={c.id}
              className="flex justify-between items-center p-3 border rounded"
            >
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-gray-500">コード: {c.code}</p>
              </div>
              <button
                onClick={() => handleUnlink(c.id)}
                className="text-red-500 hover:underline"
                aria-label={`${c.name} との連携を解除`}
              >
                解除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>連携先企業がいません</p>
      )}

      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </div>
  );
}
