import { useEffect, useMemo, useRef, useState } from 'react'
import mapImageUrl from '../assets/dota_map.jpg'
import { useT } from '../i18n/index.ts'

const MAP_SIZE = 256
// 死亡点在图上留一点边距，不贴死在画布边缘。
const PADDING = 28

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.abs(seconds % 60)
  return `${seconds < 0 ? '-' : ''}${Math.abs(m)}:${String(s).padStart(2, '0')}`
}

// 塔的位置和死亡点的位置来自两套没法互相校准的坐标系（塔是从第三方地图数据算出来的
// 世界坐标，死亡点是 Stratz 自己返回的 positionX/Y），强行按同一个变换叠在一起会导致
// 死亡点相对地图错位。放弃塔标注和跟底图的绝对对齐，改成只看本局死亡点之间的相对分布：
// 按这局所有死亡点自己的坐标范围重新拉伸铺满画布，能看出"死得分散还是集中在一片"，
// 但死亡点在图上的具体位置不代表地图上的真实地理位置。
function buildScaler(points: Array<{ x: number; y: number }>) {
  const xs = points.map(p => p.x)
  const ys = points.map(p => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const rangeX = maxX - minX || 1
  const rangeY = maxY - minY || 1
  const usable = MAP_SIZE - PADDING * 2
  return (x: number, y: number) => ({
    x: PADDING + ((x - minX) / rangeX) * usable,
    y: PADDING + ((y - minY) / rangeY) * usable,
  })
}

export default function DeathPositionMap({ deathPositions }: { deathPositions: Array<{ time: number; x: number; y: number }> }) {
  const t = useT()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [hovered, setHovered] = useState<number | null>(null)
  const scale = useMemo(() => buildScaler(deathPositions), [deathPositions])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = MAP_SIZE * dpr
    canvas.height = MAP_SIZE * dpr
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    const image = new Image()
    image.onload = () => {
      ctx.clearRect(0, 0, MAP_SIZE, MAP_SIZE)
      ctx.drawImage(image, 0, 0, MAP_SIZE, MAP_SIZE)
    }
    image.src = mapImageUrl
  }, [])

  if (!deathPositions.length) return null

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider">{t('deathMap.title')}</label>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative mx-auto aspect-square w-full max-w-[220px] overflow-hidden rounded-md bg-[var(--surface-2)]">
            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-40" />
            <svg viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} className="absolute inset-0 h-full w-full overflow-visible">
              {deathPositions.map((d, i) => {
                const p = scale(d.x, d.y)
                return (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={MAP_SIZE - p.y}
                    r={hovered === i ? 6 : 4.5}
                    fill="var(--gold-strong)"
                    stroke="var(--surface-2)"
                    strokeWidth={1}
                    className="cursor-pointer transition-all"
                    onMouseEnter={() => setHovered(i)}
                    onMouseLeave={() => setHovered(current => (current === i ? null : current))}
                  />
                )
              })}
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
