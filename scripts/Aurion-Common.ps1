# Aurion - bibliothèque commune (dot-sourcée par Install / Launcher / Stop / Diagnose).
# Windows PowerShell 5.1 compatible. Fichier enregistré en UTF-8 AVEC BOM (accents en PS 5.1).
# Principe : AUCUNE saisie n'est jamais demandée dans PowerShell (ni mot de passe, ni adresse e-mail).

$script:IsWin     = ($env:OS -eq 'Windows_NT')
$script:Root      = Split-Path -Parent $PSScriptRoot
$script:Backend   = Join-Path $script:Root 'backend'
$script:EnvFile   = Join-Path $script:Backend '.env'
$script:LogDir    = Join-Path $script:Root 'logs'
$script:LogFile   = Join-Path $script:LogDir 'aurion.log'
$script:DataDir   = Join-Path $script:Root 'data'
$script:PgData    = Join-Path $script:DataDir 'pg'
$script:RuntimeDir= Join-Path $script:Root 'runtime'
$script:NodeName  = $(if ($script:IsWin) { 'node.exe' } else { 'node' })
$script:NpmName   = $(if ($script:IsWin) { 'npm.cmd' } else { 'npm' })
$script:Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$script:Interactive = $false
$script:Port = 4000
$script:AppUrl = 'http://127.0.0.1:4000'

New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null
try { [System.Net.WebRequest]::DefaultWebProxy = $null } catch {}
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}

# ---------------------------------------------------------------- journal / messages
function Write-Log([string]$Message, [string]$Level = 'INFO') {
    $line = '[{0}] [{1}] {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Level, $Message
    try { [IO.File]::AppendAllText($script:LogFile, $line + "`r`n", $script:Utf8NoBom) } catch {}
    if ($script:Interactive) {
        $color = switch ($Level) { 'ERROR' { 'Red' } 'WARN' { 'Yellow' } 'STEP' { 'Cyan' } default { 'Gray' } }
        Write-Host $line -ForegroundColor $color
    }
}
function Write-Step([string]$Message) { Write-Log $Message 'STEP' }

function Get-TailText([string]$File, [int]$Lines = 20) {
    if (-not (Test-Path -LiteralPath $File)) { return '' }
    try { return ((Get-Content -LiteralPath $File -Tail $Lines -ErrorAction Stop) -join "`n") } catch { return '' }
}

function Show-ErrorDialog([string]$Title, [string]$Message) {
    Write-Log $Message 'ERROR'
    if (-not $script:IsWin) { Write-Host $Message; return }
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $r = [System.Windows.Forms.MessageBox]::Show($Message + "`n`nOuvrir le dossier des journaux ?`n($script:LogDir)", $Title, 'YesNo', 'Error')
        if ($r -eq 'Yes') { Start-Process explorer.exe -ArgumentList ('"{0}"' -f $script:LogDir) }
    } catch { Write-Host $Message -ForegroundColor Red }
}

function Show-YesNoDialog([string]$Title, [string]$Message) {
    if (-not $script:IsWin) { return $false }
    try { Add-Type -AssemblyName System.Windows.Forms; return ([System.Windows.Forms.MessageBox]::Show($Message, $Title, 'YesNo', 'Question') -eq 'Yes') }
    catch { return $false }
}

# ---------------------------------------------------------------- utilitaires
function New-Secret([int]$Bytes = 32) {
    $b = New-Object byte[] $Bytes
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($b) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($b).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}
function Get-AppVersion {
    $f = Join-Path $script:Root 'VERSION.txt'
    if (Test-Path -LiteralPath $f) { return ([IO.File]::ReadAllText($f).Trim()) }
    return 'unknown'
}
function Update-SessionPath {
    if (-not $script:IsWin) { return }
    $env:Path = (@([Environment]::GetEnvironmentVariable('Path', 'Machine'), [Environment]::GetEnvironmentVariable('Path', 'User'), $env:Path) | Where-Object { $_ }) -join ';'
}

# Programme natif SANS que stderr devienne une erreur fatale (piège PS 5.1). Renvoie Code + Output.
function Invoke-Native([string]$Exe, [string[]]$Arguments) {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    try { $out = & $Exe @Arguments 2>&1 | ForEach-Object { "$_" }; $code = $LASTEXITCODE } finally { $ErrorActionPreference = $old }
    return [pscustomobject]@{ Code = $code; Output = (@($out) -join "`n") }
}

# Ligne de commande shell, toute la sortie vers un journal. Attend UNIQUEMENT ce processus (jamais ses descendants durables).
function Invoke-Cmd([string]$WorkDir, [string]$CommandLine, [string]$LogFile, [int]$TimeoutSec = 900) {
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    if ($script:IsWin) { $psi.FileName = $env:ComSpec; $psi.Arguments = ('/d /s /c "cd /d "{0}" && {1} >> "{2}" 2>&1"' -f $WorkDir, $CommandLine, $LogFile) }
    else { $psi.FileName = '/bin/sh'; [void]$psi.ArgumentList.Add('-c'); [void]$psi.ArgumentList.Add(('cd "{0}" && {1} >> "{2}" 2>&1' -f $WorkDir, $CommandLine, $LogFile)) }   # sh : sert aux tests sous Linux
    $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true; $psi.WorkingDirectory = $WorkDir
    $p = [System.Diagnostics.Process]::Start($psi)
    if (-not $p.WaitForExit($TimeoutSec * 1000)) { try { $p.Kill() } catch {}; return 124 }
    return $p.ExitCode
}

function Invoke-Http([string]$Url, [int]$Timeout = 4) {
    try { $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $Timeout; return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = [string]$r.Content } }
    catch { $st = 0; try { if ($_.Exception.Response) { $st = [int]$_.Exception.Response.StatusCode } } catch {}; return [pscustomobject]@{ Status = $st; Body = '' } }
}

function Get-PortOwnerPid([int]$Port) {
    if (-not $script:IsWin) { return $null }
    try { $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -First 1; if ($c) { return [int]$c.OwningProcess } } catch {}
    return $null
}

function Get-FreePort([int]$Start = 54329) {
    for ($p = $Start; $p -lt ($Start + 60); $p++) {
        $l = $null
        try { $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $p); $l.Start(); $l.Stop(); return $p } catch { try { $l.Stop() } catch {} }
    }
    throw 'Aucun port local libre pour la base de données Aurion.'
}

# ---------------------------------------------------------------- backend\.env (UTF-8 SANS BOM)
function Read-EnvFile([string]$Path = $script:EnvFile) {
    $map = [ordered]@{}
    if (-not (Test-Path -LiteralPath $Path)) { return $map }
    foreach ($line in (([IO.File]::ReadAllText($Path).TrimStart([char]0xFEFF)) -split "`r?`n")) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$') { $map[$Matches[1]] = $Matches[2].Trim() }
    }
    return $map
}
function Write-EnvFile($Map, [string]$Path = $script:EnvFile) {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
    $lines = foreach ($k in $Map.Keys) { '{0}={1}' -f $k, $Map[$k] }
    [IO.File]::WriteAllText($Path, (($lines -join "`r`n") + "`r`n"), $script:Utf8NoBom)
}
function Initialize-EnvPort {
    $e = Read-EnvFile
    if ($e['PORT'] -match '^\d+$') { $script:Port = [int]$e['PORT'] }
    $script:AppUrl = 'http://127.0.0.1:{0}' -f $script:Port
}
Initialize-EnvPort

# ---------------------------------------------------------------- Node.js (système ou portable, sans droits administrateur)
function Get-NodeExe {
    $portable = Join-Path (Join-Path $script:RuntimeDir 'node') $script:NodeName
    if (Test-Path -LiteralPath $portable) { return $portable }
    $c = Get-Command $script:NodeName -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    return $null
}
function Use-AurionRuntime {
    Update-SessionPath
    $dir = Join-Path $script:RuntimeDir 'node'
    if (Test-Path -LiteralPath $dir) { $env:Path = $dir + [IO.Path]::PathSeparator + $env:Path }
}
function Test-NodeOk {
    $exe = Get-NodeExe
    if (-not $exe) { return $false }
    $r = Invoke-Native $exe @('--version')
    if ($r.Code -ne 0) { return $false }
    return ([int](($r.Output.Trim() -replace '^v', '').Split('.')[0]) -ge 20)
}
function Install-PortableNode {
    Write-Step 'Téléchargement de Node.js (environ 30 Mo)...'
    $ProgressPreference = 'SilentlyContinue'
    $idx = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -UseBasicParsing -TimeoutSec 60
    $rel = $idx | Where-Object { $_.lts -and ($_.files -contains 'win-x64-zip') -and ([int]($_.version.TrimStart('v').Split('.')[0]) -ge 20) } | Select-Object -First 1
    if (-not $rel) { throw 'Version de Node.js introuvable sur nodejs.org.' }
    $ver = $rel.version; $file = "node-$ver-win-x64.zip"
    New-Item -ItemType Directory -Force -Path $script:RuntimeDir | Out-Null
    $zip = Join-Path $script:RuntimeDir $file
    $ok = $false
    for ($i = 1; $i -le 3 -and -not $ok; $i++) {
        try { Invoke-WebRequest -Uri "https://nodejs.org/dist/$ver/$file" -OutFile $zip -UseBasicParsing -TimeoutSec 600; $ok = $true }
        catch { Write-Log "Téléchargement Node.js : essai $i/3 échoué ($($_.Exception.Message))" 'WARN'; Start-Sleep -Seconds 3 }
    }
    if (-not $ok) { throw 'Téléchargement de Node.js impossible : vérifiez la connexion Internet, puis relancez le setup.' }
    $sums = (Invoke-WebRequest -Uri "https://nodejs.org/dist/$ver/SHASUMS256.txt" -UseBasicParsing -TimeoutSec 60).Content
    $expected = ($sums -split "`n" | Where-Object { $_ -match [regex]::Escape($file) } | Select-Object -First 1)
    if ($expected) {
        $hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLower()
        if (-not $expected.ToLower().StartsWith($hash)) { Remove-Item $zip -Force; throw 'Somme de contrôle de Node.js invalide : téléchargement corrompu.' }
    }
    $tmp = Join-Path $script:RuntimeDir 'node-tmp'
    if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
    $target = Join-Path $script:RuntimeDir 'node'
    if (Test-Path $target) { Remove-Item $target -Recurse -Force }
    Move-Item -LiteralPath (Join-Path $tmp "node-$ver-win-x64") -Destination $target
    Remove-Item $tmp -Recurse -Force; Remove-Item $zip -Force
    Write-Log "Node.js $ver installé dans runtime\node."
}
function Ensure-Node([bool]$AllowDownload = $false) {
    Use-AurionRuntime
    if (-not (Test-NodeOk)) {
        if (-not $AllowDownload) { throw 'Node.js est introuvable ou trop ancien. Relancez Aurion-Setup.bat.' }
        Install-PortableNode; Use-AurionRuntime
        if (-not (Test-NodeOk)) { throw 'Node.js est inutilisable après installation.' }
    }
    $exe = Get-NodeExe
    Write-Log ("Node.js {0} ({1})" -f (& $exe --version), $exe)
    return $exe
}

# ---------------------------------------------------------------- PostgreSQL embarqué (dédié à Aurion : aucun mot de passe à saisir)
function Get-PgBinDir {
    $plat = $(if ($script:IsWin) { 'windows-x64' } else { 'linux-x64' })
    $d = Join-Path (Join-Path (Join-Path (Join-Path $script:Backend 'node_modules') '@embedded-postgres') $plat) (Join-Path 'native' 'bin')
    if (Test-Path -LiteralPath $d) { return $d }
    return $null
}
function Get-PgExe([string]$Name) {
    $bin = Get-PgBinDir
    if (-not $bin) { throw 'PostgreSQL embarqué introuvable (backend\node_modules\@embedded-postgres). Relancez Aurion-Setup.bat.' }
    return (Join-Path $bin $(if ($script:IsWin) { "$Name.exe" } else { $Name }))
}
function Get-AurionMode { $m = (Read-EnvFile)['AURION_PG_MODE']; if ($m) { return $m } else { return 'embedded' } }

function Test-VcRuntime {
    if (-not $script:IsWin) { return $true }
    return ((Test-Path "$env:SystemRoot\System32\vcruntime140.dll") -and (Test-Path "$env:SystemRoot\System32\msvcp140.dll"))
}
# Rare : Windows sans « Visual C++ Redistributable ». Une seule autorisation Windows (UAC), une seule fois.
function Install-VcRuntime {
    Write-Step 'Installation du composant Windows « Visual C++ Redistributable » (une seule fois)...'
    $exe = Join-Path $env:TEMP 'vc_redist.x64.exe'
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile $exe -UseBasicParsing -TimeoutSec 600
    $p = Start-Process -FilePath $exe -ArgumentList '/install /quiet /norestart' -Verb RunAs -Wait -PassThru
    Remove-Item $exe -Force -ErrorAction SilentlyContinue
    if (($p.ExitCode -ne 0) -and ($p.ExitCode -ne 3010) -and ($p.ExitCode -ne 1638)) { throw "Le composant Visual C++ n'a pas pu être installé (code $($p.ExitCode))." }
}

function Test-PgRunning {
    if (-not (Test-Path -LiteralPath (Join-Path $script:PgData 'PG_VERSION'))) { return $false }
    $r = Invoke-Native (Get-PgExe 'pg_ctl') @('status', '-D', $script:PgData)
    return ($r.Code -eq 0)
}

function Initialize-PgCluster([string]$AdminPassword) {
    if (Test-Path -LiteralPath (Join-Path $script:PgData 'PG_VERSION')) { Write-Log 'Base PostgreSQL déjà initialisée.'; return }
    Write-Step 'Création de la base de données Aurion (une seule fois)...'
    New-Item -ItemType Directory -Force -Path $script:DataDir | Out-Null
    $initdb = Get-PgExe 'initdb'
    $pwf = Join-Path ([IO.Path]::GetTempPath()) ('aurion-pw-{0}.txt' -f [guid]::NewGuid().ToString('N'))
    [IO.File]::WriteAllText($pwf, $AdminPassword, $script:Utf8NoBom)
    $log = Join-Path $script:LogDir 'postgres-init.log'
    try {
        $base = '"{0}" -D "{1}" -U aurion_admin -A scram-sha-256 -E UTF8 --locale=C --pwfile="{2}"' -f $initdb, $script:PgData, $pwf
        $code = Invoke-Cmd $script:Root ($base + ' --locale-provider=icu --icu-locale=fr-FR') $log 300     # tri alphabétique français si ICU disponible
        if ($code -ne 0) {
            Write-Log 'Initialisation avec ICU impossible : nouvel essai standard.' 'WARN'
            if (Test-Path $script:PgData) { Remove-Item $script:PgData -Recurse -Force }
            $code = Invoke-Cmd $script:Root $base $log 300
        }
        if ($code -ne 0) { throw "L'initialisation de PostgreSQL a échoué (code $code).`n" + (Get-TailText $log 12) }
    } finally { Remove-Item -LiteralPath $pwf -Force -ErrorAction SilentlyContinue }
}

function Start-PgCluster([int]$Port) {
    if (Test-PgRunning) { Write-Log 'PostgreSQL déjà démarré.'; return }
    Write-Step "Démarrage de PostgreSQL (port $Port)..."
    $opts = '-p {0} -c listen_addresses=127.0.0.1' -f $Port
    if (-not $script:IsWin) { $opts += (' -c unix_socket_directories={0}' -f $script:PgData) }
    $log = Join-Path $script:LogDir ('pg-ctl-start-{0}.log' -f (Get-Date -Format 'HHmmss'))
    $cmd = '"{0}" start -D "{1}" -l "{2}" -w -t 90 -o "{3}"' -f (Get-PgExe 'pg_ctl'), $script:PgData, (Join-Path $script:LogDir 'postgres.log'), $opts
    $code = Invoke-Cmd $script:Root $cmd $log 150
    if ($code -ne 0) { throw "PostgreSQL n'a pas démarré (code $code).`n" + (Get-TailText $log 8) + "`n" + (Get-TailText (Join-Path $script:LogDir 'postgres.log') 12) }
}

function Stop-PgCluster {
    if (-not (Test-Path -LiteralPath (Join-Path $script:PgData 'PG_VERSION'))) { return }
    if (-not (Test-PgRunning)) { return }
    Write-Step 'Arrêt de PostgreSQL...'
    $log = Join-Path $script:LogDir ('pg-ctl-stop-{0}.log' -f (Get-Date -Format 'HHmmss'))
    $code = Invoke-Cmd $script:Root ('"{0}" stop -D "{1}" -m fast -w -t 60' -f (Get-PgExe 'pg_ctl'), $script:PgData) $log 90
    if ($code -ne 0) {
        Write-Log 'Arrêt propre impossible : arrêt immédiat.' 'WARN'
        [void](Invoke-Cmd $script:Root ('"{0}" stop -D "{1}" -m immediate -w -t 30' -f (Get-PgExe 'pg_ctl'), $script:PgData) $log 60)
    }
}

function Invoke-DbTool([string]$Command, [string]$Arg = '') {
    $log = Join-Path $script:LogDir 'aurion-dbtool.log'
    if (Test-Path $log) { Remove-Item $log -Force -ErrorAction SilentlyContinue }
    $code = Invoke-Cmd $script:Backend ('{0} dist/dbtool.js {1} {2}' -f $script:NodeName, $Command, $Arg) $log 180
    if ($code -ne 0) { throw "Base de données : commande « $Command » échouée.`n" + (Get-TailText $log 10) }
}

# ---------------------------------------------------------------- arrêt du serveur Aurion
function Stop-AurionBackend {
    $pidFile = Join-Path $script:LogDir 'backend.pid'
    if (Test-Path -LiteralPath $pidFile) {
        try {
            $id = [int](([IO.File]::ReadAllText($pidFile)).Trim())
            $p = Get-Process -Id $id -ErrorAction SilentlyContinue
            if ($p -and $p.ProcessName -match 'node') { Write-Log "Arrêt du serveur Aurion (PID $id)."; Stop-Process -Id $id -Force -ErrorAction SilentlyContinue }
        } catch {}
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
    $owner = Get-PortOwnerPid $script:Port
    if ($owner) {
        $h = Invoke-Http ($script:AppUrl + '/health') 3
        $isAurion = $false
        if ($h.Status -eq 200) { try { $isAurion = (($h.Body | ConvertFrom-Json).service -eq 'aurion-api') } catch {} }
        if (-not $isAurion) { throw "Le port $($script:Port) est utilisé par un autre programme (PID $owner). Fermez-le, puis relancez Aurion." }
        Write-Log "Ancien serveur Aurion sur le port $($script:Port) (PID $owner) : arrêt."
        try { Stop-Process -Id $owner -Force -ErrorAction Stop } catch { throw "Impossible d'arrêter l'ancien Aurion (PID $owner). Fermez node.exe dans le Gestionnaire des tâches." }
    }
    for ($i = 0; $i -lt 20; $i++) { if (-not (Get-PortOwnerPid $script:Port)) { return }; Start-Sleep -Milliseconds 500 }
    throw "Le port $($script:Port) reste occupé après l'arrêt d'Aurion."
}

# ---------------------------------------------------------------- dépendances / compilation / migrations
function Test-DependenciesInstalled {
    foreach ($m in 'fastify', 'pg', 'typescript', 'pdfkit', 'adm-zip', 'docx', 'nodemailer', 'argon2') {
        if (-not (Test-Path (Join-Path (Join-Path $script:Backend 'node_modules') $m))) { return $false }
    }
    if ($script:IsWin -and -not (Get-PgBinDir)) { return $false }
    $lock = Join-Path (Join-Path $script:Backend 'node_modules') '.package-lock.json'
    if (-not (Test-Path $lock)) { return $false }
    return ([IO.File]::GetLastWriteTime((Join-Path $script:Backend 'package.json')) -le [IO.File]::GetLastWriteTime($lock))   # pas de Get-Item : fichier caché
}
function Test-BuildFresh {
    $server = Join-Path $script:Backend 'dist/server.js'; $ver = Join-Path $script:Backend 'dist/.version'
    if (-not (Test-Path $server) -or -not (Test-Path $ver)) { return $false }
    if (([IO.File]::ReadAllText($ver).Trim()) -ne (Get-AppVersion)) { return $false }
    $src = Get-ChildItem (Join-Path $script:Backend 'src') -Recurse -Filter *.ts -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    return -not ($src -and $src.LastWriteTime -gt [IO.File]::GetLastWriteTime($server))
}
function Install-Dependencies {
    Write-Step 'Installation des composants (npm) : quelques minutes...'
    $log = Join-Path $script:LogDir 'npm-install.log'
    $code = Invoke-Cmd $script:Backend ($script:NpmName + ' install --no-audit --no-fund') $log 1500
    if ($code -ne 0) { throw "L'installation des composants a échoué (code $code). Vérifiez la connexion Internet.`n" + (Get-TailText $log 12) }
}
function Build-Backend {
    Write-Step 'Compilation d''Aurion...'
    $log = Join-Path $script:LogDir 'aurion-build.log'
    if (Test-Path $log) { Remove-Item $log -Force -ErrorAction SilentlyContinue }
    $code = Invoke-Cmd $script:Backend ($script:NpmName + ' run build') $log 600
    if ($code -ne 0) { throw "La compilation a échoué (code $code).`n" + (Get-TailText $log 15) }
    [IO.File]::WriteAllText((Join-Path $script:Backend 'dist/.version'), (Get-AppVersion), $script:Utf8NoBom)
}
function Invoke-Migrations {
    Write-Step 'Mise à jour de la base de données...'
    $log = Join-Path $script:LogDir 'aurion-migrate.log'
    if (Test-Path $log) { Remove-Item $log -Force -ErrorAction SilentlyContinue }
    $code = Invoke-Cmd $script:Backend ($script:NodeName + ' dist/migrate.js') $log 300
    if ($code -ne 0) { throw "La migration de la base a échoué (code $code).`n" + (Get-TailText $log 15) }
}

# ---------------------------------------------------------------- icône et raccourcis (Windows)
function New-AurionIcon([string]$Path) {
    if (-not $script:IsWin) { return $false }
    try {
        Add-Type -AssemblyName System.Drawing
        $bmp = New-Object System.Drawing.Bitmap 256, 256
        $g = [System.Drawing.Graphics]::FromImage($bmp); $g.SmoothingMode = 'AntiAlias'; $g.TextRenderingHint = 'AntiAlias'
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $d = 72; $path.AddArc(0, 0, $d, $d, 180, 90); $path.AddArc(256 - $d, 0, $d, $d, 270, 90); $path.AddArc(256 - $d, 256 - $d, $d, $d, 0, 90); $path.AddArc(0, 256 - $d, $d, $d, 90, 90); $path.CloseFigure()
        $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0, 0)), ([System.Drawing.Point]::new(256, 256)), ([System.Drawing.Color]::FromArgb(71, 123, 255)), ([System.Drawing.Color]::FromArgb(25, 191, 255))
        $g.FillPath($brush, $path)
        $font = New-Object System.Drawing.Font 'Segoe UI', 132, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
        $sf = New-Object System.Drawing.StringFormat; $sf.Alignment = 'Center'; $sf.LineAlignment = 'Center'
        $g.DrawString('A', $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 6, 256, 256), $sf)
        $ms = New-Object IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $png = $ms.ToArray()
        $fs = [IO.File]::Create($Path); $bw = New-Object IO.BinaryWriter $fs
        $bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]1)
        $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([byte]0); $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$png.Length); $bw.Write([uint32]22)
        $bw.Write($png); $bw.Close(); $fs.Close(); $g.Dispose(); $bmp.Dispose()
        return $true
    } catch { Write-Log ("Icône générée impossible : " + $_.Exception.Message) 'WARN'; return $false }
}
function New-AurionShortcuts {
    if (-not $script:IsWin) { return }
    $ico = Join-Path $script:Root 'branding\aurion.ico'
    if (-not (Test-Path $ico)) { $ico = Join-Path $script:DataDir 'aurion.ico'; New-Item -ItemType Directory -Force -Path $script:DataDir | Out-Null; if (-not (Test-Path $ico)) { [void](New-AurionIcon $ico) } }
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $launcher = Join-Path $script:Root 'scripts\Aurion-Launcher.ps1'
    $w = New-Object -ComObject WScript.Shell
    $targets = @((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Aurion.lnk'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'Aurion.lnk'))
    foreach ($lnk in $targets) {
        $s = $w.CreateShortcut($lnk)
        $s.TargetPath = $ps
        $s.Arguments = '-NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}"' -f $launcher
        $s.WorkingDirectory = $script:Root; $s.Description = 'Démarrer Aurion'; $s.WindowStyle = 7
        if (Test-Path $ico) { $s.IconLocation = $ico }
        $s.Save()
        if (-not (Test-Path $lnk)) { throw "Impossible de créer le raccourci : $lnk" }
    }
}
