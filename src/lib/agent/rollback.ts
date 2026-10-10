import { deleteFile, writeFile as fsWriteFile } from '@/lib/workspace/fs'
import { useAgentStore } from '@/stores/agentStore'
import { useChatStore } from '@/stores/chatStore'
import { useEditorStore } from '@/stores/editorStore'
import { useWorkspaceStore } from '@/stores/workspaceStore'

// Agent Time Travel (Fase 5): rollback de los cambios de archivos aplicados
// por el agente desde un punto del historial. Módulo neutro para evitar
// dependencias circulares entre chatStore y agentStore.

/** TurnIds de los mensajes user desde `index` hasta el final del chat */
export function collectTurnIdsFrom(index: number): Set<string> {
  const messages = useChatStore.getState().messages
  const ids = new Set<string>()
  for (const message of messages.slice(index)) {
    if (message.role === 'user' && message.turnId) {
      ids.add(message.turnId)
    }
  }
  return ids
}

/** Restaura los archivos de los turnos indicados (en orden inverso) y trunca historial */
export async function rollbackTurns(turnIds: Set<string>): Promise<void> {
  if (turnIds.size === 0) return
  const { checkpoints } = useAgentStore.getState()
  const toRevert = checkpoints.filter((cp) => turnIds.has(cp.turnId))

  // Orden inverso: cada restauración deshace la edición más reciente primero
  for (const checkpoint of [...toRevert].reverse()) {
    try {
      if (checkpoint.previousContent !== null) {
        await fsWriteFile(checkpoint.path, checkpoint.previousContent)
      } else {
        // El archivo fue creado por el agente: se elimina (siempre dentro del
        // workspace activo; el backend lo valida y rechaza una raíz vacía)
        await deleteFile(checkpoint.path, useWorkspaceStore.getState().rootPath ?? '')
      }
    } catch {
      // Si uno no se puede restaurar, seguimos con el resto
    }
  }

  useAgentStore.getState().applyRollback(turnIds)
  useChatStore.getState().applyRollback(turnIds)

  // Refrescar las pestañas abiertas de los archivos revertidos: sin esto, la
  // pestaña seguía mostrando el contenido post-agente y Auto Save podía
  // reescribirlo sobre el archivo recién restaurado, deshaciendo el rollback
  // en silencio. Force = el contenido en disco manda (acción explícita).
  const editor = useEditorStore.getState()
  for (const path of new Set(toRevert.map((cp) => cp.path))) {
    editor.cancelAutoSave(path)
    await editor.reloadExternally(path, true)
  }

  // Persistir el estado resultante: el historial guardado refleja el rollback
  void useChatStore.getState().persistActive()
}
