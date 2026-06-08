import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card'

interface EmptyStateProps {
  title: string
  message: string
}

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <Card className="border-white/5 bg-white/[0.03]">
      <CardHeader>
        <CardTitle className="text-white">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-slate-400">{message}</CardContent>
    </Card>
  )
}
