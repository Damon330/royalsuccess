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
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-brand-surface border-t border-brand-border safe-bottom transition-colors duration-200">
      <div className="flex min-h-[60px]">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors min-h-touch relative ${
                isActive ? 'text-primary' : 'text-brand-muted hover:text-brand-text'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
                )}
                <span className={`text-[22px] leading-none transition-transform duration-150 ${isActive ? 'scale-110' : ''}`}>
                  {item.icon}
                </span>
                {item.label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
