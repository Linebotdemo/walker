import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function ReportList() {
  const [reports, setReports] = useState([]);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const { logout } = useAuth();

  useEffect(() => {
    fetchReports();
  }, [page, filter]);

  const fetchReports = async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/reports_geojson`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('レポートの取得に失敗しました');
      const data = await res.json();
      let filtered = data.features;
      if (filter) {
        filtered = filtered.filter(
          (r) =>
            r.properties.status.toLowerCase().includes(filter.toLowerCase()) ||
            r.properties.category.toLowerCase().includes(filter.toLowerCase())
        );
      }
      setReports(filtered.slice((page - 1) * 10, page * 10));
    } catch (error) {
      console.error('Fetch reports error:', error);
      toast.error('レポートの取得に失敗しました');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">レポート一覧</h1>
        <button
          onClick={logout}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          ログアウト
        </button>
      </div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="ステータスまたはカテゴリで検索"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="px-3 py-2 border rounded w-full max-w-md"
        />
      </div>
      <table className="w-full bg-white shadow rounded">
        <thead>
          <tr>
            <th className="p-2">ID</th>
            <th className="p-2">説明</th>
            <th className="p-2">状態</th>
            <th className="p-2">カテゴリ</th>
            <th className="p-2">投稿日</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.properties.id}>
              <td className="p-2">{r.properties.id}</td>
              <td className="p-2">{r.properties.description}</td>
              <td className="p-2">
                <span className={`status-${r.properties.status.toLowerCase()}`}>
                  {r.properties.status}
                </span>
              </td>
              <td className="p-2">{r.properties.category}</td>
              <td className="p-2">
                {new Date(r.properties.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-between">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:bg-blue-300"
          disabled={page === 1}
        >
          前
        </button>
        <span>ページ {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          次
        </button>
      </div>
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

export default ReportList;