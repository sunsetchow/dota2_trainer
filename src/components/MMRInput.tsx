import React, { useState } from 'react'
import type { MMRLog } from '../types'
import { nanoid } from 'nanoid'
import { todayStr } from '../utils/cycle.ts'

interface MMRInputProps {
  onAdd: (log: MMRLog) => void
}

export default function MMRInput({ onAdd }: MMRInputProps) {
  const [open, setOpen] = useState(false)
  const [mmr, setMmr] = useState('')
  const [notes, setNotes] = useState('')

  const handleSave = () => {
    const val = parseInt(mmr, 10)
    if (isNaN(val)) return
    const log: MMRLog = {
      id: nanoid(),
      date: todayStr(),
      mmr: val,
      notes: notes.trim() || undefined,
    }
    onAdd(log)
    setMmr('')
    setNotes('')
    setOpen(false)
  }

  return (
    <>
      {/* 浮动按钮 */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-[var(--accent)] text-[var(--text-primary)] text-lg font-bold shadow-lg hover:bg-[var(--accent-strong)] transition-colors flex items-center justify-center z-40"
        title="录入 MMR"
      >
        M
      </button>

      {/* 弹出面板 */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setOpen(false)}>
          <div
            className="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl p-6 w-80 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4">录入 MMR</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">当前 MMR</label>
                <input
                  type="number"
                  value={mmr}
                  onChange={e => setMmr(e.target.value)}
                  placeholder="如：3500"
                  autoFocus
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">备注（可选）</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="如：连输三把后的 MMR"
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface-1)] text-[var(--text-primary)] text-sm focus:outline-none focus:border-[var(--accent-border)]"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 px-4 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:border-[var(--text-secondary)] transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!mmr || isNaN(parseInt(mmr, 10))}
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--text-primary)] text-sm font-semibold hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
