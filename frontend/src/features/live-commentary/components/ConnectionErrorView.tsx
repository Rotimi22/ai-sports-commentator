import { AlertTriangle, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function ConnectionErrorView({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center justify-center px-4 py-8">
      <Card className="glass-card w-full max-w-2xl">
        <CardContent className="flex flex-col items-center gap-6 p-10 text-center">
          <div className="flex size-16 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
            <AlertTriangle className="size-8" />
          </div>
          <div>
            <h1 className="font-display text-4xl tracking-wide">Cannot connect to the commentary server</h1>
            <p className="mt-3 text-muted-foreground">Cannot reach the commentary server. Please try again later.</p>
          </div>
          <Button variant="outline" size="lg" className="bg-transparent" onClick={onRetry}>
            <RefreshCw className="size-4" /> Retry
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
