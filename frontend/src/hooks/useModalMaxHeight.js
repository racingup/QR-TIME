import { useEffect, useState } from 'react'

/**
 * Retourne une `style.maxHeight` en pixels qui suit la hauteur visible
 * du viewport (visualViewport API). Cela permet aux modals de rester
 * scrollables lorsque le clavier virtuel iOS Safari réduit l'écran.
 *
 * Sans ça, `max-h-[90vh]` reste figé à 90 % de la hauteur initiale,
 * et le contenu (input + bouton submit) peut sortir de l'écran.
 *
 * @param {number} ratio - fraction du viewport à utiliser (0.9 par défaut)
 */
export function useModalMaxHeight(ratio = 0.9) {
  const compute = () => {
    if (typeof window === 'undefined') return undefined
    const vv = window.visualViewport
    const h = vv ? vv.height : window.innerHeight
    return Math.round(h * ratio)
  }
  const [maxHeight, setMaxHeight] = useState(compute)

  useEffect(() => {
    const update = () => setMaxHeight(compute())
    const vv = window.visualViewport
    if (vv) {
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
    }
    window.addEventListener('resize', update)
    return () => {
      if (vv) {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      }
      window.removeEventListener('resize', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratio])

  return maxHeight
}
