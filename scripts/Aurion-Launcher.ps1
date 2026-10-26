# Aurion - démarrage quotidien (icône Bureau). Séquence : arrêt propre -> PostgreSQL -> migrations -> serveur -> fenêtre plein écran.
# Aucune saisie, aucun droit administrateur. Chaque échec affiche une boîte de dialogue et écrit dans logs\aurion.log.
param([switch]$Console)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Aurion-Common.ps1')
$script:Interactive = [bool]$Console

function Get-AurionHealth {
    $r = Invoke-Http ($script:AppUrl + '/health/db') 4
    if ($r.Status -eq 200) { try { return ($r.Body | ConvertFrom-Json) } catch { return $null } }
    return $null
}

function Open-AurionWindow {
    # Fenêtre d'application plein écran (F11 pour quitter le plein écran), profil dédié pour que les options soient toujours appliquées.
    $profileDir = Join-Path $script:DataDir 'browser-profile'
    $args = '--app={0}/?native=1 --start-fullscreen --user-data-dir="{1}" --no-first-run --no-default-browser-check' -f $script:AppUrl, $profileDir
    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'), (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'), (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'), (Join-Path $env:LocalAppData 'Google\Chrome\Application\chrome.exe'))
    foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { Start-Process -FilePath $c -ArgumentList $args | Out-Null; return } }
    Start-Process ($script:AppUrl + '/') | Out-Null
}

$mutex = New-Object System.Threading.Mutex($false, 'Local\AurionLauncher')
if (-not $mutex.WaitOne(0)) { Write-Log 'Un lancement est déjà en cours.'; exit 0 }
try {
    Write-Log "=== Démarrage Aurion $(Get-AppVersion) ==="
    if (-not (Test-Path -LiteralPath $script:EnvFile)) { throw 'Aurion n''est pas installé correctement (backend\.env absent). Relancez Aurion-Setup.bat.' }
    $node = Ensure-Node $false
    $env0 = Read-EnvFile
    $embedded = ((Get-AurionMode) -eq 'embedded')

    # 1) Arrêt propre : le serveur, puis PostgreSQL. Ils sont ensuite relancés à neuf.
    Write-Step 'Arrêt propre du serveur et de PostgreSQL'
    Stop-AurionBackend
    if ($embedded) { Stop-PgCluster }

    # 2) Composants et compilation si nécessaire.
    if (-not (Test-DependenciesInstalled)) { Install-Dependencies }
    if (-not (Test-BuildFresh)) { Build-Backend }

    # 3) PostgreSQL, puis attente que la base réponde réellement, puis migrations.
    if ($embedded) {
        if (-not (Test-VcRuntime)) { Install-VcRuntime }
        Start-PgCluster ([int]$env0['AURION_PG_PORT'])
    }
    Invoke-DbTool 'wait' '60'
    Invoke-Migrations

    # 4) Serveur Aurion : node lancé directement, sorties dans logs\.
    $outLog = Join-Path $script:LogDir 'aurion-backend.log'; $errLog = Join-Path $script:LogDir 'aurion-backend-error.log'
    foreach ($f in $outLog, $errLog) { if (Test-Path $f) { Remove-Item $f -Force -ErrorAction SilentlyContinue } }
    Write-Step 'Démarrage du serveur Aurion'
    $sp = @{ FilePath = $node; ArgumentList = 'dist/server.js'; WorkingDirectory = $script:Backend; PassThru = $true; RedirectStandardOutput = $outLog; RedirectStandardError = $errLog }
    if ($script:IsWin) { $sp['WindowStyle'] = 'Hidden' }
    $proc = Start-Process @sp
    [IO.File]::WriteAllText((Join-Path $script:LogDir 'backend.pid'), [string]$proc.Id, $script:Utf8NoBom)

    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        if ($proc.HasExited) { break }
        $h = Get-AurionHealth
        if ($h -and $h.database -eq 'reachable') { $ready = $true; break }
    }
    if (-not $ready) {
        $why = 'Le serveur Aurion ne répond pas après 60 secondes.'
        if ($proc.HasExited) { $why = "Le serveur Aurion s'est arrêté (code $($proc.ExitCode))." }
        throw ($why + "`n`n" + (Get-TailText $errLog 12) + "`n" + (Get-TailText $outLog 8))
    }
    $front = Invoke-Http ($script:AppUrl + '/') 6
    if ($front.Status -ne 200 -or $front.Body -notmatch 'Aurion') { throw 'Le serveur répond mais l''interface Aurion n''est pas servie (index.html introuvable).' }
    if ((Invoke-Http ($script:AppUrl + '/backend/.env') 4).Status -eq 200) { Write-Log 'ALERTE SÉCURITÉ : /backend/.env est accessible !' 'ERROR' }

    Write-Log 'Serveur, base de données et interface prêts.'
    if (-not $env:AURION_NO_WINDOW) { Open-AurionWindow }
    exit 0
} catch {
    Show-ErrorDialog 'Aurion - Démarrage impossible' ($_.Exception.Message)
    exit 1
} finally { try { $mutex.ReleaseMutex() } catch {} }
