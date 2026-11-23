# Déclenche un déploiement Render existant pour le commit main vérifié.
# Le script ne crée/modifie aucun service, aucune base et aucune variable.
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^srv-[A-Za-z0-9]+$')]
    [string]$ServiceId,
    [switch]$ClearBuildCache,
    [switch]$AllowNonFreePlan
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Repository = 'https://github.com/wooffey78/aurion'
$ApiKey = $env:RENDER_API_KEY
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw 'Définissez RENDER_API_KEY dans la session PowerShell. Ne collez jamais la clé dans le script ni dans Git.'
}

function Invoke-ProjectGit([string[]]$GitArgs) {
    $output = & git -C $ProjectRoot @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "Échec de git $($GitArgs -join ' ') (code $LASTEXITCODE)." }
    return $output
}
function Invoke-RenderApi([string]$Uri, [string]$Method = 'GET', $Body = $null) {
    $headers = @{ Authorization = "Bearer $ApiKey"; Accept = 'application/json' }
    if ($null -eq $Body) {
        return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers -TimeoutSec 30
    }
    return Invoke-RestMethod -Uri $Uri -Method $Method -Headers $headers -ContentType 'application/json' -Body ($Body | ConvertTo-Json -Depth 6) -TimeoutSec 30
}

$origin = (Invoke-ProjectGit @('remote', 'get-url', 'origin') | Out-String).Trim().TrimEnd('/') -replace '\.git$', ''
if ($origin -ne $Repository) { throw "Origin inattendu ('$origin'). Déploiement annulé." }
$branch = (Invoke-ProjectGit @('branch', '--show-current') | Out-String).Trim()
if ($branch -ne 'main') { throw "La branche locale doit être main (branche détectée : '$branch')." }
$dirty = Invoke-ProjectGit @('status', '--porcelain')
if ($dirty) { throw 'Le dépôt local contient des modifications non publiées. Déploiement annulé.' }
$localSha = (Invoke-ProjectGit @('rev-parse', 'HEAD') | Out-String).Trim()
$remoteLine = (Invoke-ProjectGit @('ls-remote', 'origin', 'refs/heads/main') | Out-String).Trim()
if ([string]::IsNullOrWhiteSpace($remoteLine)) { throw 'GitHub ne retourne pas de branche main. Publiez le code avant le déploiement.' }
$remoteSha = ($remoteLine -split '\s+')[0].Trim()
if ($localSha -ne $remoteSha) { throw "Le commit local ($localSha) diffère du commit GitHub ($remoteSha). Aucun déploiement déclenché." }

$service = Invoke-RenderApi "https://api.render.com/v1/services/$ServiceId"
if ($service.service) { $service = $service.service }
$serviceRepo = ([string]$service.repo).TrimEnd('/') -replace '\.git$', ''
if ($serviceRepo -ne $Repository) { throw "Le service Render est relié à un autre dépôt ('$serviceRepo'). Aucun déploiement déclenché." }
if ([string]$service.branch -ne 'main') { throw "Le service Render suit la branche '$($service.branch)' et non main. Aucun déploiement déclenché." }
if ([string]$service.type -ne 'web_service') { throw "Le service n'est pas un service Web (type détecté : '$($service.type)'). Aucun déploiement déclenché." }
$plan = [string]$service.plan
if (-not $plan -and $service.serviceDetails) { $plan = [string]$service.serviceDetails.plan }
if ($plan -and $plan -ne 'free' -and -not $AllowNonFreePlan) {
    throw "Le plan détecté est '$plan', pas free. Aucun déploiement déclenché. Ajoutez -AllowNonFreePlan seulement si ce plan est voulu."
}

# Les variables d'environnement sont consultées uniquement par leur NOM ; aucune valeur n'est affichée.
$varsResponse = Invoke-RenderApi "https://api.render.com/v1/services/$ServiceId/env-vars?limit=100"
$keys = @($varsResponse | ForEach-Object { if ($_.envVar) { [string]$_.envVar.key } elseif ($_.key) { [string]$_.key } })
if ($keys -notcontains 'DATABASE_URL') {
    throw 'DATABASE_URL n’apparaît pas dans les variables directement attachées au service. Vérifiez qu’elle est bien fournie, éventuellement par un groupe d’environnement, et qu’elle cible une base dédiée à Aurion ; puis relancez.'
}

$autoTrigger = [string]$service.autoDeployTrigger
if (-not $autoTrigger) { if ([string]$service.autoDeploy -eq 'no') { $autoTrigger = 'off' } else { $autoTrigger = 'commit' } }
if ($autoTrigger -ne 'off') {
    throw "Le déploiement automatique Render est réglé sur '$autoTrigger'. Aucun déploiement manuel supplémentaire n'a été déclenché afin d'éviter un doublon. Vérifiez le déploiement créé par le push GitHub."
}

Write-Host "Service vérifié : $($service.name) ($ServiceId), plan=$($plan | ForEach-Object { if($_){$_}else{'non communiqué'} })" -ForegroundColor Cyan
Write-Host "Dépôt : $serviceRepo ; branche : main ; commit : $localSha" -ForegroundColor Cyan
Write-Host 'Aucune base de données, variable d’environnement ou ressource Render ne sera créée ou modifiée.' -ForegroundColor Yellow
$confirm = Read-Host 'Tapez exactement DEPLOYER pour lancer le build/deploy de ce commit'
if ($confirm -cne 'DEPLOYER') { throw 'Déploiement annulé ; Render n’a pas été modifié.' }
$clear = if ($ClearBuildCache) { 'clear' } else { 'do_not_clear' }
$result = Invoke-RenderApi "https://api.render.com/v1/services/$ServiceId/deploys" 'POST' @{ commitId = $localSha; clearCache = $clear }
if ($result.deploy) { $result = $result.deploy }
$deployId = [string]$result.id
$status = [string]$result.status
Write-Host "Demande de déploiement envoyée. ID : $deployId ; statut retourné : $status" -ForegroundColor Green
if ($service.serviceDetails.url) { Write-Host "URL du service : $($service.serviceDetails.url)" }
Write-Host 'Confirmez le statut final dans le tableau de bord Render et testez /health ainsi que /health/db. L’endpoint /health seul ne valide pas la base ni les parcours métier.' -ForegroundColor Yellow
