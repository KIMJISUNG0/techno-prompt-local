# GPT Context Bundle Generation Script (PowerShell)
# Creates a curated archive of essential project files for LLM ingestion.

$ErrorActionPreference = "Stop"

$BundleRoot = "gpt-context"
if (Test-Path $BundleRoot) { Remove-Item -Recurse -Force $BundleRoot }
New-Item -ItemType Directory -Path $BundleRoot | Out-Null

function Copy-Safe($path) {
  if (Test-Path $path) {
    $dest = Join-Path $BundleRoot $path
    $parent = Split-Path $dest -Parent
    if (!(Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
    Copy-Item -Recurse -Force $path $dest
  }
}

Write-Host "📦 Collecting core metadata..."
Copy-Safe README.md
Copy-Safe package.json
Copy-Safe tsconfig.json
Copy-Safe vite.config.ts
Copy-Safe tailwind.config.js
Copy-Safe postcss.config.cjs
Copy-Safe .env.example
Copy-Safe eslint.config.mjs
Copy-Safe vitest.config.ts

Write-Host "🧠 Collecting source entry points..."
Copy-Safe src/main.tsx
Copy-Safe src/index.tsx

Write-Host "🧩 Collecting orchestrator & services..."
Copy-Safe orchestrator
Copy-Safe services
Copy-Safe scripts/gcp/colab-bridge.ts

Write-Host "🎛️ Collecting types & utils (filtered)..."
New-Item -ItemType Directory -Path "$BundleRoot/src" -ErrorAction SilentlyContinue | Out-Null
Get-ChildItem -Path src -Include *.ts,*.tsx -Recurse | Where-Object { $_.FullName -notmatch "(\.test|\.spec|dist|coverage)" } | ForEach-Object {
  $rel = $_.FullName.Substring((Get-Item .).FullName.Length+1)
  $dest = Join-Path $BundleRoot $rel
  $parent = Split-Path $dest -Parent
  if (!(Test-Path $parent)) { New-Item -ItemType Directory -Force -Path $parent | Out-Null }
  Copy-Item $_.FullName $dest
}

Write-Host "🧪 Collecting 1–2 representative tests (if any)..."
if (Test-Path tests) { Copy-Safe tests }

Write-Host "🗂️ Generating repo tree (depth 3)..."
(Get-ChildItem -Recurse -Depth 3 | Select-Object FullName) | Out-File "$BundleRoot/repo-tree.txt"

Write-Host "🔍 Generating route & store scan..."
$scanFile = "$BundleRoot/routes-scan.txt"
Select-String -Path src -Pattern '<Route|createBrowserRouter|useRoutes|RouterProvider' -List -ErrorAction SilentlyContinue | Out-File $scanFile
Add-Content $scanFile "`n--- STORE / Hooks ---"
Select-String -Path src -Pattern 'createSlice|zustand|use[A-Z].*Store' -List -ErrorAction SilentlyContinue | Add-Content $scanFile

Write-Host "📦 Skipping dependency usage scan to avoid network installs (depcheck)"
# To enable depcheck, install it locally first: npm i -D depcheck

Write-Host "🧹 Pruning large / irrelevant folders..."
Remove-Item -Recurse -Force "$BundleRoot/node_modules" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$BundleRoot/dist" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$BundleRoot/memory" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$BundleRoot/screenshots" -ErrorAction SilentlyContinue

Write-Host "🗜️ Creating archive..."
$zipName = "gpt-context-bundle.zip"
if (Test-Path $zipName) { Remove-Item $zipName }
Compress-Archive -Path $BundleRoot/* -DestinationPath $zipName -Force

Write-Host "✅ Done! Bundle created: $zipName" -ForegroundColor Green
Write-Host "➡️  Path: $(Join-Path (Get-Location) $zipName)" -ForegroundColor Cyan
