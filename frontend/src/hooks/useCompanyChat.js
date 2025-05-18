// src/hooks/useCompanyChat.js
import { useState, useEffect, useRef } from 'react';
import { jwtDecode } from 'jwt-decode';

export function useCompanyChat(reportId, isOpen) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [chatId, setChatId] = useState(null);
  const bottomRef = useRef(null);
  const wsRef     = useRef(null);

  const API_BASE = import.meta.env.VITE_API_BASE;
  const WS_BASE  = import.meta.env.VITE_WS_BASE;

  // reportId 切り替え時のリセット
  useEffect(() => {
    setMessages([]);
    setChatId(null);
  }, [reportId]);

  // チャットID取得 or 新規作成
  useEffect(() => {
    if (!isOpen || !reportId) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`${API_BASE}/api/company/chats?report_id=${reportId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.chat_id) return setChatId(data.chat_id);
        return fetch(`${API_BASE}/api/company/chats`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ report_id: reportId }),
        })
        .then(r => r.json())
        .then(c => setChatId(c.chat_id));
      })
      .catch(e => console.error('chatId取得エラー:', e));
  }, [reportId, isOpen]);

  // 履歴取得
  useEffect(() => {
    if (!chatId || !isOpen) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    fetch(`${API_BASE}/api/company/chats/${chatId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setMessages(data.map(m => ({
            id: m.id,
            text: m.text || null,
            image: m.image?.replace(/\\/g,'/') ?? null,
            sender: m.sender_id || m.user_id,
            created_at: m.created_at,
          })));
        }
      })
      .catch(e => console.error('チャット履歴取得失敗:', e));
  }, [chatId, isOpen]);

  // WebSocket
  useEffect(() => {
    if (!chatId || !isOpen) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const ws = new WebSocket(`${WS_BASE}/ws/company/chats/${chatId}?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = evt => {
      try {
        const p = JSON.parse(evt.data);
        const msg = {
          id: p.id,
          text: p.text || null,
          image: p.image?.replace(/\\/g,'/') ?? null,
          sender: p.sender_id || p.user_id,
          created_at: p.created_at,
        };
        setMessages(prev => prev.some(m => m.id===msg.id) ? prev : [...prev, msg]);
      } catch (e) {
        console.error('WSメッセージパースエラー:', e);
      }
    };

    return () => ws.readyState===WebSocket.OPEN && ws.close();
  }, [chatId, isOpen]);

  // 自動スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 送信
  const sendMessage = async () => {
    if (!newMessage.trim() && !imageFile) return;
    const token = localStorage.getItem('token');
    if (!token) return;

    const form = new FormData();
    form.append('text', newMessage.trim());
    if (imageFile) form.append('file', imageFile);

    // 楽観更新
    const userId = jwtDecode(token).id;
    const optimistic = {
      id: Date.now(),
      text: newMessage.trim() || null,
      image: imageFile ? URL.createObjectURL(imageFile) : null,
      sender: userId,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setNewMessage(''); setImageFile(null);

    try {
      const res = await fetch(
        `${API_BASE}/api/company/chats/${chatId}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        }
      );
      if (!res.ok) throw new Error('メッセージ送信失敗');
    } catch (err) {
      console.error('sendMessage error:', err);
      // ロールバック
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    }
  };

  return {
    messages,
    newMessage,
    setNewMessage,
    imageFile,
    setImageFile,
    sendMessage,
    bottomRef,
  };
}
