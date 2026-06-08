import { Routes, Route, Navigate } from 'react-router-dom'
import AgentDashboard from '../components/agent/AgentDashboard'
import ActivityPage from './ActivityPage'

export default function AgentLayout() {
  return (
    <Routes>
      <Route path="/"        element={<AgentDashboard />} />
      <Route path="activity" element={<ActivityPage />} />
      <Route path="*"        element={<Navigate to="/agent" replace />} />
    </Routes>
  )
}
