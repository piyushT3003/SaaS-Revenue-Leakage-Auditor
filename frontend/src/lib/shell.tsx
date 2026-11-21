import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

/** App-shell layout state.
 *  - "full":   sidebar with labels (wide screens, unless the user collapsed it)
 *  - "rail":   icon-only sidebar with tooltips (medium screens, or user-collapsed)
 *  - "drawer": sidebar hidden behind a menu button, slides in over the page (narrow screens) */
export type ShellMode = 'full' | 'rail' | 'drawer'
interface Shell { mode: ShellMode; collapsed: boolean; toggleCollapsed: () => void; drawerOpen: boolean; setDrawerOpen: (v: boolean) => void }

const Ctx = createContext<Shell | null>(null)
const KEY = 'sra.sidebar.collapsed'

function width() { return typeof window === 'undefined' ? 1600 : window.innerWidth }

export function ShellProvider({ children }: { children: ReactNode }) {
  const [w, setW] = useState(width)
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem(KEY) === '1' } catch { return false } })
  const [drawerOpen, setDrawerOpen] = useState(false)
  useEffect(() => {
    let raf = 0
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setW(width())) }
    window.addEventListener('resize', on)
    return () => { window.removeEventListener('resize', on); cancelAnimationFrame(raf) }
  }, [])
  const mode: ShellMode = w < 900 ? 'drawer' : w < 1280 || collapsed ? 'rail' : 'full'
  useEffect(() => { if (mode !== 'drawer') setDrawerOpen(false) }, [mode])
  const toggleCollapsed = () => setCollapsed((c) => { try { localStorage.setItem(KEY, c ? '0' : '1') } catch { /* storage unavailable */ } return !c })
  return <Ctx.Provider value={{ mode, collapsed, toggleCollapsed, drawerOpen, setDrawerOpen }}>{children}</Ctx.Provider>
}

export function useShell(): Shell {
  const s = useContext(Ctx)
  if (!s) throw new Error('useShell outside ShellProvider')
  return s
}
