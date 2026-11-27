import { LiveWeather } from "./LiveWeather";
import { RegressionPrediction, RegressionSimulator } from "./ModelViews";
import { useEffect, useRef, useState } from "react";
import { languages, translateText, translateTree, type LanguageCode } from "./i18n";
import indiaStates from "./data/india-states.json";
import { AuthProvider, SignedInAccount } from "./auth/AuthProvider";
import { AuthBoundary } from "./auth/AuthScreen";

type Page =
  | "Home"
  | "Dashboard"
  | "Monitoring"
  | "AI Prediction"
  | "Scenario Simulator"
  | "Risk Analysis"
  | "About";
type IconName =
  | "home"
  | "dashboard"
  | "monitor"
  | "spark"
  | "sliders"
  | "shield"
  | "info"
  | "thermometer"
  | "rain"
  | "humidity"
  | "soil"
  | "pin"
  | "arrow"
  | "clock"
  | "leaf"
  | "wind"
  | "language"
  | "sun"
  | "moon";
type Theme = "day" | "night";

const navItems: { label: Page; icon: IconName }[] = [
  { label: "Home", icon: "home" },
  { label: "Dashboard", icon: "dashboard" },
  { label: "Monitoring", icon: "monitor" },
  { label: "AI Prediction", icon: "spark" },
  { label: "Scenario Simulator", icon: "sliders" },
  { label: "Risk Analysis", icon: "shield" },
  { label: "About", icon: "info" },
];

const locationData = {
  "All India": { temp: "27.4°", rain: "82 mm", humidity: "68%", soil: "43%", delta: "+0.8°C" },
  "New Delhi": { temp: "31.2°", rain: "42 mm", humidity: "51%", soil: "29%", delta: "+1.4°C" },
  Mumbai: { temp: "28.6°", rain: "184 mm", humidity: "79%", soil: "58%", delta: "+0.5°C" },
  Bengaluru: { temp: "24.1°", rain: "96 mm", humidity: "66%", soil: "47%", delta: "+0.4°C" },
  Kolkata: { temp: "29.4°", rain: "138 mm", humidity: "75%", soil: "52%", delta: "+0.9°C" },
};

const pageSlugs: Record<Page, string> = {
  Home: "home",
  Dashboard: "dashboard",
  Monitoring: "monitoring",
  "AI Prediction": "ai-prediction",
  "Scenario Simulator": "scenario-simulator",
  "Risk Analysis": "risk-analysis",
  About: "about",
};

function pageFromHash(): Page {
  const slug = window.location.hash.replace("#", "");
  return navItems.find((item) => pageSlugs[item.label] === slug)?.label ?? "Home";
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<IconName, React.ReactNode> = {
    home: (
      <>
        <path d="m3 11 9-8 9 8" />
        <path d="M5 10v10h14V10M9 20v-6h6v6" />
      </>
    ),
    dashboard: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    monitor: (
      <>
        <path d="M3 12h4l2-7 4 14 2-7h6" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 1.4 4.6L18 9l-4.6 1.4L12 15l-1.4-4.6L6 9l4.6-1.4L12 3Z" />
        <path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" />
      </>
    ),
    sliders: (
      <>
        <path d="M4 6h5M15 6h5M4 18h5M15 18h5M4 12h9M19 12h1" />
        <circle cx="12" cy="6" r="2" />
        <circle cx="12" cy="18" r="2" />
        <circle cx="16" cy="12" r="2" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </>
    ),
    thermometer: (
      <>
        <path d="M10 14.8V5a2 2 0 0 1 4 0v9.8a4 4 0 1 1-4 0Z" />
        <path d="M12 9v7" />
      </>
    ),
    rain: (
      <>
        <path d="M7 16a4 4 0 1 1 1-7.9A5 5 0 0 1 18 9a3.5 3.5 0 0 1-.5 7H7Z" />
        <path d="m8 19-1 2M13 19l-1 2M18 19l-1 2" />
      </>
    ),
    humidity: (
      <>
        <path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11Z" />
        <path d="M9 15c.5 1.5 1.5 2 3 2" />
      </>
    ),
    soil: (
      <>
        <path d="M4 20h16M6 16h12M8 12h8" />
        <path d="M12 12V6M12 8c-3 0-4-2-4-4 3 0 4 2 4 4ZM12 9c3 0 4-2 4-4-3 0-4 2-4 4Z" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    leaf: (
      <>
        <path d="M20 4C12 4 5 7 5 14c0 3 2 5 5 5 7 0 10-8 10-15Z" />
        <path d="M4 21c3-6 7-9 12-12" />
      </>
    ),
    wind: (
      <>
        <path d="M3 8h10c3 0 3-4 0-4-1 0-2 .5-2 1M3 12h15c3 0 3-4 0-4M3 16h10c3 0 3 4 0 4-1 0-2-.5-2-1" />
      </>
    ),
    language: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3Z" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" />
      </>
    ),
    moon: <path d="M20.2 15.1A8.5 8.5 0 0 1 8.9 3.8 8.5 8.5 0 1 0 20.2 15.1Z" />,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Brand() {
  return (
    <div className="brand">
      <div className="brand-mark">
        <span />
        <span />
        <span />
      </div>
      <div>
        <strong>ClimateTwin</strong>
        <small>INDIA</small>
      </div>
    </div>
  );
}

function DemoBadge() {
  return (
    <span className="demo-badge">
      <span /> LIVE WEATHER / PROTOTYPE
    </span>
  );
}

type ClimateMetric = {
  temperature: number;
  rainfall: number;
  humidity: number;
  aqi: number;
};

type MapLayer = "temperature" | "rainfall";
type Position = [number, number];
type PolygonCoordinates = Position[][];
type MultiPolygonCoordinates = Position[][][];

const stateClimate: Record<string, ClimateMetric> = {
  "Andaman and Nicobar Islands": { temperature: 27.8, rainfall: 296, humidity: 82, aqi: 32 },
  "Andhra Pradesh": { temperature: 29.2, rainfall: 94, humidity: 68, aqi: 74 },
  "Arunachal Pradesh": { temperature: 19.4, rainfall: 248, humidity: 78, aqi: 29 },
  Assam: { temperature: 25.6, rainfall: 236, humidity: 81, aqi: 58 },
  Bihar: { temperature: 28.1, rainfall: 117, humidity: 70, aqi: 132 },
  Chandigarh: { temperature: 26.1, rainfall: 76, humidity: 61, aqi: 109 },
  Chhattisgarh: { temperature: 27.6, rainfall: 129, humidity: 67, aqi: 72 },
  "Dadra and Nagar Haveli and Daman and Diu": {
    temperature: 28.3,
    rainfall: 189,
    humidity: 77,
    aqi: 68,
  },
  Delhi: { temperature: 29.8, rainfall: 63, humidity: 52, aqi: 168 },
  Goa: { temperature: 27.4, rainfall: 287, humidity: 80, aqi: 48 },
  Gujarat: { temperature: 30.2, rainfall: 71, humidity: 55, aqi: 91 },
  Haryana: { temperature: 29.1, rainfall: 58, humidity: 55, aqi: 142 },
  "Himachal Pradesh": { temperature: 17.8, rainfall: 121, humidity: 65, aqi: 41 },
  "Jammu and Kashmir": { temperature: 15.6, rainfall: 86, humidity: 63, aqi: 46 },
  Jharkhand: { temperature: 26.9, rainfall: 139, humidity: 70, aqi: 96 },
  Karnataka: { temperature: 25.7, rainfall: 124, humidity: 67, aqi: 72 },
  Kerala: { temperature: 26.8, rainfall: 269, humidity: 82, aqi: 51 },
  Ladakh: { temperature: 8.7, rainfall: 18, humidity: 31, aqi: 24 },
  Lakshadweep: { temperature: 28.1, rainfall: 193, humidity: 83, aqi: 27 },
  "Madhya Pradesh": { temperature: 27.2, rainfall: 104, humidity: 61, aqi: 88 },
  Maharashtra: { temperature: 27.9, rainfall: 143, humidity: 69, aqi: 92 },
  Manipur: { temperature: 22.8, rainfall: 188, humidity: 78, aqi: 39 },
  Meghalaya: { temperature: 20.7, rainfall: 318, humidity: 84, aqi: 34 },
  Mizoram: { temperature: 22.9, rainfall: 242, humidity: 80, aqi: 36 },
  Nagaland: { temperature: 21.9, rainfall: 205, humidity: 79, aqi: 38 },
  Odisha: { temperature: 28.4, rainfall: 151, humidity: 74, aqi: 83 },
  Puducherry: { temperature: 28.7, rainfall: 112, humidity: 76, aqi: 61 },
  Punjab: { temperature: 27.6, rainfall: 52, humidity: 57, aqi: 137 },
  Rajasthan: { temperature: 31.4, rainfall: 41, humidity: 42, aqi: 104 },
  Sikkim: { temperature: 16.9, rainfall: 224, humidity: 79, aqi: 26 },
  "Tamil Nadu": { temperature: 28.6, rainfall: 98, humidity: 72, aqi: 78 },
  Telangana: { temperature: 29.4, rainfall: 91, humidity: 59, aqi: 87 },
  Tripura: { temperature: 25.4, rainfall: 221, humidity: 82, aqi: 42 },
  "Uttar Pradesh": { temperature: 28.7, rainfall: 89, humidity: 64, aqi: 151 },
  Uttarakhand: { temperature: 19.3, rainfall: 146, humidity: 67, aqi: 52 },
  "West Bengal": { temperature: 27.5, rainfall: 167, humidity: 76, aqi: 112 },
};

const majorCities = [
  { name: "New Delhi", longitude: 77.209, latitude: 28.614 },
  { name: "Mumbai", longitude: 72.878, latitude: 19.076 },
  { name: "Bengaluru", longitude: 77.595, latitude: 12.972 },
  { name: "Chennai", longitude: 80.271, latitude: 13.083 },
  { name: "Kolkata", longitude: 88.364, latitude: 22.573 },
  { name: "Hyderabad", longitude: 78.487, latitude: 17.385 },
  { name: "Ahmedabad", longitude: 72.571, latitude: 23.023 },
  { name: "Guwahati", longitude: 91.736, latitude: 26.145 },
];

const projectPoint = ([longitude, latitude]: Position): Position => [
  14 + (longitude - 67) * 9.15,
  11 + (38 - latitude) * 9.25,
];

function canonicalRingKey(ring: Position[]) {
  const openRing =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  const tokens = openRing.map(([longitude, latitude]) => `${longitude},${latitude}`);
  const smallestRotation = (values: string[]) =>
    values
      .map((_, index) => [...values.slice(index), ...values.slice(0, index)].join("|"))
      .sort()[0];
  const forwards = smallestRotation(tokens);
  const backwards = smallestRotation([...tokens].reverse());
  return forwards < backwards ? forwards : backwards;
}

function geometryPath(
  type: string,
  coordinates: PolygonCoordinates | MultiPolygonCoordinates,
  displayScale = 1,
) {
  const polygons = type === "Polygon" ? [coordinates as PolygonCoordinates] : coordinates;
  const uniqueRings = new Map<string, Position[]>();
  (polygons as MultiPolygonCoordinates)
    .flatMap((polygon) => polygon)
    .forEach((ring) => uniqueRings.set(canonicalRingKey(ring), ring));
  const projectedRings = [...uniqueRings.values()].map((ring) => ring.map(projectPoint));
  const projectedPoints = projectedRings.flat();
  const centre: Position = [
    (Math.min(...projectedPoints.map(([x]) => x)) + Math.max(...projectedPoints.map(([x]) => x))) /
      2,
    (Math.min(...projectedPoints.map(([, y]) => y)) +
      Math.max(...projectedPoints.map(([, y]) => y))) /
      2,
  ];
  return projectedRings
    .map(
      (ring) =>
        `${ring
          .map((point, index) => {
            const x = centre[0] + (point[0] - centre[0]) * displayScale;
            const y = centre[1] + (point[1] - centre[1]) * displayScale;
            return `${index ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`;
          })
          .join(" ")} Z`,
    )
    .join(" ");
}

const statePalette = [
  "#28a99e",
  "#d9776a",
  "#4d8bc9",
  "#c6a64b",
  "#8e72c7",
  "#65a86e",
  "#d48c4e",
  "#3b9fc4",
  "#b96891",
  "#83a84d",
  "#c96b78",
  "#5d7fc0",
  "#47a985",
  "#c58a45",
  "#9d6eaa",
  "#4b9e93",
  "#d27f72",
  "#6578bc",
  "#72a85b",
  "#c99a52",
  "#bd6f89",
  "#438db7",
  "#91a44c",
  "#d37a55",
  "#806fb4",
  "#35a6a4",
  "#ca725c",
  "#557fba",
  "#57a675",
  "#b96c98",
  "#b69f4b",
  "#3b9b91",
  "#9871b5",
  "#d08268",
  "#4f91b8",
  "#6da15e",
] as const;

const minimumTargetStates = new Set(["Delhi", "Puducherry", "Lakshadweep"]);
const orderedStateFeatures = [...indiaStates.features].sort(
  (first, second) =>
    Number(minimumTargetStates.has(first.properties.st_nm)) -
    Number(minimumTargetStates.has(second.properties.st_nm)),
);

function aqiDetails(aqi: number) {
  if (aqi <= 50) {
    return { status: "Good", detail: "Air quality is generally clear.", tone: "good" };
  }
  if (aqi <= 100) {
    return { status: "Moderate", detail: "Sensitive groups should take care.", tone: "moderate" };
  }
  return { status: "Poor", detail: "Reduce prolonged outdoor exposure.", tone: "poor" };
}

function useDraggablePanel() {
  const panelRef = useRef<HTMLElement | null>(null);
  const dragStart = useRef({
    pointerX: 0,
    pointerY: 0,
    panelX: 0,
    panelY: 0,
    offsetX: 0,
    offsetY: 0,
  });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const onPointerDown = (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragStart.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      panelX: rect.left,
      panelY: rect.top,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLElement>) => {
    if (!isDragging || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    const desiredX = dragStart.current.panelX + event.clientX - dragStart.current.pointerX;
    const desiredY = dragStart.current.panelY + event.clientY - dragStart.current.pointerY;
    const clampedX = Math.max(8, Math.min(window.innerWidth - rect.width - 8, desiredX));
    const clampedY = Math.max(8, Math.min(window.innerHeight - rect.height - 8, desiredY));
    setOffset({
      x: dragStart.current.offsetX + clampedX - dragStart.current.panelX,
      y: dragStart.current.offsetY + clampedY - dragStart.current.panelY,
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    panelRef,
    isDragging,
    style: {
      transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
    } as React.CSSProperties,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}

function IndiaMap({
  mode = "climate",
  compact = false,
  visualization = "temperature",
}: {
  mode?: "climate" | "risk" | "hero";
  compact?: boolean;
  visualization?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const regionalPanel = useDraggablePanel();
  const aqiPanel = useDraggablePanel();
  const layer: MapLayer = visualization.toLowerCase().includes("rain") ? "rainfall" : "temperature";
  const selectedClimate = selectedState ? stateClimate[selectedState] : null;
  const displayedAqi = selectedClimate?.aqi ?? 72;
  const airQuality = aqiDetails(displayedAqi);
  return (
    <div className={`map-wrap ${compact ? "compact" : ""}`}>
      <svg
        className="india-map"
        viewBox="0 0 310 320"
        aria-label={`Administrative map of India; colours identify states, select a state for current weather`}
        style={{ transform: `scale(${zoom})` }}
      >
        <g className="india-regions">
          {orderedStateFeatures.map((feature, stateIndex) => {
            const name = feature.properties.st_nm;
            
            const isSelected = name === selectedState;
            const needsMinimumTarget = minimumTargetStates.has(name);
            const displayScale = name === "Lakshadweep" ? 10 : name === "Puducherry" ? 3 : 1;
            const path = geometryPath(
              feature.geometry.type,
              feature.geometry.coordinates as PolygonCoordinates | MultiPolygonCoordinates,
              displayScale,
            );
            return (
              <path
                key={name}
                className={`india-region ${needsMinimumTarget ? "micro-region" : ""} ${isSelected ? "selected" : ""}`}
                data-state={name}
                d={path}
                fill={statePalette[stateIndex]}
                fillRule="evenodd"
                pointerEvents="all"
                style={
                  {
                    "--state-fill": statePalette[stateIndex],
                    fill: statePalette[stateIndex],
                    pointerEvents: "all",
                  } as React.CSSProperties
                }
                role="button"
                tabIndex={0}
                aria-label={`${name}: select to load current weather for a representative city`}
                aria-pressed={isSelected}
                onPointerDown={(event) => {
                  if (event.button === 0) setSelectedState(name);
                }}
                onClick={() => setSelectedState(name)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedState(name);
                  }
                }}
              >
                <title>{`${name} — select for current weather`}</title>
              </path>
            );
          })}
        </g>
        <g className="city-markers" aria-label="Major Indian cities">
          {majorCities.map((city) => {
            const [x, y] = projectPoint([city.longitude, city.latitude]);
            return (
              <g key={city.name} transform={`translate(${x} ${y})`}>
                <circle className="city-marker-pulse" r="4.5" />
                <circle className="city-marker-dot" r="1.7" />
                <text x="4" y="-3">
                  {city.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="map-grid" />
      <aside
        ref={aqiPanel.panelRef}
        className={`aqi-side-panel draggable-panel ${aqiPanel.isDragging ? "is-dragging" : ""}`}
        style={aqiPanel.style}
        aria-live="polite"
      >
        <header className="draggable-panel-header" {...aqiPanel.dragHandleProps}>
          <span>AIR QUALITY INDEX · DEMO</span>
          <i aria-hidden="true">⋮⋮</i>
        </header>
        <div className="aqi-panel-reading">
          <strong>{displayedAqi}</strong>
          <div>
            <span className={`aqi-status ${airQuality.tone}`}>{airQuality.status}</span>
            <small>{selectedState ?? "All India composite"}</small>
          </div>
        </div>
        <p>{airQuality.detail}</p>
        <div className="aqi-scale" aria-label={`AQI ${displayedAqi}, ${airQuality.status}`}>
          <i style={{ left: `${Math.min(100, (displayedAqi / 200) * 100)}%` }} />
        </div>
      </aside>
      {selectedClimate && selectedState && (
        <aside
          ref={regionalPanel.panelRef}
          className={`state-climate-panel draggable-panel ${regionalPanel.isDragging ? "is-dragging" : ""}`}
          style={regionalPanel.style}
          aria-live="polite"
        >
          <header className="draggable-panel-header" {...regionalPanel.dragHandleProps}>
            <div>
              <span>REGIONAL CLIMATE</span>
              <h4>{selectedState}</h4>
            </div>
            <i aria-hidden="true">⋮⋮</i>
          </header>
          <button
            type="button"
            className="state-panel-close"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={() => setSelectedState(null)}
            aria-label="Close state climate information"
          >
            ×
          </button>
          <LiveWeather location={selectedState} compact />
        </aside>
      )}
      {mode !== "hero" && (
        <>
          <div className="map-controls" aria-label="Map zoom controls">
            <button
              type="button"
              onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))}
              disabled={zoom >= 1.5}
              aria-label="Zoom map in"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setZoom((value) => Math.max(0.8, value - 0.1))}
              disabled={zoom <= 0.8}
              aria-label="Zoom map out"
            >
              −
            </button>
            <button
              type="button"
              className="map-reset"
              onClick={() => setZoom(1)}
              aria-label="Reset map zoom"
            >
              {Math.round(zoom * 100)}%
            </button>
          </div>
          <div className="map-legend">
            <span>STATE COLOURS</span>
            <i />
            <span>Select for weather</span>
          </div>
        </>
      )}
    </div>
  );
}

function LineChart({
  variant = "temperature",
  years = false,
}: {
  variant?: "temperature" | "rain" | "prediction";
  years?: boolean;
}) {
  const data =
    variant === "rain"
      ? [55, 42, 50, 30, 38, 18, 14, 24, 41, 49, 35, 46]
      : variant === "prediction"
        ? [46, 43, 41, 38, 35, 31, 28, 25, 21, 18, 14, 11]
        : [43, 40, 39, 35, 36, 29, 31, 25, 23, 18, 17, 12];
  const color =
    variant === "rain" ? "var(--cyan)" : variant === "prediction" ? "var(--green)" : "var(--teal)";
  const points = data.map((y, i) => `${i * (100 / 11)},${y}`).join(" ");
  return (
    <div className="chart">
      <svg viewBox="0 0 100 58" preserveAspectRatio="none">
        <defs>
          <linearGradient id={`fill-${variant}`} x1="0" y1="0" x2="0" y2="1">
            <stop stopColor={color} stopOpacity=".28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={`chart-glow-${variant}`}>
            <feGaussianBlur stdDeviation=".8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g className="chart-grid">
          <path d="M0 10H100M0 25H100M0 40H100M0 55H100M0 0V55M20 0V55M40 0V55M60 0V55M80 0V55M100 0V55" />
        </g>
        <polygon points={`0,58 ${points} 100,58`} fill={`url(#fill-${variant})`} />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
          filter={`url(#chart-glow-${variant})`}
        />
        {variant === "prediction" && (
          <polyline
            points="54,29 63,26 72,21 81,17 90,11 100,7"
            fill="none"
            stroke={color}
            strokeWidth="1.5"
            strokeDasharray="3 2"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <circle
          className="chart-end-point"
          cx="100"
          cy={data[data.length - 1]}
          r="1.8"
          fill={color}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="chart-labels">
        {(years
          ? ["2025", "2027", "2029", "2031", "2033", "2035"]
          : ["JAN", "MAR", "MAY", "JUL", "SEP", "NOV"]
        ).map((x) => (
          <span key={x}>{x}</span>
        ))}
      </div>
    </div>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="header-actions">
        <DemoBadge />
        {children}
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="card metric-card">
      <div className={`metric-icon ${tone}`}>
        <Icon name={icon} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{sub}</small>
      </div>
      <div className="mini-spark">
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

function Home({ onExplore }: { onExplore: () => void }) {
  return (
    <section id="home" className="home-page">
      <div className="hero-aura" />
      <div className="hero-copy">
        <div className="eyebrow">
          <span className="live-dot" /> INDIA’S CLIMATE INTELLIGENCE LAYER
        </div>
        <h1>
          Understand Climate.
          <br />
          <em>Predict Tomorrow.</em>
        </h1>
        <p>
          AI-powered climate intelligence for a sustainable India. Monitor environmental change,
          explore predictions and simulate a more resilient future.
        </p>
        <div className="hero-actions">
          <button className="primary-btn" onClick={onExplore}>
            Explore Dashboard <Icon name="arrow" />
          </button>
          <button
            className="text-btn"
            onClick={() =>
              document.getElementById("capabilities")?.scrollIntoView({ behavior: "smooth" })
            }
          >
            Discover the platform <span>↓</span>
          </button>
        </div>
        <div className="hero-stats">
          <div>
            <strong>28</strong>
            <span>States covered</span>
          </div>
          <div>
            <strong>8</strong>
            <span>Climate indicators</span>
          </div>
          <div>
            <strong>10 yr</strong>
            <span>Scenario horizon</span>
          </div>
        </div>
      </div>
      <div className="hero-visual">
        <div className="orbit orbit-one" />
        <div className="orbit orbit-two" />
        <IndiaMap mode="hero" />
        <div className="float-card fc-temp">
          <div className="float-icon">
            <Icon name="thermometer" />
          </div>
          <span>
            AVG TEMPERATURE<strong>27.4°C</strong>
            <small>Demo national mean</small>
          </span>
        </div>
        <div className="scan-label">
          <span /> CLIMATE TWIN ACTIVE
        </div>
      </div>
      <div id="capabilities" className="capability-strip">
        <div>
          <Icon name="monitor" />
          <span>
            <strong>Monitor</strong>Multi-variable signals
          </span>
        </div>
        <div>
          <Icon name="spark" />
          <span>
            <strong>Predict</strong>AI-powered outlooks
          </span>
        </div>
        <div>
          <Icon name="sliders" />
          <span>
            <strong>Simulate</strong>Explore interventions
          </span>
        </div>
        <div>
          <Icon name="shield" />
          <span>
            <strong>Prepare</strong>Assess regional risk
          </span>
        </div>
      </div>
    </section>
  );
}

function Dashboard() {
  const [location, setLocation] = useState<keyof typeof locationData>("New Delhi");
  const [layer, setLayer] = useState("Climate");
  return (
    <section id="dashboard">
      <PageHeader
        eyebrow="NATIONAL OVERVIEW"
        title="Climate Dashboard"
        description="A unified view of India’s key climate indicators and regional patterns."
      >
        <label className="select-wrap">
          <Icon name="pin" />
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value as keyof typeof locationData)}
          >
            {Object.keys(locationData).filter((x) => x !== "All India").map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
      </PageHeader>
      <LiveWeather location={location} />
      <p className="weather-note">Historical charts below are demo samples pending dataset integration.</p>
      <div className="dashboard-main">
        <div className="card map-panel">
          <div className="card-title">
            <div>
              <span>CLIMATE INTENSITY</span>
              <h3>India climate map</h3>
            </div>
            <button
              className="ghost-button"
              onClick={() =>
                setLayer((current) =>
                  current === "Climate"
                    ? "Temperature"
                    : current === "Temperature"
                      ? "Rainfall"
                      : "Climate",
                )
              }
              aria-label={`Change map layer. Current layer: ${layer}`}
            >
              {layer} <Icon name="sliders" size={15} />
            </button>
          </div>
          <IndiaMap compact visualization={layer} />
          <div className="map-callout">
            <Icon name="pin" />
            <span>
              SELECTED REGION<strong>{location}</strong>
            </span>
          </div>
        </div>
        <div className="right-stack">
          <div className="card chart-card">
            <div className="card-title">
              <div>
                <span>12-MONTH TREND</span>
                <h3>Temperature pattern</h3>
              </div>
              <strong className="trend-up">+0.8°C</strong>
            </div>
            <LineChart />
            <div className="legend-row">
              <span>
                <i className="legend-teal" />
                2024 demo
              </span>
              <span>National mean °C</span>
            </div>
          </div>
          <div className="card chart-card">
            <div className="card-title">
              <div>
                <span>MONSOON SIGNAL</span>
                <h3>Rainfall distribution</h3>
              </div>
              <strong className="trend-blue">82 mm</strong>
            </div>
            <LineChart variant="rain" />
            <div className="legend-row">
              <span>
                <i className="legend-blue" />
                Monthly rainfall
              </span>
              <span>Demo estimate</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Monitoring() {
  const [range, setRange] = useState("5 years");
  const [mapMetric, setMapMetric] = useState("Temperature");
  return (
    <section id="monitoring">
      <PageHeader
        eyebrow="OBSERVE & UNDERSTAND"
        title="Climate Monitoring"
        description="Explore historical climate patterns and environmental change over time."
      >
        <label className="select-wrap">
          <Icon name="clock" />
          <select value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="1 year">1 year</option>
            <option value="5 years">5 years</option>
            <option value="10 years">10 years</option>
            <option value="20 years">20 years</option>
          </select>
        </label>
      </PageHeader>
      <LiveWeather />
      <p className="weather-note">Historical analysis below uses demo data.</p>
      <div className="monitor-grid">
        <div className="card map-panel monitor-map">
          <div className="card-title">
            <div>
              <span>SPATIAL VIEW</span>
              <h3>{mapMetric} anomalies</h3>
            </div>
            <div className="status">
              <span /> Analysis ready
            </div>
          </div>
          <IndiaMap compact visualization={mapMetric} />
          <div className="map-tabs">
            {["Temperature", "Rainfall", "Vegetation"].map((metric) => (
              <button
                key={metric}
                className={mapMetric === metric ? "active" : ""}
                onClick={() => setMapMetric(metric)}
                aria-pressed={mapMetric === metric}
              >
                {metric}
              </button>
            ))}
          </div>
        </div>
        <div className="card insight-panel">
          <span className="section-kicker">KEY OBSERVATIONS</span>
          <h3>{range} climate summary</h3>
          <div className="insight">
            <span className="num">01</span>
            <div>
              <strong>Warming trend</strong>
              <p>North-western regions show the strongest demo anomaly.</p>
            </div>
            <b>+1.2°</b>
          </div>
          <div className="insight">
            <span className="num">02</span>
            <div>
              <strong>Monsoon variability</strong>
              <p>Rainfall distribution is increasingly uneven.</p>
            </div>
            <b>14%</b>
          </div>
          <div className="insight">
            <span className="num">03</span>
            <div>
              <strong>Soil moisture</strong>
              <p>Central regions show persistent seasonal stress.</p>
            </div>
            <b>-8%</b>
          </div>
        </div>
        <div className="card wide-chart">
          <div className="card-title">
            <div>
              <span>HISTORICAL TREND</span>
              <h3>Temperature anomaly</h3>
            </div>
            <div className="stat-big">
              +0.86<span>°C</span>
            </div>
          </div>
          <LineChart />
          <div className="chart-label-note">
            Illustrative demo trend relative to a 1991–2020 baseline
          </div>
        </div>
        <div className="card rainfall-bars">
          <div className="card-title">
            <div>
              <span>RAINFALL ANALYSIS</span>
              <h3>Seasonal contribution</h3>
            </div>
          </div>
          <div className="bars">
            {[
              ["Winter", 18],
              ["Pre-monsoon", 34],
              ["Monsoon", 88],
              ["Post-monsoon", 42],
            ].map(([a, b]) => (
              <div key={a}>
                <span>{a}</span>
                <i>
                  <b style={{ width: `${b}%` }} />
                </i>
                <strong>{b}%</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function RiskAnalysis() {
  const risks = [
    { label: "Flood risk", icon: "rain" as IconName, score: 64, level: "ELEVATED", tone: "cyan" },
    {
      label: "Drought risk",
      icon: "soil" as IconName,
      score: 48,
      level: "MODERATE",
      tone: "amber",
    },
    {
      label: "Heatwave risk",
      icon: "thermometer" as IconName,
      score: 76,
      level: "HIGH",
      tone: "coral",
    },
  ];
  return (
    <section id="risk-analysis">
      <PageHeader
        eyebrow="CLIMATE RESILIENCE"
        title="Risk Analysis"
        description="Illustrative demo risk scores. These are not calculated by the regression model or the scenario simulator."
      >
        <label className="select-wrap">
          <Icon name="pin" />
          <select>
            <option value="All India">All India</option>
            <option value="North India">North India</option>
            <option value="Coastal India">Coastal India</option>
            <option value="Central India">Central India</option>
          </select>
        </label>
      </PageHeader>
      <div className="risk-grid">
        <div className="card map-panel risk-map">
          <div className="card-title">
            <div>
              <span>COMPOSITE RISK INDEX</span>
              <h3>Geographical risk view</h3>
            </div>
            <button className="ghost-button">2035 scenario</button>
          </div>
          <IndiaMap mode="risk" compact />
          <div className="risk-legend">
            <span>
              <i className="low" />
              Low
            </span>
            <span>
              <i className="moderate" />
              Moderate
            </span>
            <span>
              <i className="high" />
              High
            </span>
          </div>
        </div>
        <div className="risk-list">
          {risks.map((r) => (
            <div className="card risk-card" key={r.label}>
              <div className={`metric-icon ${r.tone}`}>
                <Icon name={r.icon} />
              </div>
              <div className="risk-info">
                <span>{r.label}</span>
                <strong>
                  {r.score}
                  <small>/100</small>
                </strong>
                <div className="risk-bar">
                  <i style={{ width: `${r.score}%` }} />
                </div>
              </div>
              <b className={r.level.toLowerCase()}>{r.level}</b>
            </div>
          ))}
          <div className="card resilience">
            <Icon name="shield" />
            <div>
              <span>National resilience index</span>
              <strong>58 / 100</strong>
              <p>Moderate adaptive capacity in this demo scenario.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="priority-banner">
        <div>
          <span>PRIORITY INSIGHT</span>
          <h3>Heat stress is the most significant near-term risk</h3>
          <p>
            Strengthening urban heat action plans and early warning systems could improve
            resilience.
          </p>
        </div>
        <button className="ghost-button">
          View methodology <Icon name="arrow" />
        </button>
      </div>
    </section>
  );
}

function About() {
  return (
    <section id="about">
      <PageHeader
        eyebrow="THE PROJECT"
        title="A digital twin for India’s climate"
        description="Turning complex climate information into clearer decisions for a resilient future."
      />
      <div className="about-hero card">
        <div>
          <div className="about-number">01</div>
          <h2>
            What is a climate <em>digital twin?</em>
          </h2>
          <p>
            A climate digital twin is a dynamic virtual representation of environmental systems. It
            brings together observed patterns, AI models and scenario tools so users can understand
            change, explore possible futures and test interventions in a safe digital environment.
          </p>
        </div>
        <div className="twin-diagram">
          <div className="earth">
            <span>
              PHYSICAL
              <br />
              CLIMATE
            </span>
          </div>
          <div className="data-flow">
            <i />
            <i />
            <i />
            <Icon name="arrow" />
          </div>
          <div className="digital">
            <Icon name="spark" size={30} />
            <span>
              DIGITAL
              <br />
              TWIN
            </span>
          </div>
        </div>
      </div>
      <div className="objectives">
        <div className="section-heading">
          <span>OUR OBJECTIVES</span>
          <h2>Climate intelligence for everyone</h2>
        </div>
        <div className="objective-grid">
          <div className="card objective">
            <b>01</b>
            <Icon name="monitor" size={28} />
            <h3>Make climate visible</h3>
            <p>
              Translate complex, multi-variable environmental patterns into clear visual insights.
            </p>
          </div>
          <div className="card objective">
            <b>02</b>
            <Icon name="spark" size={28} />
            <h3>Explore future pathways</h3>
            <p>Use AI-assisted projections to compare possible climate trajectories.</p>
          </div>
          <div className="card objective">
            <b>03</b>
            <Icon name="sliders" size={28} />
            <h3>Support better decisions</h3>
            <p>Enable scenario exploration for research, education and climate policy.</p>
          </div>
        </div>
      </div>
      <div className="tech-section">
        <div>
          <span className="section-kicker">AI + CLIMATE TECHNOLOGY</span>
          <h2>From signals to insight</h2>
          <p>
            ClimateTwin demonstrates how machine learning, geospatial analysis and interactive
            modelling can work together to make climate information more accessible.
          </p>
        </div>
        <div className="pipeline">
          {["Climate signals", "Pattern learning", "Scenario engine", "Actionable insight"].map(
            (x, i) => (
              <div key={x}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{x}</strong>
                {i < 3 && <Icon name="arrow" />}
              </div>
            ),
          )}
        </div>
      </div>
    </section>
  );
}

export function ClimateDashboard() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const [language, setLanguage] = useState<LanguageCode>(() => {
    const saved = window.localStorage.getItem("climatetwin-language");
    return languages.some((item) => item.code === saved) ? (saved as LanguageCode) : "en";
  });
  const [theme, setTheme] = useState<Theme>(() =>
    window.localStorage.getItem("climatetwin-theme") === "day" ? "day" : "night",
  );

  useEffect(() => {
    const syncPageToUrl = () => setPage(pageFromHash());
    window.addEventListener("hashchange", syncPageToUrl);
    window.addEventListener("popstate", syncPageToUrl);
    return () => {
      window.removeEventListener("hashchange", syncPageToUrl);
      window.removeEventListener("popstate", syncPageToUrl);
    };
  }, []);

  useEffect(() => {
    document.title = `${translateText(page, language)} · ClimateTwin India`;
  }, [page, language]);

  useEffect(() => {
    const selectedLanguage = languages.find((item) => item.code === language) ?? languages[0];
    document.documentElement.lang = language;
    document.documentElement.dir = selectedLanguage.dir;
    document.documentElement.dataset.language = language;
    window.localStorage.setItem("climatetwin-language", language);

    const app = document.querySelector<HTMLElement>(".app-shell");
    if (!app) return;
    translateTree(app, language);
    const observer = new MutationObserver(() => translateTree(app, language));
    observer.observe(app, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });
    return () => observer.disconnect();
  }, [language, page]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme === "night" ? "dark" : "light";
    window.localStorage.setItem("climatetwin-theme", theme);
  }, [theme]);

  const go = (p: Page) => {
    setPage(p);
    setMenuOpen(false);
    window.history.pushState(null, "", `#${pageSlugs[p]}`);
    document.title = `${translateText(p, language)} · ClimateTwin India`;
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const render = () => {
    if (page === "Home") return <Home onExplore={() => go("Dashboard")} />;
    if (page === "Dashboard") return <Dashboard />;
    if (page === "Monitoring") return <Monitoring />;
    if (page === "AI Prediction") return <RegressionPrediction />;
    if (page === "Scenario Simulator") return <RegressionSimulator />;
    if (page === "Risk Analysis") return <RiskAnalysis />;
    return <About />;
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand-button" onClick={() => go("Home")}>
          <Brand />
        </button>
        <nav className={menuOpen ? "open" : ""}>
          {navItems.map((item) => (
            <button
              key={item.label}
              className={page === item.label ? "active" : ""}
              onClick={() => go(item.label)}
              aria-current={page === item.label ? "page" : undefined}
            >
              <Icon name={item.icon} size={16} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="top-actions">
          <label className="language-selector">
            <span className="sr-only">Select language</span>
            <Icon name="language" size={14} />
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as LanguageCode)}
              aria-label="Select language"
            >
              {languages.map((item) => (
                <option key={item.code} value={item.code} lang={item.code} dir={item.dir}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="theme-toggle"
            type="button"
            onClick={() => setTheme((current) => (current === "night" ? "day" : "night"))}
            aria-label={`Switch to ${theme === "night" ? "day" : "night"} mode`}
            aria-pressed={theme === "day"}
            title={`Switch to ${theme === "night" ? "day" : "night"} mode`}
          >
            <span className="theme-toggle-thumb" aria-hidden="true" />
            <span className={theme === "day" ? "active" : ""} aria-hidden="true">
              <Icon name="sun" size={14} />
            </span>
            <span className={theme === "night" ? "active" : ""} aria-hidden="true">
              <Icon name="moon" size={14} />
            </span>
          </button>
          <SignedInAccount />
          <DemoBadge />
          <button
            className="menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>
      <main className={page === "Home" ? "home-main" : ""}>{render()}</main>
      <footer>
        <Brand />
        <p>Designed for climate learning, research and scenario exploration.</p>
        <span>ClimateTwin India · Hackathon Demo 2025</span>
      </footer>
    </div>
  );
}

export default function App() {
  return <AuthProvider><AuthBoundary><ClimateDashboard /></AuthBoundary></AuthProvider>;
}
