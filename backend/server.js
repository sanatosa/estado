const express = require('express');
const cors = require('cors');
const axios = require('axios');
const XLSX = require('xlsx');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const API_URL = "https://b2b.atosa.es:880/api/articulos/";
const API_USER = process.env.API_USER || "amazon@espana.es";
const API_PASS = process.env.API_PASS || "0glLD6g7Dg";

// Función para cargar grupos desde grupos.xlsx
function cargarGrupos() {
  try {
    const workbook = XLSX.readFile('./grupos.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    // Puedes ajustar aquí el campo si tu Excel usa otro nombre de columna (por ejemplo "idGrupo" en vez de "grupo")
    return data;
  } catch (e) {
    console.error('Error leyendo grupos.xlsx:', e.message);
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

    // Detecta el nombre de la columna grupo (puedes cambiar esto según tu excel)
    let nombreColumnaGrupo = 'grupo';
    if (
      gruposXlsx.length > 0 &&
      !Object.keys(gruposXlsx[0]).includes('grupo')
    ) {
      // Busca columna parecida
      const posible = Object.keys(gruposXlsx[0]).find(k =>
        k.toLowerCase().includes('grupo')
      );
      if (posible) nombreColumnaGrupo = posible;
    }

    const grupoCodigos = new Set(
      gruposXlsx.map(g =>
        (g[nombreColumnaGrupo] !== undefined && g[nombreColumnaGrupo] !== null)
          ? g[nombreColumnaGrupo].toString().trim()
          : ''
      )
    );

    // Debug: imprime los primeros grupos y artículos
    console.log("Nombre de la columna grupo en Excel:", nombreColumnaGrupo);
    console.log("Primeros códigos de grupo cargados:", Array.from(grupoCodigos).slice(0, 10));
    console.log("Primeros artículos:", articulos.slice(0, 2));

    const porGrupo = {};
    let sinGrupo = 0;
    articulos.forEach(a => {
      // Normaliza el grupo del artículo
      const artGrupo = a.grupo !== undefined && a.grupo !== null
        ? a.grupo.toString().trim()
        : '';
      const grupo = grupoCodigos.has(artGrupo) ? artGrupo : "SIN_GRUPO";
      porGrupo[grupo] = (porGrupo[grupo] || 0) + 1;
      if (grupo === "SIN_GRUPO") sinGrupo++;
    });

    res.json({
      total: articulos.length,
      porGrupo,
      sinGrupo
    });
  } catch (err) {
    console.error('Error en /api/resumen:', err);
    res.status(500).json({ error: err.message });
  }
});

// Healthcheck
app.get('/', (req, res) => res.send('ATOSA resumen backend OK!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Servidor escuchando en puerto', PORT));
