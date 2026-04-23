# QRtime.ch — Site vitrine

Site de présentation de QRtime.ch (pointage numérique QR + GPS, 100% Swiss Hosting chez AlpiVault).

## Stack

- **Astro 4** — génération statique, zéro JS par défaut
- **Tailwind CSS 3** — design system glassmorphique custom
- **Inter** (via rsms.me) pour la typographie

## Dev

```bash
cd site_web_vitrine
npm install
npm run dev      # http://localhost:4321
```

## Build

```bash
npm run build    # sortie dans ./dist
npm run preview  # preview du build local
```

## Structure

```
src/
├── layouts/Layout.astro         # shell HTML + Inter + meta
├── pages/index.astro            # assemblage de la landing
├── components/
│   ├── Nav.astro                # barre glass sticky
│   ├── Hero.astro               # promesse + mock scan
│   ├── Problem.astro            # 3 pain points chiffrés
│   ├── HowItWorks.astro         # 3 étapes
│   ├── Features.astro           # 8 fonctionnalités
│   ├── UseCases.astro           # 5 cas d'usage en tabs
│   ├── Pricing.astro            # 2 plans + comparateur TCO
│   ├── Security.astro           # swiss hosting / LPD
│   ├── FAQ.astro                # 10 objections
│   ├── CTA.astro                # formulaire qualifié
│   └── Footer.astro
└── styles/global.css            # tokens glass + utilitaires
```

## Design

- **Palette** : neutre (ink-50 → ink-900) + bleu ardoise `#0D2B4E` (brand) + rouge suisse `#DA291C` (accent minimal, jamais en gradient).
- **Glass** : classes `.glass`, `.glass-strong`, `.glass-dark` dans `global.css`. Fond `backdrop-filter: blur(20–24px) saturate(160%)` + bordure translucide.
- **Pas de dégradés décoratifs**. Les halos radiaux (`.page-bg::before/after`) sont volontairement subtils (opacity 0.55, 80px blur).

## Conformité

Chaque mention de géolocalisation rappelle la proportionnalité et la conformité LPD
(finalité limitée à la preuve de présence, accès aux coordonnées précises journalisé
et restreint aux administrateurs identifiés).

## Déploiement

Statique — déployable sur Netlify, Vercel, Infomaniak ou directement chez AlpiVault.
