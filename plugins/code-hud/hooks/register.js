// Fichier texte listant les chemins des checklists (option checklists_file). Vide = désactivé.
let ACTIVES = ''
const PANE = 'hud'
const HISTORY_MAX = 60

let model = ''
let project = ''
let contextPercent = null
let weekly = null
let checklists = []   // [{ name, open }] pour chaque checklist active
let breakdown = null
let cost = null       // coût estimé de la session, en dollars
let history = []      // valeurs successives du contexte, pour la courbe
let askCompact = false

// Couleur d'un niveau d'usage : vert, puis orange à 70 %, rouge à 90 %
function levelColor(p) {
  return p >= 90 ? 'error' : p >= 70 ? 'warning' : 'success'
}

// Mêmes niveaux, en hexadécimal, pour le SVG (les clés de thème n'y sont pas résolues)
const HEX = { success: '#3fb950', warning: '#d29922', error: '#f85149', subtle: '#8b949e' }

// Anneau de jauge en SVG : arc proportionnel à p, pourcentage au centre
function ringSource(p, level) {
  const v = Math.max(0, Math.min(100, Math.round(p)))
  const r = 36
  const c = 2 * Math.PI * r
  const dash = (c * v) / 100
  const hex = HEX[level] ?? HEX.subtle
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<circle cx="50" cy="50" r="${r}" fill="none" stroke="#30363d" stroke-width="9"/>` +
    `<circle cx="50" cy="50" r="${r}" fill="none" stroke="${hex}" stroke-width="9" stroke-linecap="round" ` +
    `stroke-dasharray="${dash} ${c}" transform="rotate(-90 50 50)"/>` +
    `<text x="50" y="57" text-anchor="middle" font-size="20" font-family="sans-serif" fill="#e6edf3">${v}%</text>` +
    `</svg>`
}

// Courbe du contexte depuis le début de la session, en SVG
function curveSource(values, level) {
  const w = 260
  const h = 60
  const hex = HEX[level] ?? HEX.subtle
  const n = values.length
  const pts = values.map((v, i) => {
    const x = n > 1 ? (i * w) / (n - 1) : w / 2
    const y = h - (Math.max(0, Math.min(100, v)) / 100) * h
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">` +
    `<line x1="0" y1="${h - 0.6 * h}" x2="${w}" y2="${h - 0.6 * h}" stroke="#30363d" stroke-dasharray="3 3"/>` +
    `<line x1="0" y1="${h - 0.9 * h}" x2="${w}" y2="${h - 0.9 * h}" stroke="#30363d" stroke-dasharray="3 3"/>` +
    (n > 1 ? `<polyline points="${pts}" fill="none" stroke="${hex}" stroke-width="2.5" stroke-linejoin="round"/>` : '') +
    `</svg>`
}

// Tokens lisibles : 124,7 k, 1,0 M
function fmtTokens(n) {
  if (n == null) return '?'
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' M'
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.', ',') + ' k'
  return String(n)
}

// Nom du dossier, séparateurs Windows (\) et POSIX (/) acceptés
function baseName(path) {
  if (!path) return '?'
  return String(path).split(/[\\/]/).filter(Boolean).pop() ?? '?'
}

// Répartition du contexte par catégorie (estimation locale, sans requête) et coût
async function readUsage($) {
  try {
    const usage = await $.session.usage({ breakdown: 'summary' })
    cost = usage.cost?.usd ?? null
    const b = usage.context?.breakdown
    if (!b) return null
    return {
      used: b.totalTokens,
      max: b.maxTokens,
      rows: b.categories.map(c => ({ name: c.name, tokens: c.tokens, color: c.color, kind: c.kind })),
    }
  } catch {
    return null
  }
}

// Checklists actives : nom du fichier et nombre de cases ouvertes
async function readChecklists($) {
  if (!ACTIVES) return []
  try {
    const list = (await $.fs.read(ACTIVES)).split('\n')
      .map(s => s.trim()).filter(s => s && !s.startsWith('#'))
    const out = []
    for (const file of list) {
      try {
        const text = await $.fs.read(file)
        const open = text.split('\n').filter(l => /^\s*- \[ \]/.test(l)).length
        out.push({ name: baseName(file).replace(/\.md$/i, ''), open })
      } catch {}
    }
    return out
  } catch {
    return []
  }
}

// Avertissements à 80 % puis 90 %, une seule fois par seuil.
// Le seuil repasse à zéro quand la valeur redescend (compaction, reset de semaine).
async function checkAlerts($) {
  const saved = (await $.store.get('alerts')) ?? { ctx: 0, week: 0 }
  const level = p => (p >= 90 ? 90 : p >= 80 ? 80 : 0)
  const next = { ...saved }

  if (contextPercent != null) {
    const l = level(contextPercent)
    if (l > saved.ctx) $.ui.toast(`Contexte à ${contextPercent} % : pense à compacter`)
    next.ctx = l
  }
  if (weekly) {
    const l = level(weekly.percentUsed)
    if (l > saved.week) $.ui.toast(`Limite de la semaine à ${weekly.percentUsed} %`)
    next.week = l
  }
  if (next.ctx !== saved.ctx || next.week !== saved.week) {
    await $.store.set('alerts', next)
  }
}

// « dans 2 j 4 h » ou « dans 3 h 12 min »
function countdown(iso) {
  if (!iso) return ''
  const ms = new Date(iso).getTime() - Date.now()
  if (Number.isNaN(ms) || ms <= 0) return ''
  const totalH = Math.floor(ms / 3600e3)
  if (totalH >= 24) return `dans ${Math.floor(totalH / 24)} j ${totalH % 24} h`
  return `dans ${totalH} h ${Math.floor((ms % 3600e3) / 60e3)} min`
}

function formatReset(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Pourcentage de contexte : celui que Claude Code donne, sinon calculé
// à partir des tokens et de la taille de la fenêtre (disponibles dès le démarrage).
function contextPct(ctx) {
  if (!ctx) return null
  if (ctx.percent != null) return ctx.percent
  if (ctx.tokens != null && ctx.window) return Math.round((ctx.tokens / ctx.window) * 1000) / 10
  return null
}

export function register(on, options = {}) {
  ACTIVES = options.checklists_file ? String(options.checklists_file).trim() : ''
  on('session.start', async ($, e, next) => {
    try {
      const usage = await $.session.usage()
      weekly = (usage.rateLimits ?? []).find(r => r.kind === 'seven_day') ?? null
      contextPercent = contextPct(usage.context)
    } catch {}
    try {
      model = (await $.session.model()) ?? ''
      project = (await $.session.cwd()) ?? ''
    } catch {}
    checklists = await readChecklists($)
    breakdown = await readUsage($)
    if (contextPercent == null && breakdown?.max) {
      contextPercent = Math.round((breakdown.used / breakdown.max) * 1000) / 10
    }
    if (contextPercent != null) history = [contextPercent]
    await checkAlerts($)

    await $.command.register({ name: 'hud', description: 'Ouvrir le panneau HUD (/hud close pour le fermer)' })
    // Panneau déplaçable : démarre en widget, l'utilisateur le place où il veut
    void $.ui.open({ id: PANE, title: 'HUD', placement: 'widget' })
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('command.run', { command: 'hud' }, async ($, e) => {
    if ((e.args ?? '').trim() === 'close') {
      await $.ui.close({ id: PANE })
      return { text: 'Panneau HUD fermé.' }
    }
    await $.ui.open({ id: PANE, title: 'HUD' })
    return { text: 'Panneau HUD ouvert.' }
  })

  on('session.measure', async ($, e, next) => {
    if (e.rateLimits) weekly = e.rateLimits.find(r => r.kind === 'seven_day') ?? null
    const measured = contextPct(e.context)
    if (measured != null) {
      contextPercent = measured
      history = [...history, contextPercent].slice(-HISTORY_MAX)
    }
    checklists = await readChecklists($)
    breakdown = await readUsage($)
    await checkAlerts($)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e, next) => {
    const { Box, Text, Svg, Button } = $.ui.resolve(e)
    const ctxColor = contextPercent != null ? levelColor(contextPercent) : 'subtle'
    const weekColor = weekly ? levelColor(weekly.percentUsed) : 'subtle'
    const openItems = checklists.reduce((s, c) => s + c.open, 0)
    const checkOk = openItems === 0

    // Vue réduite (widget) : une seule ligne
    if (e.props.placement === 'widget') {
      const ctx = contextPercent != null ? `ctx ${contextPercent}%` : 'ctx ?'
      const wk = weekly ? `sem ${weekly.percentUsed}%` : 'sem n/a'
      return Box({
        flexDirection: 'row',
        borderStyle: 'round',
        borderColor: 'claude',
        paddingX: 1,
        columnGap: 2,
        children: [
          Text({ color: 'claude', bold: true, children: [`◆ ${model || '?'}`] }),
          Text({ color: ctxColor, children: [ctx] }),
          Text({ color: weekColor, children: [wk] }),
          Text({ color: checkOk ? 'success' : 'warning', children: [checkOk ? '✓' : `☐ ${openItems}`] }),
        ],
      })
    }

    // Anneaux SVG sur desktop ; sur le terminal (pas de Svg), une ligne de texte
    const gauges = Svg && contextPercent != null && weekly
      ? Box({
          flexDirection: 'row',
          columnGap: 3,
          children: [
            Box({
              flexDirection: 'column',
              alignItems: 'center',
              children: [
                Svg({ source: ringSource(contextPercent, ctxColor), alt: `Contexte ${contextPercent} %`, width: 96, height: 96 }),
                Text({ dimColor: true, children: ['Contexte'] }),
              ],
            }),
            Box({
              flexDirection: 'column',
              alignItems: 'center',
              children: [
                Svg({ source: ringSource(weekly.percentUsed, weekColor), alt: `Semaine ${weekly.percentUsed} %`, width: 96, height: 96 }),
                Text({ dimColor: true, children: ['Semaine'] }),
              ],
            }),
          ],
        })
      : Text({
          color: ctxColor,
          children: [`Contexte ${contextPercent ?? '?'} %  ·  Semaine ${weekly ? weekly.percentUsed + ' %' : 'n/a'}`],
        })

    const weekReset = weekly && weekly.resetsAt
      ? Text({
          dimColor: true,
          children: [`Reset ${countdown(weekly.resetsAt) || formatReset(weekly.resetsAt)}  ·  ${formatReset(weekly.resetsAt)}`],
        })
      : null

    const checkRows = checklists.length === 0
      ? Text({ dimColor: true, children: ['Aucune checklist active'] })
      : Box({
          flexDirection: 'column',
          children: [
            Text({
              color: checkOk ? 'success' : 'warning',
              bold: !checkOk,
              children: [checkOk ? '✓ Checklists à jour' : `☐ ${openItems} case${openItems > 1 ? 's' : ''} ouverte${openItems > 1 ? 's' : ''}`],
            }),
            ...checklists.map(c => Text({
              color: c.open > 0 ? 'warning' : 'success',
              dimColor: c.open === 0,
              children: [`  ${c.open > 0 ? '☐' : '✓'} ${c.name}  (${c.open})`],
            })),
          ],
        })

    // Détail du contexte, comme /context : une ligne par catégorie
    const breakdownBlock = breakdown
      ? Box({
          flexDirection: 'column',
          gap: 'sm',
          children: [
            Text({
              bold: true,
              color: 'text',
              children: [`Contexte  ${fmtTokens(breakdown.used)} / ${fmtTokens(breakdown.max)}`],
            }),
            ...breakdown.rows.map(r => {
              const isDef = r.kind === 'deferred'
              const pct = breakdown.max
                ? ((r.tokens / breakdown.max) * 100).toFixed(1).replace('.', ',') + ' %'
                : '—'
              return Box({
                flexDirection: 'row',
                justifyContent: 'space-between',
                columnGap: 2,
                children: [
                  Text({ color: isDef ? 'subtle' : r.color, dimColor: isDef, children: [`● ${r.name}`] }),
                  Text({ dimColor: true, children: [isDef ? `${fmtTokens(r.tokens)} (différé)` : `${fmtTokens(r.tokens)}  ${pct}`] }),
                ],
              })
            }),
          ],
        })
      : null

    // Courbe du contexte depuis le début de la session
    const curve = history.length > 1
      ? Box({
          flexDirection: 'column',
          children: [
            Text({ dimColor: true, children: [`Évolution du contexte (${history.length} mesures)`] }),
            Svg({ source: curveSource(history, ctxColor), alt: 'Évolution du contexte', width: 260, height: 60 }),
          ],
        })
      : null

    // Coût estimé de la session
    const costRow = cost != null
      ? Text({ dimColor: true, children: [`Coût estimé de la session : ${cost.toFixed(2).replace('.', ',')} $`] })
      : null

    // Compaction : deux clics, jamais automatique
    const compactBtn = contextPercent != null && contextPercent >= 85 && Button
      ? Button({
          key: 'compact',
          label: askCompact ? 'Confirmer la compaction' : 'Compacter le contexte…',
          onPress: async () => {
            if (!askCompact) {
              askCompact = true
              $.ui.invalidate('ui.render')
              return
            }
            askCompact = false
            await $.session.compact()
            $.ui.invalidate('ui.render')
          },
        })
      : null

    return Box({
      flexDirection: 'column',
      borderStyle: 'round',
      borderColor: 'claude',
      paddingX: 2,
      paddingY: 1,
      gap: 'sm',
      children: [
        Box({
          flexDirection: 'row',
          justifyContent: 'space-between',
          columnGap: 1,
          children: [
            Text({ color: 'claude', bold: true, children: ['◆ HUD'] }),
            Text({ dimColor: true, children: [model || '?'] }),
          ],
        }),
        Text({ dimColor: true, children: [`📁 ${baseName(project)}`] }),
        gauges,
        weekReset,
        checkRows,
        curve,
        breakdownBlock,
        costRow,
        compactBtn,
      ],
    })
  })
}
