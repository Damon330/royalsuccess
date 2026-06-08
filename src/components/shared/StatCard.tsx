interface StatCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  bgColor?: string
  iconBg?: string
}

export default function StatCard({ label, value, icon, bgColor = 'bg-white', iconBg = 'bg-primary-pale' }: StatCardProps) {
  return (
    <div className={`${bgColor} rounded-xl p-5 shadow-sm border border-brand-border card-hover`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-brand-muted font-medium">{label}</p>
          <p className="text-3xl font-bold text-brand-text mt-1">{value}</p>
        </div>
        <div className={`${iconBg} rounded-xl p-3`}>
          {icon}
        </div>
      </div>
    </div>
  )
}
