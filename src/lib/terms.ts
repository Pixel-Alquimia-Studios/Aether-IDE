// Estado de aceptación de Términos y Privacidad (persistido en localStorage)
const ACCEPTED_KEY = 'aether-ide-terms-accepted'

export function termsAccepted(): boolean {
  try {
    return localStorage.getItem(ACCEPTED_KEY) === 'true'
  } catch {
    return false
  }
}

export function acceptTerms(): void {
  try {
    localStorage.setItem(ACCEPTED_KEY, 'true')
  } catch {
    // localStorage no disponible
  }
}
