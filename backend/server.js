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

// Lee el Excel de grupos y crea un mapa codigo->grupo
function cargarGrupos() {
  try {
    const workbook = XLSX.readFile('./grupos.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    const codigoAGrupo = {};
    data.forEach(row => {
      if (row.codigo && row.grupo) {
        codigoAGrupo[row.codigo.toString().trim()] = row.grupo.toString().trim();
      }
    });
    return codigoAGrupo;
  } catch (e) {
    console.error('Error leyendo grupos.xlsx:', e.message);
    return {};
  }
}

app.get('/api/resumen', async (req, res) => {
  try {
    // 1. Descarga todos los artículos de la API
    const response = await axios.get(API_URL, {
      auth: { username: API_USER, password: API_PASS },
      timeout: 60000,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
    });
    const articulos = response.data;

    // 2. Mapa codigo->grupo desde el Excel
    const codigoAGrupo = cargarGrupos();

    // 3. Cuenta cuántos artículos hay en cada grupo
    const resumenPorGrupo = {};
    let sinGrupo = 0;

    articulos.forEach(a => {
      const codigo = a.codigo ? a.codigo.toString().trim() : '';
      const grupo = codigoAGrupo[codigo];
      if (grupo) {
        resumenPorGrupo[grupo] = (resumenPorGrupo[grupo] || 0) + 1;
      } else {
        sinGrupo++;
      }
    });

    res.json({
      total: articulos.length,
      porGrupo: resumenPorGrupo,
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
