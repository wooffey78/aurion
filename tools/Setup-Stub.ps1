# Aurion - installateur autonome. Ce script est copié dans %TEMP% puis exécuté par Aurion-Setup.bat (aucun Invoke-Expression).
# Il extrait le projet complet intégré au fichier .bat, puis lance l'installation automatique. Aucune saisie.
$ErrorActionPreference = 'Stop'
$errLog = Join-Path ([IO.Path]::GetTempPath()) 'aurion-setup-error.log'
if (Test-Path $errLog) { Remove-Item $errLog -Force -ErrorAction SilentlyContinue }
try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch {}
$isWin = ($env:OS -eq 'Windows_NT')
$dir = $env:AURION_SETUP_DIR
if (-not $dir) { $dir = Join-Path $(if ($isWin) { $env:LOCALAPPDATA } else { Join-Path $HOME '.local/share' }) 'Aurion' }

# PostgreSQL n'aime pas les chemins accentués (ex. nom d'utilisateur Windows avec accent) : dossier de repli à la racine du disque.
if ($isWin -and $dir -match '[^\x00-\x7F]') { $dir = 'C:\Aurion' }

Write-Host ''
Write-Host '   AURION - installation automatique' -ForegroundColor Cyan
Write-Host "   Dossier d'installation : $dir"
Write-Host '   Ne fermez pas cette fenêtre : tout s''installe seul (quelques minutes).' -ForegroundColor Yellow
Write-Host ''

try {
    $self = $env:AURION_SELF
    $lines = [IO.File]::ReadAllLines($self)
    $at = [Array]::IndexOf($lines, '::AURION-SETUP-PAYLOAD')
    if ($at -lt 0) { throw 'Fichier Aurion-Setup.bat incomplet ou modifié (données introuvables). Retéléchargez-le.' }
    $bytes = [Convert]::FromBase64String(($lines[($at + 1)..($lines.Length - 1)] -join ''))
    # Mise à jour : l'instance en cours est arrêtée proprement avant de remplacer les fichiers.
    $stop = Join-Path $dir 'scripts\Stop-Aurion.ps1'
    if ($isWin -and (Test-Path $stop)) { try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stop | Out-Null } catch {} }

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = New-Object IO.Compression.ZipArchive((New-Object IO.MemoryStream(, $bytes)), [IO.Compression.ZipArchiveMode]::Read)
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $root = [IO.Path]::GetFullPath($dir).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    $count = 0
    foreach ($e in $zip.Entries) {
        $dest = [IO.Path]::GetFullPath((Join-Path $dir ($e.FullName.Replace('/', [string][IO.Path]::DirectorySeparatorChar))))
        if (-not $dest.StartsWith($root)) { throw 'Archive invalide (chemin interdit).' }
        if ($e.FullName.EndsWith('/')) { New-Item -ItemType Directory -Force -Path $dest | Out-Null; continue }
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
        [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $dest, $true)
        $count++
    }
    $zip.Dispose()
    Write-Host "   $count fichiers installés." -ForegroundColor Green
    if ($env:AURION_SETUP_EXTRACT_ONLY) { Write-Host '   (extraction seule)'; exit 0 }

    $ps = $(if ($isWin) { 'powershell.exe' } else { 'pwsh' })
    & $ps -NoProfile -ExecutionPolicy Bypass -File (Join-Path $dir 'scripts\Install-Aurion.ps1')
    exit $LASTEXITCODE
} catch {
    $detail = ('[{0}] {1}`r`n{2}`r`n{3}' -f (Get-Date -Format 's'), $_.Exception.Message, ($_ | Out-String), $_.ScriptStackTrace)
    try { [IO.File]::WriteAllText($errLog, $detail) } catch {}
    Write-Host ''
    Write-Host ('   ERREUR : ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
