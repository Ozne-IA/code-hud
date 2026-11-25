# code-hud

Un panneau d'état pour Claude Code, affiché dans l'application de bureau et dans le terminal : modèle utilisé, projet, remplissage du contexte, limite hebdomadaire, coût de la session et, si tu le veux, l'état de tes checklists.

## Installation

Dans une session Claude Code :

```
/plugin marketplace add <owner>/code-hud
/plugin install code-hud@code-hud
```

Claude Code demande ensuite la valeur optionnelle `checklists_file`. Laisse-la vide si tu n'en as pas besoin.

Pour l'installer depuis le terminal, sans session :

```
claude plugin marketplace add <owner>/code-hud
claude plugin install code-hud@code-hud --scope user
```

Le panneau se charge à chaque démarrage. Tape `/hud` pour l'ouvrir, `/hud close` pour le fermer.

## Configuration

- **checklists_file** (optionnel) : chemin absolu d'un fichier texte qui liste, une par ligne, les chemins de tes checklists Markdown. Le panneau compte les cases non cochées (`- [ ]`) de chacune. Vide = désactivé.

## Ce que le mod fait, et ce qu'il ne fait pas

- Il lit les informations de session que Claude Code lui fournit, et lit les fichiers de checklists que tu indiques.
- Il n'écrit aucun fichier et n'envoie rien sur le réseau.
- Un mod s'exécute avec tes droits : lis le code avant de l'installer, comme pour tout plugin.

## Limites connues

- La limite hebdomadaire n'apparaît qu'après la première réponse d'une session, et seulement si Claude Code la reçoit d'Anthropic (abonnement direct). Derrière une passerelle tierce, elle s'affiche « n/a ».

## Licence

MIT. Voir [LICENSE](LICENSE).
