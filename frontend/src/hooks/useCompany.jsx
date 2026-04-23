/**
 * useCompany — Provider chargé au boot de l'app, expose les settings
 * entreprise (nom, logo, couleurs, infos LPD) à tout le frontend.
 *
 * Stratégie :
 *  1. Au mount, fetch /api/branding/ (anonyme) — donne logo + couleurs +
 *     nom. Utile pour la page de login AVANT auth.
 *  2. Une fois loggé, fetch /api/me/company/ (authentifié) — payload
 *     complet avec email DPO, adresse, etc., utilisé par PrivacyPage.
 *  3. Injecte les couleurs dans `:root` comme variables CSS
 *     (--brand-primary, --brand-secondary). Toute classe Tailwind ou
 *     règle CSS qui les référence prend effet immédiatement.
 *  4. Le hook `useCompany()` expose `{ company, refresh }`.
 *  5. Fail-soft : si le fetch échoue, on retombe sur des valeurs par
 *     défaut (couleurs qrtime.ch d'origine) — l'app reste utilisable.
 */
import {
  createContext, useCallback, useContext, useEffect, useState,
} from 'react'
import api from '../api/axiosInstance'

const DEFAULTS = {
  name: '',
  legal_form: '',
  address_line: '',
  postal_code: '',
  city: '',
  country: 'Suisse',
  dpo_contact_email: '',
  dpo_contact_phone: '',
  privacy_policy_extra: '',
  logo_data_url: '',
  primary_color: '#1e3a5f',
  secondary_color: '#10b981',
}

const CompanyContext = createContext({ company: DEFAULTS, refresh: async () => {} })

function applyBrandingCss({ primary_color, secondary_color }) {
  // Injecte les variables CSS sur :root pour qu'elles soient utilisables
  // partout via `var(--brand-primary)` (cf. index.css).
  const root = document.documentElement
  if (primary_color) root.style.setProperty('--brand-primary', primary_color)
  if (secondary_color) root.style.setProperty('--brand-secondary', secondary_color)
}

export function CompanyProvider({ children }) {
  const [company, setCompany] = useState(DEFAULTS)

  const refresh = useCallback(async () => {
    // Try authenticated endpoint first (full payload). Falls back to public
    // branding if user isn't authenticated yet (login screen).
    try {
      const { data } = await api.get('/me/company/')
      const next = { ...DEFAULTS, ...data }
      setCompany(next)
      applyBrandingCss(next)
      return next
    } catch {
      // Probablement 401 (pas loggé) — on charge juste le payload public.
      try {
        const { data } = await api.get('/branding/')
        const next = { ...DEFAULTS, ...data }
        setCompany(next)
        applyBrandingCss(next)
        return next
      } catch {
        // Backend down ou nouveau déploiement sans settings encore — on
        // garde les valeurs par défaut. L'app n'est pas bloquée.
        applyBrandingCss(DEFAULTS)
        return DEFAULTS
      }
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return (
    <CompanyContext.Provider value={{ company, refresh }}>
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompany() {
  return useContext(CompanyContext)
}
