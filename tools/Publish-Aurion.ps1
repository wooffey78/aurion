# Publie le dossier Aurion extrait vers le dépôt dédié wooffey78/aurion.
# Le script refuse tout push forcé et n'écrase jamais une branche distante existante.
[CmdletBinding()]
param(
    [string]$Repository = 'https://github.com/wooffey78/aurion.git',
    [string]$RenderBaseUrl = ''
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Invoke-Git([string[]]$GitArgs) {
    & git -C $ProjectRoot @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "Échec de git $($GitArgs -join ' ') (code $LASTEXITCODE)." }
}

foreach ($required in @('index.html', 'VERSION.txt', 'backend/package.json', 'backend/package-lock.json', 'render.yaml', '.gitignore')) {
    if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot $required) -PathType Leaf)) {
        throw "Fichier requis absent : $required. Extraire d'abord l'archive Aurion complète."
    }
}

$forbidden = Get-ChildItem -LiteralPath $ProjectRoot -Force -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -in @('.env', 'id_rsa', 'id_ed25519', 'credentials.json') -or $_.Extension -in @('.pem', '.p12', '.pfx') }
if ($forbidden) {
    $list = ($forbidden | ForEach-Object { $_.FullName }) -join "`n"
    throw "Publication arrêtée : des fichiers potentiellement sensibles ont été détectés :`n$list"
}

# Vérifie les prérequis locaux avant toute opération sur GitHub.
$node = & node --version
if ($LASTEXITCODE -ne 0) { throw 'Node.js est requis.' }
$npm = & npm --version
if ($LASTEXITCODE -ne 0) { throw 'npm est requis.' }
Write-Host "Projet Aurion $((Get-Content (Join-Path $ProjectRoot 'VERSION.txt') -Raw).Trim()) ; Node $node ; npm $npm" -ForegroundColor Cyan

Write-Host 'Installation des dépendances puis contrôles automatisés...' -ForegroundColor Cyan
& npm ci --prefix (Join-Path $ProjectRoot 'backend') --include=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Installation npm en échec. Aucun push effectué.' }
& npm --prefix $ProjectRoot run check
if ($LASTEXITCODE -ne 0) { throw 'Contrôles/build/tests en échec. Aucun push effectué.' }

if (Test-Path -LiteralPath (Join-Path $ProjectRoot '.git')) {
    $currentOrigin = (& git -C $ProjectRoot remote get-url origin 2>$null)
    if ($LASTEXITCODE -eq 0 -and $currentOrigin.Trim() -ne $Repository) {
        throw "Le dépôt local possède déjà un origin différent : $($currentOrigin.Trim()). Arrêt sans modification."
    }
    if ($LASTEXITCODE -ne 0) { throw 'Le dossier contient .git mais aucun remote origin vérifiable. Publiez depuis une extraction propre du ZIP.' }
    $dirty = & git -C $ProjectRoot status --porcelain
    if ($LASTEXITCODE -ne 0) { throw 'Impossible de contrôler l’état Git.' }
    if ($dirty) { throw 'Le dossier Git contient des changements préexistants. Publiez depuis une extraction propre pour éviter de mélanger des projets.' }
} else {
    Invoke-Git @('init', '--initial-branch=main')
    Invoke-Git @('remote', 'add', 'origin', $Repository)
}

# Si le dépôt distant a déjà été initialisé, on refuse de le remplacer.
$remote = & git -C $ProjectRoot ls-remote origin refs/heads/main
if ($LASTEXITCODE -ne 0) { throw 'Impossible de lire GitHub. Vérifiez la connexion et les droits d’écriture.' }
if (-not [string]::IsNullOrWhiteSpace(($remote -join '').Trim())) {
    throw 'La branche distante main existe déjà. Par sécurité, aucun push n’a été tenté. Il faut récupérer et intégrer son historique explicitement.'
}

Write-Host 'Aperçu des fichiers destinés au dépôt :' -ForegroundColor Cyan
Get-ChildItem -LiteralPath $ProjectRoot -Force | Select-Object Mode, Name | Format-Table -AutoSize
$confirm = Read-Host "Tapez exactement PUBLIER pour créer le premier commit sur $Repository"
if ($confirm -cne 'PUBLIER') { throw 'Publication annulée ; aucun push envoyé.' }

Invoke-Git @('add', '-A')
Invoke-Git @('commit', '-m', "Aurion $((Get-Content (Join-Path $ProjectRoot 'VERSION.txt') -Raw).Trim()) - préparation production")
$localSha = (& git -C $ProjectRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $localSha) { throw 'Impossible de déterminer le commit local.' }
Invoke-Git @('push', '--set-upstream', 'origin', 'main')
$remoteAfter = (& git -C $ProjectRoot ls-remote origin refs/heads/main).Trim()
if ($LASTEXITCODE -ne 0 -or -not $remoteAfter.StartsWith($localSha)) { throw 'Le push n’a pas pu être vérifié sur GitHub.' }
Write-Host "Publication GitHub confirmée : $localSha" -ForegroundColor Green
Write-Host 'Render ne se déploiera automatiquement que si le service existant est lié à wooffey78/aurion, branche main, et si le déploiement automatique est activé.' -ForegroundColor Yellow

if ([string]::IsNullOrWhiteSpace($RenderBaseUrl)) {
    $RenderBaseUrl = Read-Host 'URL publique du service Render Aurion (Entrée pour ignorer le smoke test)'
}
if (-not [string]::IsNullOrWhiteSpace($RenderBaseUrl)) {
    $base = $RenderBaseUrl.TrimEnd('/')
    if ($base -notmatch '^https://[A-Za-z0-9.-]+(?::\d+)?$') { throw 'L’URL Render doit être une URL HTTPS publique sans chemin.' }
    try {
        $response = Invoke-WebRequest -Uri "$base/health" -Method Get -TimeoutSec 15 -UseBasicParsing
        if ($response.StatusCode -ne 200) { throw "Réponse HTTP inattendue : $($response.StatusCode)" }
        Write-Host "Smoke test réussi : $base/health (HTTP $($response.StatusCode)). Vérifiez aussi les journaux Render et /health/db." -ForegroundColor Green
    } catch {
        Write-Warning "Aucune réponse /health vérifiée depuis cette machine : $($_.Exception.Message). Vérifiez le build dans le tableau de bord Render ; cela ne prouve pas à lui seul que le déploiement a échoué."
    }
}
