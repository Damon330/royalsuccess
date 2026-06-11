import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'

interface NavItem {
  to:    string
  label: string
  icon:  ReactNode
  end?:  boolean
}

export default function BottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-brand-border">
      <div className="flex min-h-[64px]">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors min-h-touch${
                isActive ? ' text-primary' : ' text-brand-muted hover:text-brand-text'
              }`
            }
          >
            <span className="text-[22px] leading-none">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
