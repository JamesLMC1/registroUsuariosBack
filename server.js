// =============================================================
// server.js  —  API de Notas Estudiantiles
// Stack : Node.js (http nativo) · @supabase/supabase-js
// Deploy: Railway  |  DB: Supabase (PostgreSQL)
// =============================================================

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config();
}

const http = require("http");
const { createClient } = require("@supabase/supabase-js");

// -------------------------------------------------------------
// CLIENTE SUPABASE
// -------------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// -------------------------------------------------------------
// HELPERS
// -------------------------------------------------------------

// Parsear el body JSON de la petición
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

// Enviar respuesta JSON
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(JSON.stringify(data));
}

// Parsear query params de la URL
function getQuery(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const params = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return { pathname: url.pathname, params };
}

// -------------------------------------------------------------
// SERVIDOR
// -------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const { pathname, params } = getQuery(req);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  // =============================================================
  // PANTALLA 1 — GET /notas
  // =============================================================
  if (req.method === "GET" && pathname === "/notas") {
    const { cedula, nombre } = params;

    if (!cedula || !nombre) {
      return sendJSON(res, 400, {
        error: "Se requieren los parámetros 'cedula' y 'nombre'",
      });
    }

    const { data: estudiante, error: errEst } = await supabase
      .from("estudiantes")
      .select("*")
      .eq("cedula", cedula)
      .ilike("nombre", nombre)
      .single();

    if (errEst || !estudiante) {
      return sendJSON(res, 404, { error: "Estudiante no encontrado" });
    }

    const { data: notas, error: errNotas } = await supabase
      .from("notas")
      .select("materia, nota1, nota2, nota3, nota4, definitiva")
      .eq("estudiante_id", estudiante.id);

    if (errNotas) {
      return sendJSON(res, 500, { error: "Error al consultar notas" });
    }

    return sendJSON(res, 200, { estudiante, notas });
  }

  // =============================================================
  // PANTALLA 2 — POST /estudiantes
  // =============================================================
  if (req.method === "POST" && pathname === "/estudiantes") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      return sendJSON(res, 400, { error: "Body JSON inválido" });
    }

    const { cedula, nombre, correo, celular, materia } = body;

    if (!cedula || !nombre || !correo || !celular || !materia) {
      return sendJSON(res, 400, {
        error: "Todos los campos son requeridos: cedula, nombre, correo, celular, materia",
      });
    }

    const { data, error } = await supabase
      .from("estudiantes")
      .insert([{ cedula, nombre, correo, celular, materia }])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return sendJSON(res, 409, { error: "La cédula ya está registrada" });
      }
      return sendJSON(res, 500, { error: "Error al registrar estudiante" });
    }

    return sendJSON(res, 201, { mensaje: "Estudiante registrado", estudiante: data });
  }

  // =============================================================
  // PANTALLA 3 — GET /buscar-estudiante
  // =============================================================
  if (req.method === "GET" && pathname === "/buscar-estudiante") {
    const { cedula, nombre } = params;

    if (!cedula || !nombre) {
      return sendJSON(res, 400, {
        error: "Se requieren los parámetros 'cedula' y 'nombre'",
      });
    }

    const { data, error } = await supabase
      .from("estudiantes")
      .select("*")
      .eq("cedula", cedula)
      .ilike("nombre", nombre)
      .single();

    if (error || !data) {
      return sendJSON(res, 404, { error: "Estudiante no encontrado" });
    }

    return sendJSON(res, 200, { estudiante: data });
  }

  // =============================================================
  // PANTALLA 3 — POST /notas
  // =============================================================
  if (req.method === "POST" && pathname === "/notas") {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      return sendJSON(res, 400, { error: "Body JSON inválido" });
    }

    const { estudiante_id, materia, nota1, nota2, nota3, nota4 } = body;

    if (
      !estudiante_id ||
      !materia ||
      nota1 == null ||
      nota2 == null ||
      nota3 == null ||
      nota4 == null
    ) {
      return sendJSON(res, 400, {
        error: "Se requieren: estudiante_id, materia, nota1, nota2, nota3, nota4",
      });
    }

    const definitiva = parseFloat(
      ((nota1 + nota2 + nota3 + nota4) / 4).toFixed(2)
    );

    const { data, error } = await supabase
      .from("notas")
      .insert([{ estudiante_id, materia, nota1, nota2, nota3, nota4, definitiva }])
      .select()
      .single();

    if (error) {
      return sendJSON(res, 500, { error: "Error al registrar notas" });
    }

    return sendJSON(res, 201, { mensaje: "Notas registradas", notas: data });
  }

  // =============================================================
  // PANTALLA 3 — GET /definitiva
  // =============================================================
  if (req.method === "GET" && pathname === "/definitiva") {
    const { estudiante_id, materia } = params;

    if (!estudiante_id || !materia) {
      return sendJSON(res, 400, {
        error: "Se requieren 'estudiante_id' y 'materia'",
      });
    }

    const { data, error } = await supabase
      .from("notas")
      .select("nota1, nota2, nota3, nota4, definitiva")
      .eq("estudiante_id", estudiante_id)
      .eq("materia", materia)
      .single();

    if (error || !data) {
      return sendJSON(res, 404, { error: "No se encontraron notas registradas" });
    }

    return sendJSON(res, 200, data);
  }

  // Ruta no encontrada
  sendJSON(res, 404, { error: "Ruta no encontrada" });
});

// -------------------------------------------------------------
// INICIO DEL SERVIDOR
// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});