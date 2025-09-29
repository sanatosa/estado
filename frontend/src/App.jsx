import {
  Box, Heading, Text, HStack, VStack, Button,
  useColorMode, IconButton, useDisclosure, Modal, ModalOverlay,
  ModalContent, ModalHeader, ModalBody, ModalCloseButton, Badge,
  SimpleGrid, Divider, useColorModeValue, Input, Alert, AlertIcon, Spinner,
  Select, Table, Thead, Tbody, Tr, Th, Td, Stat, StatLabel, StatNumber, StatHelpText
} from "@chakra-ui/react";
import { MoonIcon, SunIcon, CopyIcon, InfoOutlineIcon, DownloadIcon } from "@chakra-ui/icons";
import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { FaBoxes, FaEuroSign, FaLayerGroup, FaExclamationTriangle, FaStar, FaCrown } from "react-icons/fa";

// Utiliza una variable de entorno inyectada por Vite para la URL del backend. Si
// no está definida (por ejemplo en desarrollo local), se deja cadena vacía
// para hacer las llamadas relativas al mismo dominio.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

const GROUP_COLORS = [
  "#3182ce", "#38a169", "#805ad5", "#00b5d8", "#ed8936", "#319795", "#d53f8c", "#ecc94b"
];

function groupColor(i) {
  return GROUP_COLORS[i % GROUP_COLORS.length];
}

// ======== FORMATEADOR
function formatNum(num) {
  return Number(num).toLocaleString("es-ES", {minimumFractionDigits:2, maximumFractionDigits:2});
}
function formatInt(num) {
  return Number(num).toLocaleString("es-ES");
}

// ======== HISTORIAL
function getHistorial() {
  try { return JSON.parse(localStorage.getItem("atosa_historial") || "[]"); }
  catch { return []; }
}
function saveHistorial(snapshot) {
  const historial = getHistorial();
  historial.push({
    fecha: new Date().toISOString(),
    articulos: snapshot
  });
  localStorage.setItem("atosa_historial", JSON.stringify(historial));
}

function isEqualSnapshot(articulos1, articulos2) {
  if (!Array.isArray(articulos1) || !Array.isArray(articulos2)) return false;
  if (articulos1.length !== articulos2.length) return false;
  const s1 = [...articulos1].sort((a,b)=>a.codigo.localeCompare(b.codigo));
  const s2 = [...articulos2].sort((a,b)=>a.codigo.localeCompare(b.codigo));
  for (let i=0; i<s1.length; ++i) {
    const a = s1[i], b = s2[i];
    if (
      a.codigo !== b.codigo ||
      a.disponible !== b.disponible ||
      a.precioVenta !== b.precioVenta ||
      (a.grupo || "") !== (b.grupo || "") ||
      (a.descripcion || "") !== (b.descripcion || "")
    ) {
      return false;
    }
  }
  return true;
}

export default function App() {
  // ----- Sección resumen por grupo
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [codigos, setCodigos] = useState([]);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [diferencias, setDiferencias] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [modalStats, setModalStats] = useState(null);
  const { colorMode, toggleColorMode } = useColorMode();
  const { isOpen, onOpen, onClose } = useDisclosure();

  // ----- Sección histórico ventas
  const [historial, setHistorial] = useState(getHistorial());
  const [fechaInicio, setFechaInicio] = useState("");
  const [fechaFin, setFechaFin] = useState("");
  const [tabla, setTabla] = useState([]);
  const [ventasStats, setVentasStats] = useState({});
  const [totalVendido, setTotalVendido] = useState(0);

  const timeoutRef = useRef();

  // ========== FUNCIONES DASHBOARD RESUMEN ===========
  function copiarLista() {
    navigator.clipboard.writeText(codigos.join(", "));
  }

  function getSnapshot() {
    try { return JSON.parse(localStorage.getItem("atosa_snapshot") || "{}"); }
    catch { return {}; }
  }
  function saveSnapshot(sn) {
    localStorage.setItem("atosa_snapshot", JSON.stringify(sn));
  }
  async function getAllArticulos() {
    const res = await fetch(`${BACKEND_URL}/api/all-articulos`);
    return (await res.json()).articulos;
  }

  // === "Obtener resumen" también guarda snapshot SOLO si hay cambios ===
  const handleResumen = async () => {
    setLoading(true);
    setError("");
    setSuccess("");
    setCodigos([]);
    setGrupoSeleccionado("");
    setDiferencias(null);
    try {
      const r0 = await fetch(`${BACKEND_URL}/api/resumen`);
      const data = await r0.json();
      setResumen(data);
      setError("");

      const articulos = await getAllArticulos();
      const snapshotNow = {};
      articulos.forEach(a => snapshotNow[a.codigo] = a.disponible);

      const snapshotPrev = getSnapshot();
      const altas = [], bajas = [], ventas = [];
      Object.keys(snapshotNow).forEach(c => {
        if (!(c in snapshotPrev)) altas.push(c);
        else if (snapshotNow[c] < snapshotPrev[c]) ventas.push({codigo:c, de:snapshotPrev[c], a:snapshotNow[c]});
      });
      Object.keys(snapshotPrev).forEach(c => { if (!(c in snapshotNow)) bajas.push(c) });
      setDiferencias({altas,bajas,ventas});
      saveSnapshot(snapshotNow);

      // 3. GUARDAR SNAPSHOT EN HISTORIAL SÓLO SI CAMBIA
      const oldHistorial = getHistorial();
      const prev = oldHistorial.length ? oldHistorial[oldHistorial.length-1].articulos : [];
      if (!isEqualSnapshot(articulos, prev)) {
        saveHistorial(articulos);
        setHistorial(getHistorial());
        setSuccess("¡Nuevo snapshot guardado!");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setSuccess(""), 3000);
      } else {
        setSuccess("No hay cambios respecto al estado anterior, no se ha guardado un nuevo snapshot.");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setSuccess(""), 3000);
      }
    } catch {
      setError("Error al obtener datos");
    }
    setLoading(false);
  };

  // ======== ESTADÍSTICAS GENERALES
  function getGeneralStats() {
    if (!resumen || !resumen.total || !resumen.porGrupo) return null;
    let stockTotal = 0;
    let valorInventario = 0;
    let numGrupos = Object.keys(resumen.porGrupo).length;
    let codigosSinGrupo = resumen.sinGrupo || 0;
    let topGrupo = "";
    let topGrupoNum = 0;
    let valorMedio = 0;
    let artMasStock = {codigo: "", descripcion: "", disponible: 0};
    let artMasCaro = {codigo: "", descripcion: "", precioVenta: 0};

    let valorTotal = 0;
    let totalArticulos = 0;
    let totalPrecio = 0;
    let articulos = [];
    if (historial.length) articulos = historial[historial.length-1].articulos || [];

    articulos.forEach(a => {
      valorTotal += (Number(a.disponible) * Number(a.precioVenta||0));
      totalPrecio += Number(a.precioVenta||0);
      totalArticulos++;
      if (Number(a.disponible) > artMasStock.disponible) {
        artMasStock = {codigo: a.codigo, descripcion: a.descripcion, disponible: Number(a.disponible)};
      }
      if (Number(a.precioVenta) > artMasCaro.precioVenta) {
        artMasCaro = {codigo: a.codigo, descripcion: a.descripcion, precioVenta: Number(a.precioVenta)};
      }
    });
    valorMedio = totalArticulos ? totalPrecio/totalArticulos : 0;

    Object.entries(resumen.porGrupo).forEach(([g, n])=>{
      stockTotal += n;
      if (n > topGrupoNum) { topGrupo = g; topGrupoNum = n; }
    });

    return {
      stockTotal,
      valorTotal: valorTotal,
      numGrupos,
      codigosSinGrupo,
      porcentajeSinGrupo: Math.round(100 * codigosSinGrupo / resumen.total),
      topGrupo,
      topGrupoNum,
      valorMedio,
      artMasStock,
      artMasCaro
    };
  }

  // ====== CONSULTA CÓDIGOS DE GRUPO: calcula stats de ese grupo
  const handleVerCodigos = async grupo => {
    setLoading(true); setCodigos([]); setError(""); setGrupoSeleccionado(grupo);
    setModalStats(null);
    try {
      const url = grupo === "SIN_GRUPO"
        ? `${BACKEND_URL}/api/sin-grupo`
        : `${BACKEND_URL}/api/grupo/${encodeURIComponent(grupo)}`;
      const res = await fetch(url);
      const d = await res.json();
      const codigosGrupo = d.sinGrupo || d.codigos || [];
      setCodigos(codigosGrupo);
      setBusqueda("");
      onOpen();

      // stats grupo
      if (historial.length) {
        const arts = historial[historial.length-1].articulos || [];
        const delGrupo = arts.filter(a => 
          (grupo==="SIN_GRUPO" ? !a.grupo : a.grupo===grupo)
          && codigosGrupo.includes(a.codigo)
        );
        let stockTotal=0, valorTotal=0, precioTotal=0;
        delGrupo.forEach(a=>{
          stockTotal += Number(a.disponible);
          valorTotal += Number(a.disponible)*Number(a.precioVenta||0);
          precioTotal += Number(a.precioVenta||0);
        });
        const precioMedio = delGrupo.length ? precioTotal/delGrupo.length : 0;
        // Top 3 artículos por stock
        const topArt = [...delGrupo].sort((a,b)=>b.disponible-a.disponible).slice(0,3);
        setModalStats({
          stockTotal,
          valorTotal,
          precioMedio,
          topArt
        });
      }
    } catch {
      setError("Error al cargar códigos");
    }
    setLoading(false);
  };

  // ========== HISTORIAL Y VENTAS AVANZADO ===========
  function handleComparar() {
    if (historial.length < 2) {
      setError("Debes guardar al menos dos snapshots antes de comparar.");
      return;
    }
    if (!fechaInicio || !fechaFin) {
      setError("Selecciona ambas fechas.");
      return;
    }
    setError("");
    const idx1 = historial.findIndex(h => h.fecha === fechaInicio);
    const idx2 = historial.findIndex(h => h.fecha === fechaFin);
    if (idx1 === -1 || idx2 === -1) {
      setError("Error en selección de fechas.");
      return;
    }
    let ini = historial[idx1].articulos;
    let fin = historial[idx2].articulos;

    // Map: codigo -> articulo
    const mapIni = {};
    ini.forEach(a => { mapIni[a.codigo] = a; });
    const mapFin = {};
    fin.forEach(a => { mapFin[a.codigo] = a; });

    // Calcular ventas (stock inicial > stock final)
    const ventas = [];
    let total = 0;
    const ventasPorGrupo = {};
    const ventasPorArticulo = {};

    Object.keys(mapIni).forEach(codigo => {
      const artIni = mapIni[codigo];
      const artFin = mapFin[codigo];
      if (artFin && Number(artIni.disponible) > Number(artFin.disponible)) {
        const cantidad = Number(artIni.disponible) - Number(artFin.disponible);
        const totalVenta = cantidad * Number(artIni.precioVenta || 0);
        total += totalVenta;
        ventas.push({
          codigo,
          descripcion: artIni.descripcion || "",
          grupo: artIni.grupo || "",
          precioVenta: artIni.precioVenta || "",
          stockInicial: artIni.disponible,
          stockFinal: artFin.disponible,
          vendido: cantidad,
          totalVenta: totalVenta
        });
        if (!ventasPorGrupo[artIni.grupo || "SIN_GRUPO"]) ventasPorGrupo[artIni.grupo || "SIN_GRUPO"] = 0;
        ventasPorGrupo[artIni.grupo || "SIN_GRUPO"] += cantidad;
        ventasPorArticulo[codigo] = { cantidad, totalVenta, descripcion: artIni.descripcion || "" };
      }
    });
    setTabla(ventas);
    setTotalVendido(total);

    // Estadísticas de ventas
    const topGrupos = Object.entries(ventasPorGrupo).sort((a,b)=>b[1]-a[1]).slice(0,5);
    const topArticulosUnidades = [...ventas].sort((a,b)=>b.vendido-a.vendido).slice(0,3);
    const topArticulosValor = [...ventas].sort((a,b)=>b.totalVenta-a.totalVenta).slice(0,3);

    setVentasStats({
      totalUnidades: ventas.reduce((sum,v)=>sum+v.vendido,0),
      totalEuros: total,
      topGrupos,
      topArticulosUnidades,
      topArticulosValor,
      chartData: topGrupos.map(([g, u], i) => ({grupo: g, unidades: u, color: groupColor(i)}))
    });
  }

  function handleExportarExcel() {
    if (!tabla.length) return;
    const dataXLSX = tabla.map(row => ({
      ...row,
      precioVenta: formatNum(row.precioVenta),
      totalVenta: formatNum(row.totalVenta)
    }));
    const ws = XLSX.utils.json_to_sheet(dataXLSX);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas");
    XLSX.writeFile(wb, "ventas.xlsx");
  }

  function handleResetHistorial() {
    localStorage.removeItem("atosa_historial");
    setHistorial([]);
    setTabla([]);
    setFechaInicio("");
    setFechaFin("");
    setTotalVendido(0);
    setVentasStats({});
  }

  function niceDate(fechaIso) {
    const d = new Date(fechaIso);
    return d.toLocaleString("es-ES", { year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  // --- estilos
  const bg = useColorModeValue("gray.50", "gray.900");
  const cardBg = useColorModeValue("white", "gray.800");
  const codigosFiltrados = codigos.filter(c =>
    !busqueda ? true : c.toString().toLowerCase().includes(busqueda.toLowerCase())
  );

  // --- General stats (tarjetas)
  const stats = getGeneralStats();

  return (
    <Box minH="100vh" bg={bg} px={[2, 8]} py={[4, 10]}>
      {/* Header */}
      <HStack justify="space-between" mb={8}>
        <HStack spacing={3}>
          <InfoOutlineIcon w={7} h={7} color="blue.400" />
          <Heading size="lg" fontWeight="extrabold" letterSpacing="wide">
            ATOSA <Text as="span" color="blue.400">Dashboard</Text>
          </Heading>
        </HStack>
        <IconButton
          aria-label="Cambiar modo oscuro/claro"
          icon={colorMode === "light" ? <MoonIcon /> : <SunIcon />}
          onClick={toggleColorMode}
          variant="ghost"
          size="lg"
        />
      </HStack>

      {/* Alerta de éxito o sin cambios */}
      {success && (
        <Alert status="success" mb={4} borderRadius="lg">
          <AlertIcon /> {success}
        </Alert>
      )}
      {error && !resumen && (
        <Alert status="error" mb={4}><AlertIcon />{error}</Alert>
      )}

      {/* Tarjetas estadísticas generales */}
      {stats && (
        <SimpleGrid columns={[1, 2, 3, 6]} spacing={4} mb={8}>
          <Stat bg={cardBg} shadow="md" borderRadius="xl" p={4}>
            <StatLabel><HStack><FaBoxes /> <span>Total stock actual</span></HStack></StatLabel>
            <StatNumber>{formatInt(stats.stockTotal)}</StatNumber>
          </Stat>
          <Stat bg={cardBg} shadow="md" borderRadius="xl" p={4}>
            <StatLabel><HStack><FaEuroSign /> <span>Valor inventario</span></HStack></StatLabel>
            <StatNumber>{formatNum(stats.valorTotal)} €</StatNumber>
          </Stat>
          <Stat bg={cardBg} shadow="md" borderRadius="xl" p={4}>
            <StatLabel><HStack><FaLayerGroup /><span>Grupos activos</span></HStack></StatLabel>
            <StatNumber>{stats.numGrupos}</StatNumber>
          </Stat>
          <Stat bg={cardBg} shadow="md" borderRadius="xl" p={4}>
            <StatLabel><HStack><FaExclamationTriangle /><span>% sin grupo</span></HStack></StatLabel>
            <StatNumber>{stats.porcentajeSinGrupo}%</StatNumber>
          </Stat>
          <Stat bg={cardBg} shadow="md" borderRadius="xl" p={4}>
            <StatLabel><HStack><FaStar /><span>Artículo más caro</span></HStack></StatLabel>
            <StatNumber>{stats.artMasCaro.codigo}</StatNumber>
            <StatHelpText>
              {stats.artMasCaro.descripcion} · {formatNum(stats.artMasCaro.precioVenta)} €
            </StatHelpText>
          </Stat>
          <Stat bg={cardBg} shadow="md" borderRadius="xl" p={4}>
            <StatLabel><HStack><FaCrown /><span>Top stock artículo</span></HStack></StatLabel>
            <StatNumber>{stats.artMasStock.codigo}</StatNumber>
            <StatHelpText>
              {stats.artMasStock.descripcion} · {formatInt(stats.artMasStock.disponible)}
            </StatHelpText>
          </Stat>
        </SimpleGrid>
      )}

      {/* Sección 1: Dashboard resumen grupos */}
      <VStack align="stretch" spacing={6}>
        <HStack spacing={3} mb={1}>
          <Button colorScheme="blue" size="lg" onClick={handleResumen} isLoading={loading}>
            Obtener resumen
          </Button>
          <Button variant="outline" onClick={handleResetHistorial}>Borrar histórico (ventas)</Button>
        </HStack>
        {resumen && (
          <VStack align="stretch" spacing={6}>
            <Text fontSize="2xl" fontWeight="bold" color="gray.600" mb={-2}>
              Códigos activos: <Text as="span" color="blue.500">{formatInt(resumen.total)}</Text>
            </Text>
            <SimpleGrid columns={[1, 2, 3]} spacing={5}>
              {Object.entries(resumen.porGrupo).map(([grupo, count], i) => (
                <Box
                  key={grupo}
                  bg={cardBg}
                  p={6}
                  rounded="2xl"
                  shadow="xl"
                  borderLeft="8px solid"
                  borderColor={groupColor(i)}
                  transition="transform .18s"
                  _hover={{ transform: "scale(1.03)", boxShadow: "2xl" }}
                  cursor="pointer"
                  onClick={() => handleVerCodigos(grupo)}
                  position="relative"
                >
                  <Text fontWeight="bold" fontSize="lg" color={groupColor(i)} mb={2}>
                    {grupo}
                  </Text>
                  <Text fontSize="4xl" fontWeight="extrabold">{formatInt(count)}</Text>
                  <Badge colorScheme="blue" position="absolute" top={4} right={4}>
                    Ver códigos
                  </Badge>
                </Box>
              ))}
              <Box
                bg={cardBg}
                p={6}
                rounded="2xl"
                shadow="xl"
                borderLeft="8px solid"
                borderColor="red.400"
                transition="transform .18s"
                _hover={{ transform: "scale(1.03)", boxShadow: "2xl" }}
                cursor="pointer"
                onClick={() => handleVerCodigos("SIN_GRUPO")}
                position="relative"
              >
                <Text fontWeight="bold" fontSize="lg" color="red.400" mb={2}>
                  Sin grupo
                </Text>
                <Text fontSize="4xl" fontWeight="extrabold">{formatInt(resumen.sinGrupo)}</Text>
                <Badge colorScheme="red" position="absolute" top={4} right={4}>
                  Ver códigos
                </Badge>
              </Box>
            </SimpleGrid>
          </VStack>
        )}
        {diferencias && (
          <Box bg={cardBg} rounded="xl" shadow="md" mt={10} p={6}>
            <Heading size="md" mb={3}>Novedades desde la última consulta</Heading>
            <SimpleGrid columns={[1,2,3]} spacing={2}>
              <Box>
                <Badge colorScheme="green" mb={2}>Altas</Badge>
                <Text fontSize="lg" fontWeight="bold">{formatInt(diferencias.altas.length)}</Text>
                <Text fontSize="sm">{diferencias.altas.length > 0 ? diferencias.altas.join(", ") : "Ninguna"}</Text>
              </Box>
              <Box>
                <Badge colorScheme="red" mb={2}>Bajas</Badge>
                <Text fontSize="lg" fontWeight="bold">{formatInt(diferencias.bajas.length)}</Text>
                <Text fontSize="sm">{diferencias.bajas.length > 0 ? diferencias.bajas.join(", ") : "Ninguna"}</Text>
              </Box>
              <Box>
                <Badge colorScheme="blue" mb={2}>Ventas (stock bajó)</Badge>
                <Text fontSize="lg" fontWeight="bold">{formatInt(diferencias.ventas.length)}</Text>
                <Text fontSize="sm">
                  {diferencias.ventas.length > 0
                    ? diferencias.ventas.map(v=>`${v.codigo} (${v.de}→${v.a})`).join(", ")
                    : "Ninguna"}
                </Text>
              </Box>
            </SimpleGrid>
          </Box>
        )}
      </VStack>

      {/* Modal para lista de códigos y stats grupo */}
      <Modal isOpen={isOpen} onClose={onClose} size="xl" scrollBehavior="inside">
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            Códigos en {grupoSeleccionado === "SIN_GRUPO" ? "Sin grupo" : grupoSeleccionado}
          </ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            {modalStats && (
              <Box mb={4}>
                <Text mb={1}><b>Stock total:</b> {formatInt(modalStats.stockTotal)}</Text>
                <Text mb={1}><b>Valor total:</b> {formatNum(modalStats.valorTotal)} €</Text>
                <Text mb={1}><b>Precio medio:</b> {formatNum(modalStats.precioMedio)} €</Text>
                {modalStats.topArt && modalStats.topArt.length > 0 && (
                  <Box mb={1}>
                    <b>Top 3 artículos por stock:</b>
                    <ul style={{marginLeft: "1em"}}>
                      {modalStats.topArt.map(a=>(
                        <li key={a.codigo}>{a.codigo} ({a.descripcion || ""}): {formatInt(a.disponible)}</li>
                      ))}
                    </ul>
                  </Box>
                )}
              </Box>
            )}
            <Input
              placeholder="Buscar código..."
              mb={3}
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
            <Button leftIcon={<CopyIcon />} size="sm" mb={4} onClick={copiarLista}>
              Copiar lista
            </Button>
            <Divider mb={2} />
            {loading
              ? <Spinner />
              : codigosFiltrados.length
                ? <SimpleGrid columns={[2,3]} spacing={1}>
                    {codigosFiltrados.map(c => (
                      <Badge key={c} colorScheme="teal" fontSize="md" mb={1}>{c}</Badge>
                    ))}
                  </SimpleGrid>
                : <Text color="gray.500">No hay códigos</Text>
            }
          </ModalBody>
        </ModalContent>
      </Modal>

      {/* Sección 2: Histórico avanzado de ventas y estadísticas de ventas */}
      <Box bg="white" p={4} rounded="xl" shadow="md" mt={10} mb={5}>
        <Heading size="md" mb={3}>Comparativa de ventas entre snapshots</Heading>
        <HStack spacing={4} align="center">
          <Text>Comparar desde:</Text>
          <Select value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} maxW={52}>
            <option value="">Elige fecha inicio</option>
            {historial.map(h => (
              <option key={h.fecha} value={h.fecha}>{niceDate(h.fecha)}</option>
            ))}
          </Select>
          <Text>hasta:</Text>
          <Select value={fechaFin} onChange={e => setFechaFin(e.target.value)} maxW={52}>
            <option value="">Elige fecha fin</option>
            {historial.map(h => (
              <option key={h.fecha} value={h.fecha}>{niceDate(h.fecha)}</option>
            ))}
          </Select>
          <Button colorScheme="green" onClick={handleComparar}>Comparar ventas</Button>
          <Button leftIcon={<DownloadIcon />} onClick={handleExportarExcel} variant="outline" colorScheme="blue" disabled={!tabla.length}>
            Descargar Excel
          </Button>
        </HStack>
        {/* Estadísticas de ventas y GRÁFICO de barras */}
        {ventasStats && tabla.length > 0 && (
          <>
          <SimpleGrid columns={[1,2,4]} spacing={3} mt={4} mb={4}>
            <Stat bg="gray.50" borderRadius="xl" p={2}>
              <StatLabel>Total unidades vendidas</StatLabel>
              <StatNumber>{formatInt(ventasStats.totalUnidades)}</StatNumber>
            </Stat>
            <Stat bg="gray.50" borderRadius="xl" p={2}>
              <StatLabel>Total vendido (€)</StatLabel>
              <StatNumber>{formatNum(ventasStats.totalEuros)} €</StatNumber>
            </Stat>
            <Stat bg="gray.50" borderRadius="xl" p={2}>
              <StatLabel>Top 3 artículos por unidades</StatLabel>
              <StatHelpText>
                {ventasStats.topArticulosUnidades && ventasStats.topArticulosUnidades.length
                  ? ventasStats.topArticulosUnidades.map(a=>`${a.codigo} (${formatInt(a.vendido)})`).join(" | ")
                  : "-"}
              </StatHelpText>
            </Stat>
            <Stat bg="gray.50" borderRadius="xl" p={2}>
              <StatLabel>Top 3 artículos por valor</StatLabel>
              <StatHelpText>
                {ventasStats.topArticulosValor && ventasStats.topArticulosValor.length
                  ? ventasStats.topArticulosValor.map(a=>`${a.codigo} (${formatNum(a.totalVenta)} €)`).join(" | ")
                  : "-"}
              </StatHelpText>
            </Stat>
          </SimpleGrid>
          {/* GRÁFICO DE BARRAS DE VENTAS POR GRUPO */}
          {ventasStats.chartData && ventasStats.chartData.length > 0 && (
            <Box w="100%" h={["240px", "300px"]} mb={6} bg="gray.50" rounded="xl" p={4} shadow="md">
              <Heading size="sm" mb={3}>Ventas por grupo (unidades)</Heading>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ventasStats.chartData}>
                  <XAxis dataKey="grupo" stroke="#888" fontSize={13} />
                  <YAxis stroke="#888" fontSize={13} allowDecimals={false}/>
                  <Tooltip formatter={formatInt} />
                  <Bar dataKey="unidades">
                    {ventasStats.chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Box>
          )}
          </>
        )}
      </Box>
      {tabla.length > 0 && (
        <Box bg="white" p={4} rounded="xl" shadow="lg">
          <Heading size="md" mb={3}>Ventas entre fechas seleccionadas</Heading>
          <Table variant="simple" size="sm">
            <Thead>
              <Tr>
                <Th>Código</Th>
                <Th>Descripción</Th>
                <Th>Grupo</Th>
                <Th isNumeric>Precio (€)</Th>
                <Th isNumeric>Stock inicial</Th>
                <Th isNumeric>Stock final</Th>
                <Th isNumeric>Vendido</Th>
                <Th isNumeric>Total vendido (€)</Th>
              </Tr>
            </Thead>
            <Tbody>
              {tabla.map(row => (
                <Tr key={row.codigo}>
                  <Td><Badge colorScheme="blue">{row.codigo}</Badge></Td>
                  <Td>{row.descripcion}</Td>
                  <Td>{row.grupo}</Td>
                  <Td isNumeric>{formatNum(row.precioVenta)}</Td>
                  <Td isNumeric>{formatInt(row.stockInicial)}</Td>
                  <Td isNumeric>{formatInt(row.stockFinal)}</Td>
                  <Td isNumeric>{formatInt(row.vendido)}</Td>
                  <Td isNumeric><b>{formatNum(row.totalVenta)}</b></Td>
                </Tr>
              ))}
              <Tr>
                <Td colSpan={7}><b>TOTAL VENDIDO</b></Td>
                <Td isNumeric><b>{formatNum(totalVendido)} €</b></Td>
              </Tr>
            </Tbody>
          </Table>
        </Box>
      )}
      {historial.length < 2 && (
        <VStack bg="white" mt={8} p={8} rounded="2xl" shadow="xl" align="center">
          <Text fontSize="xl" color="gray.600" textAlign="center">
            Haz clic en <b>“Obtener resumen”</b> cada vez que quieras registrar el stock.<br />
            Cuando haya <b>dos snapshots o más</b>, podrás comparar ventas entre fechas, analizar por artículo y descargar el informe en Excel.
          </Text>
        </VStack>
      )}
    </Box>
  );
}
