let grafico = null;
let todosLosDatos = [];

const moneda = (n) => `S/ ${Number(n).toFixed(2)}`;
const textoSeguro = (v) => (v === null || v === undefined || v === "") ? "—" : String(v);

async function cargarDatos() {
  const tabla = document.getElementById("tabla");
  try {
    const resp = await fetch("precios.json");
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    todosLosDatos = await resp.json();
    consultarPrecios();
  } catch (error) {
    console.error("Error al cargar precios.json:", error);
    tabla.innerHTML = '<tr><td colspan="8">No se pudo cargar precios.json. Abre la web mediante un servidor local o GitHub Pages.</td></tr>';
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
      d.producto, d.region,
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
  grafico = new Chart(ctx, {
    type: "bar",
    data: {
      labels: validos.map(d => `${d.region} · ${d.fecha || "fecha sin indicar"}`),
      datasets: [{
        label: "Precio numérico (unidad indicada en la tabla)",
        data: validos.map(d => Number(d.precio))
      }]
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
  const q = document.getElementById("pregunta").value.trim().toLowerCase();
  const salida = document.getElementById("respuesta");
  if (!q) { salida.textContent = "Escribe una pregunta."; return; }

  let datos = obtenerFiltrados().filter(d =>
    d.precio !== null && d.precio !== undefined && Number.isFinite(Number(d.precio))
  );
  // Si el usuario nombra un producto, limitar la búsqueda a ese producto.
  const productos = ["papa","maíz","maiz","cebolla","arroz","tomate"];
  const nombrado = productos.find(p => q.includes(p));
  if (nombrado) {
    const productoNormalizado = nombrado === "maiz" ? "maíz" : nombrado;
    datos = datos.filter(d => d.producto.toLowerCase() === productoNormalizado);
  }

  if (!datos.length) {
    salida.textContent = "No hay precios numéricos para esa pregunta y los filtros seleccionados.";
    return;
  }
  if (q.includes("alto") || q.includes("mayor") || q.includes("más caro") || q.includes("mas caro")) {
    const d = datos.reduce((a,b) => Number(a.precio) > Number(b.precio) ? a : b);
    salida.textContent = `El mayor valor numérico encontrado es ${moneda(d.precio)} en ${d.region} para ${d.producto}. Fecha/periodo: ${textoSeguro(d.fecha)}. Tipo: ${textoSeguro(d.tipo)}. Revisa la fecha y la fuente antes de compararlo.`;
  } else if (q.includes("bajo") || q.includes("menor") || q.includes("más barato") || q.includes("mas barato")) {
    const d = datos.reduce((a,b) => Number(a.precio) < Number(b.precio) ? a : b);
    salida.textContent = `El menor valor numérico encontrado es ${moneda(d.precio)} en ${d.region} para ${d.producto}. Fecha/periodo: ${textoSeguro(d.fecha)}. Tipo: ${textoSeguro(d.tipo)}. Revisa la fecha y la fuente antes de compararlo.`;
  } else if (q.includes("promedio")) {
    const promedio = datos.reduce((s,d) => s + Number(d.precio), 0) / datos.length;
    salida.textContent = `El promedio simple de ${datos.length} registros numéricos visibles es ${moneda(promedio)}. Puede mezclar periodos o tipos distintos; filtra para hacer una comparación más justa.`;
  } else {
    salida.textContent = "Puedes preguntar por el precio más alto, más bajo o el promedio. Usa los filtros para limitar producto, región, tipo y estado.";
  }
}

document.getElementById("btnConsultar").addEventListener("click", consultarPrecios);
document.getElementById("btnPreguntar").addEventListener("click", responderPregunta);
document.getElementById("pregunta").addEventListener("keydown", e => {
  if (e.key === "Enter") responderPregunta();
});
["producto","region","tipo","estadoFiltro"].forEach(id =>
  document.getElementById(id).addEventListener("change", consultarPrecios)
);
cargarDatos();
