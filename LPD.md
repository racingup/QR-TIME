# Conformité LPD — qrtime.ch

> Ce document est un **registre interne** + **checklist** de conformité à la
> Loi fédérale suisse sur la protection des données (LPD, RS 235.1).
> Il complète `PRIVACY.md` (politique publique). À tenir à jour.

**Cadre légal :**
- LPD — Loi fédérale sur la protection des données (RS 235.1, en vigueur depuis le 1er sept. 2023)
- OPDo — Ordonnance sur la protection des données (RS 235.11)
- CO — Code des obligations (RS 220)
- LTr — Loi sur le travail (RS 822.11) + ordonnances OLT 1 / OLT 3
- LPart — Loi sur l'information et la consultation des travailleurs (RS 822.14)

---

## A. Registre des activités de traitement (Art. 12 LPD)

### Traitement n°1 — Pointage du temps de travail

| Champ | Valeur |
|---|---|
| Finalité | Enregistrer le temps de travail effectif des collaborateurs |
| Catégories de personnes | Salariés de l'organisation |
| Catégories de données | Identité, horaires, durées, type de session, GPS au scan |
| Destinataires | Service RH, manager direct, l'intéressé |
| Sous-traitants | Infomaniak (hébergement, Suisse) |
| Transferts à l'étranger | Aucun |
| Durée de conservation | Pointages : 5 ans (Art. 73 al. 2 OLT 1) · GPS individuels : 12 mois |
| Mesures de sécurité | TLS, hash de mots de passe, JWT, audit log, sauvegardes chiffrées |
| Motif justificatif | Art. 31 al. 2 let. a LPD (contrat de travail) + Art. 6 al. 6 LPD (consentement GPS) |

### Traitement n°2 — Gestion des absences et missions

| Champ | Valeur |
|---|---|
| Finalité | Gérer les demandes de congés, télétravail, missions |
| Catégories de données | Identité, dates, type d'absence, motif (libre texte), commentaires manager |
| Particularité | Type `SICK` = donnée de santé Art. 5 let. c LPD — usage strictement RH |
| Durée | Durée du contrat + 1 an |
| Motif justificatif | Art. 31 al. 2 let. a LPD + Art. 6 al. 7 LPD pour les arrêts maladie |

### Traitement n°3 — Audit administratif

| Champ | Valeur |
|---|---|
| Finalité | Traçabilité des actions sensibles (Art. 8 LPD — sécurité des données) |
| Catégories de données | acteur, action, cible, IP, timestamp |
| Durée | 3 ans |
| Motif justificatif | Art. 31 al. 1 LPD (intérêt prépondérant — sécurité) |

### Traitement n°4bis — Coordonnées domicile pour calcul du temps de trajet

| Champ | Valeur |
|---|---|
| Finalité | Comptabiliser le **temps de trajet professionnel supplémentaire** dû lors d'une mission externe (Art. 13 al. 3 OLT 1 — temps de déplacement). Calcul = trajet domicile → mission, MOINS trajet standard domicile → site de rattachement. |
| Catégories de données | Coordonnées GPS du domicile (lat/lon), trajet standard en minutes |
| Saisie | Par l'admin uniquement (sélection sur carte). L'employé ne peut PAS modifier ses propres coordonnées domicile (anti-fraude — vise à éviter qu'un employé gonfle artificiellement son temps de trajet). |
| Granularité | Coordonnées GPS exactes (sélection au clic sur la carte). Pas d'adresse postale stockée. |
| Sous-traitants | OpenRouteService (calculateur de trajet open source, hébergé en Allemagne) — appelé avec lat/lon uniquement, jamais d'identifiant utilisateur. |
| Transferts à l'étranger | Oui — appel HTTP à api.openrouteservice.org (DE, UE, niveau de protection adéquat reconnu). |
| Durée | Durée du contrat. Effacées à l'anonymisation du compte. |
| Motif justificatif | Art. 31 al. 2 let. a LPD (exécution du contrat de travail — calcul correct du temps de travail compensable). |

### Traitement n°5 — Consentements

| Champ | Valeur |
|---|---|
| Finalité | Preuve du consentement (Art. 6 al. 6 LPD) |
| Données | user, kind, granted, IP, user-agent, timestamp |
| Durée | 5 ans après le retrait |
| Motif justificatif | Obligation de prouver le consentement |

---

## B. Analyse d'impact (AIPD) — Art. 22 LPD

⚠ **Une AIPD est obligatoire** si le traitement est susceptible d'entraîner
un risque élevé pour la personnalité ou les droits fondamentaux des personnes
concernées (Art. 22 al. 1 LPD).

Le traitement « Pointage avec géolocalisation des salariés » mérite une analyse
explicite, en particulier au regard de l'**Art. 26 OLT 3** qui interdit les
systèmes de surveillance ou de contrôle du comportement des travailleurs au
poste de travail.

**À évaluer :**
- Le scan GPS est-il occasionnel (uniquement à la prise de poste) ou systématique ? → **occasionnel chez nous : uniquement au scan QR**
- Le périmètre est-il proportionné ? → rayon configurable par site/mission, fixé par le manager
- Les employés peuvent-ils consulter et contester leurs données ? → **oui** (page « Mes données »)
- Existe-t-il un mode dégradé sans GPS ? → télétravail/REMOTE n'utilise pas le GPS

**Recommandation :** documenter une AIPD allégée et la conserver. Voir le guide
du PFPDT : https://www.edoeb.admin.ch/fr/protection-des-donnees/principes-generaux/analyse-d-impact-relative-a-la-protection-des-donnees

---

## C. Sous-traitants — accords à formaliser (Art. 9 LPD)

| Sous-traitant | Service | Accord de sous-traitance ? | Pays |
|---|---|---|---|
| Infomaniak | Hébergement VPS | ☐ à formaliser | Suisse |
| OpenStreetMap | Tuiles cartographiques | n/a (pas de PII envoyée) | International |
| GitHub | Hébergement code source | ☐ accord standard Microsoft | États-Unis (Swiss-U.S. DPF) |
| Let's Encrypt | Certificats TLS (via Caddy) | n/a (pas de données utilisateur) | International |

L'Art. 9 LPD impose que la sous-traitance soit régie par un contrat ou par la
loi, et que le sous-traitant garantisse au minimum le même niveau de protection
des données que le responsable.

---

## D. Procédure d'annonce des violations (Art. 24 LPD)

**Délai :** « dans les meilleurs délais » (pas de délai chiffré comme à l'étranger,
mais le PFPDT recommande dans la mesure du possible un délai de 72 h).

### Étapes
1. **Détecter** : alerte (logs, monitoring, rapport interne)
2. **Contenir** : isoler le système compromis, révoquer les accès si besoin
3. **Évaluer** :
   - Quelles catégories de données ?
   - Combien de personnes concernées ?
   - Risques (usurpation, atteinte à la personnalité, financier) ?
4. **Annoncer au PFPDT** si le risque est élevé : https://databreach.edoeb.admin.ch
5. **Informer les personnes** lorsque cela est nécessaire à leur protection ou exigé par le PFPDT (Art. 24 al. 4 LPD)
6. **Documenter** la violation dans un registre interne, même si non annoncée

### Contacts d'urgence
- Conseiller à la protection des données : `dataprotection@example.com`
- Hébergeur (incident) : Infomaniak +41 22 820 35 44
- PFPDT : +41 58 462 43 95

---

## E. Checklist conformité

### Technique (couvert par le code)
- [x] Politique de confidentialité accessible publiquement (`/privacy`)
- [x] Consentement explicite tracé (`ConsentLog`)
- [x] Droit d'accès et portabilité (`/api/me/export/`)
- [x] Droit à la destruction (`/api/me/delete-account/` → anonymisation)
- [x] Audit log des actions admin (`AdminAuditLog`)
- [x] HTTPS forcé en prod, HSTS activé
- [x] Mots de passe hashés
- [x] Permissions DRF explicites sur tous les endpoints
- [x] Pas d'exposition publique de la DB
- [x] Données minimisées (GPS uniquement au scan, pas en continu — Art. 6 al. 4 LPD)
- [x] Pseudonymisation au lieu de suppression brute (intégrité comptable)

### Organisationnel (à votre charge)
- [ ] Politique de confidentialité validée par un juriste
- [ ] Conseiller à la protection des données désigné (Art. 10 LPD — facultatif mais recommandé)
- [ ] Accords de sous-traitance signés avec tous les sous-traitants (Art. 9 LPD)
- [ ] AIPD réalisée pour le traitement avec géolocalisation (Art. 22 LPD)
- [ ] Information préalable des employés (note de service, contrat de travail) — Art. 19 LPD
- [ ] Consultation de la commission du personnel le cas échéant (LPart)
- [ ] Registre interne des activités tenu à jour (Art. 12 LPD)
- [ ] Procédure d'annonce de violation testée
- [ ] Sauvegardes quotidiennes et test de restauration
- [ ] Formation des utilisateurs internes (managers, admins)
- [ ] Charte d'usage de l'application signée par les utilisateurs

### Recommandations futures
- [ ] Auto-purge GPS individuels après 12 mois (Celery beat — non implémenté)
- [ ] 2FA pour les superusers
- [ ] Rate-limiting sur les endpoints d'authentification
- [ ] Headers CSP stricts
- [ ] Auto-purge des audit logs après 3 ans
- [ ] Notifications email sur changement de données sensibles
