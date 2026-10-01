let grafico = null;


// =====================================
// CONSULTAR PRECIOS
// =====================================

async function consultarPrecios() {

    const producto =
        document.getElementById("producto").value;

    const region =
        document.getElementById("region").value;


    try {

        const respuesta =
            await fetch("precios.json");

        const todosLosDatos =
            await respuesta.json();


        let datos =
            todosLosDatos.filter(
                item => item.producto === producto
            );


        if (region !== "") {

            datos =
                datos.filter(
                    item => item.region === region
                );

        }


        mostrarTabla(datos);

        mostrarGrafico(datos);

        mostrarEstadisticas(datos);

    }

    catch (error) {

        console.error(error);

        alert(
            "No se pudieron cargar los datos."
        );

    }

}


// =====================================
// MOSTRAR TABLA
// =====================================

function mostrarTabla(datos) {

    const tabla =
        document.getElementById("tabla");


    tabla.innerHTML = "";


    if (datos.length === 0) {

        tabla.innerHTML = `
            <tr>
                <td colspan="5">
                    No existen datos para esta selección.
                </td>
            </tr>
        `;

        return;

    }


    datos.forEach(item => {

        const fila =
            document.createElement("tr");


        fila.innerHTML = `

            <td>
                ${item.producto}
            </td>

            <td>
                ${item.region}
            </td>

            <td>
                S/ ${Number(item.precio).toFixed(2)}
            </td>

            <td>
                ${item.fecha}
            </td>

            <td>
                ${item.fuente}
            </td>

        `;


        tabla.appendChild(fila);

    });

}


// =====================================
// ESTADÍSTICAS
// =====================================

function mostrarEstadisticas(datos) {

    if (datos.length === 0) {

        document.getElementById("promedio").textContent =
            "S/ 0.00";

        document.getElementById("maximo").textContent =
            "S/ 0.00";

        document.getElementById("minimo").textContent =
            "S/ 0.00";

        return;

    }


    const precios =
        datos.map(
            item => Number(item.precio)
        );


    const suma =
        precios.reduce(
            (a, b) => a + b,
            0
        );


    const promedio =
        suma / precios.length;


    const maximo =
        Math.max(...precios);


    const minimo =
        Math.min(...precios);


    document.getElementById("promedio").textContent =
        `S/ ${promedio.toFixed(2)}`;


    document.getElementById("maximo").textContent =
        `S/ ${maximo.toFixed(2)}`;


    document.getElementById("minimo").textContent =
        `S/ ${minimo.toFixed(2)}`;

}


// =====================================
// GRÁFICO
// =====================================

function mostrarGrafico(datos) {

    const canvas =
        document.getElementById("grafico");


    const ctx =
        canvas.getContext("2d");


    if (grafico !== null) {

        grafico.destroy();

    }


    grafico =
        new Chart(ctx, {

            type: "bar",

            data: {

                labels:
                    datos.map(
                        item => item.region
                    ),

                datasets: [{

                    label:
                        "Precio (S/ por kg)",

                    data:
                        datos.map(
                            item => Number(item.precio)
                        )

                }]

            },

            options: {

                responsive: true,

                plugins: {

                    legend: {
                        display: true
                    }

                }

            }

        });

}


// =====================================
// ASISTENTE
// =====================================

async function preguntar() {

    const pregunta =
        document
            .getElementById("pregunta")
            .value
            .toLowerCase();


    const respuesta =
        document.getElementById("respuesta");


    if (pregunta.trim() === "") {

        respuesta.textContent =
            "Escribe una pregunta.";

        return;

    }


    try {

        const datos =
            await fetch("precios.json")
                .then(
                    respuesta => respuesta.json()
                );


        // =============================
        // PRECIO MÁS ALTO
        // =============================

        if (
            pregunta.includes("más alto") ||
            pregunta.includes("mayor")
        ) {

            const mayor =
                datos.reduce(
                    (a, b) =>
                        Number(a.precio) >
                        Number(b.precio)
                            ? a
                            : b
                );


            respuesta.textContent =
                `El precio más alto registrado es S/ ${Number(mayor.precio).toFixed(2)} en ${mayor.region}.`;

            return;

        }


        // =============================
        // PRECIO MÁS BAJO
        // =============================

        if (
            pregunta.includes("más bajo") ||
            pregunta.includes("menor")
        ) {

            const menor =
                datos.reduce(
                    (a, b) =>
                        Number(a.precio) <
                        Number(b.precio)
                            ? a
                            : b
                );


            respuesta.textContent =
                `El precio más bajo registrado es S/ ${Number(menor.precio).toFixed(2)} en ${menor.region}.`;

            return;

        }


        // =============================
        // PROMEDIO
        // =============================

        if (
            pregunta.includes("promedio")
        ) {

            const precios =
                datos.map(
                    item => Number(item.precio)
                );


            const promedio =
                precios.reduce(
                    (a, b) => a + b,
                    0
                ) / precios.length;


            respuesta.textContent =
                `El precio promedio registrado es S/ ${promedio.toFixed(2)}.`;

            return;

        }


        respuesta.textContent =
            "Puedes preguntar por el precio más alto, más bajo o el promedio.";

    }

    catch (error) {

        respuesta.textContent =
            "No se pudieron consultar los datos.";

    }

}


// =====================================
// INICIAR PÁGINA
// =====================================

consultarPrecios();