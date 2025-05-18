import { useState } from 'react';
import { toast } from 'react-toastify';

function ReportForm({ coordinates, onClose, onReportCreated }) {
  const [formData, setFormData] = useState({
    lat: coordinates.lat,
    lng: coordinates.lng,
    description: '',
    category: 'general',
    address: '',
    image: null,
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const form = new FormData();
    form.append('lat', formData.lat);
    form.append('lng', formData.lng);
    form.append('description', formData.description);
    form.append('category', formData.category);
    form.append('address', formData.address);
    form.append('image', formData.image);

    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/report`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: form,
      });
      if (!res.ok) throw new Error('レポートの投稿に失敗しました');
      toast.success('レポートを投稿しました');
      onReportCreated();
    } catch (error) {
      console.error('Report submission error:', error);
      toast.error('レポートの投稿に失敗しました: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="bg-white p-6 rounded shadow-lg w-96">
        <h2 className="text-xl font-semibold mb-4">レポート投稿</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">緯度</label>
            <input
              type="number"
              value={formData.lat}
              readOnly
              className="w-full px-3 py-2 border rounded bg-gray-100"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">経度</label>
            <input
              type="number"
              value={formData.lng}
              readOnly
              className="w-full px-3 py-2 border rounded bg-gray-100"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">カテゴリ</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            >
              <option value="general">一般</option>
              <option value="road">道路</option>
              <option value="sign">標識</option>
              <option value="trash">ゴミ箱</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">説明</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded"
              rows="4"
            />
          </div>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">画像</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFormData({ ...formData, image: e.target.files[0] })}
              className="w-full"
            />
          </div>
          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border rounded hover:bg-gray-100"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-blue-300"
            >
              {loading ? '投稿中...' : '投稿'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ReportForm;