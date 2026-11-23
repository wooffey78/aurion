# Aurion - arrêt complet : serveur puis PostgreSQL embarqué.
param([switch]$Console)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Aurion-Common.ps1')
$script:Interactive = [bool]$Console
try {
    Use-AurionRuntime
    Stop-AurionBackend
    if ((Get-AurionMode) -eq 'embedded' -and (Get-PgBinDir)) { Stop-PgCluster }
    Write-Log 'Aurion arrêté.'
    exit 0
} catch { Show-ErrorDialog 'Aurion - Arrêt impossible' ($_.Exception.Message); exit 1 }
