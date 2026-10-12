'use client'
import { relativeExpiry } from '../lib/relative-expiry'
import { useEffect, useState } from 'react'
export function DateValue({ value, showRelative = true }: { value: string; showRelative?: boolean }) {
  const [local, setLocal] = useState(false)
  useEffect(() => setLocal(true), [])
  const date = new Date(Number(value) * 1000)
  const formatted = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23', ...(!local ? { timeZone: 'UTC' } : {}) }).format(date)
  return <><time dateTime={date.toISOString()}>{formatted}</time>{showRelative && <span className="subtext" suppressHydrationWarning>{relativeExpiry(date.getTime(), Date.now())}</span>}</>
}
