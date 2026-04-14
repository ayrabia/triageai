'use client'

import { useCallback, useRef, useState } from 'react'
import { uploadReferral } from '@/lib/api'

interface Props {
  token: string
  onUploaded: () => void  // called after successful upload so queue can refresh
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

      // Reset to idle after 6 seconds so the zone is ready for the next upload
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
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (state === 'dragging') setState('idle')
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
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
        relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
        px-6 py-8 transition-all duration-150
        ${state === 'dragging'
          ? 'border-indigo-400 bg-indigo-50 cursor-copy'
          : state === 'processing'
          ? 'border-green-300 bg-green-50 cursor-default'
          : state === 'error'
          ? 'border-red-300 bg-red-50 cursor-pointer'
          : state === 'uploading'
          ? 'border-indigo-200 bg-white cursor-default'
          : 'border-slate-200 bg-white hover:border-indigo-300 hover:bg-slate-50 cursor-pointer'
        }
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
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          <p className="text-sm font-medium text-slate-600">Uploading…</p>
        </>
      )}

      {state === 'processing' && (
        <>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-100">
            <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700">Uploaded — pipeline running</p>
            <p className="text-xs text-slate-400 mt-0.5">The referral will appear in the queue below when ready</p>
          </div>
        </>
      )}

      {state === 'error' && (
        <>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100">
            <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <p className="text-xs text-slate-400 mt-0.5">Click to try again</p>
          </div>
        </>
      )}

      {(state === 'idle' || state === 'dragging') && (
        <>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
            state === 'dragging' ? 'bg-indigo-100' : 'bg-slate-100'
          }`}>
            <svg
              className={`h-5 w-5 transition-colors ${state === 'dragging' ? 'text-indigo-600' : 'text-slate-400'}`}
              fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
          </div>
          <div className="text-center">
            <p className={`text-sm font-medium transition-colors ${state === 'dragging' ? 'text-indigo-700' : 'text-slate-600'}`}>
              {state === 'dragging' ? 'Drop to upload' : 'Drop a referral PDF here'}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">or click to browse · PDF only</p>
          </div>
        </>
      )}
    </div>
  )
}
