param(
    [string]$Root,
    [switch]$KeepArtifacts
)

$ErrorActionPreference = 'Stop'
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
$builder = Join-Path $PSScriptRoot 'Build-Setup.ps1'
if (-not (Test-Path -LiteralPath $builder -PathType Leaf)) { throw "Constructeur absent : $builder" }

$validationName = 'validation-' + [guid]::NewGuid().ToString('N')
$validationRoot = Join-Path (Join-Path $Root 'dist-setup') $validationName
$installer = Join-Path $validationRoot 'Aurion-Setup.bat'
$extractRoot = Join-Path $validationRoot 'extracted'
$stdout = Join-Path $validationRoot 'setup-stdout.log'
$oldSetupDir = $env:AURION_SETUP_DIR
$oldExtractOnly = $env:AURION_SETUP_EXTRACT_ONLY
$fixtureToken = [guid]::NewGuid().ToString('N')
$secretFixtures = @(
    (Join-Path $Root ".env.validation-$fixtureToken"),
    (Join-Path (Join-Path $Root 'backend') ".env.local.validation-$fixtureToken")
)
$createdFixtures = @()
$success = $false

try {
    foreach ($fixture in $secretFixtures) {
        if (Test-Path -LiteralPath $fixture) { throw "Le fichier temporaire de recette existe déjà : $fixture" }
        [IO.File]::WriteAllText($fixture, 'AURION_SETUP_SECRET_FIXTURE')
        $createdFixtures += $fixture
    }
    & $builder -Root $Root -Out $installer
    if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Le fichier de setup n'a pas été construit." }
    $lines = [IO.File]::ReadAllLines($installer)
    $scriptMarker = [Array]::IndexOf($lines, '::AURION-SETUP-SCRIPT')
    $payloadMarker = [Array]::IndexOf($lines, '::AURION-SETUP-PAYLOAD')
    if ($scriptMarker -lt 0 -or $payloadMarker -le $scriptMarker) { throw 'Marqueurs de setup absents ou inversés.' }
    $payloadBytes = [Convert]::FromBase64String(($lines[($payloadMarker + 1)..($lines.Length - 1)] -join ''))

    Add-Type -AssemblyName System.IO.Compression
    $payloadStream = New-Object IO.MemoryStream -ArgumentList (,$payloadBytes)
    $payloadZip = New-Object IO.Compression.ZipArchive($payloadStream, [IO.Compression.ZipArchiveMode]::Read)
    try {
        $entries = @($payloadZip.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
    }
    finally {
        $payloadZip.Dispose()
        $payloadStream.Dispose()
    }

    $excluded = @($entries | Where-Object {
        $leaf = ($_ -split '/')[-1]
        (($leaf -match '^\.env(?:\..*)?$') -and ($leaf -ne '.env.example')) -or
        ($_ -match '(^|/)(node_modules|dist|logs|data|runtime|storage|\.git|tools|dist-setup)(/|$)') -or
        ($leaf -match '(?i)(\.zip|\.log)$')
    })
    if ($excluded.Count -gt 0) { throw "Le setup contient des fichiers exclus : $($excluded -join ', ')" }
    foreach ($fixture in $createdFixtures) {
        $relativeFixture = $fixture.Substring($Root.Length).TrimStart('\', '/').Replace('\', '/')
        if ($entries -contains $relativeFixture) { throw "Le setup contient un fichier d'environnement privé : $relativeFixture" }
    }

    foreach ($required in @('VERSION.txt','backend/package.json','backend/package-lock.json','backend/.env.example','backend/migrations/066_journey_unknown_business_status.sql','backend/migrations/067_business_document_number_sequences.sql','backend/migrations/068_journey_revision_lock.sql','scripts/Install-Aurion.ps1')) {
        if ($entries -notcontains $required) { throw "Fichier requis absent du payload : $required" }
    }

    $env:AURION_SETUP_DIR = $extractRoot
    $env:AURION_SETUP_EXTRACT_ONLY = '1'
    Push-Location $Root
    try { & $installer *> $stdout; $exitCode = $LASTEXITCODE }
    finally { Pop-Location }
    if ($exitCode -ne 0) {
        $detail = if (Test-Path -LiteralPath $stdout) { Get-Content -LiteralPath $stdout -Raw } else { '' }
        throw "L'extraction réelle du setup a échoué avec le code $exitCode. $detail"
    }

    foreach ($required in @('VERSION.txt','backend/package.json','backend/package-lock.json','backend/.env.example','backend/migrations/066_journey_unknown_business_status.sql','backend/migrations/067_business_document_number_sequences.sql','backend/migrations/068_journey_revision_lock.sql','scripts/Install-Aurion.ps1')) {
        if (-not (Test-Path -LiteralPath (Join-Path $extractRoot $required) -PathType Leaf)) { throw "Fichier absent après extraction : $required" }
    }
    $version = (Get-Content -LiteralPath (Join-Path $extractRoot 'VERSION.txt') -Raw).Trim()
    $package = Get-Content -LiteralPath (Join-Path $extractRoot 'package.json') -Raw | ConvertFrom-Json
    if ($package.version -ne $version) { throw "Version incohérente dans le setup : $version / $($package.version)" }
    $count = (Get-ChildItem -LiteralPath $extractRoot -Recurse -File).Count
    Write-Host "Windows setup package validated: clean payload, extraction succeeded, $count files, version $version."
    $success = $true
}
finally {
    if ($null -eq $oldSetupDir) { Remove-Item Env:AURION_SETUP_DIR -ErrorAction SilentlyContinue } else { $env:AURION_SETUP_DIR = $oldSetupDir }
    if ($null -eq $oldExtractOnly) { Remove-Item Env:AURION_SETUP_EXTRACT_ONLY -ErrorAction SilentlyContinue } else { $env:AURION_SETUP_EXTRACT_ONLY = $oldExtractOnly }
    foreach ($fixture in $secretFixtures) {
        if (Test-Path -LiteralPath $fixture -PathType Leaf) { Remove-Item -LiteralPath $fixture -Force }
    }
    if ($success -and -not $KeepArtifacts -and (Test-Path -LiteralPath $validationRoot)) {
        $resolvedRoot = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
        $resolvedValidation = [IO.Path]::GetFullPath($validationRoot)
        if ($resolvedValidation.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase) -and (Split-Path -Leaf $resolvedValidation) -like 'validation-*') {
            Remove-Item -LiteralPath $resolvedValidation -Recurse -Force
        }
    }
}
