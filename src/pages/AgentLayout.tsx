import { Routes, Route, Navigate } from 'react-router-dom'
import AgentDashboard from '../components/agent/AgentDashboard'
import ActivityPage from './ActivityPage'
import AccountPage from '../components/shared/AccountPage'
import BottomNav from '../components/shared/BottomNav'
import { MdPhoneAndroid, MdHistory, MdPerson } from 'react-icons/md'

const NAV_ITEMS = [
  { to: '/agent',          end: true, label: 'Phones',   icon: <MdPhoneAndroid /> },
  { to: '/agent/activity',            label: 'Activity', icon: <MdHistory /> },
  { to: '/agent/account',             label: 'Me',       icon: <MdPerson /> },
]

export default function AgentLayout() {
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <div className="flex-1 overflow-y-auto pb-16">
        <Routes>
          <Route path="/"        element={<AgentDashboard />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="account"  element={<AccountPage />} />
          <Route path="*"        element={<Navigate to="/agent" replace />} />
        </Routes>
      </div>
      <BottomNav items={NAV_ITEMS} />
    </div>
  )
}
