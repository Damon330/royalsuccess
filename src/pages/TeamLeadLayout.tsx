import { Routes, Route, Navigate } from 'react-router-dom'
import TeamLeadDashboard from '../components/teamlead/TeamLeadDashboard'
import TLAssign from '../components/teamlead/TLAssign'
import TLAgents from '../components/teamlead/TLAgents'
import ActivityPage from './ActivityPage'
import BottomNav from '../components/shared/BottomNav'
import { MdHome, MdPhoneAndroid, MdGroup, MdHistory } from 'react-icons/md'

const NAV_ITEMS = [
  { to: '/teamlead',          end: true, label: 'Home',     icon: <MdHome /> },
  { to: '/teamlead/assign',              label: 'Assign',   icon: <MdPhoneAndroid /> },
  { to: '/teamlead/agents',              label: 'Agents',   icon: <MdGroup /> },
  { to: '/teamlead/activity',            label: 'Activity', icon: <MdHistory /> },
]

export default function TeamLeadLayout() {
  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <div className="flex-1 overflow-y-auto pb-16">
        <Routes>
          <Route path="/"        element={<TeamLeadDashboard />} />
          <Route path="assign"   element={<TLAssign />} />
          <Route path="agents"   element={<TLAgents />} />
          <Route path="activity" element={<ActivityPage />} />
          <Route path="*"        element={<Navigate to="/teamlead" replace />} />
        </Routes>
      </div>
      <BottomNav items={NAV_ITEMS} />
    </div>
  )
}
