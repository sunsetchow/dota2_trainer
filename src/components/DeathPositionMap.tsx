import { useEffect, useRef, useState } from 'react'
import treePoints from '../data/mapTreePoints.json'
import { useT } from '../i18n/index.ts'

const MAP_SIZE = 256

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.abs(seconds % 60)
  return `${seconds < 0 ? '-' : ''}${Math.abs(m)}:${String(s).padStart(2, '0')}`
}

export default function DeathPositionMap({ deathPositions }: { deathPositions: Array<{ time: number; x: number; y: number }> }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hovered, setHovered] = useState<number | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = MAP_SIZE * dpr
    canvas.height = MAP_SIZE * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE)
    const style = getComputedStyle(canvas)
    ctx.fillStyle = style.getPropertyValue('--surface-3').trim() || '#342b25'
    for (const [x, y] of treePoints as Array<[number, number]>) {
      ctx.beginPath()
      ctx.arc(x, MAP_SIZE - y, 1.1, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [])

  if (!deathPositions.length) return null

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t('deathMap.title')}</label>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-md bg-[var(--surface-2)]">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
            <svg viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} className="absolute inset-0 h-full w-full overflow-visible">
              <circle cx="24" cy="232" r="14" fill="var(--bg-success)" />
              <circle cx="24" cy="232" r="6" fill="var(--text-success)" />
              <circle cx="232" cy="24" r="14" fill="var(--bg-danger)" />
              <circle cx="232" cy="24" r="6" fill="var(--text-danger)" />
              {deathPositions.map((d, i) => (
                <circle
                  key={i}
                  cx={d.x}
                  cy={MAP_SIZE - d.y}
                  r={hovered === i ? 6 : 4.5}
                  fill="var(--gold-strong)"
                  stroke="var(--surface-2)"
                  strokeWidth={1}
                  className="cursor-pointer transition-all"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(current => (current === i ? null : current))}
                />
              ))}
            </svg>
          </div>
          <div className="flex flex-row flex-wrap gap-1.5 sm:flex-col sm:flex-nowrap">
            {deathPositions.map((d, i) => (
              <button
                key={i}
                type="button"
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(current => (current === i ? null : current))}
                className={`rounded px-2 py-1 text-xs tabular-nums transition-colors ${hovered === i ? 'bg-[var(--gold-muted)] text-[var(--gold-strong)]' : 'text-[var(--text-muted)]'}`}
              >
                #{i + 1} · {formatTime(d.time)}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">{t('deathMap.disclaimer')}</p>
      </div>
    </div>
  )
}
