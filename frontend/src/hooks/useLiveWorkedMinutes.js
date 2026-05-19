import { useEffect, useRef, useState } from 'react'

/**
 * Tick local pour le compteur "Temps travaillé du jour".
 *
 * Le backend retourne `summary.today.worked_minutes` qui inclut DÉJÀ la
 * session ouverte au moment de la requête (cap = now côté serveur), avec
 * la déduction automatique de pause appliquée si configurée.
 *
 * Ce hook ajoute les minutes écoulées depuis le fetch pour donner un
 * feedback visuel sans polling réseau. Au prochain refresh du summary
 * (navigation, action), la valeur réelle remplace l'estimation.
 *
 * Tick toutes les 60 secondes (granularité minute).
 *
 * @param {object} summary - Objet /api/me/summary/
 * @returns {{ minutes: number, isLive: boolean }}
 */
export function useLiveWorkedTime(summary) {
  const [, setTick] = useState(0)
  const fetchedAtRef = useRef(Date.now())

  const hasOpenSession = Boolean(summary?.today?.has_open_session)
  const workedAtFetch = summary?.today?.worked_minutes ?? 0

  // Réinitialise l'horloge à chaque nouveau summary (identité de l'objet).
  useEffect(() => {
    fetchedAtRef.current = Date.now()
    setTick((t) => (t + 1) & 0xffff)
  }, [summary])

  // Tick chaque minute uniquement si une session est ouverte.
  useEffect(() => {
    if (!hasOpenSession) return
    const id = setInterval(() => setTick((t) => (t + 1) & 0xffff), 60_000)
    return () => clearInterval(id)
  }, [hasOpenSession])

  if (!hasOpenSession) {
    return { minutes: workedAtFetch, isLive: false }
  }
  const elapsedMin = Math.floor((Date.now() - fetchedAtRef.current) / 60_000)
  return { minutes: workedAtFetch + elapsedMin, isLive: true }
}
