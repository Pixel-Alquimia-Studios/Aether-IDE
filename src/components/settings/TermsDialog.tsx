import { acceptTerms } from '@/lib/terms'
import { useT } from '@/lib/i18n'

/** Diálogo de Términos y Privacidad: al primer arranque y reabrible desde Ajustes */
export function TermsDialog({ onAccept }: { onAccept: () => void }) {
  const t = useT()

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="max-h-[85vh] w-[560px] max-w-[92vw] overflow-hidden rounded-xl border border-white/10 bg-aether-surface/85 shadow-2xl backdrop-blur-2xl">
        <div className="border-b border-aether-border px-5 py-4">
          <h2 className="text-[16px] font-semibold text-white">✦ Aether IDE</h2>
          <p className="mt-1 text-[12px] text-aether-text-dim">
            {t('terms.dialogTitle')}
          </p>
        </div>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto px-5 py-4 text-[12px] leading-relaxed text-aether-text">
          <p>{t('terms.summary')}</p>

          <div>
            <p className="font-semibold text-aether-text">{t('terms.privacyTitle')}</p>
            <p className="mt-1 text-aether-text-dim">{t('terms.privacyBody')}</p>
          </div>

          <div>
            <p className="font-semibold text-aether-text">{t('terms.aiTitle')}</p>
            <p className="mt-1 text-aether-text-dim">{t('terms.aiBody')}</p>
          </div>

          <div>
            <p className="font-semibold text-aether-text">{t('terms.agentTitle')}</p>
            <p className="mt-1 text-aether-text-dim">{t('terms.agentBody')}</p>
          </div>

          <p className="text-aether-text-dim">
            {t('terms.docs')}{' '}
            <span className="font-mono text-[11px]">docs/PRIVACY.md · docs/TERMS.md</span>
          </p>
        </div>

        <div className="border-t border-aether-border px-5 py-3">
          <button
            onClick={() => {
              acceptTerms()
              onAccept()
            }}
            className="w-full rounded bg-gradient-to-br from-aether-accent to-aether-accent-strong px-3 py-2 text-[13px] font-medium text-white transition-shadow hover:shadow-[0_0_14px_rgba(167,139,250,0.4)]"
          >
            {t('terms.accept')}
          </button>
        </div>
      </div>
    </div>
  )
}
