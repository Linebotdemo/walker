import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Sidebar from '../components/Sidebar.jsx';

function AdminDashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [organizations, setOrganizations] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgType, setNewOrgType] = useState('company');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserType, setNewUserType] = useState('company');
  const [newUserOrg, setNewUserOrg] = useState('');
  const [currentSection, setCurrentSection] = useState('userManagement');

  useEffect(() => {
    if (['userManagement', 'orgManagement', 'reportManagement'].includes(currentSection)) {
      fetchData();
    }
  }, [currentSection]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('トークンが見つかりません。再度ログインしてください。');
      }
      console.log('Fetching data with API base:', import.meta.env.VITE_API_BASE);

      // Fetch users
      console.log('Fetching users from:', `${import.meta.env.VITE_API_BASE}/admin/users`);
      const usersRes = await fetch(`${import.meta.env.VITE_API_BASE}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!usersRes.ok) {
        console.error('Users fetch failed with status:', usersRes.status, usersRes.statusText);
        throw new Error('Failed to fetch users');
      }
      const usersData = await usersRes.json();
      setUsers(usersData);

      // Fetch organizations
      console.log('Fetching organizations from:', `${import.meta.env.VITE_API_BASE}/admin/organizations`);
      const orgsRes = await fetch(`${import.meta.env.VITE_API_BASE}/api/admin/organizations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!orgsRes.ok) {
        console.error('Organizations fetch failed with status:', orgsRes.status, orgsRes.statusText);
        throw new Error('Failed to fetch organizations');
      }
      const orgsData = await orgsRes.json();
      setOrganizations(orgsData);

      // Fetch reports
      console.log('Fetching reports from:', `${import.meta.env.VITE_API_BASE}/admin/reports`);
      const reportsRes = await fetch(`${import.meta.env.VITE_API_BASE}/api/admin/reports`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!reportsRes.ok) {
        console.error('Reports fetch failed with status:', reportsRes.status, reportsRes.statusText);
        throw new Error('Failed to fetch reports');
      }
      const reportsData = await reportsRes.json();
      setReports(reportsData);
    } catch (error) {
      console.error('Error fetching data:', error.message);
      toast.error(error.message || 'データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrg = async (e) => {
    e.preventDefault()
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('トークンが見つかりません。再度ログインしてください。')
      }
      // API パスは /api/admin/organizations です
      const res = await fetch(
        `${import.meta.env.VITE_API_BASE}/api/admin/organizations`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name: newOrgName, type: newOrgType }),
        }
      )
      if (!res.ok) {
        console.error('Create organization failed with status:', res.status, res.statusText)
        throw new Error('Failed to create organization')
      }
      toast.success('組織を作成しました')
      setNewOrgName('')
      setNewOrgType('company')
      fetchData()
    } catch (error) {
      console.error('Error creating organization:', error.message)
      toast.error(error.message || '組織の作成に失敗しました')
    }
  }

const handleCreateUser = async (e) => {
  e.preventDefault();

  // company/city は org 選択を必須に
  if ((newUserType === 'company' || newUserType === 'city') && !newUserOrg) {
    return toast.error('組織を選択してください');
  }

  try {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('トークンが見つかりません。再度ログインしてください。');

    // ← オブジェクトを閉じる }); を忘れずに！
    const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/admin/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        email: newUserEmail,
        password: newUserPassword,
        user_type: newUserType,
        org_id: parseInt(newUserOrg, 10),
      }),
    });

    // オブジェクトを閉じた後に if
 if (!res.ok) {
   const errBody = await res.json().catch(() => ({}));
   console.error('Create user failed:', res.status, res.statusText, errBody);
   // サーバーからの detail を使う
   throw new Error(errBody.detail || JSON.stringify(errBody) || `Error ${res.status}`);
 }

    toast.success('ユーザーを作成しました');
    // フォームをリセットして再フェッチ
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserType('company');
    setNewUserOrg('');
    fetchData();
  } catch (error) {
    console.error('Error creating user:', error.message);
    toast.error(error.message || 'ユーザーの作成に失敗しました');
  }
};


  const handleDeleteUser = async (userId) => {
    if (!confirm('このユーザーを削除しますか？')) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('トークンが見つかりません。再度ログインしてください。');
      }
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error('Delete user failed with status:', res.status, res.statusText);
        throw new Error('Failed to delete user');
      }
      toast.success('ユーザーを削除しました');
      fetchData();
    } catch (error) {
      console.error('Error deleting user:', error.message);
      toast.error(error.message || 'ユーザーの削除に失敗しました');
    }
  };

  const handleDeleteOrg = async (orgId) => {
    if (!confirm('この組織を削除しますか？')) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('トークンが見つかりません。再度ログインしてください。');
      }
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/admin/organizations/${orgId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error('Delete organization failed with status:', res.status, res.statusText);
        throw new Error('Failed to delete organization');
      }
      toast.success('組織を削除しました');
      fetchData();
    } catch (error) {
      console.error('Error deleting organization:', error.message);
      toast.error(error.message || '組織の削除に失敗しました');
    }
  };

  const handleDeleteReport = async (reportId) => {
    if (!confirm('このレポートを削除しますか？')) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('トークンが見つかりません。再度ログインしてください。');
      }
      const res = await fetch(`${import.meta.env.VITE_API_BASE}/api/admin/reports/${reportId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.error('Delete report failed with status:', res.status, res.statusText);
        throw new Error('Failed to delete report');
      }
      toast.success('レポートを削除しました');
      fetchData();
    } catch (error) {
      console.error('Error deleting report:', error.message);
      toast.error(error.message || 'レポートの削除に失敗しました');
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar userType="admin" onSectionChange={setCurrentSection} />
      <div className="flex-1 p-6 bg-gray-100">
        {currentSection === 'userManagement' && (
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">ユーザー管理</h2>
            <table className="w-full bg-white shadow rounded">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>ユーザー名</th>
                  <th>メール</th>
                  <th>タイプ</th>
                  <th>組織</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td>{u.user_type}</td>
                    <td>{u.org}</td>
                    <td>
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {currentSection === 'createUser' && (
          <div className="mb-8">
            <h3 className="text-xl font-semibold mb-2">新規ユーザー作成</h3>
            <form onSubmit={handleCreateUser} className="bg-white p-4 rounded shadow">
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">メール</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">パスワード</label>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">ユーザータイプ</label>
                <select
                  value={newUserType}
                  onChange={(e) => setNewUserType(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="company">企業</option>
                  <option value="city">市</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">組織</label>
                <select
                  value={newUserOrg}
                  onChange={(e) => setNewUserOrg(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">選択してください</option>
                  {organizations.map((org) => (
                    <option key={org.id} value={org.id}>
                      {org.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                ユーザーを作成
              </button>
            </form>
          </div>
        )}

        {currentSection === 'orgManagement' && (
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">組織管理</h2>
            <table className="w-full bg-white shadow rounded">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>名前</th>
                  <th>タイプ</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td>{org.id}</td>
                    <td>{org.name}</td>
                    <td>{org.type}</td>
                    <td>
                      <button
                        onClick={() => handleDeleteOrg(org.id)}
                        className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {currentSection === 'createOrg' && (
          <div className="mb-8">
            <h3 className="text-xl font-semibold mt-6 mb-2">新規組織作成</h3>
            <form onSubmit={handleCreateOrg} className="bg-white p-4 rounded shadow">
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">組織名</label>
                <input
                  type="text"
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-gray-700 mb-2">組織タイプ</label>
                <select
                  value={newOrgType}
                  onChange={(e) => setNewOrgType(e.target.value)}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="company">企業</option>
                  <option value="city">市</option>
                </select>
              </div>
              <button type="submit" className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">
                組織を作成
              </button>
            </form>
          </div>
        )}

        {currentSection === 'reportManagement' && (
          <div>
            <h2 className="text-2xl font-semibold mb-4">レポート管理</h2>
            <table className="w-full bg-white shadow rounded">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>タイトル</th>
                  <th>ステータス</th>
                  <th>作成日</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.id}>
                    <td>{report.id}</td>
                    <td>{report.title}</td>
                    <td>
                      <span
                        className={
                          report.status === 'new'
                            ? 'status-new'
                            : report.status === 'resolved'
                            ? 'status-resolved'
                            : report.status === 'ignored'
                            ? 'status-ignored'
                            : 'status-shared'
                        }
                      >
                        {report.status}
                      </span>
                    </td>
                    <td>{new Date(report.created_at).toLocaleDateString()}</td>
                    <td>
                      <button
                        onClick={() => handleDeleteReport(report.id)}
                        className="bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

export default AdminDashboard;