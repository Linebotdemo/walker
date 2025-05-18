import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function Login() {
  // ステートの初期化
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(''); // useState0 を useState に修正、デフォルト値を空文字に
  const [loading, setLoading] = useState(false); // 別の useState で loading を定義
  const { user, login, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // デバッグログ：コンポーネントのマウントを確認
  useEffect(() => {
    console.log('Login component mounted');
    console.log('Initial state:', { email, password, loading, user, authLoading });
    return () => {
      console.log('Login component unmounted');
      console.log('Final state before unmount:', { email, password, loading, user, authLoading });
    };
  }, []);

  // ログイン済みの場合、適切なダッシュボードにリダイレクト
  useEffect(() => {
    if (user) {
      console.log('User already logged in:', user);
      console.log('User type:', user.user_type);
      if (user.user_type === 'admin') {
        console.log('Redirecting to /admin');
        navigate('/admin');
      } else if (user.user_type === 'company') {
        console.log('Redirecting to /company');
        navigate('/company');
      } else if (user.user_type === 'city') {
        console.log('Redirecting to /city');
        navigate('/city');
      } else {
        console.log('Redirecting to /dashboard');
        navigate('/dashboard');
      }
    } else {
      console.log('No user logged in, staying on login page');
    }
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('Form submitted with:', { email, password });
    console.log('Current loading state:', loading);

    // 入力バリデーション
    if (!email || !password) {
      console.warn('Validation failed: Empty email or password');
      toast.error('メールアドレスとパスワードを入力してください');
      return;
    }

    // ローディング状態を更新
    setLoading(true);
    console.log('Setting loading to true');

    try {
      console.log('Attempting to login with:', { email, password });
      const userData = await login(email, password);
      console.log('Login successful:', userData);
      toast.success('ログインしました');
      console.log('User type after login:', userData.user_type);

      // ユーザー種別に応じてリダイレクト
      if (userData.user_type === 'admin') {
        console.log('Redirecting to /admin after login');
        navigate('/admin');
      } else if (userData.user_type === 'company') {
        console.log('Redirecting to /company after login');
        navigate('/company');
      } else if (userData.user_type === 'city') {
        console.log('Redirecting to /city after login');
        navigate('/city');
      } else {
        console.log('Redirecting to /dashboard after login');
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Login error:', error);
      console.log('Error message:', error.message);
      toast.error(`ログインに失敗しました: ${error.message || 'サーバーエラーが発生しました'}`);
    } finally {
      setLoading(false);
      console.log('Setting loading to false');
      console.log('Current state after login attempt:', { email, password, loading, user });
    }
  };

  // デバッグ：レンダリングとスタイルの適用確認
  console.log('Rendering Login component with classes: login-container, login-form');
  console.log('Current props and state:', { email, password, loading, user, authLoading });

  // 認証状態の初期化中にローディング表示
  if (authLoading) {
    console.log('AuthContext is loading');
    console.log('Showing loading spinner');
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg font-semibold">読み込み中...</div>
      </div>
    );
  }

  // デバッグ：フォームの状態をレンダリング前にログ出力
  console.log('Form state before render:', { email, password, loading });

  return (
    <div className="login-container min-h-screen flex items-center justify-center bg-gray-100">
      <div className="login-form bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">ログイン</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label
              className="block text-gray-700 mb-2 font-medium"
              htmlFor="email"
            >
              メールアドレス
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                console.log('Email updated:', e.target.value);
              }}
              className="login-input w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              aria-required="true"
              disabled={loading}
              placeholder="example@domain.com"
            />
          </div>
          <div className="mb-6">
            <label
              className="block text-gray-700 mb-2 font-medium"
              htmlFor="password"
            >
              パスワード
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                console.log('Password updated:', e.target.value);
              }}
              className="login-input w-full px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              aria-required="true"
              disabled={loading}
              placeholder="パスワードを入力"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className={`login-button w-full py-2 rounded-md text-white font-semibold transition-colors duration-200 ${
              loading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700'
            }`}
            aria-disabled={loading}
          >
            {loading ? '処理中...' : 'ログイン'}
          </button>
        </form>
        <p className="mt-4 text-center text-gray-600">
          アカウントがない？{' '}
          <a
            href="/signup"
            className="text-blue-500 hover:underline"
            onClick={() => console.log('Navigating to signup page')}
          >
            登録する
          </a>
        </p>
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
        theme="light"
      />
    </div>
  );
}

export default Login;