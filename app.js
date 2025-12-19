/* Wind Go/No-Go — Grove method (Imperial)
   Assumptions locked: Main boom only, fully extended outriggers, no jib, full CW.
   References used from user-provided photos:
   - V(z) conversion (imperial): Vz = [ (Z/33)^0.14 + 0.4 ] * V
   - Capacity reduction factors for 30 < V(z) <= 45 mph:
       28.9->1.0, 40->0.9, 50/60/70->0.8, 80/90/95.2->0.7
   - Awr(allow) = 0.0059 * m(allow)  (ft^2)
   - Awr(load)  = Ap * Cd
   - Table 2-3 (Imperial) ratio -> max permissible wind speed
*/

const $ = (id) => document.getElementById(id);

const windSourceRadios = () => Array.from(document.querySelectorAll('input[name="windSource"]'));
const apModeRadios = () => Array.from(document.querySelectorAll('input[name="apMode"]'));
const orientationRadios = () => Array.from(document.querySelectorAll('input[name="orientation"]'));

const beaufortTableMphMax = [
  { n: 0, desc: "Calm", mph: 0.7 },
  { n: 1, desc: "Light Air", mph: 3.4 },
  { n: 2, desc: "Light Breeze", mph: 7.4 },
  { n: 3, desc: "Gentle Breeze", mph: 12.1 },
  { n: 4, desc: "Moderate Breeze", mph: 17.7 },
  { n: 5, desc: "Fresh Breeze", mph: 23.9 },
  { n: 6, desc: "Strong Breeze", mph: 30.9 },
  { n: 7, desc: "High Wind", mph: 38.3 },
  { n: 8, desc: "Gale", mph: 46.3 },
  { n: 9, desc: "Strong Gale", mph: 54.6 },
  { n: 10, desc: "Storm", mph: 63.5 }
];

// Cd table from photo (values/ranges). Default uses max of range per manual conservative guidance.
const shapeCdOptions = [
  { key: "box", label: "Box / Flat-sided (range 1.1–2.0)", min: 1.1, max: 2.0, def: 2.0 },
  { key: "sphere", label: "Sphere (range 0.3–0.4)", min: 0.3, max: 0.4, def: 0.4 },
  { key: "cylinder", label: "Cylinder (range 0.8–1.0)", min: 0.8, max: 1.0, def: 1.0 },
  { key: "curvedHigh", label: "Curved / Rounded (range 0.8–1.2)", min: 0.8, max: 1.2, def: 1.2 },
  { key: "curvedLow", label: "Curved / Rounded (range 0.2–0.3)", min: 0.2, max: 0.3, def: 0.3 },
  { key: "streamlined", label: "Streamlined / Airfoil-like (range 0.05–0.1)", min: 0.05, max: 0.1, def: 0.1 },
  { key: "turbine", label: "Turbine blade / complete rotor (≈1.6)", min: 1.6, max: 1.6, def: 1.6 }
];

// Ratio table 2-3 (Imperial)
const ratioSteps = [1.2, 1.4, 1.6, 1.8, 2.0];
const table23 = {
  rated30: { 1.2: 27.4, 1.4: 25.4, 1.6: 23.7, 1.8: 22.4, 2.0: 21.2 },
  allow45: { 1.2: 41.1, 1.4: 38.0, 1.6: 35.6, 1.8: 33.5, 2.0: 31.8 }
};

// Reduction factor table for 30 < V(z) <= 45 mph by main boom length (ft)
// Conservative rule: if between values, use the NEXT longer length (lower factor).
const reductionBreakpoints = [
  { len: 28.9, factor: 1.0 },
  { len: 40.0, factor: 0.9 },
  { len: 50.0, factor: 0.8 },
  { len: 60.0, factor: 0.8 },
  { len: 70.0, factor: 0.8 },
  { len: 80.0, factor: 0.7 },
  { len: 90.0, factor: 0.7 },
  { len: 95.2, factor: 0.7 }
];

function getSelectedRadio(name){
  const el = document.querySelector(`input[name="${name}"]:checked`);
  return el ? el.value : null;
}

function round2(x){ return Math.round(x * 100) / 100; }
function clamp(x, a, b){ return Math.max(a, Math.min(b, x)); }

function computeVzFromMeanWind(meanMph, tipHeightFt){
  const Z = Math.max(0, tipHeightFt);
  const V = Math.max(0, meanMph);
  const multiplier = (Math.pow((Z / 33.0), 0.14) + 0.4);
  return V * multiplier;
}

function reductionFactorForBoomLength(boomLenFt){
  const L = Math.max(0, boomLenFt);
  // ceiling to next breakpoint (conservative)
  for (const bp of reductionBreakpoints){
    if (L <= bp.len + 1e-9) return bp.factor;
  }
  // beyond table: stay conservative at lowest factor, but flag later
  return 0.7;
}

function nextHigherRatioStep(r){
  for (const s of ratioSteps){
    if (r <= s + 1e-12) return s;
  }
  return null; // exceeds table
}

function computeApFromDims(heightFt, lengthFt, shapeKey, orientation){
  const h = Math.max(0, heightFt);
  const l = Math.max(0, lengthFt);
  // Default (manual simplified) is Ap = max height * max length.
  // For end-on, only meaningful for cylinder/sphere if user can guarantee orientation.
  if (orientation === "endOn"){
    if (shapeKey === "cylinder" || shapeKey === "sphere"){
      const d = h; // in our UI: height = diameter for cylinder/sphere
      const r = d / 2;
      return Math.PI * r * r; // end-on projected area
    }
  }
  return h * l; // broadside/worst-case
}

function setResult(state, badge, title, reason, big){
  const card = $("resultCard");
  card.classList.remove("good","bad","warn","neutral");
  card.classList.add(state);
  $("badge").textContent = badge;
  $("resultTitle").textContent = title;
  $("resultReason").textContent = reason;
  $("bigOut").textContent = big;
}

function fillOutput(id, v){
  $(id).textContent = (v === null || v === undefined) ? "—" : String(v);
}

function refreshCdUI(){
  const key = $("shape").value;
  const opt = shapeCdOptions.find(x => x.key === key);
  if (!opt) return;
  $("cd").value = opt.def;
  $("cdRangeHint").textContent = opt.min === opt.max
    ? `Cd fixed at ${opt.def}`
    : `Cd range: ${opt.min} to ${opt.max} (default uses ${opt.def})`;
}

function init(){
  // populate beaufort
  beaufortTableMphMax.forEach(row => {
    const opt = document.createElement("option");
    opt.value = row.n;
    opt.textContent = `${row.n} — ${row.desc} (max ${row.mph} mph)`;
    $("beaufortNum").appendChild(opt);
  });
  $("beaufortNum").value = "4";

  // populate shape dropdown
  shapeCdOptions.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.key;
    opt.textContent = s.label;
    $("shape").appendChild(opt);
  });
  $("shape").value = "cylinder";
  refreshCdUI();

  // wind source switching
  windSourceRadios().forEach(r => r.addEventListener("change", () => {
    const v = getSelectedRadio("windSource");
    $("weatherFields").classList.toggle("hidden", v !== "weather");
    $("beaufortFields").classList.toggle("hidden", v !== "beaufort");
    $("tipFields").classList.toggle("hidden", v !== "tip");
  }));

  // ap mode switching
  apModeRadios().forEach(r => r.addEventListener("change", () => {
    const v = getSelectedRadio("apMode");
    $("apDimsFields").classList.toggle("hidden", v !== "dims");
    $("apDirectFields").classList.toggle("hidden", v !== "direct");
  }));

  $("shape").addEventListener("change", refreshCdUI);

  $("calcBtn").addEventListener("click", calculate);
}

function calculate(){
  // 1) Determine V(z)
  const windSource = getSelectedRadio("windSource");
  let vz = null;
  let tipHeight = null;

  if (windSource === "weather"){
    const mean = parseFloat($("windMeanMph").value || "0");
    tipHeight = parseFloat($("tipHeightFt").value || "0");
    vz = computeVzFromMeanWind(mean, tipHeight);
  } else if (windSource === "beaufort"){
    const n = parseInt($("beaufortNum").value, 10);
    const row = beaufortTableMphMax.find(x => x.n === n);
    const mean = row ? row.mph : 0;
    tipHeight = parseFloat($("tipHeightFt2").value || "0");
    vz = computeVzFromMeanWind(mean, tipHeight);
  } else { // tip
    vz = parseFloat($("vzInputMph").value || "0");
    tipHeight = parseFloat($("tipHeightFt3").value || "0");
  }

  vz = Math.max(0, vz);

  // 2) Gather crane/pick inputs
  const boomLen = parseFloat($("boomLengthFt").value || "0");
  const ratedCap = parseFloat($("ratedCapacityLb").value || "0");
  const loadW = parseFloat($("loadWeightLb").value || "0");

  // 3) Determine wind band and allowable capacity
  let band = null;
  let factor = 1.0;
  let mAllow = ratedCap;

  const beyondReductionTable = boomLen > 95.2 + 1e-9;

  if (vz > 45){
    band = ">45 mph (STOP)";
    factor = reductionFactorForBoomLength(boomLen);
    mAllow = ratedCap * factor;
  } else if (vz > 30){
    band = "30–45 mph band";
    factor = reductionFactorForBoomLength(boomLen);
    mAllow = ratedCap * factor;
  } else {
    band = "≤30 mph band";
    factor = 1.0;
    mAllow = ratedCap;
  }

  // 4) Compute Ap and Cd
  const shapeKey = $("shape").value;
  const apMode = getSelectedRadio("apMode");
  const orientation = getSelectedRadio("orientation");

  let ap = 0;
  if (apMode === "direct"){
    ap = parseFloat($("apDirect").value || "0");
  } else {
    const h = parseFloat($("dimHeightFt").value || "0");
    const l = parseFloat($("dimLengthFt").value || "0");
    ap = computeApFromDims(h, l, shapeKey, orientation);
  }
  ap = Math.max(0, ap);

  let cd = parseFloat($("cd").value || "0");
  cd = Math.max(0, cd);

  // (Optional) clamp Cd to known range for the selected shape (still allows manual override by editing)
  const shape = shapeCdOptions.find(x => x.key === shapeKey);
  let cdClamped = cd;
  if (shape){
    cdClamped = clamp(cd, shape.min, shape.max);
  }

  // 5) Compute Awr values
  const awrLoad = ap * cdClamped;
  const awrAllow = 0.0059 * mAllow; // ft^2

  const ratio = (awrAllow > 0) ? (awrLoad / awrAllow) : Infinity;

  // 6) Determine max permissible wind if ratio > 1
  const using45Row = (vz > 30 && vz <= 45);
  const rowKey = using45Row ? "allow45" : "rated30";

  let ratioStep = null;
  let vmax = null;
  let ratioOk = false;

  if (ratio <= 1.0){
    ratioOk = true;
    vmax = using45Row ? 45.0 : 30.0;
  } else {
    ratioStep = nextHigherRatioStep(ratio);
    if (ratioStep === null){
      vmax = null; // out of table
    } else {
      vmax = table23[rowKey][ratioStep];
    }
  }

  // 7) Decide GO / NO-GO with reasons
  const reasons = [];

  if (beyondReductionTable && vz > 30){
    reasons.push("Boom length exceeds reduction-factor table (used lowest factor 0.7).");
  }

  // hard stop
  if (vz > 45){
    reasons.push(`V(z) = ${round2(vz)} mph exceeds 45 mph hard limit.`);
  }

  // weight check
  if (loadW > mAllow){
    reasons.push(`Load weight (${loadW} lb) exceeds allowable load m(allow) (${round2(mAllow)} lb).`);
  }

  // area / ratio check
  if (!isFinite(ratio) || awrAllow <= 0){
    reasons.push("Awr(allow) is zero/invalid (check rated capacity input).");
  } else if (ratio <= 1.0){
    // OK on area at this band
  } else {
    if (ratioStep === null){
      reasons.push(`Ratio R=${round2(ratio)} exceeds Table 2-3 range (>2.0).`);
    } else if (vmax === null){
      reasons.push("Could not compute max permissible wind from Table 2-3.");
    } else if (vz > vmax){
      reasons.push(`V(z) = ${round2(vz)} mph exceeds Table 2-3 max permissible wind ${vmax} mph (ratio rounded to ${ratioStep}).`);
    }
  }

  const go =
    (vz <= 45) &&
    (loadW <= mAllow) &&
    (isFinite(ratio)) &&
    (
      ratio <= 1.0 ||
      (ratioStep !== null && vmax !== null && vz <= vmax)
    );

  // 8) UI outputs
  fillOutput("outVz", round2(vz));
  fillOutput("outBand", band);
  fillOutput("outFactor", round2(factor));
  fillOutput("outAllow", round2(mAllow));

  fillOutput("outAp", round2(ap));
  fillOutput("outCd", round2(cdClamped));
  fillOutput("outAwrLoad", round2(awrLoad));
  fillOutput("outAwrAllow", round2(awrAllow));

  fillOutput("outRatio", isFinite(ratio) ? round2(ratio) : "∞");
  fillOutput("outRatioStep", ratioStep ?? (ratio <= 1.0 ? "≤1.0" : "—"));
  fillOutput("outVmax", vmax ?? (ratio <= 1.0 ? (using45Row ? 45.0 : 30.0) : "—"));

  if (go){
    setResult(
      "good",
      "GO",
      "GO",
      reasons.length ? reasons.join(" ") : "Within manual limits for this input set.",
      "GO"
    );
  } else {
    // pick severity
    let state = "bad";
    let badge = "NO-GO";
    if (reasons.some(r => r.includes("exceeds 45 mph hard limit"))) state = "bad";
    else if (reasons.some(r => r.includes("exceeds Table 2-3")) || reasons.some(r => r.includes("exceeds allowable load"))) state = "bad";
    else state = "warn";

    setResult(
      state,
      badge,
      "NO-GO",
      reasons.length ? reasons.join(" ") : "Not within manual limits for this input set.",
      "NO"
    );
  }
}

init();
