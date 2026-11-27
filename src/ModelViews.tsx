import { useState } from "react";
import artifact from "./data/regression-model.json";
import { forecastMonths, predict, simulate, type Projection, type RegressionModel } from "./regression";
import "./model.css";

const model: RegressionModel = artifact;
const states = Object.keys(model.states);
const months = forecastMonths(model);
const initialState = states.includes("Delhi") ? "Delhi" : states[0];
const dateLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-IN", { month: "short", year: "numeric", timeZone: "UTC" });
const number = (value: number) => value.toFixed(1);
const signed = (value: number) => `${value > 0 ? "+" : ""}${number(value)}`;

function StateSelector({ state, onChange }: { state: string; onChange: (state: string) => void }) {
  return <label className="model-control">State / Union Territory
    <select value={state} onChange={event => onChange(event.target.value)}>
      {states.map(name => <option key={name}>{name}</option>)}
    </select>
  </label>;
}

function ModelHeader({ simulation = false }: { simulation?: boolean }) {
  return <>
    <div className="page-header">
      <div><div className="eyebrow">LINEAR REGRESSION · MONTHLY OUTLOOK</div>
        <h1>{simulation ? "Scenario Simulator" : "Climate Prediction"}</h1>
        <p>{simulation ? "Explore temperature and rainfall changes against a fitted monthly baseline." : "Explore the next 12 months with a fitted trend and a seasonal pattern for each state."}</p>
      </div>
      <span className="model-tag">{model.dataKind === "synthetic" ? "SYNTHETIC DATA" : "DATASET MODEL"}</span>
    </div>
    <div className="model-disclosure" role="note">
      {model.dataKind === "synthetic"
        ? <>This prototype was trained on generated climate data from {dateLabel(model.trainingStart)} to {dateLabel(model.trainingEnd)}. The source includes generated future-dated records. These are learning projections, not real weather forecasts.</>
        : <>These monthly statistical projections use the supplied dataset and are not operational weather forecasts.</>}
      {" "}The live-weather API is separate. Scenarios apply your chosen changes; they do not predict their causes or impacts.
    </div>
  </>;
}

function OutlookChart({ rows, rainfall = false }: { rows: Projection[]; rainfall?: boolean }) {
  const values = rows.map(row => rainfall ? row.rainfall : row.meanTemp);
  const low = rainfall ? 0 : Math.floor(Math.min(...values) - 2);
  const high = Math.max(low + 1, Math.ceil(Math.max(...values) + (rainfall ? 5 : 2)));
  const x = (i: number) => 55 + i * (490 / Math.max(1, rows.length - 1));
  const y = (value: number) => 170 - (value - low) / (high - low) * 135;
  const title = rainfall ? "Monthly rainfall total" : "Monthly mean temperature";
  return <div className="card model-chart"><h2>{title}</h2>
    <p>{rainfall ? "mm per month" : "°C · average of daily minimum and maximum"}</p>
    <svg viewBox="0 0 600 210" role="img" aria-label={`${title} for ${rows[0].state}. Exact values are in the table below.`}>
      {[low, (low + high) / 2, high].map(value => <g key={value}>
        <line x1="55" x2="545" y1={y(value)} y2={y(value)} className="model-gridline" />
        <text x="45" y={y(value) + 4} textAnchor="end">{Math.round(value)}</text>
      </g>)}
      <polyline points={values.map((value, i) => `${x(i)},${y(value)}`).join(" ")} fill="none" className={rainfall ? "model-rain" : "model-temp"} strokeWidth="3" />
      {rows.map((row, i) => <g key={row.month}>
        <circle cx={x(i)} cy={y(values[i])} r="4" className={rainfall ? "model-rain-dot" : "model-temp-dot"}><title>{`${dateLabel(row.month)}: ${number(values[i])}${rainfall ? " mm" : " °C"}`}</title></circle>
        {(rows.length <= 6 || i % 2 === 0 || i === rows.length - 1) && <text x={x(i)} y="197" textAnchor="middle">{dateLabel(row.month).split(" ")[0]}</text>}
      </g>)}
    </svg>
  </div>;
}

function Evaluation({ state }: { state: string }) {
  const evaluation = model.states[state].evaluation;
  return <div className="card model-evaluation"><h2>How well did it predict held-out months?</h2>
    <p>Trained on {dateLabel(evaluation.trainFirst)}–{dateLabel(evaluation.trainLast)}; tested on {evaluation.testMonths} complete months within {dateLabel(model.evaluationStart)}–{dateLabel(model.evaluationEnd)}. Lower error is better. The comparison uses historical averages for each calendar month, fitted only on training data.</p>
    <div className="model-table-scroll" tabIndex={0} aria-label="Validation results, scroll horizontally if needed">
      <table><caption>Mean absolute error · {state} · {model.dataKind} data</caption>
        <thead><tr><th scope="col">Target</th><th scope="col">Regression</th><th scope="col">Seasonal average</th><th scope="col">Comparison</th></tr></thead>
        <tbody>{([ ["mean_temp", "Mean temperature", "°C"], ["rainfall", "Monthly rainfall", "mm"] ] as const).map(([key, label, unit]) => {
          const fitted = evaluation.model[key].mae;
          const baseline = evaluation.baseline[key].mae;
          return <tr key={key}><th scope="row">{label}</th><td>{fitted.toFixed(2)} {unit}</td><td>{baseline.toFixed(2)} {unit}</td>
            <td className={fitted < baseline ? "model-better" : "model-caution"}>{fitted < baseline ? "Lower error" : "No improvement"}</td></tr>;
        })}</tbody>
      </table>
    </div>
    <p>A single historical test does not establish future accuracy. No calibrated uncertainty interval is available. The displayed projections use a final refit on all {model.states[state].fitMonths} complete months through {dateLabel(model.states[state].fitLast)}.</p>
  </div>;
}

function download(rows: Projection[], temperatureChange?: number, rainfallPercent?: number) {
  const header = "state,month,mean_temp_c,mean_daily_min_c,mean_daily_max_c,monthly_rainfall_mm,data_kind,output_type,temp_adjustment_c,rainfall_adjustment_percent";
  const csv = [header, ...rows.map(row => [JSON.stringify(row.state), row.month, number(row.meanTemp), number(row.minTemp), number(row.maxTemp), number(row.rainfall), model.dataKind,
    temperatureChange === undefined ? "regression_projection" : "user_defined_scenario", temperatureChange ?? 0, rainfallPercent ?? 0].join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `climatetwin-${temperatureChange === undefined ? "projections" : "scenario"}-${model.dataKind}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RegressionPrediction() {
  const [state, setState] = useState(initialState);
  const [horizon, setHorizon] = useState(12);
  const rows = months.slice(0, horizon).map(month => predict(model, state, month));
  return <section id="ai-prediction" className="regression-view">
    <ModelHeader />
    <div className="model-toolbar"><StateSelector state={state} onChange={setState} />
      <label className="model-control">Projection horizon<select value={horizon} onChange={e => setHorizon(Number(e.target.value))}>
        {[3, 6, 12].map(count => <option key={count} value={count}>{count} months from {dateLabel(months[0])}</option>)}
      </select></label>
      <button type="button" className="ghost-button" onClick={() => download(rows)}>Download projections CSV</button>
    </div>
    <div className="model-summary" aria-live="polite"><strong>{state}</strong><span>{dateLabel(rows[0].month)}–{dateLabel(rows[rows.length - 1].month)}</span><span>{model.states[state].fitMonths} complete months used for the final fit</span></div>
    <div className="model-two-columns"><OutlookChart rows={rows} /><OutlookChart rows={rows} rainfall /></div>
    <div className="card model-table-card"><div className="model-table-scroll" tabIndex={0} aria-label="Monthly projections, scroll horizontally if needed">
      <table><caption>Monthly projections · {model.dataKind} data</caption><thead><tr><th scope="col">Month</th><th scope="col">Mean °C</th><th scope="col">Mean daily min °C</th><th scope="col">Mean daily max °C</th><th scope="col">Rainfall total mm</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.month}><th scope="row">{dateLabel(row.month)}</th><td>{number(row.meanTemp)}</td><td>{number(row.minTemp)}</td><td>{number(row.maxTemp)}</td><td>{number(row.rainfall)}</td></tr>)}</tbody>
      </table>
    </div></div>
    <Evaluation state={state} />
    <details className="card model-method"><summary>Dataset and method</summary>
      <p>{model.audit.rowCount.toLocaleString("en-IN")} daily records across {model.audit.stateCount} states and Union Territories. {model.audit.completeStateMonths.toLocaleString("en-IN")} complete state-months retained; {model.audit.excludedStateMonths} incomplete state-months excluded. Missing rainfall is not replaced by zero.</p>
      <p>Separate ordinary least-squares models per state use elapsed years plus 11 month indicators. Targets are monthly averages of daily minimum and maximum temperature, and monthly total rainfall. Negative rainfall predictions are clipped to zero and temperature minimum/maximum order is enforced. The range between minimum and maximum is not an uncertainty interval.</p>
    </details>
  </section>;
}

export function RegressionSimulator() {
  const [state, setState] = useState(initialState);
  const [month, setMonth] = useState(months[0]);
  const [temperature, setTemperature] = useState(0);
  const [rainfall, setRainfall] = useState(0);
  const baseline = predict(model, state, month);
  const scenario = simulate(baseline, temperature, rainfall);
  return <section id="scenario-simulator" className="regression-view">
    <ModelHeader simulation />
    <div className="model-toolbar"><StateSelector state={state} onChange={setState} />
      <label className="model-control">Scenario month<select value={month} onChange={e => setMonth(e.target.value)}>{months.map(m => <option key={m} value={m}>{dateLabel(m)}</option>)}</select></label>
      <button className="ghost-button" type="button" onClick={() => { setTemperature(0); setRainfall(0); }}>Reset changes</button>
    </div>
    <div className="model-two-columns model-scenario-grid">
      <div className="card model-adjustments"><h2>Choose a what-if scenario</h2><p>Results update as you move the sliders.</p>
        <label htmlFor="temperature-delta">Temperature change <strong>{signed(temperature)} °C</strong></label>
        <input id="temperature-delta" type="range" min={-3} max={5} step={0.1} value={temperature} aria-valuetext={`${signed(temperature)} degrees Celsius`} onChange={e => setTemperature(Number(e.target.value))} />
        <div className="model-range-labels"><span>−3 °C</span><span>+5 °C</span></div>
        <label htmlFor="rainfall-delta">Rainfall change <strong>{signed(rainfall)}%</strong></label>
        <input id="rainfall-delta" type="range" min={-50} max={50} step={1} value={rainfall} aria-valuetext={`${signed(rainfall)} percent`} onChange={e => setRainfall(Number(e.target.value))} />
        <div className="model-range-labels"><span>−50%</span><span>+50%</span></div>
        <p>The temperature adjustment is added to the fitted minimum and maximum. Rainfall is multiplied by 1 + your percentage / 100. These controls do not retrain the regression.</p>
      </div>
      <div className="card model-scenario-results"><h2>{state} · {dateLabel(month)}</h2><p>Regression baseline → your scenario</p>
        <div className="model-table-scroll" tabIndex={0} aria-label="Scenario comparison, scroll horizontally if needed">
          <table><caption>Monthly values · {model.dataKind} data</caption><thead><tr><th scope="col">Measure</th><th scope="col">Baseline</th><th scope="col">Scenario</th><th scope="col">Change</th></tr></thead>
            <tbody>{([ ["meanTemp", "Mean °C"], ["minTemp", "Mean daily min °C"], ["maxTemp", "Mean daily max °C"], ["rainfall", "Total rainfall mm"] ] as const).map(([key, label]) =>
              <tr key={key}><th scope="row">{label}</th><td>{number(baseline[key])}</td><td>{number(scenario[key])}</td><td>{signed(scenario[key] - baseline[key])}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="model-result-summary" role="status">Scenario: {number(scenario.meanTemp)} °C monthly mean temperature and {number(scenario.rainfall)} mm monthly rainfall.</p>
        <button type="button" className="ghost-button" onClick={() => download([scenario], temperature, rainfall)}>Download scenario CSV</button>
      </div>
    </div>
    <div className="model-disclosure">This is a sensitivity exercise around the regression baseline. Crop yields, water availability, heat-health impacts and emissions pathways require additional data and validated models. They are not calculated here.</div>
    <Evaluation state={state} />
  </section>;
}
