#requires -Version 5.1
# Publie l'intégralité d'Aurion 15.4.35 sur le dépôt GitHub préparé.
# GitHub uniquement : aucune opération Render, aucun déploiement.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoUrl = 'https://github.com/wooffey78/aurion.git'
$RepoFull = 'wooffey78/aurion'
$ExpectedRemoteMain = '930583be97058f6f8b46d20fdfe1471fb8e7f400'
$ExpectedVersion = '15.4.35'

function Stop-OnNativeError([string]$Label) {
    if ($LASTEXITCODE -ne 0) { throw "$Label a échoué (code $LASTEXITCODE)." }
}
function Run-Native([string]$File, [string[]]$Arguments, [string]$Label) {
    & $File @Arguments
    Stop-OnNativeError $Label
}

Write-Host '=== Aurion 15.4.35 — publication GitHub main ===' -ForegroundColor Cyan
if ($PSVersionTable.PSVersion -lt [version]'5.1') { throw 'Windows PowerShell 5.1 minimum requis.' }
if (!(Test-Path '.\VERSION.txt')) { throw 'Lance le script depuis la racine du dossier Aurion extrait.' }
$Version = (Get-Content '.\VERSION.txt' -Raw).Trim()
if ($Version -ne $ExpectedVersion) { throw "Version détectée $Version ; version attendue $ExpectedVersion." }
if (Test-Path '.git') { throw 'Un dossier .git existe déjà. Extrais le ZIP dans un dossier neuf pour éviter de mélanger les historiques.' }
if (!(Get-Command git -ErrorAction SilentlyContinue)) { throw 'Git est absent. Installe Git for Windows.' }
if (!(Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI est absent. Installe-le avec winget install --id GitHub.cli' }
if (!(Get-Command node -ErrorAction SilentlyContinue) -or !(Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Node.js et npm sont requis.' }

# Refuse de publier des fichiers de secrets, dépendances ou données locales.
$Forbidden = @(Get-ChildItem -Force -Recurse -File | Where-Object {
    $rel = $_.FullName.Substring((Get-Location).Path.Length).TrimStart('\','/')
    (($rel -match '(^|[\\/])\.env($|[.\\/])') -and ($rel -notmatch '(^|[\\/])\.env\.example$')) -or
    ($rel -match '(^|[\\/])node_modules([\\/]|$)') -or
    ($rel -match '(^|[\\/])storage([\\/]|$)') -or
    ($rel -match '(^|[\\/])\.git([\\/]|$)')
})
if ($Forbidden.Count -gt 0) {
    $Forbidden | ForEach-Object { Write-Host $_.FullName -ForegroundColor Red }
    throw 'Fichiers privés, générés ou dépendances détectés. Aucun push effectué.'
}

Write-Host 'Authentification GitHub...' -ForegroundColor Cyan
Run-Native 'gh' @('auth','status') 'gh auth status'
Run-Native 'gh' @('auth','setup-git') 'gh auth setup-git'

# Le dépôt doit toujours contenir une seule branche main et le commit vide connu.
$remoteBranches = @(gh api "repos/$RepoFull/branches?per_page=100" --jq '.[].name')
Stop-OnNativeError 'Lecture des branches distantes'
if ($remoteBranches.Count -ne 1 -or $remoteBranches[0] -cne 'main') {
    throw "Le dépôt distant n'a pas exactement une branche main. Branches détectées : $($remoteBranches -join ', ')."
}
$remoteLine = git ls-remote $RepoUrl refs/heads/main
Stop-OnNativeError 'Lecture du SHA distant'
$remoteSha = (($remoteLine -split '\s+')[0]).Trim()
if ($remoteSha -cne $ExpectedRemoteMain) {
    throw "main a changé. SHA attendu $ExpectedRemoteMain ; SHA constaté $remoteSha. Aucun push effectué."
}
Write-Host "Dépôt vérifié : $RepoFull / main / $remoteSha" -ForegroundColor Green

Write-Host 'Installation des dépendances backend...' -ForegroundColor Cyan
Run-Native 'npm' @('ci','--prefix','backend','--include=dev','--no-audit','--no-fund') 'npm ci backend'
Write-Host 'Build backend...' -ForegroundColor Cyan
Run-Native 'npm' @('run','build') 'npm run build'
Write-Host 'Typecheck...' -ForegroundColor Cyan
Run-Native 'npm' @('run','typecheck') 'npm run typecheck'
Write-Host 'Contrôle frontend...' -ForegroundColor Cyan
Run-Native 'npm' @('run','test:frontend') 'npm run test:frontend'
Write-Host 'Lint frontend...' -ForegroundColor Cyan
Run-Native 'npm' @('run','lint:frontend') 'npm run lint:frontend'
Write-Host 'Smoke...' -ForegroundColor Cyan
Run-Native 'npm' @('run','test:smoke') 'npm run test:smoke'
Write-Host 'Tests métier...' -ForegroundColor Cyan
Run-Native 'npm' @('run','test:business') 'npm run test:business'
Write-Host 'Tests configuration entreprise...' -ForegroundColor Cyan
Run-Native 'npm' @('run','test:company-config') 'npm run test:company-config'
Write-Host 'Tests accessibilité UI...' -ForegroundColor Cyan
Run-Native 'npm' @('run','test:ui-a11y') 'npm run test:ui-a11y'
Write-Host 'Contrats de fusion 15.4.35...' -ForegroundColor Cyan
Run-Native 'node' @('--experimental-strip-types','--test','backend/tests/merge-15.4.35.contract.test.mjs') 'Contrats 15.4.35'

Write-Host ''
Write-Host 'ATTENTION CI : le rapport de livraison inclus indique 4 échecs dans la suite backend complète. La CI active AURION_BASELINE_STRICT=1 et refuse les échecs résiduels, même déjà répertoriés. Le statut Actions peut donc être rouge après le push. Playwright n’est pas exécuté par ce script.' -ForegroundColor Yellow
Write-Host 'Render n’est ni modifié ni déployé par ce script.' -ForegroundColor Yellow

# Crée un historique local depuis la main distante vide sans force-push.
Run-Native 'git' @('init') 'git init'
Run-Native 'git' @('branch','-M','main') 'git branch -M main'
Run-Native 'git' @('remote','add','origin',$RepoUrl) 'git remote add origin'
Run-Native 'git' @('fetch','origin','main') 'git fetch origin main'
$fetchSha = (git rev-parse FETCH_HEAD).Trim()
Stop-OnNativeError 'Vérification FETCH_HEAD'
if ($fetchSha -cne $ExpectedRemoteMain) { throw 'Le commit distant a changé pendant le contrôle ; aucun push.' }
Run-Native 'git' @('checkout','-B','main','FETCH_HEAD') 'git checkout main'

$gitName = (git config user.name)
$gitEmail = (git config user.email)
if ([string]::IsNullOrWhiteSpace($gitName)) {
    $gitName = Read-Host 'Nom à inscrire comme auteur du commit'
    if ([string]::IsNullOrWhiteSpace($gitName)) { throw 'Nom Git vide.' }
    Run-Native 'git' @('config','user.name',$gitName) 'git config user.name'
}
if ([string]::IsNullOrWhiteSpace($gitEmail)) {
    $gitEmail = Read-Host 'E-mail Git à inscrire comme auteur du commit'
    if ([string]::IsNullOrWhiteSpace($gitEmail)) { throw 'E-mail Git vide.' }
    Run-Native 'git' @('config','user.email',$gitEmail) 'git config user.email'
}

Run-Native 'git' @('add','-A') 'git add'
$staged = @(git diff --cached --name-only)
Stop-OnNativeError 'Vérification index'
if ($staged.Count -eq 0) { throw 'Aucun fichier à publier.' }
Write-Host "Fichiers indexés : $($staged.Count)"
git status --short
Write-Host ''
$answer = Read-Host 'Pour publier la version complète sur main, saisis exactement PUBLIER AURION 15.4.35'
if ($answer -cne 'PUBLIER AURION 15.4.35') { throw 'Publication annulée. Le dépôt distant reste inchangé.' }

Run-Native 'git' @('commit','-m','release: Aurion 15.4.35 definitive source') 'git commit'
Run-Native 'git' @('push','-u','origin','main') 'git push'
$localSha = (git rev-parse HEAD).Trim()
$afterLine = git ls-remote $RepoUrl refs/heads/main
Stop-OnNativeError 'Vérification finale distante'
$afterSha = (($afterLine -split '\s+')[0]).Trim()
if ($afterSha -cne $localSha) { throw "Le SHA distant ($afterSha) diffère du commit local ($localSha)." }

Write-Host ''
Write-Host "PUBLICATION VALIDÉE : $RepoFull / main / $localSha" -ForegroundColor Green
Write-Host 'Aucun service Render n’a été supprimé, modifié ou déployé.'
