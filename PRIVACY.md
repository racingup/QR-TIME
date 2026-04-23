# Politique de confidentialité — qrtime.ch

> **Ce document est un MODÈLE — à faire valider par un juriste / conseiller à la protection des données avant publication.**
> Il est servi en ligne par l'application à la route `/privacy` (frontend `PrivacyPage.jsx`).

**Version :** `2026-04-01` — toute modification doit incrémenter la constante
`PRIVACY_POLICY_VERSION` dans `backend/apps/users/views.py` ET dans `frontend/src/pages/PrivacyPage.jsx`.

**Cadre légal de référence :** Loi fédérale sur la protection des données (LPD, RS 235.1, révision en vigueur depuis le 1er septembre 2023), Ordonnance sur la protection des données (OPDo, RS 235.11), Code des obligations (CO, RS 220) et Loi sur le travail (LTr, RS 822.11).

---

## 1. Responsable du traitement

- **Nom :** [Votre organisation]
- **Adresse :** [Adresse complète en Suisse]
- **N° IDE :** [CHE-…]
- **Contact protection des données :** dataprotection@example.com (à adapter)

## 2. Données collectées

| Catégorie | Champs | Source | Finalité |
|---|---|---|---|
| Identité | username, first_name, last_name, email | création par l'admin | identification, communication |
| Pointage | clock_in/out, durée, type (OFFICE/REMOTE/MISSION) | scan de l'utilisateur | calcul du temps travaillé, salaire |
| Position GPS | latitude/longitude au scan | navigateur (avec consentement) | validation périmètre site |
| Demandes | absences (type, dates), missions (lieu, dates) | utilisateur | gestion RH |
| Consentements | kind, granted, IP, user-agent, timestamp | utilisateur | preuve (Art. 6 al. 6-7 LPD) |
| Audit administratif | actor, action, target, timestamp | système (managers) | traçabilité, sécurité (Art. 8 LPD) |
| Métadonnées techniques | IP au consentement, user-agent | navigateur | sécurité, audit |
| Domicile (coordonnées GPS) | home_lat, home_lon | sélection sur carte par l'admin | calcul du temps de trajet professionnel en mission externe (Art. 13 al. 3 OLT 1) |

**Données sensibles** (Art. 5 let. c LPD) : les absences de type `SICK` (maladie) sont des données sur la santé. Elles sont traitées uniquement dans la mesure nécessaire à la gestion des absences ; aucun détail médical n'est demandé ni stocké.

## 3. Motifs justificatifs (Art. 31 LPD)

Le traitement des données personnelles repose sur les motifs suivants :

| Donnée | Motif justificatif |
|---|---|
| Pointage | Exécution du contrat de travail (Art. 31 al. 2 let. a LPD + Art. 328b CO) |
| Conservation des enregistrements du temps de travail | Obligation légale (Art. 73 OLT 1) |
| GPS au scan | Consentement explicite (Art. 6 al. 6 LPD) |
| JWT en stockage local du navigateur | Consentement (informé à la connexion) |
| Audit administratif | Intérêt prépondérant — sécurité et intégrité (Art. 31 al. 1 LPD) |
| Données de santé (absence type SICK) | Exécution du contrat + base légale (Art. 6 al. 7 LPD) |
| Coordonnées domicile (calcul de trajet) | Exécution du contrat (Art. 31 al. 2 let. a LPD) — calcul correct du temps de travail compensable (Art. 13 al. 3 OLT 1) |

Conformément à l'**Art. 328b CO**, seules les données portant sur les aptitudes du collaborateur ou nécessaires à l'exécution du contrat sont traitées. Conformément à l'**Art. 26 OLT 3**, aucun système de surveillance du comportement n'est mis en place : la géolocalisation est uniquement ponctuelle, au moment du scan QR, et a pour seule finalité la validation du périmètre du site.

## 4. Durée de conservation

| Type de donnée | Durée | Justification |
|---|---|---|
| Enregistrements du temps de travail | 5 ans | Art. 73 al. 2 OLT 1 |
| Pièces comptables liées (salaires) | 10 ans | Art. 958f CO |
| Coordonnées GPS individuelles (par session) | 12 mois max | minimisation (Art. 6 al. 4 LPD) |
| Compte utilisateur actif | Durée du contrat de travail |  |
| Compte utilisateur après départ | 1 an puis anonymisation | gestion administrative |
| Logs d'audit | 3 ans | sécurité + preuve |
| Consentements | jusqu'à 5 ans après le retrait | preuve du consentement (Art. 6 al. 6 LPD) |

**Mécanisme d'anonymisation** (`services/audit.py::anonymize_user`) : le compte est renommé `deleted-{id}`, l'email est vidé, le mot de passe est rendu inutilisable, `is_active=False`. Les enregistrements de pointage restent rattachés à cet identifiant pseudonyme à des fins comptables et légales.

## 5. Destinataires

- **Internes :** managers (vue agrégée + équipe), superusers (administration), employé concerné (ses propres données).
- **Sous-traitants :**
  - **Hébergeur :** Infomaniak (Suisse — hébergement local, aucun transfert hors Suisse).
  - **Cartographie :** OpenStreetMap (tuiles publiques uniquement, aucune donnée personnelle transmise).
  - **Code source :** GitHub (si vous y stockez le repo — transfert vers les États-Unis encadré par le Swiss-U.S. Data Privacy Framework).
- **Aucun transfert** vers un État ne disposant pas d'un niveau de protection adéquat sans garanties supplémentaires (Art. 16 LPD).

## 6. Droits des personnes concernées

Conformément à la LPD, vous disposez des droits suivants :

- **Droit d'accès** (Art. 25 LPD) : `GET /api/me/export/` — export JSON complet, accessible via l'UI dans « Mes données ».
- **Droit à la remise des données / portabilité** (Art. 28 LPD) : couvert par le même export JSON, format structuré et lisible par machine.
- **Droit de rectification** (Art. 32 al. 1 LPD) : éditer son profil ou demander à un manager.
- **Droit à la destruction des données / effacement** (Art. 32 al. 2 LPD) : `POST /api/me/delete-account/` ou page « Mes données » → anonymisation immédiate. Les enregistrements de temps de travail sont conservés à des fins légales mais rattachés à un identifiant anonyme.
- **Droit d'opposition** (Art. 32 al. 2 let. b LPD) : contactez la personne en charge de la protection des données.
- **Retrait du consentement** (Art. 6 al. 6 LPD) : page « Mes données » → toggle par catégorie. Le retrait du consentement GPS rend impossible le pointage avec validation de périmètre.
- **Droit de plainte au PFPDT** : Préposé fédéral à la protection des données et à la transparence — https://www.edoeb.admin.ch

## 7. Sécurité (Art. 8 LPD + Art. 1-3 OPDo)

- Tous les échanges sont chiffrés en HTTPS (TLS 1.2+, HSTS activé).
- Les mots de passe sont hashés (PBKDF2, hash Django par défaut).
- Les jetons d'authentification (JWT) sont à durée limitée et le refresh token peut être révoqué.
- Les actions administratives sensibles sont journalisées de manière immuable (qui a fait quoi, quand, depuis quelle IP).
- PostgreSQL et Redis ne sont **pas** exposés sur l'IP publique (cloisonnement réseau Docker).
- Permissions explicites sur l'intégralité des points d'entrée API.
- Sauvegardes de la base de données quotidiennes et chiffrées (à activer côté hébergeur).

## 8. Annonce des violations (Art. 24 LPD)

En cas de violation susceptible d'engendrer un risque élevé pour les droits et libertés des personnes :
- **Annonce au PFPDT** dans les meilleurs délais via le formulaire en ligne : https://databreach.edoeb.admin.ch
- **Information des personnes concernées** lorsque cela est nécessaire à leur protection ou exigé par le PFPDT (Art. 24 al. 4 LPD).
- Procédure interne formalisée — voir `LPD.md`.

## 9. Conseiller à la protection des données

Conformément à l'Art. 10 LPD, [Votre organisation] a/n'a pas désigné un conseiller à la protection des données. **(Désignation facultative en Suisse, mais fortement recommandée.)** Lorsqu'il est désigné, le conseiller est joignable à : `dataprotection@example.com`.

## 10. Contact

- Protection des données : `dataprotection@example.com`
- Réclamation à l'autorité de contrôle (PFPDT) : https://www.edoeb.admin.ch
