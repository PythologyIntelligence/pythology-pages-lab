param(
    [string]$Checkout = 'C:\Pythology\_enviroarc_pages_publish'
)
$ErrorActionPreference = 'Stop'
Write-Host ''
Write-Host '=== ENVIROARC NEMESIS -> GITHUB PAGES ===' -ForegroundColor Cyan

# Read-only from confirmed Nemesis local runtime. No Qwen calls, no secrets.
$health = Invoke-RestMethod -Uri 'http://127.0.0.1:8100/healthz' -TimeoutSec 5
if ($health.service -ne 'nemesis-vps') {
    throw 'Port 8100 is not the confirmed Nemesis runtime; no publication attempted.'
}
Write-Host 'Nemesis local runtime confirmed.' -ForegroundColor Green

$repoUrl = 'https://github.com/PythologyIntelligence/pythology-pages-lab.git'
if (-not (Test-Path -LiteralPath (Join-Path $Checkout '.git'))) {
    & git clone --depth 1 $repoUrl $Checkout
    if ($LASTEXITCODE -ne 0) { throw 'Clone failed; check GitHub credentials' }
}
Push-Location $Checkout
try {
    $branch = (& git branch --show-current).Trim()
    if ($branch -ne 'main') { throw "Checkout is on $branch, expected main." }
    $origin = (& git remote get-url origin).Trim()
    if ($origin -notmatch 'PythologyIntelligence/pythology-pages-lab(?:\.git)?$') {
        throw 'Unexpected repository origin. No edits made.'
    }
    if (@(& git status --porcelain).Count -gt 0) {
        throw 'Publisher checkout has uncommitted changes. Resolve manually.'
    }
    & git pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) { throw 'Could not fast-forward Pages checkout' }

    & node 'scripts/export-nemesis-vps.mjs'
    if ($LASTEXITCODE -ne 0) { throw 'Nemesis export failed. Nothing published.' }
    $target = 'earthnet2/data/enviroarc/nemesis.json'
    & git add -- $target
    if ($LASTEXITCODE -ne 0) { throw 'Cannot stage vetted projection' }
    & git diff --cached --quiet -- $target
    if ($LASTEXITCODE -eq 0) {
        Write-Host 'Already current. No new commit.' -ForegroundColor Green
        return
    }
    & git -c 'user.name=Pythology Intelligence' -c 'user.email=pages-publisher@users.noreply.github.com' commit -m 'data: refresh public-safe Nemesis globe projection' -- $target
    if ($LASTEXITCODE -ne 0) { throw 'Snapshot commit failed' }
    & git push origin main
    if ($LASTEXITCODE -ne 0) {
        throw 'GitHub push failed. Local commit retained; inspect repo credentials.'
    }
    Write-Host 'Snapshot pushed to GitHub Pages Lab main.' -ForegroundColor Green
    Write-Host 'Pages workflow will deploy the new Nemesis data automatically.'
} finally {
    Pop-Location
}
