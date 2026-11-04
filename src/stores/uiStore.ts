import { create } from 'zustand'

export type SidebarView = 'explorer' | 'search' | 'ai' | 'settings' | 'git' | 'extensions'
/** Secciones internas del panel de Ajustes (vive aquí para navegación externa) */
export type SettingsSection = 'general' | 'providers' | 'permissions'

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
  /** Panel DERECHO del chat visible (se cierra con ✕ en su cabecera) */
  chatPanelVisible: boolean
  /** Diálogo de Términos y Privacidad abierto (reabrible desde Ajustes) */
  termsDialogOpen: boolean
  /** Sección activa de Ajustes (el chat puede abrir Ajustes en proveedores) */
  settingsSection: SettingsSection

  setActiveView: (view: SidebarView) => void
  showView: (view: SidebarView) => void
  toggleSidebar: () => void
  togglePanel: () => void
  /** Abre el panel de terminal (Ctrl+J con cero terminales, Lote B) */
  showPanel: () => void
  setPaletteOpen: (open: boolean) => void
  setInlineEditOpen: (open: boolean) => void
  toggleAutoSave: () => void
  setOpenMenu: (menu: string | null) => void
  setChatPanelVisible: (open: boolean) => void
  setTermsDialogOpen: (open: boolean) => void
  /** Abre Ajustes en la sección indicada (botón 401/403 del chat) */
  openSettings: (section?: SettingsSection) => void
  setSettingsSection: (section: SettingsSection) => void
}

export const useUiStore = create<UiState>()((set) => ({
  activeView: 'explorer',
  sidebarVisible: true,
  panelVisible: false,
  paletteOpen: false,
  inlineEditOpen: false,
  autoSave: false,
  openMenu: null,
  chatPanelVisible: true,
  termsDialogOpen: false,
  settingsSection: 'general',

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
  showPanel: () => set({ panelVisible: true }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  setInlineEditOpen: (open) => set({ inlineEditOpen: open }),
  toggleAutoSave: () => set((state) => ({ autoSave: !state.autoSave })),
  setOpenMenu: (menu) => set({ openMenu: menu }),
  setChatPanelVisible: (open) => set({ chatPanelVisible: open }),
  setTermsDialogOpen: (open) => set({ termsDialogOpen: open }),
  openSettings: (section) =>
    set({ activeView: 'settings', sidebarVisible: true, settingsSection: section ?? 'general' }),
  setSettingsSection: (section) => set({ settingsSection: section }),
}))
