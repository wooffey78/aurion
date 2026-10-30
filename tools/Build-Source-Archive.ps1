param(
    [string]$Root,
    [string]$Out
)

$ErrorActionPreference = 'Stop'
if (-not $Root) { $Root = Split-Path -Parent $PSScriptRoot }
$Root = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/')
$rootName = Split-Path -Leaf $Root

$versionPath = Join-Path $Root 'VERSION.txt'
$packagePath = Join-Path $Root 'package.json'
$backendPackagePath = Join-Path $Root 'backend/package.json'
$lockPath = Join-Path $Root 'backend/package-lock.json'
foreach ($required in @($versionPath, $packagePath, $backendPackagePath, $lockPath)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Fichier source requis absent : $required"
    }
}

$version = (Get-Content -LiteralPath $versionPath -Raw).Trim()
$rootPackage = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$backendPackage = Get-Content -LiteralPath $backendPackagePath -Raw | ConvertFrom-Json
if (-not $version -or $rootPackage.version -ne $version -or $backendPackage.version -ne $version) {
    throw 'Les versions de VERSION.txt, package.json et backend/package.json ne correspondent pas.'
}

if (-not $Out) { $Out = Join-Path (Split-Path -Parent $Root) ("{0}-source-{1}.zip" -f $rootName, $version) }
$Out = [IO.Path]::GetFullPath($Out)
if ($Out.StartsWith($Root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Le ZIP doit être créé hors du dossier source.'
}
if (Test-Path -LiteralPath $Out) { throw "Le fichier de sortie existe déjà : $Out" }

$excludedDirectories = @(
    '.git', '.idea', '.next', '.pytest_cache', '.turbo', '.vscode', '.vite', '__pycache__',
    'coverage', 'data', 'dist', 'dist-setup', 'dist-source', 'logs', 'node_modules', 'runtime', 'storage'
)

function Get-ProjectRelativePath {
    param([Parameter(Mandatory = $true)][string]$FullName)
    return $FullName.Substring($Root.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
}

function Test-ExcludedPath {
    param(
        [Parameter(Mandatory = $true)][string]$RelativePath,
        [switch]$Directory
    )

    $segments = $RelativePath -split '/'
    foreach ($segment in $segments) {
        if ($excludedDirectories -contains $segment) { return $true }
    }
    if ($Directory) { return $false }

    $leaf = $segments[-1]
    if ($leaf -match '^\.env(?:\..*)?$' -and $leaf -ne '.env.example') { return $true }
    if ($leaf -match '(?i)(\.zip|\.log|\.dump|\.sql\.gz|\.tmp|\.bak|\.swp|\.msi)$') { return $true }
    if ($leaf -in @('.DS_Store', 'Thumbs.db')) { return $true }
    return $false
}

$directories = @(Get-ChildItem -LiteralPath $Root -Directory -Force -Recurse | Where-Object {
    -not (Test-ExcludedPath -RelativePath (Get-ProjectRelativePath -FullName $_.FullName) -Directory)
})
$files = @(Get-ChildItem -LiteralPath $Root -File -Force -Recurse | Where-Object {
    -not (Test-ExcludedPath -RelativePath (Get-ProjectRelativePath -FullName $_.FullName))
})
if ($files.Count -eq 0) { throw 'Aucun fichier source admissible à empaqueter.' }

Add-Type -AssemblyName System.IO.Compression
$outDirectory = Split-Path -Parent $Out
New-Item -ItemType Directory -Force -Path $outDirectory | Out-Null
$outputStream = $null
$archive = $null
try {
    $outputStream = [IO.File]::Open($Out, [IO.FileMode]::CreateNew, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $archive = New-Object IO.Compression.ZipArchive($outputStream, [IO.Compression.ZipArchiveMode]::Create, $false)
    [void]$archive.CreateEntry("$rootName/", [IO.Compression.CompressionLevel]::NoCompression)

    foreach ($directory in $directories) {
        $relative = Get-ProjectRelativePath -FullName $directory.FullName
        [void]$archive.CreateEntry("$rootName/$relative/", [IO.Compression.CompressionLevel]::NoCompression)
    }
    foreach ($file in $files) {
        $relative = Get-ProjectRelativePath -FullName $file.FullName
        $entry = $archive.CreateEntry("$rootName/$relative", [IO.Compression.CompressionLevel]::Optimal)
        $entryStream = $entry.Open()
        $fileStream = [IO.File]::OpenRead($file.FullName)
        try { $fileStream.CopyTo($entryStream) }
        finally {
            $fileStream.Dispose()
            $entryStream.Dispose()
        }
    }
    $archive.Dispose()
    $archive = $null
    $outputStream.Dispose()
    $outputStream = $null
}
catch {
    if ($archive) { $archive.Dispose() }
    if ($outputStream) { $outputStream.Dispose() }
    if (Test-Path -LiteralPath $Out) { Remove-Item -LiteralPath $Out -Force }
    throw
}

$check = [IO.Compression.ZipFile]::OpenRead($Out)
try {
    $names = @($check.Entries | ForEach-Object { $_.FullName })
    $unsafe = @($names | Where-Object { $_ -match '(^/|(^|/)\.\.?(/|$)|^[A-Za-z]:)' })
    $excluded = @($names | Where-Object {
        $name = $_.TrimEnd('/')
        $parts = $name -split '/'
        (($parts | Where-Object { $excludedDirectories -contains $_ }).Count -gt 0) -or
        (($parts[-1] -match '^\.env(?:\..*)?$' -and $parts[-1] -ne '.env.example')) -or
        ($parts[-1] -match '(?i)(\.zip|\.log|\.dump|\.sql\.gz|\.tmp|\.bak|\.swp|\.msi)$')
    })
    if ($unsafe.Count -gt 0) { throw 'Le ZIP contient un chemin non sûr.' }
    if ($excluded.Count -gt 0) { throw 'Le ZIP contient encore un artefact exclu.' }
    foreach ($requiredName in @("$rootName/VERSION.txt", "$rootName/package.json", "$rootName/backend/package.json", "$rootName/backend/package-lock.json")) {
        if ($names -notcontains $requiredName) { throw "Fichier requis absent du ZIP : $requiredName" }
    }
    $entryCount = $check.Entries.Count
}
catch {
    Remove-Item -LiteralPath $Out -Force
    throw
}
finally { $check.Dispose() }

$info = Get-Item -LiteralPath $Out
$hash = (Get-FileHash -LiteralPath $Out -Algorithm SHA256).Hash.ToLowerInvariant()
Write-Host ("Archive créée : {0}" -f $Out)
Write-Host ("Version : {0} | fichiers source : {1} | entrées ZIP : {2}" -f $version, $files.Count, $entryCount)
Write-Host ("Taille : {0:N2} MiB | SHA-256 : {1}" -f ($info.Length / 1MB), $hash)
