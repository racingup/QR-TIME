import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import * as meApi from '../api/me'

/**
 * Hook + provider qui partage `summary` (résultat de /api/me/summary/)
 * entre tous les composants. Évite les fetch dupliqués lorsque plusieurs
 * pages (HomePage, ScanPage, AbsenceRequestPage…) demandent les mêmes
 * données.
 *
 * Pattern : lazy fetch au premier consommateur, partagé ensuite via context.
 * Invalidation manuelle via `refresh()`.
 */

const SummaryContext = createContext(null)

export function SummaryProvider({ children }) {
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const inflight = useRef(null)

  const refresh = useCallback(async () => {
    // Déduplique : si une requête est déjà en cours, attache-toi à elle.
    if (inflight.current) return inflight.current
    setLoading(true)
    setError(null)
    inflight.current = meApi
      .summary()
      .then((data) => {
        setSummary(data)
        return data
      })
      .catch((e) => {
        setError(e)
        throw e
      })
      .finally(() => {
        inflight.current = null
        setLoading(false)
      })
    return inflight.current
  }, [])

  return (
    <SummaryContext.Provider value={{ summary, loading, error, refresh, setSummary }}>
      {children}
    </SummaryContext.Provider>
  )
}

/**
 * Hook consommateur. Si fetchOnMount=true (par défaut), déclenche
 * automatiquement un refresh la première fois qu'un composant consume.
 */
export function useSummary({ fetchOnMount = true } = {}) {
  const ctx = useContext(SummaryContext)
  if (!ctx) {
    throw new Error('useSummary() doit être utilisé dans <SummaryProvider>.')
  }
  const { summary, loading, error, refresh } = ctx
  const mounted = useRef(false)
  useEffect(() => {
    if (fetchOnMount && !summary && !loading && !mounted.current) {
      mounted.current = true
      refresh().catch(() => {})
    }
  }, [fetchOnMount, summary, loading, refresh])
  return { summary, loading, error, refresh }
}
