'use client'

import { useState } from 'react'
import {
  LayoutDashboard,
  BarChart3,
  Image as ImageIcon,
  History as HistoryIcon,
  SlidersHorizontal,
  MapIcon,
  GitCompare,
  Navigation2,
} from 'lucide-react'
import { ToastProvider } from '@/components/Platform/Toast'
import { OperationsTab } from '@/components/Platform/OperationsTab'
import { InspectTab } from '@/components/Platform/InspectTab'
import { HistoryTab } from '@/components/Platform/HistoryTab'
import { ParkMapTab } from '@/components/Platform/ParkMapTab'
import { SettingsTab } from '@/components/Platform/SettingsTab'
import { DiffTab } from '@/components/Platform/DiffTab'
import { PlanTab } from '@/components/Platform/PlanTab'
import { OverviewTab } from '@/components/Platform/OverviewTab'

type Tab = 'operations' | 'inspect' | 'history' | 'settings' | 'parkmap' | 'diff' | 'plan' | 'overview'

export default function PlatformPage() {
  return (
    <ToastProvider>
      <PlatformShell />
    </ToastProvider>
  )
}

function PlatformShell() {
  const [tab, setTab] = useState<Tab>('operations')

  return (
    <main className="ax-page">
      <div className="shell">
        {/* Rail navigation */}
        <aside className="rail">
          {/* Rail brand */}
          <div className="rail-brand">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                background: 'linear-gradient(135deg, #0ea5e9, #06b6d4)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 18,
                fontWeight: 800,
                color: '#fff',
              }}
            >
              A
            </div>
          </div>

          {/* Navigation buttons */}
          <nav className="rail-nav tab-bar">
            <button
              type="button"
              className={`rail-link ${tab === 'overview' ? 'active' : ''}`}
              onClick={() => setTab('overview')}
              title="Overview"
            >
              <BarChart3 size={16} />
              <span>Overview</span>
            </button>
            <button
              type="button"
              className={`rail-link ${tab === 'operations' ? 'active' : ''}`}
              onClick={() => setTab('operations')}
              title="Operations"
            >
              <LayoutDashboard size={16} />
              <span>Operations</span>
            </button>
            <button
              type="button"
              className={`rail-link ${tab === 'inspect' ? 'active' : ''}`}
              onClick={() => setTab('inspect')}
              title="Inspect"
            >
              <ImageIcon size={16} />
              <span>Inspect</span>
            </button>
            <button
              type="button"
              className={`rail-link ${tab === 'history' ? 'active' : ''}`}
              onClick={() => setTab('history')}
              title="History"
            >
              <HistoryIcon size={16} />
              <span>History</span>
            </button>
            <button
              type="button"
              className={`rail-link ${tab === 'parkmap' ? 'active' : ''}`}
              onClick={() => setTab('parkmap')}
              title="Park Map"
              data-testid="tab-parkmap"
            >
              <MapIcon size={16} />
              <span>Park Map</span>
            </button>
            <button
              type="button"
              className={`rail-link ${tab === 'diff' ? 'active' : ''}`}
              onClick={() => setTab('diff')}
              title="Diff"
            >
              <GitCompare size={16} />
              <span>Diff</span>
            </button>
            <button
              type="button"
              className={`rail-link ${tab === 'plan' ? 'active' : ''}`}
              onClick={() => setTab('plan')}
              title="Plan"
              data-testid="tab-plan"
            >
              <Navigation2 size={16} />
              <span>Plan</span>
            </button>
            <button
              type="button"
              className={`rail-link ${tab === 'settings' ? 'active' : ''}`}
              onClick={() => setTab('settings')}
              title="Settings"
            >
              <SlidersHorizontal size={16} />
              <span>Settings</span>
            </button>
          </nav>

          {/* Rail footer */}
          <div className="rail-foot">
            <div className="rail-status ok">
              <span />
              Axalon Platform
            </div>
            <div className="rail-foot-line">YOLO11m</div>
          </div>
        </aside>

        {/* Main content area */}
        <div className="wrap tab-content platform-container">
          {tab === 'overview' && <OverviewTab />}
          {tab === 'operations' && <OperationsTab />}
          {tab === 'inspect' && <InspectTab />}
          {tab === 'history' && <HistoryTab />}
          {tab === 'settings' && <SettingsTab />}
          {tab === 'parkmap' && <ParkMapTab />}
          {tab === 'diff' && <DiffTab />}
          {tab === 'plan' && <PlanTab />}
        </div>
      </div>
    </main>
  )
}
