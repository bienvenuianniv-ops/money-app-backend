# apply_improvements.ps1
# Lance ce script depuis C:\Users\HP\money_app\backend

$backend = "C:\Users\HP\money_app\backend"
$zip = "$env:USERPROFILE\Downloads\money_app_improvements.zip"
$extract = "$env:USERPROFILE\Downloads\money_app_improved"

# 1. Extraire le zip
Write-Host "Extraction du zip..." -ForegroundColor Cyan
Expand-Archive -Path $zip -DestinationPath "$env:USERPROFILE\Downloads" -Force

# 2. Copier les fichiers
Write-Host "Copie des fichiers..." -ForegroundColor Cyan

# Créer le dossier config s'il n'existe pas
New-Item -ItemType Directory -Force -Path "$backend\src\config" | Out-Null

Copy-Item "$extract\money_app_improved\prisma\schema.prisma" -Destination "$backend\prisma\schema.prisma" -Force
Copy-Item "$extract\money_app_improved\src\config\countries.ts" -Destination "$backend\src\config\countries.ts" -Force
Copy-Item "$extract\money_app_improved\src\services\exchange.service.ts" -Destination "$backend\src\services\exchange.service.ts" -Force
Copy-Item "$extract\money_app_improved\src\services\auth.service.ts" -Destination "$backend\src\services\auth.service.ts" -Force
Copy-Item "$extract\money_app_improved\src\services\transactions.service.ts" -Destination "$backend\src\services\transactions.service.ts" -Force
Copy-Item "$extract\money_app_improved\src\routes\auth.routes.ts" -Destination "$backend\src\routes\auth.routes.ts" -Force
Copy-Item "$extract\money_app_improved\src\routes\transactions.routes.ts" -Destination "$backend\src\routes\transactions.routes.ts" -Force

Write-Host "Fichiers copiés avec succès !" -ForegroundColor Green

# 3. Migration
Write-Host "Application de la migration..." -ForegroundColor Cyan
Set-Location $backend
npx prisma migrate dev --name multi_country

Write-Host "Terminé ! Lance npm run dev" -ForegroundColor Green
