'use client'

import { useCallback, useRef, useState } from 'react'
import { uploadReferral } from '@/lib/api'

interface Props {
  token: string
  onUploaded: () => void
}

type State = 'idle' | 'dragging' | 'uploading' | 'processing' | 'error'

export default function UploadZone({ token, onUploaded }: Props) {
  const [state, setState] = useState<State>('idle')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setState('error')
      setError('Only PDF files are accepted.')
      return
    }
    setState('uploading')
    setError(null)
    try {
      await uploadReferral(file, token)
      setState('processing')
      onUploaded()
      setTimeout(() => setState('idle'), 6000)
    } catch (err) {
      setState('error')
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    }
  }, [token, onUploaded])

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (state === 'idle') setState('dragging')
  }
  function onDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node) && state === 'dragging') setState('idle')
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }
  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
    e.target.value = ''
  }

  const isIdle = state === 'idle' || state === 'dragging' || state === 'error'

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => isIdle && inputRef.current?.click()}
      className={`
        border-2 border-dashed rounded-lg flex flex-col items-center justify-center
        text-center transition-all duration-200 py-8 px-6
        ${state === 'dragging'   ? 'border-primary/50 bg-primary-fixed/10 cursor-copy' : ''}
        ${state === 'processing' ? 'border-green-400/50 bg-green-50/50 cursor-default' : ''}
        ${state === 'error'      ? 'border-error/40 bg-error-container/20 cursor-pointer' : ''}
        ${state === 'uploading'  ? 'border-outline-variant/40 bg-surface-container-lowest cursor-default' : ''}
        ${state === 'idle'       ? 'border-outline-variant/60 bg-surface-container-lowest hover:border-primary/40 hover:bg-primary-fixed/5 cursor-pointer' : ''}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={onInputChange}
      />

      {state === 'uploading' && (
        <>
          <span className="material-symbols-outlined text-primary animate-spin mb-3" style={{ fontSize: '32px' }}>sync</span>
          <p className="text-sm font-medium text-on-surface">Uploading…</p>
        </>
      )}

      {state === 'processing' && (
        <>
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-green-600" style={{ fontSize: '20px' }}>check</span>
          </div>
          <p className="text-sm font-semibold text-on-surface">Uploaded — pipeline running</p>
          <p className="text-xs text-on-surface-variant mt-1">The referral will appear in the queue when ready</p>
        </>
      )}

      {state === 'error' && (
        <>
          <div className="w-10 h-10 rounded-full bg-error-container flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-error" style={{ fontSize: '20px' }}>warning</span>
          </div>
          <p className="text-sm font-semibold text-error">{error}</p>
          <p className="text-xs text-on-surface-variant mt-1">Click to try again</p>
        </>
      )}

      {(state === 'idle' || state === 'dragging') && (
        <>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors ${
            state === 'dragging' ? 'bg-primary-fixed' : 'bg-surface-container-low'
          }`}>
            <span
              className={`material-symbols-outlined transition-colors ${state === 'dragging' ? 'text-primary' : 'text-secondary'}`}
              style={{ fontSize: '24px' }}
            >
              cloud_upload
            </span>
          </div>
          <p className={`text-sm font-semibold transition-colors ${state === 'dragging' ? 'text-primary' : 'text-on-surface'}`}>
            {state === 'dragging' ? 'Drop to upload' : 'Drop a referral PDF here'}
          </p>
          <p className="text-xs text-on-surface-variant mt-1">or click to browse · PDF only</p>
        </>
      )}
    </div>
  )
}
