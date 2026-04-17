'use client'

import { useEffect } from 'react'
import { scrollStore } from '@/scrollStore'
import SplitLayout from '@/components/Layout/SplitLayout'
import DynamicMainScene from '@/components/DynamicMainScene'
import LeftPanel from '@/components/UI/LeftPanel'

export default function Home() {
  // Wire scroll → scrollStore (zero re-renders — raw mutation, read by R3F useFrame)
  useEffect(() => {
    const update = () => {
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
      scrollStore.progress = window.scrollY / maxScroll
      scrollStore.raw = window.scrollY
    }
    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [])

  return (
    <SplitLayout
      leftContent={<LeftPanel />}
      rightContent={<DynamicMainScene />}
    />
  )
}
