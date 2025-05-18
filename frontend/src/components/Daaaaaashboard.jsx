// src/components/Dashboard.jsx
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import ReportList from './ReportList';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
  const [reports, setReports] = useState([]);
  const [formData, setFormData] = useState({
    description: '',
    category: '',
    address: '',
    images: [],
  });
  const mapContainer = useRef(null);
  const map = useRef(null);
  const navigate = useNavigate();

  // ページリロード時にログアウト
  useEffect(() => {
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  }, [navigate]);

  // 初期データ取得
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      return;
    }

    const fetchReports = async () => {
      try {
        const response = await axios.get('http://localhost:8000/api/reports', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setReports(response.data.features || []);
      } catch (err) {
        console.error('レポート取得エラー:', err);
        localStorage.removeItem('token');
        navigate('/login');
      }
    };

    fetchReports();
  }, [navigate]);

  // 地図初期化
  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://api.maptiler.com/maps/streets/style.json?key=YOUR_MAPTILER_API_KEY',
      center: [139.6917, 35.6895],
      zoom: 10,
    });

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      map.current.addSource('reports', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: reports,
        },
      });

      map.current.addLayer({
        id: 'reports-layer',
        type: 'circle',
        source: 'reports',
        paint: {
          'circle-radius': 8,
          'circle-color': '#007cbf',
        },
      });
    });

    return () => map.current?.remove();
  }, [reports]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const data = new FormData();
    data.append('description', formData.description);
    data.append('category', formData.category);
    data.append('address', formData.address);
    formData.images.forEach((image) => data.append('images', image));

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post('http://localhost:8000/api/reports', data, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setReports([...reports, response.data]);
      setFormData({ description: '', category: '', address: '', images: [] });
      alert('レポートが投稿されました');
    } catch (err) {
      console.error('レポート投稿エラー:', err);
      alert('レポート投稿に失敗しました');
    }
  };

  const handleImageChange = (e) => {
    setFormData({ ...formData, images: Array.from(e.target.files) });
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-4">ダッシュボード</h1>
      <div className="mb-6">
        <h2 className="text-xl mb-2">レポート投稿</h2>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
          <input
            type="text"
            placeholder="説明"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="p-2 border rounded"
            required
          />
          <input
            type="text"
            placeholder="カテゴリ"
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
            className="p-2 border rounded"
            required
          />
          <input
            type="text"
            placeholder="住所"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="p-2 border rounded"
            required
          />
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageChange}
            className="p-2 border rounded"
          />
          <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded col-span-2">
            投稿
          </button>
        </form>
      </div>
      <div className="mb-6">
        <h2 className="text-xl mb-2">レポートマップ</h2>
        <div ref={mapContainer} className="map-container" style={{ height: '400px' }} />
      </div>
      <ReportList reports={reports} />
    </div>
  );
}

export default Dashboard;