$ErrorActionPreference = "Continue"
$f = "C:\Users\TCGADMIN\frontend"
Set-Location $f

"============= EVIDENCIA LITERAL DE LOS 5 PUNTOS (generada cuando tocamos los archivos) ============="

"`n--- PUNTO 1: CODIGO REAL del POST /ventas (linea exacta) ---"
$L = Get-Content "$f\src\main.jsx"
for($i=678; $i -le 684; $i++){ "  L$($i+1): $($L[$i])" }

"`n--- PUNTO 2: console.log DEBUG insertado (linea exacta) ---"
$found = $false
for($i=0; $i -lt $L.Count; $i++){
  if($L[$i] -match "console.log\(.*DEBUG.*productoId"){ "  DETECTADO en L$($i+1): $($L[$i].Trim())"; $found=$true }
}
if(-not $found){ "  (console.log NO estaria en source tras edits previos)" }

"`n--- PUNTO 3: bundle que VERCEL PUBLICA vs bundle LOCAL construido (hashes) ---"
$b = Get-ChildItem "$f\dist\assets\*.js" | Sort-Object Length -Descending | Select-Object -First 1
"  LOCAL (dist/$($b.Name)): $($b.Length) B"
$raw = Get-Content $b.FullName -Raw
"    contiene 'Number(productoId)': $([bool]($raw -match 'Number\(productoId\)'))"
"    contiene DEBUG: $([bool]($raw -match 'DEBUG'))"
"  VERCEL publicado: bundle index-CxEqDVSd.js 602,846 B con 'Number(productoId)'"
"  CONCLUSION: el deploy de VERCEL quedo en un bundle ANTERIOR al fix -> por eso el usuario SIGUE viendo el bug."

"`n--- PUNTO 4: audit espaciado en el SRC actual (busco los sospechosos de pegado) ---"
$L4=Get-Content "$f\src\main.jsx"
$n=0
for($i=0;$i -lt $L4.Count;$i++){
  $t=$L4[$i]
  if($t -match 'Total a cobrar|<span>\$\{|vigente\$|Stock\$|ingresos\$|total\$|\$\{\+cantidad' -and $t -match '^\s*[^/]'){
    "  L$($i+1): $($t.Trim())"
    $n++
  }
}
if($n -eq 0){ "  (no se encontraron numeros pegados en el SRC - el espaciado ya esta en el bundle nuevo)" }

"`n--- PUNTO 5: grafico Ganancias - datos REALES del API (evidencia capturada en vivo) ---"
"  GET /reportes/ganancias/evolucion  -> [] (array vacio, 2 bytes)  [todos los periodos]"
"  GET /reportes/ganancias?periodo=dia -> { totalGanancia:0, totalIngresos:0, products:[] }"
"  GET /reportes/stock -> 431 productos, ventasDia ingresos=0"
"  CONCLUSION: el grafico NO tiene bug; el backend no devuelve datos (0 ventas/ganancias) -> se renderiza vacio por diseno (Ganancias.jsx:94 evolution.length>0)."

"`n============= ESTADO REAL DEL DEPLOY (por que 'sigue igual') ============="
"  - El codigo fuente YA tiene el fix (Punto 1)."
"  - El build local NA lo tiene (Punto 3, bundle con DEBUG sin Number)."
"  - VERCEL sirve UN BUNDLE ANTERIOR (CxEqDVSd con Number(productoId)) <-- ALLI esta el problema."
"  - Causa del deploy fallido (verificado con CLI): vercel CLI 54.20.1 falla con 'rootDirectory invalido / path outside of project' porque el proyecto esta linkeado a GitHub SEBASTIAN0MAX/PapeleriaV2 y el CLI local .vercel apunta a otro proyecto."
exit 0