# Appwrite Setup Script for CNH Marina
$endpoint = "https://cloud.appwrite.io/v1"
$projectId = "6a2fbdf0001acfc98111"
$apiKey = "standard_a53b4103bd791c96bba00d900f59e5dade2d25be6fc4f61c2f3d7b334d6c2e34393d8874ee6f021543c29d55bb32a9f917a6b466519ac9fcc29eddc3d7885ef5805f82775375a77ffc8eecd554675cc79ce11b4c754b6a429ece2d5bd00cf52560055f07385aec72f6a7bd0bcfe6b58b543f700915c02c7a68c68cfbf06d3cad"

$headers = @{
    "Content-Type" = "application/json"
    "X-Appwrite-Project" = $projectId
    "X-Appwrite-Key" = $apiKey
}

function Log-Message {
    param([string]$Message, [string]$Type = "Info")
    $color = "White"
    if ($Type -eq "Success") { $color = "Green" }
    if ($Type -eq "Error") { $color = "Red" }
    Write-Host "> $Message" -ForegroundColor $color
}

try {
    Log-Message "Démarrage de l'installation Appwrite..."

    # 1. Reset/Create Database
    Log-Message "Nettoyage et création de la base de données CNH_Marina..."
    $dbId = "cnh_db"
    try {
        Invoke-RestMethod -Method Delete -Uri "$endpoint/databases/$dbId" -Headers $headers
        Log-Message "Ancienne base supprimée pour repartir à zéro."
    } catch {
        Log-Message "Aucune ancienne base à supprimer."
    }

    try {
        $dbBody = @{ databaseId = $dbId; name = "CNH_Marina" } | ConvertTo-Json
        Invoke-RestMethod -Method Post -Uri "$endpoint/databases" -Headers $headers -Body $dbBody
        Log-Message "Base créée avec ID: $dbId" "Success"
    } catch {
        Log-Message "Erreur lors de la création de la base : $($_.Exception.Message)" "Error"
        throw
    }

    # 2. Create Boats Collection
    Log-Message "Création de la collection 'boats'..."
    $boatsId = "boats_col"
    try {
        $boatsBody = @{ 
            collectionId = $boatsId; 
            name = "boats"; 
            permissions = @() 
        } | ConvertTo-Json
        Invoke-RestMethod -Method Post -Uri "$endpoint/databases/$dbId/collections" -Headers $headers -Body $boatsBody
        Log-Message "Collection boats créée avec ID: $boatsId" "Success"
        
        Log-Message "Pause de 3 secondes pour synchronisation Appwrite..."
        Start-Sleep -Seconds 3
    } catch {
        Log-Message "Erreur lors de la création de la collection boats : $($_.Exception.Message)" "Error"
        throw
    }

    # 3. Create Boat Attributes
    $boatAttrs = @(
        @{ name = "boat_name"; type = "string"; size = 255; required = $true },
        @{ name = "licence_number"; type = "string"; size = 255; required = $true },
        @{ name = "registration_number"; type = "string"; size = 255; required = $false },
        @{ name = "boat_type"; type = "string"; size = 255; required = $false },
        @{ name = "status"; type = "string"; size = 255; required = $true },
        @{ name = "owner_name"; type = "string"; size = 255; required = $true },
        @{ name = "owner_phone"; type = "string"; size = 255; required = $true },
        @{ name = "owner_email"; type = "string"; size = 255; required = $false },
        @{ name = "emergency_contact"; type = "string"; size = 255; required = $false },
        @{ name = "zone_id"; type = "string"; size = 255; required = $true },
        @{ name = "slot_number"; type = "integer"; required = $true },
        @{ name = "length_m"; type = "string"; size = 255; required = $false },
        @{ name = "width_m"; type = "string"; size = 255; required = $false },
        @{ name = "equipment"; type = "string"; size = 255; required = $false },
        @{ name = "notes"; type = "string"; size = 255; required = $false },
        @{ name = "photo_data"; type = "string"; size = 10000; required = $false }
    )

    foreach ($attr in $boatAttrs) {
        Log-Message "Ajout de l'attribut $($attr.name)..."
        $attrBody = @{ key = $attr.name; type = $attr.type; size = $attr.size; required = $attr.required } | ConvertTo-Json
        Invoke-RestMethod -Method Post -Uri "$endpoint/databases/$dbId/collections/$boatsId/attributes" -Headers $headers -Body $attrBody
    }
    Log-Message "Tous les attributs de bateaux ont été créés !" "Success"

    # 4. Create Profiles Collection
    Log-Message "Création de la collection 'profiles'..."
    $profBody = @{ collectionId = "profiles_col"; name = "profiles"; permissions = "users:all" } | ConvertTo-Json
    $profResponse = Invoke-RestMethod -Method Post -Uri "$endpoint/databases/$dbId/collections" -Headers $headers -Body $profBody
    $profId = $profResponse."$id"
    Log-Message "Collection profiles créée avec ID: $profId" "Success"

    $profAttrs = @(
        @{ name = "email"; type = "string"; size = 255; required = $true },
        @{ name = "full_name"; type = "string"; size = 255; required = $false },
        @{ name = "role"; type = "string"; size = 255; required = $true },
        @{ name = "must_change_password"; type = "boolean"; required = $true }
    )

    foreach ($attr in $profAttrs) {
        Log-Message "Ajout de l'attribut $($attr.name)..."
        $attrBody = @{ key = $attr.name; type = $attr.type; size = $attr.size; required = $attr.required } | ConvertTo-Json
        Invoke-RestMethod -Method Post -Uri "$endpoint/databases/$dbId/collections/$profId/attributes" -Headers $headers -Body $attrBody
    }
    Log-Message "Tous les attributs de profils ont été créés !" "Success"

    Log-Message "--- INSTALLATION TERMINÉE AVEC SUCCÈS ---" "Success"
} catch {
    Log-Message "ERREUR : $($_.Exception.Message)" "Error"
}

Write-Host "`nAppuyez sur une touche pour quitter..."
$null = [Console]::ReadKey()
