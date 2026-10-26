# Aurion - construit le fichier unique Aurion-Setup.bat (projet complet intégré). À lancer depuis le dossier du projet
# (là où se trouvent vos dossiers branding\ et assets\ : ils sont inclus automatiquement).
param([string]$Root, [string]$Out)
$ErrorActionPreference = 'Stop'
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
if (-not $Out) { $Out = Join-Path (Join-Path $Root 'dist-setup') 'Aurion-Setup.bat' }
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
$exclude = '(^|/)(node_modules|dist|logs|data|runtime|storage|\.git|tools|dist-setup)(/|$)|(^|/)\.env$|\.zip$|\.log$|^Aurion-Setup\.bat$|^INSTALL-DEPUIS-LES-SOURCES\.bat$'

Add-Type -AssemblyName System.IO.Compression
$ms = New-Object IO.MemoryStream
$zip = New-Object IO.Compression.ZipArchive($ms, [IO.Compression.ZipArchiveMode]::Create, $true)
$n = 0
foreach ($f in Get-ChildItem -LiteralPath $Root -Recurse -File -Force) {
    $rel = $f.FullName.Substring($Root.Length).TrimStart('\', '/').Replace('\', '/')
    if ($rel -match $exclude) { continue }
    $entry = $zip.CreateEntry($rel, [IO.Compression.CompressionLevel]::Optimal)
    $s = $entry.Open(); $b = [IO.File]::ReadAllBytes($f.FullName); $s.Write($b, 0, $b.Length); $s.Dispose(); $n++
}
$zip.Dispose()
$b64 = [Convert]::ToBase64String($ms.ToArray(), [Base64FormattingOptions]::InsertLineBreaks)
$stub = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'Setup-Stub.ps1')).TrimStart([char]0xFEFF)

$header = @(
    '@echo off', 'setlocal', 'title Installation d''Aurion', 'set "AURION_SELF=%~f0"',
    'powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$l=[IO.File]::ReadAllLines($env:AURION_SELF); $a=[Array]::IndexOf($l,''::AURION-SETUP-SCRIPT''); $b=[Array]::IndexOf($l,''::AURION-SETUP-PAYLOAD''); $f=Join-Path $env:TEMP ''aurion-setup.ps1''; [IO.File]::WriteAllLines($f,$l[($a+1)..($b-1)],(New-Object Text.UTF8Encoding($true))); & $f; exit $LASTEXITCODE"',
    'set "RC=%errorlevel%"', 'if "%RC%"=="0" exit /b 0', 'echo.', 'echo L installation d Aurion a echoue.', 'if exist "%TEMP%\aurion-setup-error.log" type "%TEMP%\aurion-setup-error.log"', 'echo.', 'echo Journaux detailles : %LOCALAPPDATA%\Aurion\logs', 'pause', 'exit /b %RC%'
) -join "`r`n"
$text = $header + "`r`n" + '::AURION-SETUP-SCRIPT' + "`r`n" + $stub.Replace("`r`n", "`n").Replace("`n", "`r`n") + "`r`n" + '::AURION-SETUP-PAYLOAD' + "`r`n" + $b64
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null
[IO.File]::WriteAllText($Out, $text, (New-Object Text.UTF8Encoding($false)))
Write-Host ("Aurion-Setup.bat créé : {0}  ({1} fichiers, {2:N1} Mo)" -f $Out, $n, ((Get-Item $Out).Length / 1MB))
