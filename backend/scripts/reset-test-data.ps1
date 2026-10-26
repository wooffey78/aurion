param([string]$DatabaseUrl=$env:DATABASE_URL)
if([string]::IsNullOrWhiteSpace($DatabaseUrl)){throw 'DATABASE_URL est requis.'}
if($env:AURION_ENV -eq 'production' -or $env:AURION_ALLOW_DATA_RESET -ne 'true'){throw 'Refus de remise à zéro : définir AURION_ALLOW_DATA_RESET=true et ne jamais utiliser ce script en production.'}
psql $DatabaseUrl -v ON_ERROR_STOP=1 -f "$PSScriptRoot/reset-test-data.sql"
if($LASTEXITCODE -ne 0){throw 'La remise à zéro PostgreSQL a échoué.'}
Write-Host 'Base PostgreSQL de test remise à zéro.'
