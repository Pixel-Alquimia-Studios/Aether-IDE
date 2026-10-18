// Registro de comandos del chat (fase E, v0.3.0): menú desplegable al
// escribir "/" en el input. Único punto de verdad — un comando nuevo que se
// agregue aquí aparece solo en el menú (sin tocar la UI).

export interface ChatCommand {
  /** Nombre sin slash: 'qa' → se inserta "/qa " */
  name: string
  description: string
  emoji: string
  /** Clases Tailwind del avatar circular (color identitario) */
  avatarClass: string
  /** Texto exacto a insertar en el input al seleccionar */
  insert: string
}

export const CHAT_COMMANDS: ChatCommand[] = [
  {
    name: 'qa',
    description: 'BugBot: revisión de calidad — bugs, lógica y edge cases',
    emoji: '🐛',
    avatarClass: 'bg-rose-500/15 shadow-[0_0_10px_rgba(244,63,94,0.25)]',
    insert: '/qa',
  },
  {
    name: 'security',
    description: 'SecBot: auditoría de seguridad ética — vulnerabilidades',
    emoji: '🛡',
    avatarClass: 'bg-emerald-500/15 shadow-[0_0_10px_rgba(16,185,129,0.25)]',
    insert: '/security',
  },
  {
    name: 'audit',
    description: 'AuditBot: auditoría completa — calidad + seguridad',
    emoji: '📋',
    avatarClass: 'bg-amber-500/15 shadow-[0_0_10px_rgba(245,158,11,0.25)]',
    insert: '/audit',
  },
]
