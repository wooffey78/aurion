# Aurion - installation/extraction locale de LibreOffice
# Compatible Windows PowerShell 5.1 et PowerShell 7+
# Le MSI officiel est telecharge puis extrait dans runtime\libreoffice.
# Aucun service LibreOffice n'est installe comme composant permanent du systeme.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

. (Join-Path $PSScriptRoot 'Aurion-Common.ps1')
$script:Interactive = $true

function Get-LibreOfficeExecutable {
    param([Parameter(Mandatory = $true)][string]$Root)

    if (-not (Test-Path -LiteralPath $Root)) {
        return $null
    }

    return Get-ChildItem -LiteralPath $Root -Recurse -Filter 'soffice.exe' -File -ErrorAction SilentlyContinue |
        Select-Object -First 1
}

try {
    Write-Step 'Preparation du moteur LibreOffice integre a Aurion...'

    $dir = Join-Path $script:RuntimeDir 'libreoffice'
    New-Item -ItemType Directory -Force -Path $dir | Out-Null

    # Si LibreOffice a deja ete extrait, reutiliser cette copie.
    $existing = Get-LibreOfficeExecutable -Root $dir
    if ($existing) {
        $envMap = Read-EnvFile
        $envMap['LIBREOFFICE_PATH'] = $existing.FullName
        Write-EnvFile $envMap
        Write-Log ('LibreOffice deja present : {0}' -f $existing.FullName)
        exit 0
    }

    Write-Step 'Recherche de la derniere version stable de LibreOffice...'

    $base = 'https://download.documentfoundation.org/libreoffice/stable/'
    $html = (Invoke-WebRequest -Uri $base -UseBasicParsing -TimeoutSec 60).Content

    $versions = [regex]::Matches($html, 'href=["''](\d+\.\d+\.\d+)/["'']') |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object { [version]$_ } -Descending

    $ver = $versions | Select-Object -First 1
    if ([string]::IsNullOrWhiteSpace($ver)) {
        throw 'Impossible de trouver une version stable de LibreOffice.'
    }

    $name = 'LibreOffice_{0}_Win_x86-64.msi' -f $ver
    $url = '{0}{1}/win/x86_64/{2}' -f $base, $ver, $name
    $msi = Join-Path $dir $name

    Write-Step ('Telechargement de LibreOffice {0}. Cela peut prendre plusieurs minutes...' -f $ver)

    $downloaded = $false
    for ($attempt = 1; $attempt -le 3 -and -not $downloaded; $attempt++) {
        try {
            if (Test-Path -LiteralPath $msi) {
                Remove-Item -LiteralPath $msi -Force -ErrorAction SilentlyContinue
            }

            Invoke-WebRequest -Uri $url -OutFile $msi -UseBasicParsing -TimeoutSec 3600

            if (-not (Test-Path -LiteralPath $msi)) {
                throw 'Le fichier MSI n''a pas ete cree.'
            }

            $length = (Get-Item -LiteralPath $msi).Length
            if ($length -lt 10000000) {
                throw ('Le fichier MSI semble incomplet ({0} octets).' -f $length)
            }

            $downloaded = $true
        }
        catch {
            Write-Log ('Essai {0}/3 echoue : {1}' -f $attempt, $_.Exception.Message) 'WARN'
            if ($attempt -lt 3) {
                Start-Sleep -Seconds 4
            }
        }
    }

    if (-not $downloaded) {
        throw 'Telechargement de LibreOffice impossible. Verifiez la connexion Internet.'
    }

    Write-Step 'Verification de la signature numerique du MSI...'
    $sig = Get-AuthenticodeSignature -FilePath $msi
    if ($sig.Status -ne 'Valid') {
        Remove-Item -LiteralPath $msi -Force -ErrorAction SilentlyContinue
        throw ('La signature numerique du MSI LibreOffice n''est pas valide. Statut : {0}' -f $sig.Status)
    }

    $target = Join-Path $dir 'app'
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $target | Out-Null

    Write-Step 'Extraction de LibreOffice. Windows peut demander une autorisation administrateur...'

    $arguments = '/a "{0}" /qn TARGETDIR="{1}"' -f $msi, $target
    $process = Start-Process -FilePath 'msiexec.exe' -ArgumentList $arguments -Verb RunAs -Wait -PassThru

    if ($process.ExitCode -ne 0) {
        throw ('Extraction de LibreOffice echouee. Code MSI : {0}' -f $process.ExitCode)
    }

    $exe = Get-LibreOfficeExecutable -Root $target
    if (-not $exe) {
        throw 'soffice.exe est introuvable apres extraction de LibreOffice.'
    }

    Remove-Item -LiteralPath $msi -Force -ErrorAction SilentlyContinue

    $envMap = Read-EnvFile
    $envMap['LIBREOFFICE_PATH'] = $exe.FullName
    Write-EnvFile $envMap

    Write-Log ('LibreOffice pret pour Aurion : {0}' -f $exe.FullName)

    if ($script:IsWin) {
        Add-Type -AssemblyName System.Windows.Forms
        [void][System.Windows.Forms.MessageBox]::Show(
            "LibreOffice est pret pour Aurion.`r`n`r`nRelancez Aurion pour utiliser la generation de documents avec vos modeles.",
            'Aurion - LibreOffice',
            'OK',
            'Information'
        )
    }

    exit 0
}
catch {
    $message = $_.Exception.Message
    try {
        Write-Log ('Installation LibreOffice echouee : {0}' -f $message) 'ERROR'
    }
    catch {
        # Le journal n'est pas disponible : conserver l'erreur originale.
    }

    try {
        Show-ErrorDialog 'Aurion - LibreOffice' $message
    }
    catch {
        Write-Error $message
    }

    exit 1
}
