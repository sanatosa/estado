const express = require('express');
const cors = require('cors');
const axios = require('axios');
const XLSX = require('xlsx');
require('dotenv').config();

const app = express();
app.use(cors()); // ¡CORS habilitado!
app.use(express.json());

// Configuración de usuario y endpoint de la API Atosa
const API_URL = "https://b2b.atosa.es:880/api/articulos/";
const API_USER = process.env.API_USER || "amazon@espana.es";
const API_PASS = process.env.API_PASS || "0glLD6g7Dg";

// Función para cargar grupos desde grupos.xlsx
function cargarGrupos() {
  try {
    const workbook = XLSX.readFile('./grupos.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet);
  } catch (e) {
    return [];
  }
}

// Endpoint principal de resumen
app.get('/api/resumen', async (req, res) => {
  try {
    // 1. Consigue todos los artículos
    const response = await axios.get(API_URL, {
      auth: { username: API_USER, password: API_PASS },
      timeout: 60000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
    });
    const articulos = response.data;

    // 2. Consigue los grupos desde el Excel
    const gruposXlsx = cargarGrupos();
    const grupoCodigos = new Set(gruposXlsx.map(g => g.grupo?.toString().trim()));

    // 3. Segmenta y resume
    const porGrupo = {};
    let sinGrupo = 0;
    articulos.forEach(a => {
      const grupo = grupoCodigos.has(a.grupo?.toString()) ? a.grupo : "SIN_GRUPO";
      porGrupo[grupo] = (porGrupo[grupo] || 0) + 1;
      if (grupo === "SIN_GRUPO") sinGrupo++;
    });

    res.json({
      total: articulos.length,
      porGrupo,
      sinGrupo
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Healthcheck
app.get('/', (req, res) => res.send('ATOSA resumen backend OK!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor escuchando en puerto', PORT));
