interface StatCardProps {
  label:        string
  value:        number | string
  icon:         React.ReactNode
  bgColor?:     string
  iconBg?:      string
  borderColor?: string
  valueColor?:  string
}

export default function StatCard({
  label,
  value,
  icon,
  bgColor     = 'bg-white',
  iconBg      = 'bg-primary-pale',
  borderColor = 'border-l-primary',
  valueColor  = 'text-brand-text',
}: StatCardProps) {
  return (
    <div className={`${bgColor} rounded-xl p-5 shadow-sm border border-brand-border border-l-4 ${borderColor} hover:shadow-md transition-shadow duration-200`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand-muted uppercase tracking-wider truncate">{label}</p>
          <p className={`text-3xl font-extrabold ${valueColor} mt-1.5 leading-none tabular-nums`}>{value}</p>
        </div>
        <div className={`${iconBg} rounded-2xl p-3 flex-shrink-0`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
