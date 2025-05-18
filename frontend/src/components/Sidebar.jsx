// src/components/Sidebar.jsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';

/**
 * Sidebar.jsx
 * - 会社ユーザーなら企業コード、市ユーザーなら市コード、
 *   それ以外は組織コードを表示
 * - セクション切り替え
 * - ログアウトボタン
 */
function Sidebar({ onSectionChange }) {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  // デバッグ：AuthContext から何が来ているか確認
  useEffect(() => {
    console.log('🛠 Sidebar useAuth →', { user, logout });
  }, [user, logout]);

  const toggleSidebar = () => setIsOpen(open => !open);

  // ユーザータイプ（'admin'｜'city'｜'company'｜'normal'）
  const actualType = user?.user_type || 'normal';

  const sections = {
    admin: [
      { name: 'ユーザー管理', section: 'userManagement' },
      { name: '新規ユーザー作成', section: 'createUser' },
      { name: '組織管理', section: 'orgManagement' },
      { name: '新規組織作成', section: 'createOrg' },
      { name: 'レポート管理', section: 'reportManagement' },
    ],
    normal: [
      { name: 'レポート一覧', section: 'reportList' },
      { name: '新規レポート作成', section: 'createReport' },
    ],
    city: [
      { name: 'レポート一覧', section: 'handleReports' },
      { name: 'マップ表示', section: 'mapView' },
      { name: '地域管理', section: 'areaManagement' },
    ],
    company: [
      { name: 'レポート一覧', section: 'reportList' },
      { name: 'レポート対応', section: 'handleReports' },
      { name: '地域管理',   section: 'areaManagement' },
      { name: 'パートナー管理', section: 'partnerManagement' },
      { name: 'コード連携', section: 'codeLink' },
    ],
  };

  // 表示するコードのラベル
  const getCodeLabel = () => {
    if (actualType === 'company') return '企業コード';
    if (actualType === 'city')    return '市コード';
    return '組織コード';
  };

  // 表示するコードの値
  // user.org には Organization.code (C-XXXXXX) が入っています
  const getCodeValue = () => {
    return user?.org ?? '—';
  };

  // ダッシュボードタイトル
  const getTitle = () => {
    if (actualType === 'admin')   return '管理者 ダッシュボード';
    if (actualType === 'city')    return '市 ダッシュボード';
    if (actualType === 'company') return '企業 ダッシュボード';
    return '一般 ダッシュボード';
  };

  return (
    <>
      {/* モバイル時のメニュー開閉ボタン */}
      <button
        className="md:hidden fixed top-4 left-4 z-20 p-2 bg-blue-500 text-white rounded"
        onClick={toggleSidebar}
      >
        {isOpen ? '閉じる' : 'メニュー'}
      </button>

      {/* サイドバー */}
      <div
        className={`
          fixed top-0 left-0 h-full bg-gray-800 text-white w-64
          transform transition-transform
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:static md:w-64 z-10
        `}
      >
        <div className="p-4">
          {/* コード表示 */}
          <div className="mb-4 p-2 bg-gray-700 rounded text-center">
            <div className="text-xs text-gray-400">{getCodeLabel()}</div>
            <div className="font-mono text-lg text-blue-300">{getCodeValue()}</div>
          </div>

          {/* ダッシュボードタイトル */}
          <h2 className="text-2xl font-bold mb-4">{getTitle()}</h2>

          {/* ナビゲーション */}
          <nav>
            <ul>
              {sections[actualType]?.map(item => (
                <li key={item.section} className="mb-2">
                  <button
                    onClick={() => {
                      console.log(`🔀 セクション切替: ${item.section}`);
                      onSectionChange(item.section);
                      setIsOpen(false);
                    }}
                    className="w-full text-left p-2 hover:bg-gray-700 rounded"
                  >
                    {item.name}
                  </button>
                </li>
              ))}

              {/* ログアウトボタン */}
              <li className="mt-4">
                <button
                  onClick={() => {
                    console.log('🚪 ログアウト実行');
                    typeof logout === 'function' && logout();
                    setIsOpen(false);
                  }}
                  className="w-full text-left p-2 bg-red-500 hover:bg-red-600 rounded"
                >
                  ログアウト
                </button>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
}

export default Sidebar;
