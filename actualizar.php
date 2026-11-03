<?php
// Descarga del SISAP (MIDAGRI) los precios de mercados y regenera precios.json.
// Uso: botón «Actualizar precios» de la página, "php actualizar.php" en esta carpeta
// o abrir http://localhost/AgroPrecios/actualizar.php

declare(strict_types=1);

const SISAP = 'http://sistemas.midagri.gob.pe/sisap/portal2/ciudades';
const DIAS_ATRAS = 30;
const INTENTOS = 3;
const ARCHIVO_JSON = __DIR__ . '/precios.json';

// Código del producto en el SISAP => nombre que se muestra en la web.
const PRODUCTOS = [
    '0104' => 'Papa',
    '0401' => 'Arroz',
    '0212' => 'Cebolla',
    '0228' => 'Tomate',
    '0403' => 'Choclo',
];

// Nombre de la ciudad en los reportes del SISAP => nombre que se muestra en la web.
const REGIONES = [
    'Ancash' => 'Áncash',
    'Cajamarca' => 'Cajamarca',
    'Cusco' => 'Cusco',
    'Junin' => 'Junín',
    'Puno' => 'Puno',
    'San martin' => 'San Martín',
    'Amazonas' => 'Amazonas',
    'Piura' => 'Piura',
    'Ica' => 'Ica',
    'La libertad' => 'La Libertad',
];

// Inicio del nombre de la columna en el reporte ("May. Prec. Prom.", "Min.Prec. Prom.") => tipo de precio.
const TIPOS = ['May' => 'Mayorista', 'Min' => 'Minorista'];

if (PHP_SAPI !== 'cli') {
    ob_start(); // permite fijar el código HTTP de error aunque ya se haya impreso el avance
    header('Content-Type: text/plain; charset=utf-8');
    if (!in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
        http_response_code(403);
        exit('Solo se puede ejecutar desde el propio equipo.');
    }
}
set_time_limit(600);
date_default_timezone_set('America/Lima');

function pedir(CurlHandle $ch, string $url): string
{
    curl_setopt($ch, CURLOPT_URL, $url);
    $cuerpo = curl_exec($ch);
    $codigo = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    if ($cuerpo === false || $codigo !== 200) {
        throw new RuntimeException('No se pudo consultar el SISAP: ' . (curl_error($ch) ?: "HTTP $codigo"));
    }
    return $cuerpo;
}

function fallar(string $mensaje, int $codigoHttp): never
{
    if (PHP_SAPI !== 'cli') {
        http_response_code($codigoHttp);
    }
    echo "\nERROR: $mensaje. precios.json no se modificó.\n";
    exit(1);
}

function consultarReporte(CurlHandle $ch, string $producto, DateTimeImmutable $desde, DateTimeImmutable $hasta): string
{
    $query = http_build_query([
        'region' => '*',
        'productos' => [$producto],
        'variables' => ['may_precio_prom', 'min_precio_prom'],
        'periodicidad' => 'intervalo',
        'fecha' => $hasta->format('d/m/Y'),
        'desde' => $desde->format('d/m/Y'),
        'hasta' => $hasta->format('d/m/Y'),
        'anios' => [$hasta->format('Y')],
        'meses' => [$hasta->format('m')],
        'checkTransformacion' => 1, // precios convertidos a soles por kilogramo
        '__ajax_carga_final' => 'consulta',
        'ajax' => 'true',
    ]);
    // El portal espera "productos[]=..." como un formulario, no "productos[0]=...".
    $query = preg_replace('/%5B\d+%5D=/', '%5B%5D=', $query);
    $html = pedir($ch, SISAP . '/resumenes/filtrar?' . $query);
    if (trim($html) === 'f0bed7f93d91709a30c37ae5c7faba38') {
        throw new RuntimeException('El SISAP rechazó la sesión; vuelve a intentarlo');
    }
    return $html;
}

// Repite el texto de cada celda tantas veces como columnas ocupa (colspan).
function expandirColumnas(DOMElement $fila, int $saltar): array
{
    $columnas = [];
    foreach ($fila->getElementsByTagName('td') as $i => $celda) {
        if ($i < $saltar) {
            continue;
        }
        $ancho = max(1, (int) $celda->getAttribute('colspan'));
        array_push($columnas, ...array_fill(0, $ancho, trim($celda->textContent)));
    }
    return $columnas;
}

// Devuelve [ciudad][variedad][May|Min] => ['fecha' => 'dd/mm/aaaa', 'precio' => float] con el dato más reciente.
function ultimosPrecios(string $html): array
{
    $dom = new DOMDocument();
    // El SISAP responde en ISO-8859-1 sin declararlo en el fragmento.
    $dom->loadHTML('<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1">' . $html, LIBXML_NOERROR | LIBXML_NOWARNING);
    $xpath = new DOMXPath($dom);
    $encabezados = $xpath->query('//tr[@class="encabezado"]');
    if ($encabezados->length < 3) {
        return [];
    }
    $ciudades = expandirColumnas($encabezados->item(0), 1); // la primera celda es "Fecha"
    $variedades = expandirColumnas($encabezados->item(1), 0);
    $variables = expandirColumnas($encabezados->item(2), 0);

    $ultimos = [];
    foreach ($xpath->query('//tr[@class="contenido"]') as $fila) {
        $celdas = $fila->getElementsByTagName('td');
        $fecha = trim($celdas->item(0)->textContent);
        $dia = DateTimeImmutable::createFromFormat('!d/m/Y', $fecha);
        if ($dia === false) {
            continue;
        }
        for ($i = 1; $i < $celdas->length; $i++) {
            $valor = trim($celdas->item($i)->textContent);
            if (!is_numeric($valor)) {
                continue;
            }
            $ciudad = strtolower($ciudades[$i - 1]);
            $variedad = $variedades[$i - 1];
            $tipo = substr($variables[$i - 1], 0, 3);
            $previo = $ultimos[$ciudad][$variedad][$tipo] ?? null;
            if ($previo === null || $dia >= $previo['dia']) {
                $ultimos[$ciudad][$variedad][$tipo] = ['dia' => $dia, 'fecha' => $fecha, 'precio' => (float) $valor];
            }
        }
    }
    return $ultimos;
}

function registro(string $producto, ?string $variedad, string $region, string $tipo, ?float $precio, ?string $fecha): array
{
    $hayPrecio = $precio !== null;
    return [
        'producto' => $producto,
        'variedad' => $variedad,
        'region' => $region,
        'precio' => $precio,
        'unidad' => 'S/ por kg',
        'fecha' => $fecha,
        'tipo' => $tipo,
        'fuente' => $hayPrecio ? 'SISAP - MIDAGRI' : 'SISAP - MIDAGRI: sin reporte en los últimos ' . DIAS_ATRAS . ' días',
        'estado' => $hayPrecio ? 'REAL - SISAP' : 'SIN DATO',
        'categoriaEstado' => $hayPrecio ? 'registrado' : 'sin_dato',
    ];
}

$hasta = new DateTimeImmutable('today');
$desde = $hasta->modify('-' . DIAS_ATRAS . ' days');

$ch = curl_init();
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_COOKIEFILE => '', // guarda en memoria la cookie de sesión del portal
    CURLOPT_CONNECTTIMEOUT => 20,
    CURLOPT_TIMEOUT => 180,
    CURLOPT_USERAGENT => 'Mozilla/5.0 (compatible; AgroPrecios/1.0)',
    CURLOPT_HTTPHEADER => ['X-Requested-With: XMLHttpRequest', 'Referer: ' . SISAP . '/'],
]);

$registros = [];
try {
    pedir($ch, SISAP . '/'); // abre la sesión
    foreach (PRODUCTOS as $codigo => $producto) {
        echo "Consultando $producto... ";
        $inicio = microtime(true);
        // A veces el SISAP responde sin la tabla de precios (por ejemplo, si la consulta le toma demasiado);
        // estos productos se reportan a diario en el país, así que una respuesta vacía es una falla y no "sin dato".
        $ultimos = [];
        for ($intento = 1; $intento <= INTENTOS && !$ultimos; $intento++) {
            if ($intento > 1) {
                echo "el SISAP no envió la tabla, reintento $intento... ";
                sleep(5);
            }
            $ultimos = ultimosPrecios(consultarReporte($ch, (string) $codigo, $desde, $hasta));
        }
        if (!$ultimos) {
            throw new RuntimeException("El SISAP no devolvió precios de $producto tras " . INTENTOS . ' intentos; vuelve a intentarlo más tarde');
        }
        $antes = count($registros);
        foreach (REGIONES as $ciudad => $region) {
            $variedades = $ultimos[strtolower($ciudad)] ?? [];
            foreach (TIPOS as $clave => $tipo) {
                $conPrecio = array_filter($variedades, fn($porTipo) => isset($porTipo[$clave]));
                foreach ($conPrecio as $variedad => $porTipo) {
                    $dato = $porTipo[$clave];
                    $registros[] = registro($producto, (string) $variedad, $region, $tipo, $dato['precio'], $dato['fecha']);
                }
                if (!$conPrecio) {
                    $registros[] = registro($producto, null, $region, $tipo, null, null);
                }
            }
        }
        printf("%d registros (%.1f s)\n", count($registros) - $antes, microtime(true) - $inicio);
    }
} catch (RuntimeException $e) {
    fallar($e->getMessage(), 502);
}

$totalConPrecio = count(array_filter($registros, fn($r) => $r['precio'] !== null));
if ($totalConPrecio === 0) {
    fallar('El SISAP no devolvió precios', 502);
}
$json = json_encode($registros, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if (file_put_contents(ARCHIVO_JSON, $json . "\n", LOCK_EX) === false) {
    fallar('No se pudo escribir el archivo', 500);
}
printf(
    "Precios actualizados desde el SISAP: %d registros, %d con precio (reportes del %s al %s).\n",
    count($registros),
    $totalConPrecio,
    $desde->format('d/m/Y'),
    $hasta->format('d/m/Y')
);
