import { create } from 'zustand'

export type SidebarView = 'explorer' | 'search' | 'ai' | 'settings' | 'git' | 'extensions'

interface UiState {
  activeView: SidebarView
  sidebarVisible: boolean
  panelVisible: boolean
  paletteOpen: boolean
  /** Widget "Edit with prompt" (Ctrl+I) sobre el editor */
  inlineEditOpen: boolean
  /** Auto-guardado al editar (menú Archivo) */
  autoSave: boolean
  /** Menú desplegable abierto (null = cerrado) */
  openMenu: string | null

  setActiveView: (view: SidebarView) => void
  showView: (view: SidebarView) => void
  toggleSidebar: () => void
  togglePanel: () => void
  setPaletteOpen: (open: boolean) => void
  setInlineEditOpen: (open: boolean) => void
  toggleAutoSave: () => void
  setOpenMenu: (menu: string | null) => void
}

export const useUiStore = create<UiState>()((set) => ({
  activeView: 'explorer',
  sidebarVisible: true,
  panelVisible: false,
  paletteOpen: false,
  inlineEditOpen: false,
  autoSave: false,
  openMenu: null,

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
  toggleAutoSave: () => set((state) => ({ autoSave: !state.autoSave })),
  setOpenMenu: (menu) => set({ openMenu: menu }),
}))
