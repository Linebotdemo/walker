import { useState, useEffect, useRef } from 'react';

/**
 * チャット機能フック（市・企業共用）
 * @param {number|string} reportId - 対象のレポートID
 * @param {boolean} isOpen - モーダル等が開いているか
 */
export function useChat(reportId, isOpen) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [chatId, setChatId] = useState(null);
  const wsRef = useRef(null);
  const bottomRef = useRef(null); // ✅ 自動スクロール用

  const API_BASE = import.meta.env.VITE_API_BASE;
  const WS_BASE = import.meta.env.VITE_WS_BASE;

  // 🔄 reportIdが切り替わったら初期化
  useEffect(() => {
    setMessages([]);
    setChatId(null);
  }, [reportId]);

  // 🆔 チャットID取得 or 新規作成
  useEffect(() => {
    if (!isOpen || !reportId) return;

    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('❌ トークンがありません');
      return;
    }

    fetch(`${API_BASE}/api/city/chats?report_id=${reportId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.chat_id) {
          setChatId(data.chat_id);
        } else {
          return fetch(`${API_BASE}/api/city/chats`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ report_id: reportId }),
          })
            .then((res) => res.json())
            .then((created) => setChatId(created.chat_id));
        }
      })
      .catch((err) => console.error('❌ chatIdの取得エラー:', err));
  }, [reportId, isOpen]);

  // 📜 チャット履歴取得
  useEffect(() => {
    if (!chatId || !isOpen) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`${API_BASE}/api/city/chats/${chatId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          const formatted = data.map((m) => ({
            id: m.id,
            text: m.text || null,
            image: m.image?.replace(/\\/g, '/') || null, // ✅ パス修正
            sender: m.sender_id || m.user_id,
            created_at: m.created_at,
          }));
          console.log('📜 チャット履歴:', formatted);
          setMessages(formatted);
        }
      })
      .catch((err) => console.error('❌ チャット履歴取得失敗:', err));
  }, [chatId, isOpen]);

  // 📡 WebSocket 接続
  useEffect(() => {
    if (!chatId || !isOpen) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    const ws = new WebSocket(`${WS_BASE}/ws/chats/${chatId}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => console.log('✅ WebSocket 接続確立');

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        const msg = {
          id: parsed.id,
          text: parsed.text || null,
          image: parsed.image?.replace(/\\/g, '/') || null,
          sender: parsed.sender_id || parsed.user_id,
          created_at: parsed.created_at,
        };
        console.log('📥 WebSocket受信:', msg);
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      } catch (err) {
        console.error('❌ WebSocketメッセージパースエラー:', err);
      }
    };

    ws.onerror = (err) => console.error('❌ WebSocket エラー:', err);
    ws.onclose = () => console.warn('🔌 WebSocket 接続が閉じられました');

    return () => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [chatId, isOpen]);

  // ✅ メッセージ更新時に自動スクロール
  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  return {
    messages,
    newMessage,
    setNewMessage,
    imageFile,
    setImageFile,
    setMessages,
    bottomRef, // ✅ 返却しておく
  };
}
