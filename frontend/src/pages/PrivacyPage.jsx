/**
 * Politique de confidentialité — accessible sans authentification.
 * IMPORTANT : ce contenu est un POINT DE DÉPART à faire valider par un juriste.
 * Adapter avant mise en production publique.
 */
export default function PrivacyPage() {
  return (
    <div className="px-4 max-w-3xl mx-auto py-6 prose prose-slate">
      <div className="glass rounded-3xl p-6 space-y-4 text-sm leading-relaxed text-slate-700">
        <header>
          <p className="text-xs uppercase tracking-widest text-slate-500">Protection des données</p>
          <h1 className="text-2xl font-semibold text-slate-900">Politique de confidentialité</h1>
          <p className="text-xs text-slate-500">Version 2026-04-01</p>
        </header>

        <section>
          <h2 className="font-semibold text-slate-900">1. Responsable du traitement</h2>
          <p>
            <strong>[Nom de votre organisation]</strong> — adresse, n° IDE, contact protection des données :{' '}
            <a href="mailto:dataprotection@example.com" className="text-blue-700 underline">dataprotection@example.com</a>.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">2. Données collectées</h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Identité :</strong> nom d'utilisateur, prénom, nom, email.</li>
            <li><strong>Données de pointage :</strong> horaires d'arrivée/départ, durée travaillée, sessions ouvertes.</li>
            <li><strong>Position GPS :</strong> uniquement au moment du scan d'un QR — pour valider que vous êtes bien sur le site. <strong>Non stockée à long terme</strong> au-delà de la session de pointage.</li>
            <li><strong>Demandes :</strong> congés (type, dates), missions / télétravail (lieu, dates), justifications.</li>
            <li><strong>Métadonnées techniques :</strong> adresse IP au moment du consentement, user-agent, JWT en stockage local pour maintenir la session.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">3. Motifs justificatifs</h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Exécution du contrat de travail</strong> (Art. 31 al. 2 let. a LPD + Art. 328b CO) : pointage des heures, gestion des absences/congés.</li>
            <li><strong>Obligation légale</strong> (Art. 73 OLT 1) : conservation des enregistrements du temps de travail.</li>
            <li><strong>Consentement explicite</strong> (Art. 6 al. 6 LPD) : géolocalisation au scan, stockage local du JWT.</li>
            <li><strong>Intérêt prépondérant</strong> (Art. 31 al. 1 LPD) : audit administratif pour la sécurité.</li>
          </ul>
          <p className="text-xs text-slate-500">
            Conformément à l'<strong>Art. 328b CO</strong>, seules les données nécessaires à l'exécution du contrat
            sont traitées. Conformément à l'<strong>Art. 26 OLT 3</strong>, aucun système de surveillance du
            comportement n'est mis en place : la géolocalisation est uniquement ponctuelle, au moment du scan QR.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">4. Durée de conservation</h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Enregistrements du temps de travail :</strong> 5 ans (Art. 73 al. 2 OLT 1).</li>
            <li><strong>Pièces comptables (salaires) :</strong> 10 ans (Art. 958f CO).</li>
            <li><strong>Données GPS individuelles :</strong> 12 mois maximum, puis suppression.</li>
            <li><strong>Compte utilisateur :</strong> jusqu'à votre demande de suppression ou départ + 1 an.</li>
            <li><strong>Logs d'audit :</strong> 3 ans.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">5. Vos droits</h2>
          <p>Conformément à la LPD, vous disposez des droits suivants :</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Droit d'accès et de portabilité</strong> (Art. 25 et 28 LPD) : page « Mes données » → bouton "Télécharger mes données" (export JSON complet)</li>
            <li><strong>Droit de rectification</strong> (Art. 32 al. 1 LPD) : via votre profil, ou demandez à votre manager</li>
            <li><strong>Droit à la destruction</strong> (Art. 32 al. 2 LPD) : page « Mes données » → bouton "Supprimer mon compte" (anonymisation immédiate, les pointages sont conservés rattachés à un identifiant anonyme à des fins légales)</li>
            <li><strong>Droit d'opposition</strong> (Art. 32 al. 2 let. b LPD) : contactez la personne en charge de la protection des données</li>
            <li><strong>Retrait du consentement</strong> (Art. 6 al. 6 LPD) : retirez votre consentement GPS à tout moment dans « Mes données » (le pointage avec validation de périmètre deviendra impossible)</li>
            <li><strong>Plainte au PFPDT</strong> : <a href="https://www.edoeb.admin.ch" target="_blank" rel="noreferrer" className="text-blue-700 underline">edoeb.admin.ch</a></li>
          </ul>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">6. Sous-traitants</h2>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Hébergeur :</strong> Infomaniak (Suisse — hébergement local, aucun transfert hors Suisse)</li>
            <li><strong>Cartes :</strong> OpenStreetMap (uniquement pour visualiser le périmètre GPS d'un site, aucune donnée personnelle transmise)</li>
            <li><strong>Code source :</strong> [GitHub si vous l'utilisez — transfert vers les États-Unis encadré par le Swiss-U.S. Data Privacy Framework]</li>
          </ul>
          <p className="text-xs text-slate-500">
            Aucun transfert vers un État ne disposant pas d'un niveau de protection adéquat n'est effectué
            sans garanties supplémentaires (Art. 16 LPD).
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">7. Sécurité (Art. 8 LPD + OPDo)</h2>
          <p>
            Tous les échanges sont chiffrés en HTTPS (TLS 1.2+, HSTS). Les mots de passe sont hashés (PBKDF2/bcrypt).
            Les jetons d'authentification (JWT) sont à durée limitée. Les actions administratives sensibles
            sont journalisées (qui a fait quoi, quand). Les sauvegardes sont chiffrées.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">8. Contact</h2>
          <p>
            Pour toute question : <a href="mailto:dataprotection@example.com" className="text-blue-700 underline">dataprotection@example.com</a>.
          </p>
          <p className="text-xs text-slate-500">
            Autorité de contrôle : Préposé fédéral à la protection des données et à la transparence (PFPDT) —{' '}
            <a href="https://www.edoeb.admin.ch" target="_blank" rel="noreferrer" className="text-blue-700 underline">edoeb.admin.ch</a>.
          </p>
        </section>
      </div>
    </div>
  )
}
