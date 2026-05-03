'use client'

import { useEffect, useState } from 'react'
import { getNotes, postNote } from '@/lib/api'
import type { ReferralNote } from '@/lib/types'

const ROLE_BADGE: Record<string, string> = {
  physician:   'bg-[#E8F5E9] text-[#2E7D32]',
  reviewer:    'bg-[#EDE7F6] text-[#4527A0]',
  coordinator: 'bg-[#E3F2FD] text-[#1565C0]',
  admin:       'bg-surface-container-high text-on-surface-variant',
  superadmin:  'bg-surface-container-high text-on-surface-variant',
}

const ROLE_LABEL: Record<string, string> = {
  physician:   'MD',
  reviewer:    'Triage',
  coordinator: 'Scheduler',
  admin:       'Admin',
  superadmin:  'Admin',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

interface Props {
  referralId: string
  onNotesLoaded?: (notes: ReferralNote[]) => void
}

export default function NotesThread({ referralId, onNotesLoaded }: Props) {
  const [notes, setNotes] = useState<ReferralNote[]>([])
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getNotes(referralId).then((n) => {
      setNotes(n)
      onNotesLoaded?.(n)
    }).catch(() => {})
  }, [referralId, onNotesLoaded])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!body.trim()) return
    setPosting(true)
    setError(null)
    try {
      const note = await postNote(referralId, body.trim())
      const updated = [...notes, note]
      setNotes(updated)
      onNotesLoaded?.(updated)
      setBody('')
    } catch {
      setError('Failed to post note. Please try again.')
    } finally {
      setPosting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {notes.length === 0 ? (
        <p className="text-sm text-on-surface-variant italic">No notes yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((note) => (
            <div key={note.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ROLE_BADGE[note.author_role] ?? ROLE_BADGE.admin}`}>
                  {ROLE_LABEL[note.author_role] ?? note.author_role}
                </span>
                <span className="text-xs font-medium text-on-surface">{note.author_name}</span>
                <span className="text-xs text-outline">{formatTime(note.created_at)}</span>
              </div>
              <p className="text-sm text-on-surface leading-relaxed pl-0.5">{note.body}</p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 pt-2 border-t border-outline-variant/15">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note…"
          rows={3}
          className="w-full rounded border border-outline-variant/50 bg-surface text-sm text-on-surface px-3 py-2 resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-outline"
        />
        {error && <p className="text-xs text-error">{error}</p>}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={posting || !body.trim()}
            className="px-4 py-1.5 rounded bg-primary text-on-primary text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {posting ? 'Posting…' : 'Post Note'}
          </button>
        </div>
      </form>
    </div>
  )
}
