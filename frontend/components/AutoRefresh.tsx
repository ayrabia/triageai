'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const INTERVAL_MS = 30_000 // 30 seconds

export default function AutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVAL_MS)
    return () => clearInterval(id)
  }, [router])

  return null
}
