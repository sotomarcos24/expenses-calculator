import { decimalSign, formatSignedCurrency, formatSignedPercent } from '../lib/format.ts'

/** Colour of a gain/loss: green above zero, red below, normal text at zero. */
function gainToneClass(gain: string): string {
  const sign = decimalSign(gain)
  return sign > 0 ? 'text-gain' : sign < 0 ? 'text-loss' : 'text-foreground'
}

type GainLossProps = {
  /** Gain in money, as returned by the API (may be negative, e.g. "-50.00"). */
  gain: string
  /** Gain as a fraction ("0.1500" = 15%), `null` when nothing was invested. */
  gainPct: string | null
  /** `stacked` puts the percentage under the amount (table); `inline` keeps them on one line. */
  layout?: 'stacked' | 'inline'
  className?: string
}

/**
 * Gain/loss in $ and %, both with an explicit sign (so colour is never the only cue). A `—`
 * percentage is shown in normal text.
 */
export function GainLoss({ gain, gainPct, layout = 'stacked', className = '' }: GainLossProps) {
  const tone = gainToneClass(gain)
  return (
    <span className={['tabular-nums', className].filter(Boolean).join(' ')}>
      <span className={`font-medium ${tone}`}>{formatSignedCurrency(gain)}</span>
      {layout === 'inline' ? ' ' : null}
      <span
        className={[
          layout === 'stacked' && 'block text-xs',
          gainPct === null ? 'text-foreground' : tone,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {formatSignedPercent(gainPct)}
      </span>
    </span>
  )
}
