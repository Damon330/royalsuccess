import { Routes, Route, Navigate } from 'react-router-dom'
import TeamLeadDashboard from '../components/teamlead/TeamLeadDashboard'
import ActivityPage from './ActivityPage'

export default function TeamLeadLayout() {
  return (
    <Routes>
      <Route path="/"        element={<TeamLeadDashboard />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="*"        element={<Navigate to="/teamlead" replace />} />
    </Routes>
  )
}
