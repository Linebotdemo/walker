import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

function ChatBox({ reportId, onClose }) {
  const [chatId, setChatId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const ws = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchChat();
    return () => {
      if (ws.current) ws.current.close();
    };
  }, []);

  useEffect(() => {
    if (chatId) {
      ws.current = new WebSocket(
        `ws://${import.meta.env.VITE_API_BASE.replace('http://', '')}/ws/chats/${chatId}?token=${localStorage.getItem('token')}`
      );
      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.error) {
          toast.error(data.error);
          return;
        }
        setMessages((prev) => [...prev, { text: data.text, sender: data.sender, created_at: data.created_at }]);
      };
      ws.current.onclose = () => toast.info('チャット接続が終了しました');
      ws.current.onerror = () => toast.error('チャット接続に失敗しました');
    }
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchChat = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/company/chats?reportId=${reportId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      const data = await res.json();
      if (data.chatId) {
        setChatId(data.chatId);
        const msgRes = await fetch(`${import.meta.env.VITE_API_BASE}/api/company/chats/${data.chatId}/messages`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const msgData = await msgRes.json();
        setMessages(msgData.map((m) => ({ text: m.message, sender: m.sender_id, created_at: m.created_at })));
      } else {
        const createRes = await fetch(`${import.meta.env.VITE_API_BASE}/api/company/chats`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
          body: JSON.stringify({ reportId }),
        });
        const createData = await createRes.json();
        setChatId(createData.chatId);
      }
    } catch (error) {
      console.error('Chat fetch error:', error);
      toast.error('チャットの取得に失敗しました');
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim()) return;
    try {
      await fetch(`${import.meta.env.VITE_API_BASE}/api/company/chats/${chatId}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ message: newMessage }),
      });
      setNewMessage('');
    } catch (error) {
      console.error('Message send error:', error);
      toast.error('メッセージの送信に失敗しました');
    }
  };

  return (
    <div className="modal-overlay">
      <div className="bg-white p-4 rounded shadow-lg w-96 h-96 flex flex-col">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-semibold">チャット (レポート #{reportId})</h3>
          <button onClick={onClose} className="text-red-500 hover:underline">
            閉じる
          </button>
        </div>
        <div className="flex-1 overflow-y-auto mb-2">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`mb-2 ${msg.sender === 'me' ? 'text-right' : 'text-left'}`}
            >
              <span
                className={`inline-block p-2 rounded ${msg.sender === 'me' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
              >
                {msg.text}
              </span>
              <div className="text-xs text-gray-500">{new Date(msg.created_at).toLocaleTimeString()}</div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            className="flex-1 px-3 py-2 border rounded-l"
            disabled={!chatId}
          />
          <button
            onClick={handleSend}
            className="bg-blue-500 text-white px-4 py-2 rounded-r hover:bg-blue-600"
            disabled={!chatId}
          >
            送信
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatBox;