import { useEffect, useRef, useState } from 'react'

/**
 * Tick local pour le compteur "Temps travaillé du jour".
 *
 * Le backend retourne `summary.today.worked_minutes` qui inclut DÉJÀ la
 * session ouverte au moment de la requête (cap = now côté serveur), avec
 * la déduction automatique de pause appliquée si configurée.
 *
 * Ce hook ajoute les secondes écoulées depuis le fetch pour donner un
 * feedback visuel temps réel sans polling. Au prochain refresh du summary
 * (ex : retour de scan), la valeur réelle remplace l'estimation.
 *
 * @param {object} summary - Objet /api/me/summary/
 * @returns {number} Minutes travaillées, tick toutes les secondes.
 */
export function useLiveWorkedMinutes(summary) {
  const [, setTick] = useState(0)
  // Mémorise le moment du fetch côté client. Approximation suffisante :
  // on suppose un round-trip < 1s, donc fetched_at ~ Date.now() à la
  // résolution de la promesse useSummary.
  const fetchedAtRef = useRef(Date.now())

  const hasOpenSession = Boolean(summary?.today?.has_open_session)
  const workedAtFetch = summary?.today?.worked_minutes ?? 0

  // Reset l'horodatage à chaque nouveau summary (détection par identité).
  useEffect(() => {
    fetchedAtRef.current = Date.now()
    // Forcer un render pour que la nouvelle valeur s'affiche.
    setTick((t) => (t + 1) & 0xffff)
  }, [summary])

  // Tick chaque seconde uniquement si une session est ouverte.
  useEffect(() => {
    if (!hasOpenSession) return
    const id = setInterval(() => setTick((t) => (t + 1) & 0xffff), 1000)
    return () => clearInterval(id)
  }, [hasOpenSession])

  if (!hasOpenSession) return workedAtFetch
  const elapsedMin = Math.floor((Date.now() - fetchedAtRef.current) / 60000)
  return workedAtFetch + elapsedMin
}

/**
 * Variante qui renvoie en plus les secondes pour l'affichage HH:MM:SS.
 * @returns {{ minutes: number, seconds: number, isLive: boolean }}
 */
export function useLiveWorkedTime(summary) {
  const [, setTick] = useState(0)
  const fetchedAtRef = useRef(Date.now())

  const hasOpenSession = Boolean(summary?.today?.has_open_session)
  const workedAtFetch = summary?.today?.worked_minutes ?? 0

  useEffect(() => {
    fetchedAtRef.current = Date.now()
    setTick((t) => (t + 1) & 0xffff)
  }, [summary])

  useEffect(() => {
    if (!hasOpenSession) return
    const id = setInterval(() => setTick((t) => (t + 1) & 0xffff), 1000)
    return () => clearInterval(id)
  }, [hasOpenSession])

  if (!hasOpenSession) {
    return { minutes: workedAtFetch, seconds: 0, isLive: false }
  }
  const elapsedMs = Date.now() - fetchedAtRef.current
  const elapsedSec = Math.floor(elapsedMs / 1000)
  const totalSec = workedAtFetch * 60 + elapsedSec
  return {
    minutes: Math.floor(totalSec / 60),
    seconds: totalSec % 60,
    isLive: true,
  }
}
