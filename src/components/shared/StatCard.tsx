import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { MdArrowUpward, MdArrowDownward } from 'react-icons/md'

interface StatCardProps {
  label:        string
  value:        number | string
  icon:         ReactNode
  iconBg?:      string   // e.g. "bg-primary/10 dark:bg-primary/20"
  valueColor?:  string
  accentBar?:   boolean  // left accent bar
  accentColor?: string   // e.g. "bg-primary"
  sub?:         string
  trend?: {
    value:  number
    label?: string
  }
}

export default function StatCard({
  label,
  value,
  icon,
  iconBg      = 'bg-primary/10 dark:bg-primary/20',
  valueColor  = 'text-brand-text',
  accentBar   = true,
  accentColor = 'bg-primary',
  sub,
  trend,
}: StatCardProps) {
  const up = trend && trend.value >= 0

  return (
    <motion.div
      whileHover={{ y: -3, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
      transition={{ duration: 0.18 }}
      className="bg-brand-surface rounded-card p-5 shadow-card relative overflow-hidden group"
    >
      {/* Left accent bar */}
      {accentBar && (
        <div className={`absolute left-0 top-4 bottom-4 w-1 rounded-r-full ${accentColor}`} />
      )}

      <div className="flex items-start justify-between gap-3 mb-3">
        {/* Icon tile */}
        <div className={`${iconBg} rounded-inner p-2.5 flex-shrink-0 group-hover:scale-110 transition-transform duration-200`}>
          {icon}
        </div>
        {/* Trend pill */}
        {trend && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${
            up ? 'trend-up' : 'trend-down'
          }`}>
            {up
              ? <MdArrowUpward  className="w-3 h-3" />
              : <MdArrowDownward className="w-3 h-3" />
            }
            {Math.abs(trend.value).toFixed(1)}%
          </span>
        )}
      </div>

      {/* Label */}
      <p className="section-label mb-1">{label}</p>

      {/* Value */}
      <p className={`text-[2rem] font-extrabold ${valueColor} leading-none tabular-nums`}>{value}</p>

      {/* Sub */}
      {sub && <p className="text-xs text-brand-muted mt-1.5 font-medium">{sub}</p>}
      {trend?.label && <p className="text-xs text-brand-muted mt-0.5">{trend.label}</p>}
    </motion.div>
  )
}
