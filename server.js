// =============================================================
// server.js  —  API de Notas Estudiantiles
// Stack : Node.js · Express · @supabase/supabase-js · Swagger
// Deploy: Railway  |  DB: Supabase (PostgreSQL)
// =============================================================

require("dotenv").config();
const express = require("express");
const { createClient } = require("@supabase/supabase-js");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

const app = express();
app.use(express.json());

const cors = require("cors");

app.use(cors({
  origin: "https://registrousuariosfront-production.up.railway.app",
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
// -------------------------------------------------------------
// 1. CLIENTE SUPABASE
//    Variables de entorno requeridas (configurar en Railway):
//      SUPABASE_URL   → URL del proyecto en Supabase
//      SUPABASE_KEY   → anon/service_role key de Supabase
// -------------------------------------------------------------
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// -------------------------------------------------------------
// 2. SWAGGER — Documentación automática en /api-docs
// -------------------------------------------------------------
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "API de Notas Estudiantiles",
      version: "1.0.0",
      description: "Endpoints para gestión de estudiantes y sus notas",
    },
    servers: [
      {
        url: process.env.BASE_URL || "http://localhost:3000",
        description: "Servidor activo",
      },
    ],
  },
  apis: ["./server.js"], // Swagger lee los comentarios JSDoc de este mismo archivo
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// =============================================================
// PANTALLA 1 — Consultar notas de un estudiante
// =============================================================

/**
 * @swagger
 * /notas:
 *   get:
 *     summary: Consultar notas por cédula y nombre
 *     tags: [Pantalla 1 - Notas]
 *     parameters:
 *       - in: query
 *         name: cedula
 *         required: true
 *         schema:
 *           type: string
 *         description: Cédula del estudiante
 *       - in: query
 *         name: nombre
 *         required: true
 *         schema:
 *           type: string
 *         description: Nombre del estudiante
 *     responses:
 *       200:
 *         description: Notas del estudiante encontradas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 estudiante:
 *                   type: object
 *                 notas:
 *                   type: array
 *       400:
 *         description: Faltan parámetros requeridos
 *       404:
 *         description: Estudiante no encontrado
 */
app.get("/notas", async (req, res) => {
  const { cedula, nombre } = req.query;

  // Validar que lleguen ambos parámetros
  if (!cedula || !nombre) {
    return res
      .status(400)
      .json({ error: "Se requieren los parámetros 'cedula' y 'nombre'" });
  }

  // Buscar estudiante en la tabla "estudiantes"
  const { data: estudiante, error: errEst } = await supabase
    .from("estudiantes")
    .select("*")
    .eq("cedula", cedula)
    .ilike("nombre", nombre) // ilike = insensible a mayúsculas
    .single();

  if (errEst || !estudiante) {
    return res.status(404).json({ error: "Estudiante no encontrado" });
  }

  // Obtener las notas de ese estudiante
  const { data: notas, error: errNotas } = await supabase
    .from("notas")
    .select("materia, nota1, nota2, nota3, nota4, definitiva")
    .eq("estudiante_id", estudiante.id);

  if (errNotas) {
    return res.status(500).json({ error: "Error al consultar notas" });
  }

  return res.json({ estudiante, notas });
});

// =============================================================
// PANTALLA 2 — Registrar un nuevo estudiante
// =============================================================

/**
 * @swagger
 * /estudiantes:
 *   post:
 *     summary: Registrar un nuevo estudiante
 *     tags: [Pantalla 2 - Registro]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cedula, nombre, correo, celular, materia]
 *             properties:
 *               cedula:
 *                 type: string
 *               nombre:
 *                 type: string
 *               correo:
 *                 type: string
 *               celular:
 *                 type: string
 *               materia:
 *                 type: string
 *     responses:
 *       201:
 *         description: Estudiante registrado correctamente
 *       400:
 *         description: Faltan campos requeridos
 *       409:
 *         description: La cédula ya está registrada
 */
app.post("/estudiantes", async (req, res) => {
  const { cedula, nombre, correo, celular, materia } = req.body;

  // Validar campos obligatorios
  if (!cedula || !nombre || !correo || !celular || !materia) {
    return res.status(400).json({
      error: "Todos los campos son requeridos: cedula, nombre, correo, celular, materia",
    });
  }

  // Insertar el estudiante en la tabla "estudiantes"
  const { data, error } = await supabase
    .from("estudiantes")
    .insert([{ cedula, nombre, correo, celular, materia }])
    .select()
    .single();

  if (error) {
    // Código 23505 = violación de unique constraint (cédula duplicada)
    if (error.code === "23505") {
      return res.status(409).json({ error: "La cédula ya está registrada" });
    }
    return res.status(500).json({ error: "Error al registrar estudiante" });
  }

  return res.status(201).json({ mensaje: "Estudiante registrado", estudiante: data });
});

// =============================================================
// PANTALLA 3 — Buscar estudiante, registrar notas y calcular definitiva
// =============================================================

/**
 * @swagger
 * /buscar-estudiante:
 *   get:
 *     summary: Buscar estudiante para registrar notas (pantalla 3)
 *     tags: [Pantalla 3 - Notas]
 *     parameters:
 *       - in: query
 *         name: cedula
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: nombre
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Estudiante encontrado
 *       404:
 *         description: Estudiante no encontrado
 */
app.get("/buscar-estudiante", async (req, res) => {
  const { cedula, nombre } = req.query;

  if (!cedula || !nombre) {
    return res
      .status(400)
      .json({ error: "Se requieren los parámetros 'cedula' y 'nombre'" });
  }

  const { data, error } = await supabase
    .from("estudiantes")
    .select("*")
    .eq("cedula", cedula)
    .ilike("nombre", nombre)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "Estudiante no encontrado" });
  }

  return res.json({ estudiante: data });
});

// -------------------------------------------------------------

/**
 * @swagger
 * /notas:
 *   post:
 *     summary: Registrar las 4 notas de un estudiante
 *     tags: [Pantalla 3 - Notas]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [estudiante_id, materia, nota1, nota2, nota3, nota4]
 *             properties:
 *               estudiante_id:
 *                 type: integer
 *               materia:
 *                 type: string
 *               nota1:
 *                 type: number
 *               nota2:
 *                 type: number
 *               nota3:
 *                 type: number
 *               nota4:
 *                 type: number
 *     responses:
 *       201:
 *         description: Notas registradas correctamente
 *       400:
 *         description: Datos incompletos o inválidos
 */
app.post("/notas", async (req, res) => {
  const { estudiante_id, materia, nota1, nota2, nota3, nota4 } = req.body;

  if (!estudiante_id || !materia || nota1 == null || nota2 == null || nota3 == null || nota4 == null) {
    return res.status(400).json({
      error: "Se requieren: estudiante_id, materia, nota1, nota2, nota3, nota4",
    });
  }

  // Calcular la definitiva al momento de insertar
  const definitiva = (nota1 + nota2 + nota3 + nota4) / 4;

  const { data, error } = await supabase
    .from("notas")
    .insert([{ estudiante_id, materia, nota1, nota2, nota3, nota4, definitiva }])
    .select()
    .single();

  if (error) {
    return res.status(500).json({ error: "Error al registrar notas" });
  }

  return res.status(201).json({ mensaje: "Notas registradas", notas: data });
});

// -------------------------------------------------------------

/**
 * @swagger
 * /definitiva:
 *   get:
 *     summary: Calcular y retornar la definitiva de un estudiante
 *     tags: [Pantalla 3 - Notas]
 *     parameters:
 *       - in: query
 *         name: estudiante_id
 *         required: true
 *         schema:
 *           type: integer
 *       - in: query
 *         name: materia
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Definitiva calculada
 *       404:
 *         description: No se encontraron notas para ese estudiante y materia
 */
app.get("/definitiva", async (req, res) => {
  const { estudiante_id, materia } = req.query;

  if (!estudiante_id || !materia) {
    return res
      .status(400)
      .json({ error: "Se requieren 'estudiante_id' y 'materia'" });
  }

  const { data, error } = await supabase
    .from("notas")
    .select("nota1, nota2, nota3, nota4, definitiva")
    .eq("estudiante_id", estudiante_id)
    .eq("materia", materia)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "No se encontraron notas registradas" });
  }

  // Re-calcular en caso de que el valor guardado difiera
  const definitiva = (data.nota1 + data.nota2 + data.nota3 + data.nota4) / 4;

  return res.json({
    nota1: data.nota1,
    nota2: data.nota2,
    nota3: data.nota3,
    nota4: data.nota4,
    definitiva: parseFloat(definitiva.toFixed(2)),
  });
});

// =============================================================
// INICIO DEL SERVIDOR
//    PORT la provee Railway automáticamente
// =============================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
  console.log(`Documentación Swagger: http://localhost:${PORT}/api-docs`);
});