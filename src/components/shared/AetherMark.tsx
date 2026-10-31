import { useId } from 'react'

interface AetherMarkProps {
  size?: number
  variant?: 'gradient' | 'mono'
  className?: string
}

export function AetherMark({ size = 24, variant = 'gradient', className = '' }: AetherMarkProps) {
  const uid = useId()
  const gid = 'aether-g-' + uid.replace(/[^a-zA-Z0-9]/g, '')
  const fill = variant === 'mono' ? 'currentColor' : 'url(#' + gid + ')'
  const dotFill = variant === 'mono' ? 'currentColor' : '#A78BFA'

  return (
    <svg width={size} height={size} viewBox='0 0 256 256' fill='none' aria-hidden='true' className={className}>
      {variant === 'gradient' && (
        <defs>
          <linearGradient id={gid} x1='0' y1='0' x2='1' y2='1'>
            <stop offset='0' stopColor='#A78BFA' />
            <stop offset='0.55' stopColor='#7C6CF5' />
            <stop offset='1' stopColor='#3B82F6' />
          </linearGradient>
        </defs>
      )}
      <circle cx={128} cy={128} r={96} fill='none' stroke={fill} strokeWidth={3} opacity={0.35} />
      <path d='M128 48 Q128 128 208 128 Q128 128 128 208 Q128 128 48 128 Q128 128 128 48 Z' fill={fill} />
      <circle cx={196} cy={60} r={7} fill={dotFill} />
    </svg>
  )
}