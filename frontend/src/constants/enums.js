/**
 * Enums et labels partagés — source unique côté frontend.
 *
 * Aligné sur les TextChoices Django :
 *   - apps/absences/models.py::AbsenceRequest.AbsenceType / Status
 *   - apps/missions/models.py::Mission.MissionType / Status
 *
 * Si un label ou une valeur change côté backend, mettre à jour ici aussi.
 */

// ── Status (commun aux absences, missions, deletion requests, etc.) ──
export const STATUS_VALUE = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
}

export const STATUS_LABEL = {
  PENDING: 'En attente',
  APPROVED: 'Validé',
  REJECTED: 'Refusé',
}

export const STATUS_BADGE_COLOR = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
}

// ── Absences ──────────────────────────────────────────────────────────
export const ABSENCE_TYPE = {
  VACATION: 'VACATION',
  SICK: 'SICK',
  OTHER: 'OTHER',
}

export const ABSENCE_TYPE_LABEL = {
  VACATION: 'Congés payés',
  SICK: 'Maladie',
  OTHER: 'Autre',
}

// ── Missions ──────────────────────────────────────────────────────────
export const MISSION_TYPE = {
  REMOTE: 'REMOTE',
  FIELD: 'FIELD',
  TRAVEL: 'TRAVEL',
}

export const MISSION_TYPE_LABEL = {
  REMOTE: 'Télétravail',
  FIELD: 'Terrain',
  TRAVEL: 'Déplacement',
}

// ── Consentements LPD ────────────────────────────────────────────────
export const CONSENT_KIND = {
  GPS: 'GPS',
  STORAGE: 'STORAGE',
  PRIVACY_POLICY: 'PRIVACY_POLICY',
}

export const CONSENT_LABEL = {
  GPS: 'Géolocalisation',
  STORAGE: 'Stockage local de session',
  PRIVACY_POLICY: 'Politique de confidentialité',
}

// ── ClockSession types ────────────────────────────────────────────────
export const SESSION_TYPE = {
  OFFICE: 'OFFICE',
  REMOTE: 'REMOTE',
  MISSION: 'MISSION',
}

export const SESSION_TYPE_LABEL = {
  OFFICE: '🏢 Bureau',
  REMOTE: '🏠 Télétravail',
  MISSION: '📍 Mission',
}
