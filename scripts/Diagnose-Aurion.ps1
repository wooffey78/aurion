# Aurion - diagnostic : une ligne OK / KO par étape, sans rien modifier.
$ErrorActionPreference = 'Continue'
. (Join-Path $PSScriptRoot 'Aurion-Common.ps1')
$script:Interactive = $false
$report = New-Object System.Collections.ArrayList
$script:ko = 0
function Check([string]$Name, [scriptblock]$Test) {
    $ok = $false; $detail = ''
    try { $r = & $Test; $ok = [bool]$r.Ok; $detail = [string]$r.Detail } catch { $detail = $_.Exception.Message }
    if (-not $ok) { $script:ko++ }
    $line = '{0,-4} {1,-40} {2}' -f $(if ($ok) { '[OK]' } else { '[KO]' }), $Name, $detail
    [void]$report.Add($line); Write-Host $line -ForegroundColor $(if ($ok) { 'Green' } else { 'Red' })
}
Write-Host "=== Diagnostic Aurion $(Get-AppVersion) ($(Get-Date -Format 'yyyy-MM-dd HH:mm')) ===" -ForegroundColor Cyan
Write-Host "Dossier : $script:Root"
Use-AurionRuntime
$mode = Get-AurionMode
Check 'Fichier backend\.env' { @{ Ok = (Test-Path $script:EnvFile); Detail = $script:EnvFile } }
Check 'Node.js >= 20' { @{ Ok = (Test-NodeOk); Detail = (Get-NodeExe) } }
Check 'Composants npm' { @{ Ok = (Test-DependenciesInstalled); Detail = 'backend\node_modules' } }
Check 'Compilation à jour' { @{ Ok = (Test-BuildFresh); Detail = 'dist\.version = VERSION.txt' } }
Check 'PostgreSQL embarqué présent' { @{ Ok = ($mode -ne 'embedded' -or [bool](Get-PgBinDir)); Detail = "mode $mode" } }
Check 'Composant Visual C++ (Windows)' { @{ Ok = (Test-VcRuntime); Detail = 'vcruntime140.dll / msvcp140.dll' } }
Check 'PostgreSQL démarré' { @{ Ok = ($mode -ne 'embedded' -or (Test-PgRunning)); Detail = $script:PgData } }
Check 'Base joignable (compte aurion)' { $log = Join-Path $script:LogDir 'aurion-dbtool.log'; try { Invoke-DbTool 'wait' '8'; @{ Ok = $true; Detail = 'select 1' } } catch { @{ Ok = $false; Detail = $_.Exception.Message } } }
$owner = Get-PortOwnerPid $script:Port
Check "Port $($script:Port)" { @{ Ok = $true; Detail = $(if ($owner) { "occupé par PID $owner" } else { 'libre' }) } }
$h1 = Invoke-Http ($script:AppUrl + '/health') 3; $h2 = Invoke-Http ($script:AppUrl + '/health/db') 3; $f = Invoke-Http ($script:AppUrl + '/') 3; $l = Invoke-Http ($script:AppUrl + '/backend/.env') 3
Check '/health' { @{ Ok = ($h1.Status -eq 200); Detail = "HTTP $($h1.Status) $($h1.Body)" } }
Check '/health/db (base joignable)' { @{ Ok = ($h2.Status -eq 200); Detail = "HTTP $($h2.Status)" } }
Check 'Interface servie sur /' { @{ Ok = ($f.Status -eq 200 -and $f.Body -match 'Aurion'); Detail = "HTTP $($f.Status)" } }
Check 'Sécurité : /backend/.env inaccessible' { @{ Ok = ($l.Status -ne 200); Detail = $(if ($l.Status -eq 0) { 'serveur arrêté (non testable)' } else { "HTTP $($l.Status)" }) } }
Write-Host ''; Write-Host $(if ($script:ko -eq 0) { 'Tout est OK.' } else { "$script:ko contrôle(s) en échec." }) -ForegroundColor $(if ($script:ko -eq 0) { 'Green' } else { 'Yellow' })
foreach ($n in 'aurion.log', 'aurion-backend-error.log', 'aurion-migrate.log', 'aurion-build.log', 'postgres.log') {
    $t = Get-TailText (Join-Path $script:LogDir $n) 10
    if ($t) { Write-Host "`n--- $n ---" -ForegroundColor DarkCyan; Write-Host $t; [void]$report.Add("`n--- $n ---`n$t") }
}
[IO.File]::WriteAllText((Join-Path $script:LogDir 'diagnose.txt'), ($report -join "`r`n"), $script:Utf8NoBom)
Write-Host "`nRapport : $(Join-Path $script:LogDir 'diagnose.txt')"
