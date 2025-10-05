<#
Reset & Scaffold Script (PowerShell)
Performs: backup -> (soft|hard) reset -> optional new scaffold (React+Vite+TS+Tailwind+FramerMotion+Fastify baseline)
Usage: powershell -ExecutionPolicy Bypass -File scripts\reset-and-scaffold.ps1 [-Mode A|B] [-Scaffold Y|N]
If params omitted, prompts interactively.
#>
param(
  [ValidateSet('A','B')][string]$Mode,
  [ValidateSet('Y','N')][string]$Scaffold
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = (Get-Location).Path
$BackupDir   = Join-Path $env:USERPROFILE 'Desktop/repo-backups'
$Stamp       = Get-Date -Format 'yyyyMMdd_HHmmss'
$Name        = Split-Path $ProjectRoot -Leaf
$ZipPath     = Join-Path $BackupDir ("{0}_backup_{1}.zip" -f $Name,$Stamp)

Write-Host "[1/6] Ensuring backup directory..." -ForegroundColor Cyan
New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null

Write-Host "[2/6] Preparing backup (excluding heavy/vendor folders)..." -ForegroundColor Cyan
$exclude = @('node_modules','dist','.next','.turbo','.cache','.venv','.DS_Store')
$items = Get-ChildItem -Force | Where-Object { $_.Name -notin $exclude }
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path $items.FullName -DestinationPath $ZipPath
Write-Host "✅ Backup created: $ZipPath" -ForegroundColor Green

if (-not $Mode) { $Mode = Read-Host '초기화 모드 선택 (A=소프트 Git 유지, B=하드 .git 제거)' }

switch ($Mode) {
  'A' {
    Write-Host "[3/6] Soft reset chosen" -ForegroundColor Yellow
    if (Test-Path '.git') {
      git add -A 2>$null
      git commit -m "chore(reset): pre-wipe snapshot $Stamp" 2>$null
      git tag "pre-wipe-$Stamp" 2>$null
      Write-Host "Tagged pre-wipe-$Stamp" -ForegroundColor DarkGray
    }
    Get-ChildItem -Force | Where-Object { $_.Name -notin @('.git','.github') } | Remove-Item -Recurse -Force
    Write-Host "🧹 Soft reset complete (Git history preserved)" -ForegroundColor Green
  }
  'B' {
    Write-Host "[3/6] Hard reset chosen" -ForegroundColor Yellow
    $parent = Split-Path $ProjectRoot -Parent
    Set-Location $parent
    Remove-Item -Recurse -Force $ProjectRoot
    New-Item -ItemType Directory -Path $ProjectRoot | Out-Null
    Set-Location $ProjectRoot
    Write-Host "🧨 Hard reset complete (clean directory)" -ForegroundColor Green
  }
  Default {
    Write-Host "Canceled - Nothing was deleted." -ForegroundColor Red
    exit 0
  }
}

if (-not $Scaffold) { $Scaffold = Read-Host '새 기본 스캐폴드 생성? (Y/N)' }

if ($Scaffold -eq 'Y') {
  Write-Host "[4/6] Initializing npm project..." -ForegroundColor Cyan
  npm init -y | Out-Null
  Write-Host "[5/6] Installing base dependencies (React, Vite, Tailwind, Framer Motion, Fastify)..." -ForegroundColor Cyan
  npm install react react-dom framer-motion fastify
  npm install -D typescript vite @vitejs/plugin-react tailwindcss postcss autoprefixer @types/react @types/react-dom

  Write-Host "[6/6] Creating baseline files..." -ForegroundColor Cyan
  "# $Name`n`nScaffold generated after reset ($Stamp)." | Out-File README.md -Encoding UTF8
  @(
    'node_modules','dist','.env','*.log','.DS_Store'
  ) | Out-File .gitignore -Encoding UTF8

  # tsconfig minimal
  @'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "jsx": "react-jsx",
    "moduleResolution": "Node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "strict": true,
    "types": ["node", "react", "react-dom"]
  },
  "include": ["src"],
  "exclude": ["dist"]
}
'@ | Out-File tsconfig.json -Encoding UTF8

  # tailwind config
  npx tailwindcss init -p | Out-Null
  (Get-Content tailwind.config.js) -replace "content: \[\]","content: ['src/**/*.{ts,tsx,jsx,js,html}']" | Set-Content tailwind.config.js

  New-Item -ItemType Directory -Path src | Out-Null
  @'
import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";

function App() {
  return (
    <div className="p-10 text-center">
      <h1 className="text-3xl font-bold">RESET: $Name</h1>
      <p>Scaffold timestamp: $Stamp</p>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
'@ | Out-File src/main.tsx -Encoding UTF8

  @'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>$Name</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
'@ | Out-File index.html -Encoding UTF8

  @'
@tailwind base;
@tailwind components;
@tailwind utilities;
'@ | Out-File src/index.css -Encoding UTF8

  # vite config
  @'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
'@ | Out-File vite.config.ts -Encoding UTF8

  Write-Host "✅ Scaffold created." -ForegroundColor Green
  Write-Host "다음 실행: npm run dev (vite)" -ForegroundColor Yellow
}
else {
  Write-Host "Scaffold skipped." -ForegroundColor DarkGray
}

Write-Host "완료. 백업 ZIP 경로: $ZipPath" -ForegroundColor Magenta
