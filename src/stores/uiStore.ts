import { create } from 'zustand'

export type SidebarView = 'explorer' | 'search' | 'ai' | 'settings' | 'git'

interface UiState {
  activeView: SidebarView
  sidebarVisible: boolean
  panelVisible: boolean
  paletteOpen: boolean
  /** Widget "Edit with prompt" (Ctrl+I) sobre el editor */
  inlineEditOpen: boolean

  setActiveView: (view: SidebarView) => void
  showView: (view: SidebarView) => void
  toggleSidebar: () => void
  togglePanel: () => void
  setPaletteOpen: (open: boolean) => void
  setInlineEditOpen: (open: boolean) => void
}

export const useUiStore = create<UiState>()((set) => ({
  activeView: 'explorer',
  sidebarVisible: true,
  panelVisible: false,
  paletteOpen: false,
  inlineEditOpen: false,

  // Si se pulsa el icono de la vista ya activa, colapsa la sidebar (comportamiento VS Code)
  setActiveView: (view) =>
    set((state) =>
      state.activeView === view
        ? { sidebarVisible: !state.sidebarVisible }
        : { activeView: view, sidebarVisible: true },
    ),
  // Muestra una vista concreta sin el comportamiento toggle del ActivityBar
  showView: (view) => set({ activeView: view, sidebarVisible: true }),
  toggleSidebar: () => set((state) => ({ sidebarVisible: !state.sidebarVisible })),
  togglePanel: () => set((state) => ({ panelVisible: !state.panelVisible })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setInlineEditOpen: (open) => set({ inlineEditOpen: open }),
}))
