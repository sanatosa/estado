import { useState } from "react";

const BACKEND_URL = "https://estado-nl35.onrender.com/api/resumen"; // tu backend real

function App() {
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleResumen = async () => {
    setLoading(true);
    const res = await fetch(BACKEND_URL);
    const data = await res.json();
    setResumen(data);
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 700, margin: "auto", fontFamily: "Arial" }}>
      <h1>Resumen API ATOSA</h1>
      <button onClick={handleResumen} disabled={loading}>
        {loading ? "Cargando..." : "Obtener resumen"}
      </button>
      {resumen && (
        <div>
          <p><b>Total códigos activos:</b> {resumen.total}</p>
          <ul>
            {Object.entries(resumen.porGrupo).map(([grupo, count]) => (
              <li key={grupo}>
                <b>Grupo {grupo}:</b> {count}
              </li>
            ))}
          </ul>
          <p><b>Sin grupo en grupos.xlsx:</b> {resumen.sinGrupo}</p>
        </div>
      )}
    </div>
  );
}

export default App;
