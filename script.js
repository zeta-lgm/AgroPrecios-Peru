let grafico = null;
let todosLosDatos = [];

const moneda = (n) => `S/ ${Number(n).toFixed(2)}`;
const textoSeguro = (v) => (v === null || v === undefined || v === "") ? "—" : String(v);
const sinTildes = (s) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
const nombreProducto = (d) => d.variedad || d.producto;

async function cargarDatos() {
  const tabla = document.getElementById("tabla");
  try {
    const resp = await fetch("precios.json", { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    todosLosDatos = await resp.json();
    ["producto", "region", "tipo"].forEach(llenarFiltro);
    consultarPrecios();
  } catch (error) {
    console.error("Error al cargar precios.json:", error);
    tabla.innerHTML = '<tr><td colspan="8">No se pudo cargar precios.json. Abre la web mediante un servidor local o GitHub Pages.</td></tr>';
  }
}

function llenarFiltro(campo) {
  const select = document.getElementById(campo);
  const elegido = select.value;
  const valores = [...new Set(todosLosDatos.map(d => d[campo]).filter(Boolean))];
  select.length = 1; // deja solo la opción "Todos"
  valores.forEach(valor => select.add(new Option(valor, valor)));
  if (valores.includes(elegido)) select.value = elegido;
}

async function actualizarPrecios() {
  const boton = document.getElementById("btnActualizar");
  const estado = document.getElementById("estadoActualizacion");
  boton.disabled = true;
  estado.textContent = "Descargando precios del SISAP… puede tardar uno o dos minutos.";
  try {
    const resp = await fetch("actualizar.php", { method: "POST" });
    // Sin PHP (por ejemplo, en GitHub Pages) la respuesta no viene del script.
    if (!(resp.headers.get("Content-Type") || "").startsWith("text/plain")) throw new Error(`HTTP ${resp.status}`);
    estado.textContent = (await resp.text()).trim().split("\n").pop();
    if (resp.ok) await cargarDatos();
  } catch (error) {
    console.error("Error al actualizar precios:", error);
    estado.textContent = "No se pudo actualizar: esta función necesita Laragon encendido en este equipo.";
  } finally {
    boton.disabled = false;
  }
}

function obtenerFiltrados() {
  const producto = document.getElementById("producto").value;
  const region = document.getElementById("region").value;
  const tipo = document.getElementById("tipo").value;
  const estado = document.getElementById("estadoFiltro").value;

  return todosLosDatos.filter(d =>
    (!producto || d.producto === producto) &&
    (!region || d.region === region) &&
    (!tipo || d.tipo === tipo) &&
    (!estado || d.categoriaEstado === estado)
  );
}

function consultarPrecios() {
  const datos = obtenerFiltrados();
  mostrarTabla(datos);
  mostrarEstadisticas(datos);
  mostrarGrafico(datos);
}

function mostrarTabla(datos) {
  const tabla = document.getElementById("tabla");
  tabla.innerHTML = "";
  if (!datos.length) {
    tabla.innerHTML = '<tr><td colspan="8">No hay registros para estos filtros.</td></tr>';
    document.getElementById("contador").textContent = "0 registros";
    return;
  }

  datos.forEach(d => {
    const fila = document.createElement("tr");
    const celdas = [
      nombreProducto(d), d.region,
      d.precio === null || d.precio === undefined ? "Sin precio" : moneda(d.precio),
      d.unidad, d.fecha, d.tipo, d.fuente
    ];
    celdas.forEach(valor => {
      const td = document.createElement("td");
      td.textContent = textoSeguro(valor);
      fila.appendChild(td);
    });
    const estadoTd = document.createElement("td");
    const etiqueta = document.createElement("span");
    etiqueta.className = `estado ${d.categoriaEstado || "revisar"}`;
    etiqueta.textContent = textoSeguro(d.estado);
    estadoTd.appendChild(etiqueta);
    fila.appendChild(estadoTd);
    tabla.appendChild(fila);
  });
  document.getElementById("contador").textContent =
    `${datos.length} registro(s). Los registros sin precio se conservan para mostrar que no hay dato disponible.`;
}

function mostrarEstadisticas(datos) {
  // No sumar valores ausentes; muestra estadística de registros numéricos visibles.
  const precios = datos
    .filter(d => d.precio !== null && d.precio !== undefined && Number.isFinite(Number(d.precio)))
    .map(d => Number(d.precio));

  if (!precios.length) {
    ["promedio","maximo","minimo"].forEach(id =>
      document.getElementById(id).textContent = "Sin datos numéricos"
    );
    return;
  }
  const promedio = precios.reduce((a,b) => a+b, 0) / precios.length;
  document.getElementById("promedio").textContent = moneda(promedio);
  document.getElementById("maximo").textContent = moneda(Math.max(...precios));
  document.getElementById("minimo").textContent = moneda(Math.min(...precios));
}

function mostrarGrafico(datos) {
  const validos = datos.filter(d =>
    d.precio !== null && d.precio !== undefined && Number.isFinite(Number(d.precio))
  );
  const ctx = document.getElementById("grafico").getContext("2d");
  if (grafico) grafico.destroy();

  if (!validos.length) {
    grafico = null;
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    return;
  }
  const etiqueta = d => `${nombreProducto(d)} · ${d.region}`;
  const etiquetas = [...new Set(validos.map(etiqueta))];
  const tipos = [...new Set(validos.map(d => d.tipo))];
  const colores = ["#287d4c", "#d69e2e"];
  grafico = new Chart(ctx, {
    type: "bar",
    data: {
      labels: etiquetas,
      datasets: tipos.map((tipo, i) => ({
        label: `${tipo} (S/ por kg)`,
        backgroundColor: colores[i % colores.length],
        data: etiquetas.map(e => {
          const d = validos.find(r => r.tipo === tipo && etiqueta(r) === e);
          return d ? Number(d.precio) : null;
        })
      }))
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: true } },
      scales: { y: { beginAtZero: true } }
    }
  });
}

function responderPregunta() {
  const q = sinTildes(document.getElementById("pregunta").value.trim());
  const salida = document.getElementById("respuesta");
  if (!q) { salida.textContent = "Escribe una pregunta."; return; }

  let datos = obtenerFiltrados().filter(d =>
    d.precio !== null && d.precio !== undefined && Number.isFinite(Number(d.precio))
  );
  // Si la pregunta nombra un producto, una región o un tipo de precio, limitar la búsqueda a ese valor.
  ["producto", "region", "tipo"].forEach(campo => {
    const nombrado = [...new Set(todosLosDatos.map(d => d[campo]))]
      .find(v => v && new RegExp(`\\b${sinTildes(v)}\\b`).test(q));
    if (nombrado) datos = datos.filter(d => d[campo] === nombrado);
  });

  if (!datos.length) {
    salida.textContent = "No hay precios numéricos para esa pregunta y los filtros seleccionados.";
    return;
  }
  // "mayor" como palabra completa, para no confundirlo con "mayorista".
  if (q.includes("alto") || /\bmayor\b/.test(q) || q.includes("mas caro")) {
    const d = datos.reduce((a,b) => Number(a.precio) > Number(b.precio) ? a : b);
    salida.textContent = `El mayor valor numérico encontrado es ${moneda(d.precio)} en ${d.region} para ${nombreProducto(d)}. Fecha/periodo: ${textoSeguro(d.fecha)}. Tipo: ${textoSeguro(d.tipo)}. Revisa la fecha y la fuente antes de compararlo.`;
  } else if (q.includes("bajo") || q.includes("menor") || q.includes("mas barato")) {
    const d = datos.reduce((a,b) => Number(a.precio) < Number(b.precio) ? a : b);
    salida.textContent = `El menor valor numérico encontrado es ${moneda(d.precio)} en ${d.region} para ${nombreProducto(d)}. Fecha/periodo: ${textoSeguro(d.fecha)}. Tipo: ${textoSeguro(d.tipo)}. Revisa la fecha y la fuente antes de compararlo.`;
  } else if (q.includes("promedio")) {
    const promedio = datos.reduce((s,d) => s + Number(d.precio), 0) / datos.length;
    salida.textContent = `El promedio simple de ${datos.length} registros numéricos visibles es ${moneda(promedio)}. Puede mezclar periodos o tipos distintos; filtra para hacer una comparación más justa.`;
  } else {
    salida.textContent = "Puedes preguntar por el precio más alto, más bajo o el promedio, e indicar producto, región o tipo (mayorista o minorista). También puedes usar los filtros.";
  }
}

document.getElementById("btnConsultar").addEventListener("click", consultarPrecios);
document.getElementById("btnActualizar").addEventListener("click", actualizarPrecios);
document.getElementById("btnPreguntar").addEventListener("click", responderPregunta);
document.getElementById("pregunta").addEventListener("keydown", e => {
  if (e.key === "Enter") responderPregunta();
});
["producto","region","tipo","estadoFiltro"].forEach(id =>
  document.getElementById(id).addEventListener("change", consultarPrecios)
);
cargarDatos();
