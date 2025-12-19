const $ = (id) => document.getElementById(id);

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

// Cd table (from your manual photo). Defaults use the max of the range (conservative).
const shapeCdOptions = [
  { key: "box", label: "Box / Flat-sided (1.1–2.0)", min: 1.1, max: 2.0, def: 2.0 },
  { key: "sphere", label: "Sphere (0.3–0.4)", min: 0.3, max: 0.4, def: 0.4 },
  { key: "cylinder", label: "Cylinder (0.8–1.0)", min: 0.8, max: 1.0, def: 1.0 },
  { key: "roundedHigh", label: "Rounded (0.8–1.2)", min: 0.8, max: 1.2, def: 1.2 },
  { key: "roundedLow", label: "Rounded (0.2–0.3)", min: 0.2, max: 0.3, def: 0.3 },
  { key: "streamlined", label: "Streamlined (0.05–0.1)", min: 0.05, max: 0.1, def: 0.1 },
  { key: "turbine", label: "Turbine blade / rotor (≈1.6)", min: 1.6, max: 1.6, def: 1.6 }
];

// Ratio table 2-3 (Imperial)
const ratioSteps = [1.2, 1.4, 1.6, 1.8, 2.0];
const table23 = {
  rated30: { 1.2: 27.4, 1.4: 25.4, 1.6: 23.7, 1.8: 22.4, 2.0: 21.2 },
  allow45: { 1.2: 41.1, 1.4: 38.0, 1.6: 35.6, 1.8: 33.5, 2.0: 31.8 }
};

// Capacity reduction factors for 30 < V(z) <= 45 mph (main boom, fully extended outriggers)
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

// conservative: if between values, use next longer (ceiling)
function reductionFactorForBoomLength(boomLenFt){
  const L = Math.max(0, boomLenFt);
  for (const bp of reductionBreakpoints){
    if (L <= bp.len + 1e-9) return bp.factor;
  }
  return 0.7;
}

function nextHigherRatioStep(r){
  for (const s of ratioSteps){
    if (r <= s + 1e-12) return s;
  }
  return null;
}

// Advanced dims Ap
function computeApFromDims(heightFt, lengthFt, shapeKey, orientation){
  const h = Math.max(0, heightFt);
  const l = Math.max(0, lengthFt);

  if (orientation === "endOn"){
    if (shapeKey === "cylinder" || shapeKey === "sphere"){
      const d = h; // if user uses advanced dims: treat height as diameter for cylinder/sphere
      const r = d / 2;
      return Math.PI * r * r;
    }
  }
  return h * l;
}

// Quick Inputs Ap
function computeApQuick(shapeKey, orientation){
  if (shapeKey === "cylinder"){
    const diaIn = parseFloat($("cylDiaIn").value || "0");
    const lenFt = parseFloat($("cylLenFt").value || "0");
    const diaFt = Math.max(0, diaIn) / 12.0;
    if (orientation === "endOn"){
      const r = diaFt / 2;
      return Math.PI * r * r;
    }
    return Math.max(0, lenFt) * diaFt;
  }

  if (shapeKey === "box"){
    const hIn = parseFloat($("boxHeightIn").value || "0");
    const lenFt = parseFloat($("boxLenFt").value || "0");
    const hFt = Math.max(0, hIn) / 12.0;
    return hFt * Math.max(0, lenFt);
  }

  if (shapeKey === "sphere"){
    const diaIn = parseFloat($("sphDiaIn").value || "0");
    const diaFt = Math.max(0, diaIn) / 12.0;
    const r = diaFt / 2;
    return Math.PI * r * r;
  }

  return null;
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

function refreshQuickUI(){
  const shapeKey = $("shape").value;
  const apMode = getSelectedRadio("apMode");

  const showQuick = apMode === "quick";
  $("apQuickFields").classList.toggle("hidden", !showQuick);

  if (!showQuick) return;

  const cyl = $("quickCylinder");
  const box = $("quickBox");
  const sph = $("quickSphere");
  const unsup = $("quickUnsupported");

  cyl.classList.add("hidden");
  box.classList.add("hidden");
  sph.classList.add("hidden");
  unsup.classList.add("hidden");

  if (shapeKey === "cylinder") cyl.classList.remove("hidden");
  else if (shapeKey === "box") box.classList.remove("hidden");
  else if (shapeKey === "sphere") sph.classList.remove("hidden");
  else unsup.classList.remove("hidden");
}

function init(){
  // Beaufort dropdown
  beaufortTableMphMax.forEach(row => {
    const opt = document.createElement("option");
    opt.value = row.n;
    opt.textContent = `${row.n} — ${row.desc} (max ${row.mph} mph)`;
    $("beaufortNum").appendChild(opt);
  });
  $("beaufortNum").value = "4";

  // Shape dropdown
  shapeCdOptions.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s.key;
    opt.textContent = s.label;
    $("shape").appendChild(opt);
  });
  $("shape").value = "cylinder";
  refreshCdUI();
  refreshQuickUI();

  // Wind source switching
  document.querySelectorAll('input[name="windSource"]').forEach(r => r.addEventListener("change", () => {
    const v = getSelectedRadio("windSource");
    $("weatherFields").classList.toggle("hidden", v !== "weather");
    $("beaufortFields").classList.toggle("hidden", v !== "beaufort");
    $("tipFields").classList.toggle("hidden", v !== "tip");
  }));

  // Ap mode switching
  document.querySelectorAll('input[name="apMode"]').forEach(r => r.addEventListener("change", () => {
    const v = getSelectedRadio("apMode");
    $("apDimsFields").classList.toggle("hidden", v !== "dims");
    $("apDirectFields").classList.toggle("hidden", v !== "direct");
    refreshQuickUI();
  }));

  $("shape").addEventListener("change", () => {
    refreshCdUI();
    refreshQuickUI();
  });

  // Re-render quick UI if orientation changes
  document.querySelectorAll('input[name="orientation"]').forEach(r => r.addEventListener("change", refreshQuickUI));

  $("calcBtn").addEventListener("click", calculate);
}

function calculate(){
  // 1) Determine V(z)
  const windSource = getSelectedRadio("windSource");
  let vz = 0;
  let tipHeight = 0;

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
  } else {
    vz = parseFloat($("vzInputMph").value || "0");
    tipHeight = parseFloat($("tipHeightFt3").value || "0");
  }
  vz = Math.max(0, vz);

  // 2) Inputs
  const boomLen = parseFloat($("boomLengthFt").value || "0");
  const ratedCap = parseFloat($("ratedCapacityLb").value || "0");
  const loadW = parseFloat($("loadWeightLb").value || "0");

  // 3) Allowable capacity with reduction factor
  let band = "";
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

  // 4) Ap and Cd
  const shapeKey = $("shape").value;
  const apMode = getSelectedRadio("apMode");
  const orientation = getSelectedRadio("orientation");

  let ap = 0;
  if (apMode === "direct"){
    ap = parseFloat($("apDirect").value || "0");
  } else if (apMode === "dims"){
    const h = parseFloat($("dimHeightFt").value || "0");
    const l = parseFloat($("dimLengthFt").value || "0");
    ap = computeApFromDims(h, l, shapeKey, orientation);
  } else { // quick
    const q = computeApQuick(shapeKey, orientation);
    if (q === null){
      // fallback: user must choose advanced/direct
      ap = 0;
    } else {
      ap = q;
    }
  }
  ap = Math.max(0, ap);

  let cd = parseFloat($("cd").value || "0");
  cd = Math.max(0, cd);

  const shape = shapeCdOptions.find(x => x.key === shapeKey);
  let cdClamped = cd;
  if (shape){
    cdClamped = clamp(cd, shape.min, shape.max);
  }

  const awrLoad = ap * cdClamped;
  const awrAllow = 0.0059 * mAllow;
  const ratio = (awrAllow > 0) ? (awrLoad / awrAllow) : Infinity;

  // 5) Table selection
  const using45Row = (vz > 30 && vz <= 45);
  const rowKey = using45Row ? "allow45" : "rated30";

  let ratioStep = null;
  let vmax = null;

  if (ratio <= 1.0){
    vmax = using45Row ? 45.0 : 30.0;
  } else {
    ratioStep = nextHigherRatioStep(ratio);
    if (ratioStep !== null){
      vmax = table23[rowKey][ratioStep];
    }
  }

  // 6) Reasons / GO logic
  const reasons = [];

  if (beyondReductionTable && vz > 30){
    reasons.push("Boom length exceeds reduction-factor table (used lowest factor 0.7).");
  }

  if (vz > 45){
    reasons.push(`V(z) = ${round2(vz)} mph exceeds 45 mph hard limit.`);
  }

  if (loadW > mAllow){
    reasons.push(`Load weight (${loadW} lb) exceeds allowable load m(allow) (${round2(mAllow)} lb).`);
  }

  if (!isFinite(ratio) || awrAllow <= 0){
    reasons.push("Awr(allow) is zero/invalid (check rated capacity input).");
  } else if (ratio > 1.0){
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

  // 7) Outputs
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
  fillOutput("outVmax", vmax ?? "—");

  if (go){
    setResult("good", "GO", "GO", reasons.length ? reasons.join(" ") : "Within manual limits for this input set.", "GO");
  } else {
    const state = reasons.some(r => r.includes("exceeds 45 mph")) ? "bad" : "bad";
    setResult(state, "NO-GO", "NO-GO", reasons.length ? reasons.join(" ") : "Not within manual limits for this input set.", "NO");
  }
}

init();
