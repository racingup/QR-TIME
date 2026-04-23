# Guide d'utilisation — qrtime.ch

## Acceder a l'application

| | URL |
|---|---|
| Application | https://time.alpicapture.com |
| Domaine alternatif | https://qrtime.ch |

Les deux adresses menent a la meme application.

---

## Connexion

1. Ouvrir https://time.alpicapture.com
2. Entrer le **nom d'utilisateur** et le **mot de passe** fournis par l'administrateur
3. Cliquer sur **Se connecter**

> A la premiere connexion, l'application demande le consentement pour la geolocalisation et la politique de confidentialite.

---

## Roles

| Role | Acces |
|---|---|
| **Employe** | Pointer (scan QR), voir son tableau de bord, historique, calendrier, demandes d'absences/missions, exporter ses donnees |
| **Manager** | Tout ce que l'employe peut faire + vue equipe, presences en temps reel, valider/refuser absences et missions, rapports mensuels, alertes |
| **Responsable missions** | Gestion transversale des missions (tous sites) |
| **Administrateur (superuser)** | Tout + gestion des sites, utilisateurs, plages fixes, arrondis, QR codes, journal d'audit |

---

## Employe — utilisation quotidienne

### Pointer (clock in / clock out)

1. Aller sur **Scanner** dans le menu
2. Scanner le QR code du site avec la camera du telephone
3. L'application detecte automatiquement s'il s'agit d'une entree ou d'une sortie
4. La geolocalisation est verifiee (il faut etre dans le perimetre du site)

### Consulter ses heures

- **Tableau de bord** : heures du jour, solde heures sup, conges restants
- **Calendrier** : vue mensuelle avec les sessions, absences et missions
- **Historique** : cliquer sur un jour pour voir le detail

### Demander une absence

1. Menu **Demandes**
2. Choisir le type (conge, maladie, etc.), les dates, demi-journee si besoin
3. Soumettre — le manager recoit la demande a valider

### Demander une mission

1. Menu **Demandes**
2. Remplir le formulaire (lieu, dates, type de mission)
3. Soumettre — le manager ou responsable missions valide

### Mes donnees personnelles

- Menu **Mes donnees** pour :
  - Exporter toutes ses donnees (format JSON)
  - Gerer ses consentements (GPS, stockage)
  - Supprimer son compte (anonymisation)

---

## Manager — gestion de l'equipe

Accessible via le menu **Manager** (visible uniquement pour les managers).

### Vue equipe

- Statut de chaque employe : present / absent / non pointe
- Heures travaillees cette semaine vs objectif
- Solde heures sup et conges restants
- Demandes en attente (nombre)

### Presences en temps reel

- Qui est actuellement pointe (session ouverte)
- Qui est en conge aujourd'hui
- Qui n'a pas encore pointe

### Valider / refuser

- Les demandes d'absences et missions en attente apparaissent dans le tableau de bord manager
- Cliquer pour approuver ou refuser avec un commentaire

### Rapports mensuels

- Selectionner un employe et un mois
- Vue jour par jour : sessions, minutes travaillees, absences, jours feries
- Export CSV ou PDF disponible

### Saisie manuelle

- Creer un pointage a la main pour un employe (oubli de scan, mission sans QR)
- Modifier un pointage existant (correction d'horaire)

> **Important** : un manager ne peut pas modifier ses propres pointages (regle anti-fraude).

### Alertes

- Oublis de pointage (session non fermee)
- Justifications en attente de validation

---

## Administrateur — parametrage

Accessible via le menu **Admin** (visible uniquement pour les superusers).

### Sites

- Creer / modifier les sites (nom, coordonnees GPS, rayon autorise)
- Generer et imprimer les QR codes pour chaque site
- Regenerer un QR code si compromis (l'ancien devient invalide immediatement)

### Utilisateurs

- Creer des comptes employes et managers
- Modifier les roles, le site de rattachement, les objectifs horaires, les quotas de conges
- Desactiver un compte (anonymisation LPD)

### Plages fixes

- Definir les heures de debut/fin de journee standard
- Si un employe pointe hors plage, une justification est demandee

### Arrondis

- Configurer la tolerance d'arrondi (ex : 5 minutes)
- Direction : inferieur, superieur, ou au plus proche

### Journal d'audit

- Toutes les actions administratives sont tracees : qui a fait quoi, quand, depuis quelle IP
- Filtrable par action, utilisateur cible, date

---

## Premiere mise en place (administrateur)

1. Se connecter avec le compte admin initial
2. **Changer le mot de passe** du compte admin immediatement
3. Creer les **sites** avec leurs coordonnees GPS et rayon
4. **Imprimer les QR codes** et les afficher sur chaque site
5. Creer les **comptes utilisateurs** (employes et managers)
6. Attribuer chaque utilisateur a son **site de rattachement**
7. Configurer les **plages fixes** et **arrondis** si necessaire
8. Verifier que les **jours feries** du site sont renseignes

---

## Support

En cas de probleme technique, contacter l'administrateur systeme.
