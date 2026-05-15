interface SectionTitleProps {
  eyebrow: string
  title: string
  description: string
}

export function SectionTitle({ eyebrow, title, description }: SectionTitleProps) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-blue-500">{eyebrow}</p>
      <h1 className="text-3xl font-bold text-white">{title}</h1>
      <p className="max-w-3xl text-sm text-slate-400">{description}</p>
    </div>
  )
}
