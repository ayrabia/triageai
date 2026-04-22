'use client'

import { useCallback, useRef, useState } from 'react'
import { uploadReferral } from '@/lib/api'

interface Props {
  token: string
  onUploaded: () => void
}

interface FileStatus {
  name: string
  state: 'uploading' | 'done' | 'error'
  error?: string
}

export default function UploadZone({ token, onUploaded }: Props) {
  const [dragging, setDragging] = useState(false)
  const [files, setFiles] = useState<FileStatus[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFiles = useCallback(async (incoming: File[]) => {
    const pdfs = incoming.filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length === 0) return

    const initial: FileStatus[] = pdfs.map((f) => ({ name: f.name, state: 'uploading' }))
    setFiles(initial)

    await Promise.all(
      pdfs.map(async (file, i) => {
        try {
          await uploadReferral(file, token)
          setFiles((prev) =>
            prev.map((s, j) => (j === i ? { ...s, state: 'done' } : s))
          )
          onUploaded()
        } catch (err) {
          setFiles((prev) =>
            prev.map((s, j) =>
              j === i
                ? { ...s, state: 'error', error: err instanceof Error ? err.message : 'Upload failed' }
                : s
            )
          )
        }
      })
    )

    setTimeout(() => setFiles([]), 6000)
  }, [token, onUploaded])

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragging(true)
  }
  function onDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false)
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }
  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFiles(Array.from(e.target.files ?? []))
    e.target.value = ''
  }

  const busy = files.some((f) => f.state === 'uploading')
  const allDone = files.length > 0 && files.every((f) => f.state === 'done')
  const hasError = files.some((f) => f.state === 'error')
  const idle = files.length === 0

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => !busy && inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-lg flex flex-col items-center justify-center
        text-center transition-all duration-200 py-8 px-6
        ${dragging    ? 'border-primary/50 bg-primary-fixed/10 cursor-copy' : ''}
        ${allDone     ? 'border-green-400/50 bg-green-50/50 cursor-default' : ''}
        ${hasError    ? 'border-error/40 bg-error-container/20 cursor-pointer' : ''}
        ${busy        ? 'border-outline-variant/40 bg-surface-container-lowest cursor-default' : ''}
        ${idle && !dragging ? 'border-outline-variant/60 bg-surface-container-lowest hover:border-primary/40 hover:bg-primary-fixed/5 cursor-pointer' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        multiple
        className="hidden"
        onChange={onInputChange}
      />

      {idle && (
        <>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors ${dragging ? 'bg-primary-fixed' : 'bg-surface-container-low'}`}>
            <span className={`material-symbols-outlined transition-colors ${dragging ? 'text-primary' : 'text-secondary'}`} style={{ fontSize: '24px' }}>
              cloud_upload
            </span>
          </div>
          <p className={`text-sm font-semibold transition-colors ${dragging ? 'text-primary' : 'text-on-surface'}`}>
            {dragging ? 'Drop to upload' : 'Drop referral PDFs here'}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">or click to browse · PDF only · multiple files supported</p>
        </>
      )}

      {files.length > 0 && (
        <div className="w-full flex flex-col gap-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-sm">
              {f.state === 'uploading' && (
                <span className="material-symbols-outlined text-primary animate-spin shrink-0" style={{ fontSize: '16px' }}>sync</span>
              )}
              {f.state === 'done' && (
                <span className="material-symbols-outlined text-green-600 shrink-0" style={{ fontSize: '16px' }}>check_circle</span>
              )}
              {f.state === 'error' && (
                <span className="material-symbols-outlined text-error shrink-0" style={{ fontSize: '16px' }}>warning</span>
              )}
              <span className="truncate text-on-surface font-mono text-xs">{f.name}</span>
              {f.state === 'error' && (
                <span className="text-xs text-error ml-auto shrink-0">{f.error}</span>
              )}
            </div>
          ))}
          {allDone && (
            <p className="text-xs text-on-surface-variant mt-1">Pipeline running — referrals will appear in the queue shortly</p>
          )}
          {hasError && !busy && (
            <p className="text-xs text-on-surface-variant mt-1">Click to try again</p>
          )}
        </div>
      )}
    </div>
  )
}
