# Aurion - installation automatique. Lancé par Aurion-Setup.bat. AUCUNE saisie, AUCUN droit administrateur requis.
param([switch]$NoLaunch)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Aurion-Common.ps1')
$script:Interactive = $true
$steps = 9; $n = 0
function Step([string]$m) { $script:n++; Write-Step ("[{0}/{1}] {2}" -f $script:n, $steps, $m); if ($script:IsWin) { try { Write-Progress -Activity 'Installation d''Aurion' -Status $m -PercentComplete ([int](100 * ($script:n - 1) / $steps)) } catch {} } }

function Get-AurionOllamaPath {
    $command = Get-Command 'ollama.exe' -ErrorAction SilentlyContinue
    if ($command) { return $command.Source }
    $candidates = @()
    if ($env:LOCALAPPDATA) {
        $candidates += Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama.exe'
        $candidates += Join-Path $env:LOCALAPPDATA 'Ollama\ollama.exe'
    }
    if ($env:ProgramFiles) { $candidates += Join-Path $env:ProgramFiles 'Ollama\ollama.exe' }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}

function Test-AurionOllamaReady {
    $health = Invoke-Http 'http://127.0.0.1:11434/api/tags' 3
    return $health.Status -eq 200
}

function Start-AurionOllamaServer([string]$OllamaPath) {
    if (Test-AurionOllamaReady) { return $true }
    $serverLog = Join-Path $script:LogDir 'aurion-ollama-server.log'
    $serverErrorLog = Join-Path $script:LogDir 'aurion-ollama-server-error.log'
    Remove-Item -LiteralPath $serverLog,$serverErrorLog -Force -ErrorAction SilentlyContinue
    try {
        # Ollama's CLI only manages models while its local HTTP service is listening.
        # Start it detached so a tray/service child cannot hold the setup process open.
        Start-Process -FilePath $OllamaPath -ArgumentList 'serve' -WindowStyle Hidden `
            -RedirectStandardOutput $serverLog -RedirectStandardError $serverErrorLog | Out-Null
    } catch {
        # Ollama may have started between the health check and the launch attempt.
        if (-not (Test-AurionOllamaReady)) { throw }
    }
    for ($attempt = 0; $attempt -lt 45; $attempt++) {
        if (Test-AurionOllamaReady) { return $true }
        Start-Sleep -Seconds 2
    }
    $detail = Get-TailText $serverLog 8
    $errorDetail = Get-TailText $serverErrorLog 8
    if ($errorDetail) { $detail += "`n" + $errorDetail }
    if ($detail) { Write-Log ("Ollama ne répond pas encore. " + $detail) 'WARN' }
    return $false
}

function Install-AurionLocalAI {
    if (-not $script:IsWin) { return }
    $envMap = Read-EnvFile
    $model = [string]$envMap['AURION_LOCAL_LLM_MODEL']
    if ([string]::IsNullOrWhiteSpace($model)) { $model = 'qwen3.5:4b-q4_K_M' }
    if ($model -notmatch '^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,120}$') {
        $model = 'qwen3.5:4b-q4_K_M'
        Write-Log 'Nom de modèle IA local invalide; Qwen3.5-4B Q4_K_M est utilisé.' 'WARN'
    }
    $ollama = Get-AurionOllamaPath
    $installedNow = $false

    if (-not $ollama) {
        $message = "Aurion peut installer Ollama pour activer son IA locale, puis télécharger le modèle $model.`n`nCela demande une connexion Internet et plusieurs Go libres. L'installation d'Ollama se fait pour votre compte Windows, sans droit administrateur. Le modèle fonctionne sur ce PC et n'active aucun repli cloud.`n`nInstaller Ollama et télécharger le modèle maintenant ?"
        if (-not (Show-YesNoDialog 'Aurion - IA locale' $message)) {
            Write-Log "Installation Ollama/Qwen refusée ou différée par l’utilisateur." 'WARN'
            return
        }

        $installer = Join-Path $env:TEMP 'Aurion-OllamaSetup.exe'
        try {
            Write-Step "Téléchargement de l’installateur officiel Ollama"
            Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile $installer -UseBasicParsing -TimeoutSec 900
            $signature = Get-AuthenticodeSignature -FilePath $installer
            if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|, )O=Ollama Inc\.(,|$)') {
                throw "La signature Authenticode de l’installateur Ollama est invalide ou son éditeur ne correspond pas à Ollama Inc."
            }
            Write-Step "Installation d’Ollama (éditeur vérifié)"
            # Wait for the installer process itself, not a long-lived Ollama child process.
            $process = Start-Process -FilePath $installer -ArgumentList '/VERYSILENT /NORESTART /SUPPRESSMSGBOXES' -PassThru
            if (-not $process.WaitForExit(600000)) {
                try { $process.Kill() } catch {}
                throw "Le programme d'installation Ollama a dépassé le délai de 10 minutes."
            }
            $process.Refresh()
            if ($process.ExitCode -ne 0) { throw "L’installation Ollama a échoué (code $($process.ExitCode))." }
            $ollama = Get-AurionOllamaPath
            if (-not $ollama) { throw 'Ollama est installé mais son exécutable est introuvable dans le compte Windows.' }
            $env:Path = (Split-Path -Parent $ollama) + [IO.Path]::PathSeparator + $env:Path
            $process.Dispose()
            $installedNow = $true
        } catch {
            $script:LocalAIWarning = "Ollama n’a pas pu être installé ; Aurion continue sans IA locale. Consultez logs\aurion.log."
            Write-Log ("Installation IA locale ignorée après erreur : {0}" -f $_.Exception.Message) 'WARN'
            return
        } finally {
            Remove-Item -LiteralPath $installer -Force -ErrorAction SilentlyContinue
        }
    }

    if (-not (Start-AurionOllamaServer $ollama)) {
        $script:LocalAIWarning = "Ollama est installé, mais son service local n’a pas démarré. Aurion continue sans IA locale. Consultez logs\aurion-ollama-server.log."
        Write-Log $script:LocalAIWarning 'WARN'
        return
    }

    $listed = Invoke-Native $ollama @('list')
    if ($listed.Code -eq 0 -and $listed.Output -match '(?im)^\s*qwen3\.5:4b-q4_K_M(?:\s|$)') {
        Write-Log "Modèle IA local déjà installé : $model."
        return
    }
    if (-not $installedNow) {
        $message = "Télécharger le modèle local $model pour activer l’IA d’Aurion ?`n`nUne connexion Internet et plusieurs Go libres sont nécessaires. Aucun service cloud ne sera utilisé."
        if (-not (Show-YesNoDialog 'Aurion - Modèle IA local' $message)) {
            Write-Log "Téléchargement de $model différé par l’utilisateur ; Aurion reste installable." 'WARN'
            return
        }
    }

    try {
        Write-Step "Téléchargement du modèle IA $model (plusieurs Go)"
        $aiLog = Join-Path $script:LogDir 'aurion-ollama-model.log'
        $pullErrorLog = Join-Path $script:LogDir 'aurion-ollama-model-error.log'
        Remove-Item -LiteralPath $aiLog,$pullErrorLog -Force -ErrorAction SilentlyContinue
        $pullProcess = Start-Process -FilePath $ollama -ArgumentList @('pull', $model) -PassThru `
            -WindowStyle Hidden -RedirectStandardOutput $aiLog -RedirectStandardError $pullErrorLog
        if (-not $pullProcess.WaitForExit(5400000)) {
            try { $pullProcess.Kill() } catch {}
            throw "Le téléchargement de $model a dépassé le délai de 90 minutes. Il peut être relancé plus tard."
        }
        $pullProcess.Refresh()
        $pullExit = $pullProcess.ExitCode
        $pullProcess.Dispose()
        $tail = Get-TailText $aiLog 12
        if ($tail) { Write-Host $tail }
        $errorTail = Get-TailText $pullErrorLog 8
        if ($errorTail) { Write-Log ("Sortie Ollama : " + $errorTail) 'WARN' }
        if ($pullExit -ne 0) { throw "ollama pull a échoué (code $pullExit). Voir logs\aurion-ollama-model.log." }
        Write-Log "Modèle IA local prêt : $model."
    } catch {
        $script:LocalAIWarning = "Le modèle $model n’a pas pu être téléchargé ; Aurion continue sans IA locale. Relancez « ollama pull $model » après installation."
        Write-Log ("Téléchargement du modèle local échoué : {0}" -f $_.Exception.Message) 'WARN'
    }
}

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
        AURION_AI_PROVIDER = 'local'; AURION_OLLAMA_URL = 'http://127.0.0.1:11434'; AURION_LOCAL_LLM_MODEL = 'qwen3.5:4b-q4_K_M'
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

    Step 'IA locale (Ollama et modèle Qwen, facultatifs)'
    try { Install-AurionLocalAI }
    catch {
        $script:LocalAIWarning = "L’installation facultative d’Ollama a échoué ; Aurion continue sans IA locale. Consultez logs\aurion.log."
        Write-Log ("Étape IA locale ignorée après erreur : {0}" -f $_.Exception.Message) 'WARN'
    }
    if ($script:LocalAIWarning) { $warnings += $script:LocalAIWarning; $script:LocalAIWarning = $null }

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
