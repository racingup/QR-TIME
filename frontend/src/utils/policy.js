/**
 * Helpers de calcul cohérents avec le backend.
 *
 * Doit rester aligné sur :
 *   - backend/services/sessions.py :: apply_break_deduction()
 *   - backend/services/overtime.py :: compute_overtime() (mêmes seuils)
 *
 * Le backend reste la source de vérité — ces fonctions servent uniquement
 * à éviter un round-trip API quand on a déjà la policy en mémoire (ex :
 * CalendarPage affiche un total par jour calculé depuis la liste des
 * sessions, et la policy est disponible via useSummary()).
 */

/**
 * Applique la déduction automatique de pause si elle est active dans la policy.
 *
 * @param {number} minutes - Minutes travaillées brutes (union d'intervalles).
 * @param {object} policy  - Objet `summary.policy` retourné par /api/me/summary/.
 *                            Si null/undefined → renvoie `minutes` tel quel.
 * @returns {number} Minutes nettes après déduction (0 si négatif).
 */
export function applyBreakDeduction(minutes, policy) {
  if (!policy || !policy.auto_deduct_break) return minutes
  if (minutes < (policy.break_trigger_minutes || 0)) return minutes
  const deduction = Math.max(
    0,
    (policy.break_duration_minutes || 0) - (policy.paid_break_minutes || 0),
  )
  return Math.max(0, minutes - deduction)
}
