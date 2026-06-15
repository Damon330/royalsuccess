import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { MdArrowUpward, MdArrowDownward } from 'react-icons/md'

interface StatCardProps {
  label:        string
  value:        number | string
  icon:         ReactNode
  bgColor?:     string
  iconBg?:      string
  borderColor?: string
  valueColor?:  string
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
  bgColor     = 'bg-brand-surface dark:bg-dark-card',
  iconBg      = 'bg-primary/10 dark:bg-primary/20',
  borderColor = 'border-l-primary',
  valueColor  = 'text-brand-text',
  sub,
  trend,
}: StatCardProps) {
  const up = trend && trend.value >= 0

  return (
    <motion.div
      whileHover={{ y: -2, boxShadow: '0 8px 25px -5px rgba(0,0,0,0.1)' }}
      transition={{ duration: 0.15 }}
      className={`${bgColor} rounded-2xl p-5 shadow-card border border-brand-border border-l-4 ${borderColor} group`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-[10px] font-bold text-brand-muted uppercase tracking-widest leading-none">{label}</p>
        <div className={`${iconBg} rounded-xl p-2.5 flex-shrink-0 group-hover:scale-110 transition-transform duration-200`}>
          {icon}
        </div>
      </div>

      <p className={`text-3xl font-extrabold ${valueColor} leading-none tabular-nums`}>{value}</p>

      {(sub || trend) && (
        <div className="flex items-center justify-between mt-2.5 gap-2 flex-wrap">
          {sub && <p className="text-xs text-brand-muted font-medium">{sub}</p>}
          {trend && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-2 py-0.5 rounded-full ${
              up ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                 : 'bg-red-100   dark:bg-red-900/30   text-red-600   dark:text-red-400'
            }`}>
              {up ? <MdArrowUpward className="w-3 h-3" /> : <MdArrowDownward className="w-3 h-3" />}
              {Math.abs(trend.value).toFixed(1)}%
              {trend.label && <span className="font-normal ml-0.5">{trend.label}</span>}
            </span>
          )}
        </div>
      )}
    </motion.div>
  )
}
