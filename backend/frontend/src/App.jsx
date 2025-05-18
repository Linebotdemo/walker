import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Login from './pages/Login.jsx';
import SignUp from './pages/SignUp.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import CompanyDashboard from './pages/CompanyDashboard.jsx';
import Dashboard from './pages/Dashboard.jsx';
import CityDashboard from './pages/CityDashboard.jsx';
import ReportList from './pages/ReportList.jsx';
import PrivateRoute from './components/PrivateRoute.jsx';

function App() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route
        path="/admin"
        element={
          <PrivateRoute>
            <AdminDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/company"
        element={
          <PrivateRoute>
            <CompanyDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/city"
        element={
          <PrivateRoute>
            <CityDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/reports"
        element={
          <PrivateRoute>
            <ReportList />
          </PrivateRoute>
        }
      />
      <Route
        path="/"
        element={
          user ? (
            user.user_type === 'admin' ? (
              <Navigate to="/admin" />
            ) : user.user_type === 'company' ? (
              <Navigate to="/company" />
            ) : user.user_type === 'city' ? (
              <Navigate to="/city" />
            ) : (
              <Navigate to="/dashboard" />
            )
          ) : (
            <Navigate to="/login" />
          )
        }
      />
    </Routes>
  );
}

export default App;