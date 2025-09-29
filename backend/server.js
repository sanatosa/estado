const express = require('express');
const cors = require('cors');
const axios = require('axios');
const XLSX = require('xlsx');
const https = require('https');
require('dotenv').config();

// -----------------------------------------------------------------------------
//  Configuración del servidor
//
//  Este archivo define un pequeño backend para interactuar con la API de ATOSA
//  y resumir datos de artículos. Se han añadido varios endpoints para hacer
//  compatible el frontend React suministrado por el usuario. Además se usan
//  variables de entorno para credenciales y orígenes permitidos.
// -----------------------------------------------------------------------------

const app = express();

// Configuración de CORS. Permite peticiones desde el dominio de Netlify y
// cualquier dominio adicional que se defina en la variable ALLOWED_ORIGINS
const defaultOrigins = ['http://localhost:5173', 'http://localhost:5174'];
const extraOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
const corsOrigins = [...defaultOrigins, ...extraOrigins].filter(Boolean);
app.use(cors({ origin: corsOrigins, credentials: true }));
app.use(express.json());

// Datos de conexión a la API de ATOSA. Si no se definen variables de entorno
// API_USER y API_PASS, se usan valores de ejemplo. Evita dejar credenciales
// sensibles en el código; usa un archivo .env o variables de entorno.
const API_URL = 'https://b2b.atosa.es:880/api/articulos/';
const API_USER = process.env.API_USER || 'amazon@espana.es';
const API_PASS = process.env.API_PASS || '0glLD6g7Dg';

// Lee grupos desde un archivo Excel local (grupos.xlsx). Si no existe o hay
// error, devuelve un array vacío. El Excel debe tener al menos una columna
// "grupo" con los nombres de grupos válidos.
function cargarGrupos() {
  try {
    const workbook = XLSX.readFile('./grupos.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  } catch (e) {
    return [];
  }
}

// -----------------------------------------------------------------------------
//  Helper para obtener datos de artículos desde la API de ATOSA. Devuelve
//  siempre un array de objetos, aunque la API devuelva un objeto diferente.
async function obtenerArticulos() {
  const resp = await axios.get(API_URL, {
    auth: { username: API_USER, password: API_PASS },
    timeout: 60000,
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  });
  let datos = resp.data;
  // Algunos endpoints devuelven { articulos: [...] }
  if (datos && typeof datos === 'object' && !Array.isArray(datos)) {
    if (Array.isArray(datos.articulos)) {
      datos = datos.articulos;
    } else {
      datos = Object.values(datos);
    }
  }
  return Array.isArray(datos) ? datos : [];
}

// -----------------------------------------------------------------------------
//  GET /api/resumen
//  Devuelve un resumen del número de artículos por grupo. Los grupos válidos se
//  obtienen de grupos.xlsx; los artículos con grupo no incluido se cuentan
//  dentro de "SIN_GRUPO".
app.get('/api/resumen', async (req, res) => {
  try {
    const articulos = await obtenerArticulos();
    const gruposXlsx = cargarGrupos();
    const grupoCodigos = new Set(gruposXlsx.map(g => g.grupo?.toString().trim()));
    const porGrupo = {};
    let sinGrupo = 0;
    articulos.forEach(a => {
      const key = a && a.grupo != null ? a.grupo.toString() : '';
      const grupo = grupoCodigos.has(key) ? key : 'SIN_GRUPO';
      porGrupo[grupo] = (porGrupo[grupo] || 0) + 1;
      // Consideramos como "sin grupo" solo el valor constante 'SIN_GRUPO'
      if (grupo === 'SIN_GRUPO') sinGrupo++;
    });
    res.json({ total: articulos.length, porGrupo, sinGrupo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
//  GET /api/all-articulos
//  Devuelve la lista de todos los artículos con campos normalizados para
//  consumo desde el frontend. Cada artículo tendrá: codigo, descripcion,
//  grupo (o null), disponible (número) y precioVenta (número).
app.get('/api/all-articulos', async (req, res) => {
  try {
    const datos = await obtenerArticulos();
    const articulos = datos.map(a => ({
      codigo: a.codigo,
      descripcion: a.descripcion,
      grupo: a.grupo || a.familia || null,
      disponible: Number(a.disponible || 0),
      precioVenta: Number(a.precioVenta || 0),
    }));
    res.json({ articulos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
//  GET /api/grupo/:grupo
//  Devuelve los códigos de artículo pertenecientes al grupo indicado.
app.get('/api/grupo/:grupo', async (req, res) => {
  const grupo = req.params.grupo;
  try {
    const datos = await obtenerArticulos();
    const codigos = datos
      .filter(a => (a.grupo || a.familia || '') === grupo)
      .map(a => a.codigo);
    res.json({ codigos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------------------------------------------------------
//  GET /api/sin-grupo
//  Devuelve los códigos de los artículos que no pertenecen a ningún grupo.
app.get('/api/sin-grupo', async (req, res) => {
  try {
    const datos = await obtenerArticulos();
    const sinGrupo = datos
      .filter(a => !(a.grupo || a.familia))
      .map(a => a.codigo);
    res.json({ sinGrupo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Endpoint de salud
app.get('/', (req, res) => {
  res.send('ATOSA resumen backend OK!');
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor escuchando en puerto', PORT);
});
