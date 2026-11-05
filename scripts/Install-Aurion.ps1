# Aurion - installation automatique. Lancé par Aurion-Setup.bat. AUCUNE saisie, AUCUN droit administrateur requis.
param([switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Aurion-Common.ps1')
$script:Interactive = $true
$steps = 8; $n = 0
function Step([string]$m) { $script:n++; Write-Step ("[{0}/{1}] {2}" -f $script:n, $steps, $m); if ($script:IsWin) { try { Write-Progress -Activity 'Installation d''Aurion' -Status $m -PercentComplete ([int](100 * ($script:n - 1) / $steps)) } catch {} } }

try {
    Write-Log "=== Installation Aurion $(Get-AppVersion) dans $script:Root ==="
    $warnings = @()
    if ($script:Root -match '(?i)\\htdocs(\\|$)') { $warnings += 'Aurion est dans XAMPP (htdocs) : déplacez-le hors de ce dossier.' }
    if ($script:IsWin) { Get-ChildItem -LiteralPath $script:Root -Recurse -Include *.ps1, *.bat -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue }

    # Une éventuelle installation précédente est arrêtée proprement avant toute mise à jour.
    Step 'Arrêt d''une éventuelle instance en cours'
    try { Use-AurionRuntime; Stop-AurionBackend } catch { Write-Log $_.Exception.Message 'WARN' }
    try { if ((Get-AurionMode) -eq 'embedded' -and (Get-PgBinDir)) { Stop-PgCluster } } catch { Write-Log $_.Exception.Message 'WARN' }

    Step 'Environnement d''exécution (Node.js)'
    $node = Ensure-Node $true

    Step 'Configuration'
    $envMap = Read-EnvFile
    if (-not $envMap['JWT_SECRET'] -or $envMap['JWT_SECRET'].Length -lt 32) { $envMap['JWT_SECRET'] = New-Secret 48 }
    if (-not $envMap['AURION_ENCRYPTION_KEY'] -or $envMap['AURION_ENCRYPTION_KEY'].Length -lt 32) { $envMap['AURION_ENCRYPTION_KEY'] = New-Secret 48 }
    if (-not $envMap['AURION_PG_MODE']) { $envMap['AURION_PG_MODE'] = 'embedded' }
    $freshDb = $false
    if ($envMap['AURION_PG_MODE'] -eq 'embedded') {
        if (-not $envMap['AURION_PG_PORT']) { $envMap['AURION_PG_PORT'] = [string](Get-FreePort 54329) }
        if (-not $envMap['AURION_PG_ADMIN_PASSWORD']) { $envMap['AURION_PG_ADMIN_PASSWORD'] = New-Secret 32 }
        if (-not $envMap['DATABASE_URL']) { $envMap['DATABASE_URL'] = 'postgres://aurion:{0}@127.0.0.1:{1}/aurion' -f [Uri]::EscapeDataString((New-Secret 32)), $envMap['AURION_PG_PORT']; $freshDb = $true }
        $envMap['AURION_PG_ADMIN_USER'] = 'aurion_admin'
    }
    $defaults = [ordered]@{
        NODE_ENV = 'development'; HOST = '127.0.0.1'; PORT = '4000'
        CORS_ORIGIN = 'http://127.0.0.1:4000,http://localhost:4000'
        AURION_LOCAL_EVALUATION_MODE = 'true'
        JWT_ISSUER = 'aurion'; JWT_AUDIENCE = 'aurion-web'; COOKIE_SECURE = 'false'
        GOOGLE_CLIENT_ID = ''; GOOGLE_CLIENT_SECRET = ''; GOOGLE_REDIRECT_URI = 'http://127.0.0.1:4000/integrations/google/callback'
        GOOGLE_TOKEN_ENCRYPTION_KEY = (New-Secret 32); GOOGLE_CALENDAR_ID = 'primary'; MAIL_FROM_NAME = 'Aurion'; REMINDER_WORKER_INTERVAL_MS = '60000'
    }
    foreach ($k in $defaults.Keys) { if (-not $envMap.Contains($k)) { $envMap[$k] = $defaults[$k] } }
    Write-EnvFile $envMap
    Initialize-EnvPort

    Step 'Composants (peut durer quelques minutes)'
    Install-Dependencies

    Step 'Moteur de documents LibreOffice (facultatif)'
    # LibreOffice est un moteur complementaire : un telechargement externe bloque ou echoue
    # ne doit pas empecher l'installation du coeur d'Aurion. La tentative est bornee et journalisee.
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Install-LibreOffice.ps1') -Optional
    if ($LASTEXITCODE -ne 0) {
        $warnings += 'LibreOffice n''a pas pu etre installe automatiquement. Aurion poursuit son installation ; les fonctions qui exigent LibreOffice resteront indisponibles jusqu''a son installation. Consultez logs\aurion.log.'
        Write-Log $warnings[-1] 'WARN'
    }

    Step 'Compilation'
    Build-Backend

    if ($envMap['AURION_PG_MODE'] -eq 'embedded') {
        Step 'Base de données dédiée à Aurion'
        if (-not (Test-VcRuntime)) { Install-VcRuntime }
        Initialize-PgCluster $envMap['AURION_PG_ADMIN_PASSWORD']
        Start-PgCluster ([int]$envMap['AURION_PG_PORT'])
    } else { Step 'Base de données externe (mode développeur)'; Invoke-DbTool 'wait' '30' }
    if ($envMap['AURION_PG_MODE'] -eq 'embedded') { Invoke-DbTool 'provision' }
    Invoke-Migrations

    Step 'Vérifications et raccourcis'
    $tlog = Join-Path $script:LogDir 'aurion-tests.log'
    if ((Invoke-Cmd $script:Backend ($script:NpmName + ' test') $tlog 300) -ne 0) { $warnings += 'Les tests automatiques signalent une erreur (logs\aurion-tests.log) : l''installation reste utilisable.'; Write-Log $warnings[-1] 'WARN' }
    New-AurionShortcuts
    # PostgreSQL est arrêté en fin d'installation : le lanceur le redémarre proprement à chaque ouverture.
    if ($envMap['AURION_PG_MODE'] -eq 'embedded') { Stop-PgCluster }
    Write-Log '=== Installation terminée ==='
    if ($script:IsWin) { try { Write-Progress -Activity 'Installation d''Aurion' -Completed } catch {} }

    $msg = "Aurion est installé.`nUne icône « Aurion » a été ajoutée à votre Bureau et au menu Démarrer."
    if ($warnings.Count -gt 0) { $msg += "`n`nRemarques :`n- " + ($warnings -join "`n- ") }
    $msg += "`n`nVoulez-vous lancer Aurion maintenant ?"
    if (-not $NoLaunch -and (Show-YesNoDialog 'Aurion - Installation terminée' $msg)) {
        Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -WindowStyle Hidden -WorkingDirectory $script:Root `
            -ArgumentList ('-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f (Join-Path $PSScriptRoot 'Aurion-Launcher.ps1'))
    }
    exit 0
} catch {
    Show-ErrorDialog 'Aurion - Installation échouée' ($_.Exception.Message)
    exit 1
}
