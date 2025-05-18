import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useChat } from '../hooks/useChat';
import 'leaflet.markercluster';
import CATEGORY_LABELS from '../constants/categoryLabels';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import * as LMarkerCluster from 'leaflet.markercluster';
import Sidebar from '../components/Sidebar.jsx';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { ChatBubbleLeftIcon, StarIcon, BellIcon } from '@heroicons/react/24/solid';
import io from 'socket.io-client';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import moment from 'moment';
import { debounce } from 'lodash';

// Leafletのマーカーアイコン設定
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

// 既存レポート用のカスタムアイコン（青いマーカー）
const reportIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  className: 'report-marker',
});

const STATUS_LABELS = {
  new:        '新規',
  responding: '対応中',
  resolved:   '解決済み',
  confirmed:  '解決確認',
  ignored:    '対応不要',
  completed:  '完了',
};

function Dashboard() {
  const { user } = useAuth();
  const [reports, setReports] = useState([]);
  const [filteredReports, setFilteredReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newReport, setNewReport] = useState({
    id: null,
    title: '',
    description: '',
    prefecture: '',
    city: '',
    addressLine1: '',
    addressLine2: '',
    latitude: '',
    longitude: '',
    files: [],
    category: '',
  });
  const [map, setMap] = useState(null);
  const [marker, setMarker] = useState(null);
  const [reportMarkers, setReportMarkers] = useState(null);
  const [currentSection, setCurrentSection] = useState('reportList');
  const [isEditing, setIsEditing] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [rating, setRating] = useState(0);
  const [filters, setFilters] = useState({
    category: '',
    dateFrom: '',
    dateTo: '',
    area: '',
    search: '',
  });
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [locationFetched, setLocationFetched] = useState(false);
  const markerRef = useRef(null); // マーカーインスタンスを保持

 // ─── ここからチャットまわり ───
 const {
   messages: chatMessages,
   newMessage: chatNewMessage,
   setNewMessage: setChatNewMessage,
   imageFile,
   setImageFile,
   setMessages: setChatMessages,
   bottomRef,
 } = useChat(selectedReport?.id, isModalOpen);

 const handleSendMessage = async () => {
   if (!chatNewMessage.trim() && !imageFile) {
     return toast.error('メッセージまたは画像を入力してください');
   }
   const token = localStorage.getItem('token');
   if (!token) return toast.error('ログインしてください');

   // 楽観更新
   const optimistic = {
     id: Date.now(),
     text: chatNewMessage.trim() || null,
     image: imageFile ? URL.createObjectURL(imageFile) : null,
     sender: user.id,
     created_at: new Date().toISOString(),
   };
   setChatMessages(prev => [...prev, optimistic]);

   const form = new FormData();
   form.append('text', chatNewMessage.trim());
   if (imageFile) form.append('file', imageFile);

   try {
     const res = await fetch(
       `${import.meta.env.VITE_API_BASE}/api/city/chats/${selectedReport.id}/messages`,
       {
         method: 'POST',
         headers: { Authorization: `Bearer ${token}` },
         body: form,
       }
     );
     if (!res.ok) throw new Error(await res.text());
     toast.success('メッセージを送信しました');
     setChatNewMessage('');
     setImageFile(null);
   } catch (err) {
     console.error(err);
     // ロールバック
     setChatMessages(prev => prev.filter(m => m.id !== optimistic.id));
     toast.error('送信に失敗しました');
   }
 };
 // ──────────────────────────────

  // データ取得とマップ初期化
  useEffect(() => {
    if (currentSection === 'reportList' || currentSection === 'myReports') {
      fetchReports();
    } else if (currentSection === 'calendarView') {
      fetchReports();
    } else if (currentSection === 'createReport') {
      if (!map || !map._container || map._container.id !== 'map-create') {
        initializeMap('map-create');
      }
    } else if (currentSection === 'mapView') {
      if (!map || map._container.id !== 'map-view') {
        initializeMap('map-view', true);
      }
    }
    fetchNotifications();
  }, [currentSection]);

  // 編集モードまたは現在地のピン設定
  useEffect(() => {
    if (currentSection !== 'createReport' || !map) return;

    if (isEditing && newReport.latitude && newReport.longitude) {
      const lat = parseFloat(newReport.latitude);
      const lng = parseFloat(newReport.longitude);
      map.setView([lat, lng], 13);
      updateMarker(lat, lng);
    } else {
      getCurrentLocation();
      setLocationFetched(true);
    }
  }, [map, currentSection, isEditing, locationFetched]);

  // ジオコーディングを必要最小限に抑える useEffect
  useEffect(() => {
    const { prefecture, city, addressLine1 } = newReport;

    if (!prefecture || !city || !addressLine1) return;

    const fullAddress = `${prefecture} ${city} ${addressLine1}`;
    const timer = setTimeout(() => {
      console.log('📍 ジオコーディング実行:', fullAddress);
      geocodeAddress(fullAddress, ({ lat, lng }) => {
        if (
          lat.toString() !== newReport.latitude ||
          lng.toString() !== newReport.longitude
        ) {
          setNewReport((prev) => ({
            ...prev,
            latitude: lat.toString(),
            longitude: lng.toString(),
          }));
          updateMarker(lat, lng);
        }
      });
    }, 700);

    return () => clearTimeout(timer);
  }, [newReport.prefecture, newReport.city, newReport.addressLine1]);

  const fetchReports = async () => {
    setLoading(true);
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        throw new Error('localStorage is not available');
      }

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token is missing. Please log in.');
      }

      const apiBase = import.meta.env.VITE_API_BASE;
      if (!apiBase) {
        throw new Error('VITE_API_BASE environment variable is not defined');
      }

      const endpoint = currentSection === 'myReports' ? '/reports?user_id=me' : '/reports';
      const url = `${apiBase}${endpoint}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch reports: ${res.status} ${errorText}`);
      }

      const data = await res.json();
const reportData = Array.isArray(data.features)
  ? data.features.map((f) => ({
      ...f.properties,
      latitude: f.geometry?.coordinates?.[1] || '',
      longitude: f.geometry?.coordinates?.[0] || '',
    }))
  : Array.isArray(data)
  ? data
  : data.results || [];

const validReports = reportData.filter((report, index) => {
  if (!report.id) {
    console.warn(`Report at index ${index} is missing id:`, report);
    return false;
  }
  return true;
});


      // idの重複チェック
      const idSet = new Set(validReports.map((r) => r.id));
      if (idSet.size !== validReports.length) {
        console.warn('Duplicate report IDs detected:', validReports);
      }

      console.log('Fetched reports:', validReports); // デバッグログ
      setReports(validReports);
      setFilteredReports(validReports);
      updateReportMarkers(validReports);

      const unread = {};
      for (const report of validReports) {
        const messagesRes = await fetch(`${apiBase}/reports/${report.id}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!messagesRes.ok) {
          console.warn(`⚠️ メッセージ取得失敗: report.id=${report.id}, status=${messagesRes.status}`);
          continue;
        }
        const messages = await messagesRes.json();
        const unreadCount = messages.filter(
          (msg) => new Date(msg.created_at) > new Date(report.last_viewed_at || 0)
        ).length;
        unread[report.id] = unreadCount;
      }
      setUnreadCounts(unread);
    } catch (error) {
      console.error('Error fetching reports:', error.message, error.stack);
      toast.error(error.message || 'レポートの取得に失敗しました');
      setReports([]);
      setFilteredReports([]);
      setReportMarkers(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        throw new Error('localStorage is not available');
      }

      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token is missing. Please log in.');
      }

      const apiBase = import.meta.env.VITE_API_BASE;
      if (!apiBase) {
        throw new Error('VITE_API_BASE environment variable is not defined');
      }

      const res = await fetch(`${apiBase}/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch notifications: ${res.status} ${errorText}`);
      }
      const data = await res.json();
      setNotifications(data);
    } catch (error) {
      console.error('Error fetching notifications:', error.message, error.stack);
      toast.error(error.message || '通知の取得に失敗しました');
    }
  };

const initializeMap = (mapId = 'map-create', isMapView = false) => {
  console.log('🗺️ initializeMap start for:', mapId, ' existing map?', !!map);

  if (map) {
    console.log(' → removing existing map');
    map.remove();
    setMap(null);
  }

  const attemptInitialize = () => {
    const el = document.getElementById(mapId);
    console.log('  attemptInitialize, container:', el);
    if (!el) {
      console.warn(`Map container "${mapId}" not found, retry...`);
      setTimeout(attemptInitialize, 100);
      return;
    }

    const mapInstance = L.map(mapId).setView([35.6895, 139.6917], isMapView ? 9 : 13);
    console.log('  L.map created:', mapInstance);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(mapInstance);

    // デバッグ: 地図が「レンダリング完了」したタイミング
    mapInstance.whenReady(() => {
      console.log(`  mapInstance.whenReady for "${mapId}" → size=`, mapInstance.getSize());
    });

    if (!isMapView) {
      mapInstance.on('click', (e) => {
        console.log('  map click at', e.latlng);
        updateMarkerAndAddress(e.latlng.lat, e.latlng.lng, mapInstance);
      });
    }

    const markers = L.markerClusterGroup();
    setReportMarkers(markers);
    mapInstance.addLayer(markers);
    setMap(mapInstance);
    console.log('  initializeMap done for:', mapId);
  };

  attemptInitialize();
};


  const updateReportMarkers = (reports) => {
    if (!reportMarkers) return;

    reportMarkers.clearLayers();
    (Array.isArray(reports) ? reports : [])
      .filter((report) => report.latitude && report.longitude && report.id)
      .forEach((report) => {
        const marker = L.marker([report.latitude, report.longitude], { icon: reportIcon }).bindPopup(
          `<b>${report.title}</b><br>住所: ${report.address || '不明'}`
        );
        reportMarkers.addLayer(marker);
      });
  };

  const getCurrentLocation = async () => {
    if (!navigator.geolocation) {
      toast.error('お使いのブラウザは位置情報をサポートしていません');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        console.log('📍 現在地取得:', latitude, longitude);

        if (map) {
          updateMarker(latitude, longitude);
          map.setView([latitude, longitude], 13);
        }

        try {
          const response = await fetch(
            `${import.meta.env.VITE_API_BASE}/geocode?lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();
          if (data.Feature && data.Feature[0]) {
            const address = data.Feature[0].Property.AddressElement;
            setNewReport((prev) => ({
              ...prev,
              prefecture: address.find((e) => e.Level === 'prefecture')?.Name || '',
              city: address.find((e) => e.Level === 'city')?.Name || '',
              addressLine1: address.find((e) => e.Level === 'oaza')?.Name || '',
              addressLine2: address.find((e) => e.Level === 'chome')?.Name || '',
              latitude: latitude.toString(),
              longitude: longitude.toString(),
            }));
            console.log('📍 住所＋座標をセット完了');
          }
        } catch (error) {
          console.error('住所の取得に失敗:', error);
          toast.error('住所の取得に失敗しました');
        }
      },
      (error) => {
        console.error('位置情報エラー:', error);
        toast.warn('位置情報の取得を許可してください');
      }
    );
  };

  const updateMarker = (lat, lng, targetMap = map) => {
    if (!targetMap) {
      console.warn('Map is not initialized yet.');
      return;
    }

    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
    }

    const newMarker = L.marker([parseFloat(lat), parseFloat(lng)]).addTo(targetMap);
    markerRef.current = newMarker;
    setMarker(newMarker);
  };

  const updateMarkerAndAddress = async (lat, lng, targetMap = map) => {
    console.log('🛠️ updateMarkerAndAddress 呼び出し:', lat, lng);
    updateMarker(lat, lng, targetMap);
    targetMap.setView([parseFloat(lat), parseFloat(lng)], 13);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE}/geocode?lat=${lat}&lon=${lng}`
      );
      const data = await response.json();
      if (data.Feature && data.Feature[0]) {
        const address = data.Feature[0].Property.AddressElement;
        setNewReport((prev) => ({
          ...prev,
          prefecture: address.find((e) => e.Level === 'prefecture')?.Name || '',
          city: address.find((e) => e.Level === 'city')?.Name || '',
          addressLine1: address.find((e) => e.Level === 'oaza')?.Name || '',
          addressLine2: address.find((e) => e.Level === 'chome')?.Name || '',
          latitude: lat.toString(),
          longitude: lng.toString(),
        }));
        console.log('📍 住所＋座標をセット完了');
      } else {
        setNewReport((prev) => ({
          ...prev,
          latitude: lat.toString(),
          longitude: lng.toString(),
        }));
        console.warn('📭 ジオコーディング結果なし（座標のみ保存）');
      }
    } catch (error) {
      console.error('Error fetching address:', error);
      toast.error('住所の取得に失敗しました（座標は保存されます）');
      setNewReport((prev) => ({
        ...prev,
        latitude: lat.toString(),
        longitude: lng.toString(),
      }));
    }
  };

  const geocodeAddress = debounce(async (fullAddress, callback) => {
    if (!fullAddress) return;
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_BASE}/geocode?query=${encodeURIComponent(fullAddress)}`
      );
      const data = await response.json();
      if (data.Feature && data.Feature[0]) {
        const coords = data.Feature[0].Geometry.Coordinates.split(',');
        const lat = parseFloat(coords[1]);
        const lng = parseFloat(coords[0]);
        callback({ lat, lng });
      } else {
        throw new Error('ジオコーディング結果なし');
      }
    } catch (error) {
      console.error('Error geocoding address:', error);
      toast.error('住所から位置を特定できませんでした');
    }
  }, 500);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const updatedReport = { ...newReport, [name]: value };
    setNewReport(updatedReport);
  };

  const handleImageChange = (e) => {
    const files = Array.from(e.target.files);
    setNewReport((prev) => ({ ...prev, files }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    console.log('========== Debugging Submit ==========');
    console.log('newReport:', newReport);
    console.log('======================================');

    const errors = [];
    if (!newReport.title) errors.push('タイトルを入力してください');
    if (!newReport.description) errors.push('説明を入力してください');
    if (!newReport.prefecture) errors.push('都道府県を入力してください');
    if (!newReport.city) errors.push('市区町村を入力してください');
    if (!newReport.addressLine1) errors.push('番地を入力してください');
    if (!newReport.category) errors.push('カテゴリを選択してください');
    if (
      !newReport.latitude ||
      !newReport.longitude ||
      isNaN(parseFloat(newReport.latitude)) ||
      isNaN(parseFloat(newReport.longitude))
    ) {
      errors.push('位置情報が正しく設定されていません');
    }

    if (errors.length > 0) {
      errors.forEach((error) => toast.error(error));
      return;
    }

    const formData = new FormData();
    formData.append('title', newReport.title);
    formData.append('description', newReport.description);
    formData.append('lat', newReport.latitude);
    formData.append('lng', newReport.longitude);
    formData.append('category', newReport.category);
    formData.append(
      'address',
      `${newReport.prefecture}${newReport.city}${newReport.addressLine1}${newReport.addressLine2}`.trim()
    );
    newReport.files.forEach((file) => {
      formData.append('files', file);
    });

    try {
      const token = localStorage.getItem('token');
      const apiBase = import.meta.env.VITE_API_BASE;
      const url = isEditing ? `${apiBase}/reports/${newReport.id}` : `${apiBase}/reports`;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(`Failed to ${isEditing ? 'update' : 'create'} report: ${JSON.stringify(err)}`);
      }

      const data = await res.json();
      toast.success(`レポートを${isEditing ? '更新' : '作成'}しました`);

      setNewReport({
        id: null,
        title: '',
        description: '',
        prefecture: '',
        city: '',
        addressLine1: '',
        addressLine2: '',
        latitude: '',
        longitude: '',
        files: [],
        category: '',
      });
      setIsEditing(false);
      setLocationFetched(false);
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
        setMarker(null);
      }
initializeMap('map-create');
    } catch (error) {
      console.error(`Error ${isEditing ? 'updating' : 'creating'} report:`, error);
      toast.error(error.message || `レポートの${isEditing ? '更新' : '作成'}に失敗しました`);
    }
  };

  const handleEdit = async (report) => {
    if (report.user_id !== user.id) {
      toast.error('自分のレポートのみ編集可能です');
      return;
    }

    const addressParts = (report.address || '').split(' ');
    const [prefecture, city, addressLine1, addressLine2] = [
      addressParts[0] || '',
      addressParts[1] || '',
      addressParts[2] || '',
      addressParts.slice(3).join(' ') || '',
    ];

    setNewReport({
      id: report.id,
      title: report.title,
      description: report.description,
      prefecture,
      city,
      addressLine1,
      addressLine2,
      latitude: report.latitude?.toString() || '',
      longitude: report.longitude?.toString() || '',
      files: [],
      category: report.category || '',
    });

    setIsEditing(true);
    await fetchReports();
    setCurrentSection('reportList');
  };

  const handleDelete = async (id) => {
    const report = reports.find((r) => r.id === id);
    if (report.user_id !== user.id) {
      toast.error('自分のレポートのみ削除可能です');
      return;
    }
    if (!confirm('このレポートを削除しますか？')) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token is missing. Please log in.');
      }

      const res = await fetch(`${import.meta.env.VITE_API_BASE}/reports/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to delete report: ${errorText}`);
      }
      toast.success('レポートを削除しました');
      fetchReports();
    } catch (error) {
      console.error('Error deleting report:', error);
      toast.error(error.message || 'レポートの削除に失敗しました');
    }
  };
const handleCancelEdit = () => {
    setNewReport({
      id: null,
      title: '',
      description: '',
      prefecture: '',
      city: '',
      addressLine1: '',
      addressLine2: '',
      latitude: '',
      longitude: '',
      files: [],
      category: '',
    });
    setIsEditing(false);
    if (markerRef.current) {
      markerRef.current.remove();
      markerRef.current = null;
      setMarker(null);
    }
  };


  const handleStatusChange = async (reportId, status) => {
    const report = reports.find((r) => r.id === reportId);
    if (report.user_id !== user.id) {
      toast.error('自分のレポートのみステータス変更可能です');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token is missing. Please log in.');
      }

      const res = await fetch(`${import.meta.env.VITE_API_BASE}/reports/${reportId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to update status: ${errorText}`);
      }
      toast.success('ステータスを更新しました');
      fetchReports();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error(error.message || 'ステータスの更新に失敗しました');
    }
  };  // ← handleStatusChange の終わり
// Dashboard.jsx 内の openReportModal をこのコードに置き換えてください
const openReportModal = async (report, initialTab = 'details') => {
  // ── 1) モーダル準備 ──
  setSelectedReport(report);
  setActiveTab(initialTab);
  setIsModalOpen(true);
  setRating(0);

  try {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('ログインしてください');

    // ── 2) Chat ID の取得 or 作成 ──
    let chatId;
    if (user.user_type === 'city') {
      console.log('→ 市ユーザー: chatId を取得/作成');
      // GET /api/city/chats?reportId=報告ID
      const listRes = await fetch(
        `${API_BASE}/api/city/chats?reportId=${report.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!listRes.ok) {
        const err = await listRes.text();
        console.error('→ 市チャット取得エラー:', listRes.status, err);
        throw new Error(err);
      }
      const { chat_id } = await listRes.json();
      chatId = chat_id;
    } else {
      // 会社/市民ユーザーの chatId 取得ロジック（既存コードを流用）
      console.log('→ 会社ユーザー: chatId を取得/作成');
      const listRes = await fetch(
        `${API_BASE}/api/company/chats?reportId=${report.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!listRes.ok) {
        const err = await listRes.text();
        console.error('→ 会社チャット取得エラー:', listRes.status, err);
        throw new Error(err);
      }
      const listJson = await listRes.json();
      chatId = listJson.chatId;
      if (!chatId) {
        // Chat がなければ POST で新規作成
        const createRes = await fetch(
          `${API_BASE}/api/company/chats`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ reportId: report.id })
          }
        );
        if (!createRes.ok) {
          const err = await createRes.text();
          console.error('→ 会社チャット作成エラー:', createRes.status, err);
          throw new Error(err);
        }
        const createJson = await createRes.json();
        chatId = createJson.chatId;
      }
    }

    // ── 3) メッセージ一覧を取得 ──
    console.log(`→ chat fetch URL: ${API_BASE}/${user.user_type === 'city' ? 'api/city' : 'api/company'}/chats/${chatId}/messages`);
    const msgRes = await fetch(
      user.user_type === 'city'
        ? `${API_BASE}/api/city/chats/${chatId}/messages`
        : `${API_BASE}/api/company/chats/${chatId}/messages`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log('→ msgRes.status=', msgRes.status);
    if (!msgRes.ok) {
      const raw = await msgRes.text();
      console.error('→ raw body:', raw);
      throw new Error(raw);
    }
    const raw = await msgRes.json();

    // ── 4) 正規化して state にセット ──
    const normalized = raw.map((m) => ({
      id:         m.id,
      text:       m.text || '',
      image:      m.image
                     ? m.image.startsWith('http')
                       ? m.image
                       : `${API_BASE}${m.image}`
                     : null,
      sender:     m.user_id ?? m.sender,
      created_at: m.created_at,
    }));
    console.log('→ normalized messages:', normalized);
    setChatMessages(normalized);

    // ── 5) 未読リセット＆スクロール ──
    setUnreadCounts((u) => ({ ...u, [report.id]: 0 }));
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

  } catch (err) {
    console.error('❌ Error fetching messages:', err);
    toast.error(err.message || 'チャットの取得に失敗しました');
  }
};








  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token is missing. Please log in.');
      }

      const res = await fetch(`${import.meta.env.VITE_API_BASE}/reports/${selectedReport.id}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: newMessage }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to send message: ${errorText}`);
      }
      const message = await res.json();
      setMessages((prev) => [...prev, message]);
      socketRef.current.emit('message', message);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      toast.error(error.message || 'メッセージの送信に失敗しました');
    }
  };

  const submitRating = async () => {
    if (rating < 1 || rating > 5) {
      toast.error('1〜5の評価を選択してください');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token is missing. Please log in.');
      }

      const res = await fetch(`${import.meta.env.VITE_API_BASE}/reports/${selectedReport.id}/rating`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ rating }),
      });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to submit rating: ${errorText}`);
      }
      const updatedReport = await res.json();
      setSelectedReport(updatedReport);
      toast.success('評価を送信しました');
      fetchReports();
    } catch (error) {
      console.error('Error submitting rating:', error);
      toast.error(error.message || '評価の送信に失敗しました');
    }
  };

  const markNotificationsAsRead = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Authentication token is missing. Please log in.');
      }

      const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
      if (unreadIds.length === 0) return;
      await fetch(`${import.meta.env.VITE_API_BASE}/notifications/read`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notification_ids: unreadIds }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      toast.error(error.message || '通知の既読処理に失敗しました');
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    applyFilters({ ...filters, [name]: value });
  };

  const applyFilters = (currentFilters) => {
    let result = [...reports];
    if (currentFilters.category) {
      result = result.filter((r) => r.category === currentFilters.category);
    }
    if (currentFilters.dateFrom) {
      result = result.filter((r) => new Date(r.created_at) >= new Date(currentFilters.dateFrom));
    }
    if (currentFilters.dateTo) {
      result = result.filter((r) => new Date(r.created_at) <= new Date(currentFilters.dateTo));
    }
    if (currentFilters.area) {
      result = result.filter((r) => r.address.includes(currentFilters.area));
    }
    if (currentFilters.search) {
      result = result.filter((r) => r.title.toLowerCase().includes(currentFilters.search.toLowerCase()));
    }
    setFilteredReports(result);
    updateReportMarkers(result);
  };

  const handleCalendarClick = (date) => {
    setCalendarDate(date);
    setFilteredReports(
      reports.filter((r) => moment(r.created_at).isSame(date, 'day'))
    );
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        userType={
          user?.type === 'general'
            ? 'normal'
            : user?.type === 'admin'
            ? 'admin'
            : user?.type === 'city'
            ? 'city'
            : user?.type === 'company'
            ? 'company'
            : 'normal'
        }
        onSectionChange={setCurrentSection}
      />
      <div className="flex-1 p-6 bg-gray-100 relative">
        {/* 通知アイコン */}
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={() => {
              setIsNotificationsOpen(true);
              markNotificationsAsRead();
            }}
            className="relative text-gray-600 hover:text-gray-800"
          >
            <BellIcon className="h-6 w-6" />
            {notifications.filter((n) => !n.read).length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                {notifications.filter((n) => !n.read).length}
              </span>
            )}
          </button>
        </div>

        {currentSection === 'createReport' && (
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">{isEditing ? 'レポート編集' : '新規レポート作成'}</h2>
            <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-lg">
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">タイトル</label>
                <input
                  type="text"
                  name="title"
                  value={newReport.title}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">説明</label>
                <textarea
                  name="description"
                  value={newReport.description}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">カテゴリ</label>
<select
  name="category"
  value={newReport.category}
  onChange={handleInputChange}
  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
  required
>
  <option value="">選択してください</option>
  <optgroup label="市の管轄">
    <option value="road">道路（市管轄）</option>
    <option value="sidewalk">歩道（市管轄）</option>
    <option value="traffic_light">信号（市管轄）</option>
    <option value="sign">標識（市管轄）</option>
    <option value="streetlight">街灯（市管轄）</option>
    <option value="park">公園（市管轄）</option>
    <option value="garbage">不法投棄・清掃（市管轄）</option>
    <option value="water">側溝・水路（市管轄）</option>
    <option value="tree">街路樹・雑草（市管轄）</option>
    <option value="other">その他</option>
  </optgroup>
</select>

              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">画像（複数選択可）</label>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageChange}
                  className="w-full px-3 py-2 border rounded"
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">都道府県</label>
                <input
                  type="text"
                  name="prefecture"
                  value={newReport.prefecture}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">市区町村</label>
                <input
                  type="text"
                  name="city"
                  value={newReport.city}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">番地</label>
                <input
                  type="text"
                  name="addressLine1"
                  value={newReport.addressLine1}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">その他（建物名など）</label>
                <input
                  type="text"
                  name="addressLine2"
                  value={newReport.addressLine2}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">地図上で位置を選択してください</label>
                <div id="map-create" className="map-container w-full" style={{ height: '400px' }}></div>
              </div>
              <div className="flex space-x-4">
                <button
                  type="submit"
                  className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                >
                  {isEditing ? '更新' : '作成'}
                </button>
                {isEditing && (
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                  >
                    キャンセル
                  </button>
                )}
              </div>
            </form>
          </div>
        )}

{(currentSection === 'reportList' || currentSection === 'myReports') && (
  <div>
    <h2 className="text-2xl font-semibold mb-4">
      {currentSection === 'myReports' ? 'マイレポート' : 'レポート一覧'}
    </h2>

    {/* フィルター部 */}
    <div className="mb-4 bg-white p-6 rounded-lg shadow-lg">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
<label className="block text-gray-700 mb-2">カテゴリ</label>
<select
  name="category"
  value={filters.category}
  onChange={handleFilterChange}
  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
>
  <option value="">すべて</option>
  <optgroup label="市の管轄">
    <option value="road">道路（市管轄）</option>
    <option value="sidewalk">歩道（市管轄）</option>
    <option value="traffic_light">信号（市管轄）</option>
    <option value="sign">標識（市管轄）</option>
    <option value="streetlight">街灯（市管轄）</option>
    <option value="park">公園（市管轄）</option>
    <option value="garbage">不法投棄・清掃（市管轄）</option>
    <option value="water">側溝・水路（市管轄）</option>
    <option value="tree">街路樹・雑草（市管轄）</option>
    <option value="other">その他</option>
  </optgroup>
</select>

        </div>
        <div>
          <label className="block text-gray-700 mb-2">投稿日（開始）</label>
          <input
            type="date"
            name="dateFrom"
            value={filters.dateFrom}
            onChange={handleFilterChange}
            className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-gray-700 mb-2">投稿日（終了）</label>
          <input
            type="date"
            name="dateTo"
            value={filters.dateTo}
            onChange={handleFilterChange}
            className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-gray-700 mb-2">エリア</label>
          <input
            type="text"
            name="area"
            value={filters.area}
            onChange={handleFilterChange}
            className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            placeholder="例: 東京都"
          />
        </div>
        <div>
          <label className="block text-gray-700 mb-2">タイトル検索</label>
          <input
            type="text"
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
            placeholder="タイトルを入力"
          />
        </div>
      </div>
    </div>

    {/* レポート一覧テーブル */}
    {Array.isArray(filteredReports) && filteredReports.length > 0 ? (
      <table className="w-full bg-white shadow rounded overflow-hidden">
        <thead>
          <tr>
            <th className="bg-gray-100 text-left px-4 py-2 font-semibold text-gray-700">ID</th>
            <th className="bg-gray-100 text-left px-4 py-2 font-semibold text-gray-700">タイトル</th>
            <th className="bg-gray-100 text-left px-4 py-2 font-semibold text-gray-700">説明</th>
            <th className="bg-gray-100 text-left px-4 py-2 font-semibold text-gray-700">カテゴリ</th>
            <th className="bg-gray-100 text-left px-4 py-2 font-semibold text-gray-700">ステータス</th>
            <th className="bg-gray-100 text-left px-4 py-2 font-semibold text-gray-700">作成日</th>
            <th className="bg-gray-100 text-left px-4 py-2 font-semibold text-gray-700">チャット</th>
          </tr>
        </thead>
        <tbody>
          {filteredReports.map((report) => (
            <tr key={report.id}>
              <td className="px-4 py-2 border-t">{report.id}</td>
              <td className="px-4 py-2 border-t">
                {/* クリック不可のただのテキスト */}
                <span className="text-gray-800">{report.title}</span>
              </td>
              <td className="px-4 py-2 border-t">{report.description}</td>
              <td className="px-4 py-2 border-t">
                {CATEGORY_LABELS[report.category] || report.category}
              </td>
              <td className="px-4 py-2 border-t">
 {report.user_id === user.id ? (
   <select
     value={report.status}
     onChange={(e) => handleStatusChange(report.id, e.target.value)}
     className={`px-2 py-1 rounded focus:ring-2 focus:ring-blue-500 status-${report.status}`}
     disabled={report.status !== 'resolved' && report.status !== 'confirmed'}
   >
     {Object.entries(STATUS_LABELS).map(([key, label]) => (
       <option key={key} value={key}>
         {label}
       </option>
     ))}
   </select>
 ) : (
   <span className={`status-${report.status}`}>
     {STATUS_LABELS[report.status] || report.status}
   </span>
 )}
              </td>
              <td className="px-4 py-2 border-t">
                {new Date(report.created_at).toLocaleDateString()}
              </td>
              <td className="px-4 py-2 border-t">
                <button
                  onClick={() => openReportModal(report, 'chat')}
                  className="text-green-500 hover:text-green-700"
                >
                  チャット
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="text-gray-600">レポートがありません</p>
    )}
  </div>
)}


        {currentSection === 'mapView' && (
          <div>
            <h2 className="text-2xl font-semibold mb-4">マップ表示</h2>
            <div id="map-view" className="map-container h-[600px] w-full"></div>
          </div>
        )}

        {currentSection === 'calendarView' && (
          <div>
            <h2 className="text-2xl font-semibold mb-4">カレンダービュー</h2>
            <Calendar
              onChange={handleCalendarClick}
              value={calendarDate}
              tileContent={({ date }) => {
                const reportCount = reports.filter((r) => moment(r.created_at).isSame(date, 'day')).length;
                return reportCount > 0 ? (
                  <div className="text-red-500 text-xs">{reportCount}</div>
                ) : null;
              }}
              className="w-full max-w-2xl mx-auto border rounded-lg"
            />
            <div className="mt-4">
              <h3 className="text-xl font-semibold">
                {moment(calendarDate).format('YYYY年MM月DD日')} のレポート
              </h3>
              {filteredReports.length > 0 ? (
                <ul className="mt-2">
                  {filteredReports.map((report) => (
                    <li key={report.id} className="p-2 border-b">
                      <button
                        onClick={() => openReportModal(report)}
                        className="text-blue-500 hover:underline"
                      >
                        {report.title}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-gray-600">この日のレポートはありません</p>
              )}
            </div>
          </div>
        )}
<Transition appear show={isModalOpen} as={Fragment}>
  <Dialog as="div" className="relative z-50" onClose={() => setIsModalOpen(false)}>
    {/* オーバーレイ */}
    <Transition.Child
      as={Fragment}
      enter="ease-out duration-300"
      enterFrom="opacity-0"
      enterTo="opacity-100"
      leave="ease-in duration-200"
      leaveFrom="opacity-100"
      leaveTo="opacity-0"
    >
      <div className="fixed inset-0 bg-black bg-opacity-50" />
    </Transition.Child>

    {/* モーダル本体 */}
    <div className="fixed inset-0 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4 text-center">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0 scale-95"
          enterTo="opacity-100 scale-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100 scale-100"
          leaveTo="opacity-0 scale-95"
        >
          <Dialog.Panel className="w-full max-w-2xl transform overflow-hidden rounded-2xl bg-white p-6 text-left shadow-xl transition-all">
            {/* タイトル */}
            <Dialog.Title as="h3" className="text-lg font-medium text-gray-900">
              {selectedReport?.title}
            </Dialog.Title>

            {/* タブ切り替え */}
            <div className="mt-4 flex border-b">
              {/* ボタン3つ */}
            </div>

            {/* タブ内容 */}
            <div className="mt-4">
              {activeTab === 'details' && <div>{/* 詳細 */}</div>}
        {activeTab === 'chat' && (
          <div className="mt-4 flex flex-col h-96 bg-gray-50 rounded-lg">
            {/* メッセージ領域 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {chatMessages.length > 0 ? (
                chatMessages.map((msg, i) => {
                  const isMine = msg.sender === user.id;
                  return (
                    <div
                      key={msg.id || i}
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-xs px-4 py-2 rounded-2xl shadow text-sm ${isMine ? 'bg-blue-500 text-white' : 'bg-white text-gray-800'}`}>
                        {msg.text && <p>{msg.text}</p>}
                        {msg.image && (
                          <img
                            src={msg.image}
                            alt=""
                            className="mt-2 w-40 h-auto rounded"
                          />
                        )}
                        <div className="text-xs mt-1 text-right opacity-60">
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-gray-500">メッセージがありません</p>
              )}
              <div ref={bottomRef} />
            </div>

            {/* 入力エリア */}
            <div className="p-4 border-t bg-white flex items-center space-x-2">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setImageFile(e.target.files[0])}
                className="mr-2"
              />
              <input
                type="text"
                value={chatNewMessage}
                onChange={(e) => setChatNewMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="flex-1 px-3 py-2 border rounded-l-lg focus:ring-2 focus:ring-blue-500"
                placeholder="メッセージを入力..."
              />
              <button
                onClick={handleSendMessage}
                className="bg-blue-500 text-white px-4 py-2 rounded-r-lg hover:bg-blue-600"
              >
                送信
              </button>
            </div>
          </div>
        )}
              {activeTab === 'company' && <div>{/* 企業プロフィール */}</div>}
            </div>

            {/* 閉じるボタン */}
            <div className="mt-4 text-right">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
              >
                閉じる
              </button>
            </div>
          </Dialog.Panel>
        </Transition.Child>
      </div>
    </div>
  </Dialog>
</Transition>

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
    </div>
  );
}

export default Dashboard;