import type { ReactNode } from 'react'
import { MdArrowUpward, MdArrowDownward } from 'react-icons/md'

interface StatCardProps {
  label:        string
  value:        number | string
  icon:         ReactNode
  bgColor?:     string
  iconBg?:      string
  borderColor?: string
  valueColor?:  string
  sub?:         string          // e.g. "42% of total"
  trend?: {
    value:  number              // positive = up, negative = down
    label?: string              // e.g. "vs last month"
  }
}

export default function StatCard({
  label,
  value,
  icon,
  bgColor     = 'bg-white',
  iconBg      = 'bg-primary-pale',
  borderColor = 'border-l-primary',
  valueColor  = 'text-brand-text',
  sub,
  trend,
}: StatCardProps) {
  const up = trend && trend.value >= 0

  return (
    <div className={`${bgColor} rounded-2xl p-5 shadow-sm border border-brand-border border-l-4 ${borderColor} hover:shadow-md transition-all duration-200 group`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-xs font-bold text-brand-muted uppercase tracking-widest leading-none">{label}</p>
        <div className={`${iconBg} rounded-xl p-2.5 flex-shrink-0 group-hover:scale-105 transition-transform duration-200`}>
          {icon}
        </div>
      </div>

      <p className={`text-3xl font-extrabold ${valueColor} leading-none tabular-nums`}>{value}</p>

      {(sub || trend) && (
        <div className="flex items-center justify-between mt-2.5 gap-2 flex-wrap">
          {sub && (
            <p className="text-xs text-brand-muted font-medium">{sub}</p>
          )}
          {trend && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
              up
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-600'
            }`}>
              {up
                ? <MdArrowUpward className="w-3 h-3" />
                : <MdArrowDownward className="w-3 h-3" />
              }
              {Math.abs(trend.value).toFixed(1)}%
              {trend.label && <span className="font-normal ml-0.5">{trend.label}</span>}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
