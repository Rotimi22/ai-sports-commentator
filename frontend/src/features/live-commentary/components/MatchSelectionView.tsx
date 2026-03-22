import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Search,
  ShieldAlert,
  Trophy,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

import type { Fixture } from '../types'

const MATCHES_PER_PAGE = 20

function initials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getPaginationItems(currentPage: number, totalPages: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const pages = new Set<number>([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  const sortedPages = Array.from(pages).filter((page) => page >= 1 && page <= totalPages).sort((a, b) => a - b)
  const items: Array<number | 'ellipsis'> = []

  for (let index = 0; index < sortedPages.length; index += 1) {
    const page = sortedPages[index]
    const previous = sortedPages[index - 1]
    if (previous && page - previous > 1) items.push('ellipsis')
    items.push(page)
  }

  return items
}

export function MatchSelectionView({
  fixtures,
  loading,
  onRefresh,
  onSelect,
}: {
  fixtures: Fixture[]
  loading: boolean
  onRefresh: () => void
  onSelect: (fixture: Fixture) => void
}) {
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const gridRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().toLowerCase())
    }, 300)

    return () => window.clearTimeout(timer)
  }, [searchQuery])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedQuery])

  const filteredFixtures = useMemo(() => {
    if (!debouncedQuery) return fixtures

    return fixtures.filter((fixture) => {
      const haystack = [fixture.home, fixture.away, fixture.league, fixture.country].join(' ').toLowerCase()
      return haystack.includes(debouncedQuery)
    })
  }, [debouncedQuery, fixtures])

  const totalMatches = filteredFixtures.length
  const totalPages = Math.ceil(totalMatches / MATCHES_PER_PAGE)
  const safeCurrentPage = totalPages === 0 ? 1 : Math.min(currentPage, totalPages)
  const startIndex = (safeCurrentPage - 1) * MATCHES_PER_PAGE
  const endIndex = Math.min(startIndex + MATCHES_PER_PAGE, totalMatches)
  const paginatedFixtures = filteredFixtures.slice(startIndex, endIndex)
  const paginationItems = getPaginationItems(safeCurrentPage, totalPages)

  const handlePageChange = (page: number) => {
    if (page === safeCurrentPage) return
    setCurrentPage(page)
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-8 sm:px-6 lg:px-8">
      <header className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-card/70 p-8 shadow-[var(--shadow-panel)] backdrop-blur-xl">
        <div className="aurora absolute inset-0 opacity-90" />
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-4">
            <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs uppercase tracking-[0.24em] text-primary">
              <Activity className="size-3.5" /> Live AI Sports Studio
            </p>
            <div>
              <h1
                className="font-display text-5xl leading-none tracking-tight text-transparent sm:text-6xl"
                style={{
                  background: 'linear-gradient(120deg, hsl(var(--primary)), hsl(var(--accent-2)))',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                }}
              >
                AI Sports Commentator
              </h1>
              <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
                Live match commentary powered by AI — talk back to your pundit.
              </p>
            </div>
          </div>
          <Button variant="outline" size="lg" className="bg-transparent" onClick={onRefresh}>
            <RefreshCw className="size-4" /> Refresh Matches
          </Button>
        </div>
      </header>

      <div className="mt-8 flex justify-center">
        <div className="relative w-full max-w-[600px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground/80" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by team, league, or country..."
            className="h-12 w-full rounded-xl border border-white/10 bg-white/5 pl-12 pr-12 text-base text-white outline-none transition-all duration-200 placeholder:text-muted-foreground/80 focus:border-[hsl(152_100%_50%)] focus:shadow-[0_0_0_1px_rgba(0,255,135,0.35),0_0_30px_rgba(0,255,135,0.15)]"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      {!loading && totalMatches > 0 && (
        <div className="mt-5 text-right text-sm text-muted-foreground">
          Showing {startIndex + 1}-{endIndex} of {totalMatches} matches
        </div>
      )}

      <section ref={gridRef} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {loading &&
          Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="glass-card overflow-hidden p-0">
              <CardContent className="space-y-4 p-5">
                <Skeleton className="h-6 w-24 bg-white/10" />
                <Skeleton className="h-10 w-full bg-white/10" />
                <Skeleton className="h-16 w-full bg-white/10" />
              </CardContent>
            </Card>
          ))}

        {!loading && fixtures.length === 0 && (
          <Card className="glass-card md:col-span-2 xl:col-span-3">
            <CardContent className="flex flex-col items-center justify-center gap-4 p-10 text-center">
              <div className="flex size-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-primary">
                <Trophy className="size-8" />
              </div>
              <div>
                <h2 className="font-display text-3xl tracking-wide">No live matches right now</h2>
                <p className="mt-2 text-muted-foreground">Check back during game time.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && fixtures.length > 0 && totalMatches === 0 && (
          <Card className="glass-card md:col-span-2 xl:col-span-3">
            <CardContent className="flex flex-col items-center justify-center gap-4 p-10 text-center">
              <div className="flex size-16 items-center justify-center rounded-full border border-white/10 bg-white/5 text-muted-foreground">
                <Search className="size-8" />
              </div>
              <div>
                <h2 className="font-display text-3xl tracking-wide">No matches found for “{searchQuery}”</h2>
                <p className="mt-2 text-muted-foreground">Try a different search term</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading &&
          paginatedFixtures.map((fixture, index) => (
            <motion.button
              key={`${safeCurrentPage}-${fixture.fixtureId}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05, duration: 0.35 }}
              className="text-left"
              onClick={() => onSelect(fixture)}
            >
              <Card className="glass-card card-hover relative overflow-hidden border-white/10">
                <CardContent className="p-5">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      {fixture.league} · {fixture.country}
                    </div>
                    <div className="live-badge">LIVE {fixture.minute}'</div>
                  </div>
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4">
                    <div className="team-crest">{initials(fixture.home)}</div>
                    <div>
                      <div className="font-display text-3xl tracking-wide text-foreground">{fixture.home}</div>
                      <div className="font-display text-3xl tracking-wide text-foreground/90">{fixture.away}</div>
                    </div>
                    <div className="score-chip">{fixture.score}</div>
                  </div>
                </CardContent>
              </Card>
            </motion.button>
          ))}
      </section>

      {!loading && totalPages > 1 && (
        <nav className="mt-6 flex justify-center" aria-label="Match pagination">
          <div className="glass-card flex flex-wrap items-center justify-center gap-2 rounded-xl px-4 py-3 sm:px-6">
            <button
              type="button"
              onClick={() => handlePageChange(safeCurrentPage - 1)}
              disabled={safeCurrentPage === 1}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-white transition-all duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="size-4" /> <span>Prev</span>
            </button>

            {paginationItems.map((item, index) =>
              item === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="inline-flex h-10 w-10 items-center justify-center text-sm text-muted-foreground">
                  ...
                </span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => handlePageChange(item)}
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-lg text-sm transition-all duration-200 ${
                    item === safeCurrentPage
                      ? 'bg-[hsl(152_100%_50%)] font-bold text-black'
                      : 'bg-transparent text-white hover:bg-white/10'
                  }`}
                >
                  {item}
                </button>
              )
            )}

            <button
              type="button"
              onClick={() => handlePageChange(safeCurrentPage + 1)}
              disabled={safeCurrentPage === totalPages}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm text-white transition-all duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <span>Next</span> <ChevronRight className="size-4" />
            </button>
          </div>
        </nav>
      )}

      <footer className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
        <ShieldAlert className="size-4" /> Backend expected at http://localhost:8000
      </footer>
    </main>
  )
}
