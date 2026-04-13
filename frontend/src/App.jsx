import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Header from './components/Header.jsx'
import ThemeToggle from './theme/ThemeToggle.jsx'
import { useSession } from './auth/SessionContext.jsx'
import Login from './pages/Login.jsx'
import StudentHome from './pages/StudentHome.jsx'
import Evaluate from './pages/Evaluate.jsx'
import EvaluateOverview from './pages/EvaluateOverview.jsx'
import MyRecords from './pages/MyRecords.jsx'
import TeacherDashboard from './pages/TeacherDashboard.jsx'
import TeacherStudentDetail from './pages/TeacherStudentDetail.jsx'
import AdminPanel from './pages/AdminPanel.jsx'

function RequireRole({ roles, children }) {
  const { session, loading } = useSession()
  const loc = useLocation()
  if (loading) return <div className="page">載入中…</div>
  if (!session) return <Navigate to="/" replace state={{ from: loc.pathname }} />
  if (roles && !roles.includes(session.role)) {
    if (session.role === 'student') return <Navigate to="/me" replace />
    if (session.role === 'teacher') return <Navigate to="/teacher" replace />
    if (session.role === 'admin') return <Navigate to="/admin" replace />
  }
  return children
}

function RootRedirect() {
  const { session, loading } = useSession()
  if (loading) return <div className="page">載入中…</div>
  if (!session) return <Login />
  if (session.role === 'student') return <Navigate to="/me" replace />
  if (session.role === 'teacher') return <Navigate to="/teacher" replace />
  if (session.role === 'admin') return <Navigate to="/admin" replace />
  return <Login />
}

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/me" element={<RequireRole roles={['student']}><StudentHome /></RequireRole>} />
        <Route path="/evaluate/:period" element={<RequireRole roles={['student']}><Evaluate /></RequireRole>} />
        <Route path="/evaluate/:period/overview" element={<RequireRole roles={['student']}><EvaluateOverview /></RequireRole>} />
        <Route path="/my-records" element={<RequireRole roles={['student', 'teacher']}><MyRecords /></RequireRole>} />
        <Route path="/teacher" element={<RequireRole roles={['teacher']}><TeacherDashboard /></RequireRole>} />
        <Route path="/teacher/records/:studentId" element={<RequireRole roles={['teacher']}><TeacherStudentDetail /></RequireRole>} />
        <Route path="/admin" element={<RequireRole roles={['admin']}><AdminPanel /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ThemeToggle />
    </>
  )
}
