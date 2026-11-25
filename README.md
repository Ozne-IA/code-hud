# code-hud

Un panneau d'état pour Claude Code, affiché au-dessus du prompt et dans le panneau latéral de l'application de bureau : modèle utilisé, projet, remplissage du contexte, limite hebdomadaire, coût de la session et, si tu le veux, l'état de tes checklists.

## Installation

Dans une session Claude Code :

```
/plugin marketplace add Ozne-IA/code-hud
/plugin install code-hud@code-hud
```

Ou depuis le terminal, sans session :

```
claude plugin marketplace add Ozne-IA/code-hud
claude plugin install code-hud@code-hud --scope user
```

Le panneau se charge à chaque démarrage. Tape `/hud` pour l'ouvrir, `/hud close` pour le fermer.

## Le message « userConfig option not yet set »

Après l'installation, Claude Code peut afficher ce message. **Il n'y a rien à corriger** : le plugin fonctionne tel quel.

Il signale seulement une option facultative, `checklists_file`, que tu n'es pas obligé de renseigner. Si tu n'utilises pas de checklists, laisse-la vide. Si tu veux la renseigner plus tard, lance `/plugin configure code-hud@code-hud` dans une session.

## Configuration (facultative)

- **checklists_file** : chemin absolu d'un fichier texte qui liste, une par ligne, les chemins de tes checklists Markdown. Le panneau affiche alors le nombre de cases non cochées (`- [ ]`) de chacune. Vide = fonction désactivée.

## Ce que le mod fait, et ce qu'il ne fait pas

- Il lit les informations de session que Claude Code lui fournit, et les fichiers de checklists que tu indiques.
- Il n'écrit aucun fichier et n'envoie rien sur le réseau.
- Un mod s'exécute avec tes droits : lis le code avant de l'installer, comme pour tout plugin.

## Limites connues

- La limite hebdomadaire n'apparaît qu'après la première réponse d'une session, et seulement si Claude Code la reçoit d'Anthropic (abonnement direct). Derrière une passerelle tierce, elle s'affiche « n/a ».

## Licence

MIT. Voir [LICENSE](LICENSE).
