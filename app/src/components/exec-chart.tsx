'use client'

import { useState } from 'react'

export type Bucket = { day: string; success: number; error: number; other: number }

/**
 * Stacked daily columns: successful vs failed executions.
 * Spec: ≤24px columns, 4px rounded tops, square baseline, 2px surface gap between segments,
 * hairline grid, legend, per-column hover tooltip, table view for accessibility.
 */
const W = 720
const H = 280
const PAD = { top: 12, right: 8, bottom: 24, left: 36 }
const GAP = 2

function niceMax(v: number): number {
  if (v <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(v))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => v / s <= 4) ?? 10 * pow
  return Math.ceil(v / step) * step
}

/** Path for a column with rounded top corners only. */
function colPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2)
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`
}

const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function ExecChart({ data }: { data: Bucket[] }) {
  const [hover, setHover] = useState<number | null>(null)
  const totals = data.map((d) => d.success + d.error + d.other)
  const max = niceMax(Math.max(0, ...totals))
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom
  const band = innerW / data.length
  const colW = Math.min(24, band * 0.6)
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max]

  const h = hover === null ? null : data[hover]

  return (
    <div className="chart">
      <div className="legend" aria-hidden>
        <span>
          <i className="swatch" style={{ background: 'var(--chart-ok)' }} /> Successful
        </span>
        <span>
          <i className="swatch" style={{ background: 'var(--chart-err)' }} /> Failed
        </span>
      </div>

      <div className="chart-plot">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Executions per day, last ${data.length} days`}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="gridline" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="axis" x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {Number.isInteger(t) ? t.toLocaleString() : t.toFixed(1)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = PAD.left + band * i + band / 2
          const x = cx - colW / 2
          // successful (+ other) at the bottom, failures stacked on top
          const okV = d.success
          const okTop = y(okV)
          const errTop = y(okV + d.error)
          const hasErr = d.error > 0
          const showLabel = i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 7) === 0
          return (
            <g key={d.day} opacity={hover === null || hover === i ? 1 : 0.45}>
              {okV > 0 &&
                (hasErr ? (
                  <rect x={x} y={okTop} width={colW} height={y(0) - okTop} fill="var(--chart-ok)" />
                ) : (
                  <path d={colPath(x, okTop, colW, y(0) - okTop, 4)} fill="var(--chart-ok)" />
                ))}
              {hasErr && (
                <path
                  d={colPath(x, errTop, colW, Math.max(0, okTop - errTop - (okV > 0 ? GAP : 0)), 4)}
                  fill="var(--chart-err)"
                />
              )}
              {d.other > 0 && <rect x={x} y={y(okV + d.error + d.other)} width={colW} height={Math.max(0, errTop - y(okV + d.error + d.other))} fill="var(--text-3)" />}
              {showLabel && (
                <text className="axis" x={cx} y={H - 6} textAnchor="middle">
                  {fmtDay(d.day)}
                </text>
              )}
              {/* hit target: the full band, taller than the mark */}
              <rect
                x={PAD.left + band * i}
                y={PAD.top}
                width={band}
                height={innerH}
                fill="transparent"
                tabIndex={0}
                aria-label={`${d.day} UTC: ${d.success} successful, ${d.error} failed, ${d.other} other`}
                onFocus={() => setHover(i)}
                onBlur={() => setHover(null)}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          )
        })}
      </svg>

      {h && hover !== null && (
        <div
          className="tooltip"
          style={{
            left: `${((PAD.left + band * hover + band / 2) / W) * 100}%`,
            top: `${(y(h.success + h.error + h.other) / H) * 100}%`,
          }}
        >
          <strong>{fmtDay(h.day)}</strong>
          <div className="t-row">
            <span>
              <i className="swatch" style={{ background: 'var(--chart-ok)' }} /> Successful
            </span>
            <span>{h.success.toLocaleString()}</span>
          </div>
          <div className="t-row">
            <span>
              <i className="swatch" style={{ background: 'var(--chart-err)' }} /> Failed
            </span>
            <span>{h.error.toLocaleString()}</span>
          </div>
          {h.other > 0 && (
            <div className="t-row">
              <span>Other</span>
              <span>{h.other.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}
      </div>

      <details className="small faint">
        <summary>View as table</summary>
        <div className="table-wrap" style={{ marginTop: 'var(--s-3)' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Day (UTC)</th>
                <th className="num">Successful</th>
                <th className="num">Failed</th>
                <th className="num">Other</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.day}>
                  <td>{d.day}</td>
                  <td className="num">{d.success}</td>
                  <td className="num">{d.error}</td>
                  <td className="num">{d.other}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
