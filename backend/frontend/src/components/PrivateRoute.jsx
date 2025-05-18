import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>;
  }

  return user ? children : <Navigate to="/login" />;
}

export default PrivateRoute;