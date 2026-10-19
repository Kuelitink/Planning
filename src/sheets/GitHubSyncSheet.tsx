/**
 * Sauvegarde GitHub : configuration (dépôt privé, clé d'accès, mot de passe de chiffrement),
 * puis état, envoi manuel, restauration et déconnexion.
 */

import { useId, useState } from 'react';
import { useNav } from '../state/nav';
import { useSync } from '../state/sync';
import { Field, Sheet } from '../ui/kit';
import { formatDeadline } from '../ui/format';
import '../modes/cycle.css';

const NEW_REPO = 'https://github.com/new';
const NEW_TOKEN = 'https://github.com/settings/personal-access-tokens/new';

export function GitHubSyncSheet({ onClose }: { onClose: () => void }) {
  const { status, connect, restore, pushNow, setAuto, disconnect } = useSync();
  const { showToast } = useNav();
  const ids = { repo: useId(), token: useId(), pw: useId(), pw2: useId(), auto: useId(), auto2: useId() };
  const [repo, setRepo] = useState('Kuelitink/planning-donnees');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [auto, setAutoInput] = useState(true);
  const [error, setError] = useState('');
  /** Une sauvegarde existait déjà au moment de connecter : la récupérer ? */
  const [remote, setRemote] = useState<{ savedAt: string } | null>(null);
  const [working, setWorking] = useState('');

  const run = async (label: string, job: () => Promise<void>) => {
    setError('');
    setWorking(label);
    try {
      await job();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Échec.');
    } finally {
      setWorking('');
    }
  };

  const canConnect = repo.trim() && token.trim() && password.length >= 8 && password === password2 && !working;

  const doConnect = () =>
    run('Vérification et chiffrement…', async () => {
      const out = await connect({ repo, token, password, auto });
      setPassword('');
      setPassword2('');
      setToken('');
      if (out.remote) setRemote(out.remote);
      else showToast({ message: 'Sauvegarde GitHub activée' });
    });

  if (remote) {
    return (
      <Sheet title="Sauvegarde trouvée" onClose={onClose}>
        <p className="cy-card__sub" style={{ lineHeight: 1.5 }}>
          Une sauvegarde chiffrée du {formatDeadline(remote.savedAt)} existe dans ce dépôt, et ton mot de passe l'ouvre. Que faire des
          données de ce téléphone ?
        </p>
        <div className="sheet__actions">
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={Boolean(working)}
            onClick={() =>
              run('Récupération…', async () => {
                await restore('merge');
                showToast({ message: 'Sauvegarde récupérée et fusionnée' });
                setRemote(null);
              })
            }
          >
            Fusionner avec la sauvegarde
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--block"
            disabled={Boolean(working)}
            onClick={() =>
              run('Récupération…', async () => {
                if (!window.confirm('Remplacer toutes les données de ce téléphone par la sauvegarde ?')) return;
                await restore('replace');
                showToast({ message: 'Données remplacées par la sauvegarde' });
                setRemote(null);
              })
            }
          >
            Remplacer ce téléphone par la sauvegarde
          </button>
        </div>
        {working && <p className="cy-foot">{working}</p>}
        {error && (
          <p className="cy-error" role="alert">
            {error}
          </p>
        )}
        <p className="cy-foot">Fusionner garde tout : pour chaque élément, la version modifiée le plus récemment l'emporte.</p>
      </Sheet>
    );
  }

  if (status.configured) {
    return (
      <Sheet title="Sauvegarde GitHub" onClose={onClose}>
        <div>
          <Field label="Dépôt">{status.repoName}</Field>
          <Field label="Dernier envoi">
            {status.busy ? 'En cours…' : status.lastPushAt ? formatDeadline(status.lastPushAt) : 'Pas encore'}
          </Field>
          <Field label="Envoi automatique" htmlFor={ids.auto}>
            <input
              id={ids.auto}
              type="checkbox"
              role="switch"
              className="switch"
              checked={status.auto}
              onChange={(e) => void setAuto(e.target.checked)}
            />
          </Field>
        </div>
        {status.pending && !status.busy && <p className="cy-foot">Modifications en attente : envoi dans moins d'une minute.</p>}
        {(error || status.lastError) && (
          <p className="cy-error" role="alert">
            {error || status.lastError}
          </p>
        )}
        <div className="sheet__actions">
          <button
            type="button"
            className="btn btn--primary btn--block"
            disabled={status.busy || Boolean(working)}
            onClick={() =>
              run('Envoi…', async () => {
                await pushNow();
                showToast({ message: 'Sauvegarde à jour sur GitHub' });
              })
            }
          >
            Sauvegarder maintenant
          </button>
          <button
            type="button"
            className="btn btn--secondary btn--block"
            disabled={status.busy || Boolean(working)}
            onClick={() =>
              run('Récupération…', async () => {
                const replace = window.confirm('Remplacer toutes les données de ce téléphone par la sauvegarde ? (Annuler = fusionner)');
                await restore(replace ? 'replace' : 'merge');
                showToast({ message: replace ? 'Données remplacées par la sauvegarde' : 'Sauvegarde récupérée et fusionnée' });
              })
            }
          >
            Récupérer la sauvegarde
          </button>
          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={() => {
              if (
                !window.confirm(
                  'Déconnecter ce téléphone ? La sauvegarde reste sur GitHub ; il faudra la clé d’accès et le mot de passe pour reconnecter.',
                )
              )
                return;
              void disconnect().then(() => showToast({ message: 'Sauvegarde GitHub déconnectée' }));
            }}
          >
            Déconnecter ce téléphone
          </button>
        </div>
        {working && <p className="cy-foot">{working}</p>}
        <p className="cy-foot">
          Les données sont chiffrées sur le téléphone avant l'envoi (AES-256) : sur GitHub, le fichier est illisible sans ton mot de passe.
          L'envoi se fait une minute après chaque modification et quand tu quittes l'appli, tant qu'elle est ouverte. Pensé pour un
          téléphone : avec plusieurs appareils, une suppression peut revenir.
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet title="Sauvegarde GitHub" onClose={onClose}>
      <ol className="cy-steps">
        <li>
          Crée un dépôt <strong>privé</strong> nommé planning-donnees :{' '}
          <a href={NEW_REPO} target="_blank" rel="noopener noreferrer">
            github.com/new
          </a>{' '}
          (cocher Private).
        </li>
        <li>
          Crée une clé d'accès :{' '}
          <a href={NEW_TOKEN} target="_blank" rel="noopener noreferrer">
            nouvelle clé « fine-grained »
          </a>
          . Repository access : Only select repositories › planning-donnees. Permissions › Repository permissions › Contents : Read and
          write. Génère-la et copie-la.
        </li>
        <li>Colle-la ici et choisis un mot de passe de chiffrement (8 caractères au moins), à noter quelque part.</li>
      </ol>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canConnect) void doConnect();
        }}
      >
        <Field label="Dépôt" htmlFor={ids.repo}>
          <input
            id={ids.repo}
            className="cy-input"
            value={repo}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setRepo(e.target.value)}
          />
        </Field>
        <Field label="Clé d'accès" htmlFor={ids.token}>
          <input
            id={ids.token}
            className="cy-input"
            type="password"
            autoComplete="off"
            placeholder="github_pat_…"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </Field>
        <Field label="Mot de passe" htmlFor={ids.pw}>
          <input
            id={ids.pw}
            className="cy-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirmation" htmlFor={ids.pw2}>
          <input
            id={ids.pw2}
            className="cy-input"
            type="password"
            autoComplete="new-password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />
        </Field>
        <Field label="Envoi automatique" htmlFor={ids.auto2}>
          <input
            id={ids.auto2}
            type="checkbox"
            role="switch"
            className="switch"
            checked={auto}
            onChange={(e) => setAutoInput(e.target.checked)}
          />
        </Field>
        {password2 && password !== password2 && <p className="cy-error">Les deux mots de passe sont différents.</p>}
        {error && (
          <p className="cy-error" role="alert">
            {error}
          </p>
        )}
        <div className="sheet__actions">
          <button type="submit" className="btn btn--primary btn--block" disabled={!canConnect}>
            {working || 'Connecter'}
          </button>
        </div>
      </form>
      <p className="cy-foot">
        Le mot de passe n'est enregistré nulle part : sans lui, la sauvegarde est illisible, même pour toi. La clé d'accès reste sur ce
        téléphone et ne donne accès qu'à ce dépôt.
      </p>
    </Sheet>
  );
}
