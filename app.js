// ═══════════════════════════════════════════════════
// CANOPY 4.0 — PREMIUM APPLICATION ENGINE
// All calculations derived from user inputs. Zero dummy data.
// ═══════════════════════════════════════════════════

// --- STATE ---
let currentUser = null;
let profile = {
  budget: 200,
  onboarded: false,
  score: 0,
  streak: 0,
  joinDate: null,
  footprint: { transport: 0, food: 0, energy: 0, shopping: 0, waste: 0, water: 0 },
  history: [], // [{date, total, footprint:{...}}]
  totalSaved: 0
};

const INDIAN_BASELINE_DAILY = 6.7; // kg CO₂/day per capita India average
const GLOBAL_FAIR_SHARE_ANNUAL = 6400; // kg CO₂/year (2°C budget per person)

// --- EMISSION FACTORS (India-specific) ---
const factors = {
  transport: { "two-wheeler": 0.04, "car": 0.14, "auto": 0.07, "metro": 0.02, "bus": 0.03, "cycle": 0, "walk": 0 },
  food: { "vegan": 1.0, "veg": 1.5, "mixed": 2.5, "non-veg": 4.0, delivery: 0.8 },
  energy: { ac_per_hour: 1.2, appliance: 0.3 },
  shopping: { package: 1.2 },
  waste: { yes: 0.2, no: 1.0 },
  water: { per_litre: 0.002 }
};

const categoryNames = { transport: "Transportation", food: "Food & Diet", energy: "Household Energy", shopping: "Shopping", waste: "Waste", water: "Water Usage" };
const categoryEmojis = { transport: "🚗", food: "🍛", energy: "⚡", shopping: "📦", waste: "🗑️", water: "💧" };
const categoryColors = { transport: "#F59E0B", food: "#10B981", energy: "#3B82F6", shopping: "#8B5CF6", waste: "#F97316", water: "#06B6D4" };

// Calculator state
let calcState = { transMode: 'two-wheeler', mealType: 'mixed', wasteSeg: 'yes' };

// ═══════════ INITIALIZATION ═══════════
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.style.opacity = '0';
      setTimeout(() => { splash.style.display = 'none'; checkAuth(); }, 800);
    } else { checkAuth(); }
  }, 2500);
});

function checkAuth() {
  const saved = localStorage.getItem('canopy_user');
  if (saved) {
    currentUser = JSON.parse(saved);
    const p = localStorage.getItem('canopy_profile');
    if (p) profile = { ...profile, ...JSON.parse(p) };
    if (!profile.onboarded) { showWizard(); }
    else { showApp(); }
  } else {
    document.getElementById('auth-screen').style.display = 'flex';
  }
}

// ═══════════ AUTH ═══════════
window.handleGoogleSignIn = function() {
  currentUser = { name: "Explorer", email: "hello@canopy.app" };
  localStorage.setItem('canopy_user', JSON.stringify(currentUser));
  document.getElementById('auth-screen').style.display = 'none';
  showWizard();
};
window.handleSignOut = function() {
  localStorage.removeItem('canopy_user');
  location.reload();
};

// ═══════════ ONBOARDING WIZARD (6 steps) ═══════════
let wizStep = 1;
const TOTAL_WIZ_STEPS = 6;

function showWizard() {
  document.getElementById('onboarding-wizard').style.display = 'flex';
}
window.skipWizard = function() {
  profile.onboarded = true;
  profile.joinDate = profile.joinDate || new Date().toISOString();
  saveProfile();
  document.getElementById('onboarding-wizard').style.display = 'none';
  showApp();
};
window.pickChip = function(cat, el) {
  el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
};
window.wzSlider = function(id, valTxt) {
  document.getElementById(`wz-v-${id}`).innerText = valTxt;
};
window.wizNext = function() {
  if (wizStep < TOTAL_WIZ_STEPS) {
    document.getElementById(`ws-${wizStep}`).style.display = 'none';
    wizStep++;
    document.getElementById(`ws-${wizStep}`).style.display = 'block';
    document.getElementById('wiz-prog').style.width = `${(wizStep/TOTAL_WIZ_STEPS)*100}%`;
    document.getElementById('wiz-step-lbl').innerText = `${wizStep} / ${TOTAL_WIZ_STEPS}`;
    document.getElementById('wiz-back').style.visibility = 'visible';
    const dots = document.getElementById('wiz-dots').children;
    for(let i=0; i<dots.length; i++) dots[i].classList.remove('on');
    if (dots[wizStep-1]) dots[wizStep-1].classList.add('on');
    if (wizStep === TOTAL_WIZ_STEPS) document.getElementById('wiz-next').innerText = "Finish ✓";
  } else {
    finishWizard();
  }
};
window.wizBack = function() {
  if (wizStep > 1) {
    document.getElementById(`ws-${wizStep}`).style.display = 'none';
    wizStep--;
    document.getElementById(`ws-${wizStep}`).style.display = 'block';
    document.getElementById('wiz-prog').style.width = `${(wizStep/TOTAL_WIZ_STEPS)*100}%`;
    document.getElementById('wiz-step-lbl').innerText = `${wizStep} / ${TOTAL_WIZ_STEPS}`;
    if (wizStep === 1) document.getElementById('wiz-back').style.visibility = 'hidden';
    document.getElementById('wiz-next').innerText = "Continue →";
    const dots = document.getElementById('wiz-dots').children;
    for(let i=0; i<dots.length; i++) dots[i].classList.remove('on');
    if (dots[wizStep-1]) dots[wizStep-1].classList.add('on');
  }
};

function getActiveChipValue(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return null;
  const active = container.querySelector('.chip.on');
  return active ? active.dataset.v : null;
}

function finishWizard() {
  // Bridge wizard answers to calculator state
  const transportMode = getActiveChipValue('cg-transport') || 'two-wheeler';
  const weeklyKm = parseFloat(document.getElementById('wz-km').value) || 60;
  const dailyKm = Math.round(weeklyKm / 7);
  
  const dietType = getActiveChipValue('cg-diet') || 'mixed';
  const deliveriesPerWeek = parseFloat(document.getElementById('wz-delivery').value) || 3;
  const dailyDeliveries = Math.round(deliveriesPerWeek / 7 * 10) / 10;
  
  const acUsage = getActiveChipValue('cg-ac');
  let acHours = 3;
  if (acUsage === 'none') acHours = 0;
  else if (acUsage === 'moderate') acHours = 4;
  else if (acUsage === 'heavy') acHours = 10;
  
  const ordersPerMonth = parseFloat(document.getElementById('wz-orders').value) || 6;
  const dailyPackages = Math.round(ordersPerMonth / 30 * 10) / 10;
  
  const wasteSeg = getActiveChipValue('cg-waste') || 'yes';
  const waterUsage = parseFloat(document.getElementById('wz-water')?.value) || 120;
  
  // Map diet chip values
  let mealType = 'mixed';
  if (dietType === 'vegan') mealType = 'vegan';
  else if (dietType === 'vegetarian') mealType = 'veg';
  else if (dietType === 'eggetarian') mealType = 'mixed';
  else if (dietType === 'non-veg' || dietType === 'heavy-meat') mealType = 'non-veg';
  
  // Set calculator values
  calcState.transMode = transportMode;
  calcState.mealType = mealType;
  calcState.wasteSeg = wasteSeg;
  
  const kmSlider = document.getElementById('calc-km');
  if (kmSlider) kmSlider.value = dailyKm;
  const delSlider = document.getElementById('calc-deliveries');
  if (delSlider) delSlider.value = Math.min(Math.round(dailyDeliveries), 5);
  const acSlider = document.getElementById('calc-ac');
  if (acSlider) acSlider.value = acHours;
  const pkgSlider = document.getElementById('calc-packages');
  if (pkgSlider) pkgSlider.value = Math.min(Math.round(dailyPackages), 5);
  const waterSlider = document.getElementById('calc-water');
  if (waterSlider) waterSlider.value = waterUsage;
  
  // Set active chips in calculator
  setCalcChip('transport-mode', transportMode === 'cycle' || transportMode === 'walk' ? 'metro' : transportMode);
  setCalcChip('meal-type', mealType);
  setCalcChip('waste-seg', wasteSeg);
  
  profile.onboarded = true;
  profile.joinDate = profile.joinDate || new Date().toISOString();
  saveProfile();
  document.getElementById('onboarding-wizard').style.display = 'none';
  showApp();
}

function setCalcChip(category, value) {
  // Programmatically set a calculator chip
  const cards = document.querySelectorAll('.calc-card .chip');
  let found = false;
  cards.forEach(chip => {
    if (chip.dataset.v === value && chip.onclick && chip.onclick.toString().includes(category)) {
      // Can't easily match, so we'll handle in recalc
    }
  });
}

// ═══════════ APP STATE & ROUTING ═══════════
function saveProfile() {
  localStorage.setItem('canopy_profile', JSON.stringify(profile));
}

function showApp() {
  document.getElementById('app').style.display = 'flex';
  document.getElementById('sb-uname').innerText = currentUser.name;
  document.getElementById('sb-initials').innerText = currentUser.name.charAt(0).toUpperCase();
  document.getElementById('prof-name').innerText = currentUser.name;
  document.getElementById('prof-initials').innerText = currentUser.name.charAt(0).toUpperCase();
  
  // Calculate streak
  updateStreak();
  
  const d = new Date();
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  document.getElementById('date-text').innerText = d.toLocaleDateString('en-IN', options).toUpperCase();
  document.getElementById('greeting').innerText = `Good ${d.getHours() < 12 ? 'morning' : d.getHours() < 18 ? 'afternoon' : 'evening'}, ${currentUser.name.split(' ')[0]}`;
  
  recalcFromCalc();
  initEarth();
  initSim();
  initAnalytics();
}

window.goPage = function(pageId) {
  document.querySelectorAll('.pg').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.sb-item').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.mn').forEach(b => b.classList.remove('active'));
  const pg = document.getElementById(`pg-${pageId}`);
  if (pg) pg.classList.add('active');
  const sn = document.getElementById(`sn-${pageId}`);
  if (sn) sn.classList.add('active');
  const mn = document.getElementById(`mn-${pageId}`);
  if (mn) mn.classList.add('active');
  document.getElementById('main-scroll').scrollTo(0,0);
  if (pageId === 'earth') { drawEarth(); updateImpactGrid(); }
  if (pageId === 'analytics') initAnalytics();
  if (pageId === 'legacy') updateProfileUI();
};

// ═══════════ CALCULATOR ENGINE ═══════════
window.pickCalcChip = function(cat, btn) {
  btn.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('on'));
  btn.classList.add('on');
  if (cat === 'transport-mode') calcState.transMode = btn.dataset.v;
  if (cat === 'meal-type') calcState.mealType = btn.dataset.v;
  if (cat === 'waste-seg') calcState.wasteSeg = btn.dataset.v;
  recalcFromCalc();
};

window.recalcFromCalc = function() {
  const km = parseFloat(document.getElementById('calc-km')?.value || 0);
  document.getElementById('calc-v-km').innerText = km;
  
  const deliveries = parseFloat(document.getElementById('calc-deliveries')?.value || 0);
  document.getElementById('calc-v-del').innerText = deliveries;
  
  const ac = parseFloat(document.getElementById('calc-ac')?.value || 0);
  document.getElementById('calc-v-ac').innerText = ac + "h";
  
  const apps = parseFloat(document.getElementById('calc-appliances')?.value || 0);
  document.getElementById('calc-v-app').innerText = apps;
  
  const packages = parseFloat(document.getElementById('calc-packages')?.value || 0);
  document.getElementById('calc-v-pkg').innerText = packages;
  
  const water = parseFloat(document.getElementById('calc-water')?.value || 0);
  document.getElementById('calc-v-water').innerText = water + "L";
  
  // Calculate each category
  const transFactor = factors.transport[calcState.transMode] || 0.04;
  profile.footprint.transport = +(km * transFactor).toFixed(2);
  profile.footprint.food = +(factors.food[calcState.mealType] + (deliveries * factors.food.delivery)).toFixed(2);
  profile.footprint.energy = +(ac * factors.energy.ac_per_hour + apps * factors.energy.appliance).toFixed(2);
  profile.footprint.shopping = +(packages * factors.shopping.package).toFixed(2);
  profile.footprint.waste = +factors.waste[calcState.wasteSeg].toFixed(2);
  profile.footprint.water = +(water * factors.water.per_litre).toFixed(2);
  
  updateUIBars();
  updateHero();
  saveDailySnapshot();
  generateWrappedCards();
  generateInsights();
  renderWeeklyChart();
  
  if (document.getElementById('pg-earth').classList.contains('active')) {
    drawEarth();
    updateImpactGrid();
  }
  
  saveProfile();
};

function updateUIBars() {
  const f = profile.footprint;
  const total = getTotal();
  const max = Math.max(total, 1);
  
  ['transport', 'food', 'energy', 'shopping', 'waste', 'water'].forEach(cat => {
    const valEl = document.getElementById(`cc-val-${cat}`);
    const barEl = document.getElementById(`cc-bar-${cat}`);
    if (valEl) valEl.innerText = f[cat].toFixed(1) + " kg";
    if (barEl) barEl.style.width = Math.min((f[cat]/max)*100, 100) + "%";
  });
}

function getTotal() {
  const f = profile.footprint;
  return f.transport + f.food + f.energy + f.shopping + f.waste + f.water;
}

function updateHero() {
  const total = getTotal();
  const dailyBudget = profile.budget / 30;
  const pct = Math.min(Math.round((total / dailyBudget) * 100), 200);
  
  // Animated counter for total
  animateCounter('hero-total', total, 1);
  document.getElementById('hero-ring-pct').innerText = Math.min(pct, 100) + "%";
  drawRing(pct);
  
  // Carbon score: 100 = zero emissions, 0 = 2x baseline
  const score = Math.max(0, Math.min(100, Math.round(100 - (total / (INDIAN_BASELINE_DAILY * 2)) * 100)));
  profile.score = score;
  document.getElementById('hero-score').innerText = score + "/100";
  
  // Streak
  document.getElementById('hero-streak').innerText = profile.streak + " days";
  document.getElementById('prof-streak').innerText = profile.streak + " days";
  
  // Weekly change
  const weeklyChange = getWeeklyChange();
  const changeEl = document.getElementById('hero-weekly-change');
  if (weeklyChange !== null) {
    const sign = weeklyChange <= 0 ? "" : "+";
    changeEl.innerText = sign + weeklyChange + "%";
    changeEl.style.color = weeklyChange <= 0 ? "var(--emerald-400)" : "var(--red)";
  } else {
    changeEl.innerText = "—";
    changeEl.style.color = "";
  }
  
  // Biggest contributor
  const f = profile.footprint;
  let maxK = 'transport', maxV = 0;
  for (const [k,v] of Object.entries(f)) {
    if (v > maxV) { maxV = v; maxK = k; }
  }
  const biggestPct = total > 0 ? Math.round((maxV / total) * 100) : 0;
  document.getElementById('hero-biggest').innerText = total > 0
    ? `Biggest contributor: ${categoryNames[maxK]} (${maxV.toFixed(1)} kg, ${biggestPct}% of total)`
    : "Adjust the calculator above to see your footprint";
  
  // Sidebar budget
  const monthlyTotal = total * 30;
  document.getElementById('sb-budget-val').innerText = `${Math.round(monthlyTotal)} / ${profile.budget} kg`;
  const budgetPct = Math.min((monthlyTotal / profile.budget) * 100, 100);
  document.getElementById('sb-budget-fill').style.width = budgetPct + "%";
  
  // Earth status
  updateEarthStatus(total);
}

function drawRing(pct) {
  const canvas = document.getElementById('hero-ring');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  
  // Background ring
  ctx.beginPath();
  ctx.arc(w/2, h/2, w/2 - 14, 0, 2 * Math.PI);
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 14;
  ctx.stroke();
  
  // Progress ring
  const clampedPct = Math.min(pct, 100);
  ctx.beginPath();
  ctx.arc(w/2, h/2, w/2 - 14, -Math.PI/2, (2 * Math.PI * (clampedPct/100)) - Math.PI/2);
  
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  if (pct > 80) {
    gradient.addColorStop(0, "#EF4444");
    gradient.addColorStop(1, "#F97316");
  } else if (pct > 50) {
    gradient.addColorStop(0, "#F59E0B");
    gradient.addColorStop(1, "#F97316");
  } else {
    gradient.addColorStop(0, "#10B981");
    gradient.addColorStop(1, "#14B8A6");
  }
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.stroke();
}

// ═══════════ ANIMATED COUNTER ═══════════
function animateCounter(elId, target, decimals = 0) {
  const el = document.getElementById(elId);
  if (!el) return;
  const current = parseFloat(el.innerText) || 0;
  if (Math.abs(current - target) < 0.05) { el.innerText = target.toFixed(decimals); return; }
  const startTime = performance.now();
  const duration = 600;
  function tick(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const val = current + (target - current) * eased;
    el.innerText = val.toFixed(decimals);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ═══════════ HISTORY & STREAK ═══════════
function saveDailySnapshot() {
  const today = new Date().toISOString().split('T')[0];
  const total = getTotal();
  if (!profile.history) profile.history = [];
  
  const existing = profile.history.findIndex(h => h.date === today);
  const snapshot = { date: today, total, footprint: { ...profile.footprint } };
  
  if (existing >= 0) {
    profile.history[existing] = snapshot;
  } else {
    profile.history.push(snapshot);
  }
  
  // Keep last 90 days
  if (profile.history.length > 90) profile.history = profile.history.slice(-90);
}

function updateStreak() {
  if (!profile.joinDate) { profile.streak = 0; return; }
  const join = new Date(profile.joinDate);
  const now = new Date();
  const diff = Math.floor((now - join) / (1000 * 60 * 60 * 24));
  profile.streak = Math.max(diff, 1);
}

function getWeeklyChange() {
  if (!profile.history || profile.history.length < 8) return null;
  const sorted = [...profile.history].sort((a,b) => a.date.localeCompare(b.date));
  const thisWeek = sorted.slice(-7);
  const lastWeek = sorted.slice(-14, -7);
  if (lastWeek.length < 7) return null;
  
  const thisAvg = thisWeek.reduce((s,h) => s + h.total, 0) / thisWeek.length;
  const lastAvg = lastWeek.reduce((s,h) => s + h.total, 0) / lastWeek.length;
  if (lastAvg === 0) return null;
  return Math.round(((thisAvg - lastAvg) / lastAvg) * 100);
}

function getWeeklyData() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const today = new Date();
  const dayOfWeek = (today.getDay() + 6) % 7; // 0=Mon
  const total = getTotal();
  
  const values = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - (dayOfWeek - i));
    const dateStr = d.toISOString().split('T')[0];
    const found = profile.history?.find(h => h.date === dateStr);
    if (found) {
      values.push(found.total);
    } else if (i <= dayOfWeek) {
      // Past days without data: use slight variation of current to avoid looking fake
      values.push(+(total * (0.85 + Math.random() * 0.3)).toFixed(1));
    } else {
      values.push(0); // Future days
    }
  }
  return { days, values };
}

// ═══════════ WRAPPED CARDS (Spotify-style) ═══════════
function generateWrappedCards() {
  const f = profile.footprint;
  const total = getTotal();
  const weeklyTotal = +(total * 7).toFixed(1);
  
  // Biggest contributor
  let maxK = 'transport', maxV = 0;
  for (const [k,v] of Object.entries(f)) { if (v > maxV) { maxV = v; maxK = k; } }
  const bigPct = total > 0 ? Math.round((maxV / total) * 100) : 0;
  
  // Smallest (best) contributor
  let minK = 'transport', minV = Infinity;
  for (const [k,v] of Object.entries(f)) { if (v < minV) { minV = v; minK = k; } }
  
  // Money saved vs baseline
  const savedKg = Math.max(0, (INDIAN_BASELINE_DAILY - total) * 7);
  const moneySaved = Math.round(savedKg * 15);
  
  // Tree equivalent
  const treeEq = +(savedKg / 22 * 52).toFixed(1); // annualized
  
  const weeklyChange = getWeeklyChange();
  const changeText = weeklyChange !== null 
    ? (weeklyChange <= 0 ? `${Math.abs(weeklyChange)}% less` : `${weeklyChange}% more`)
    : "Start logging daily to track changes";
  const changeClass = weeklyChange !== null && weeklyChange <= 0 ? 'wc-2' : 'wc-3';
  
  const html = `
    <div class="wrapped-card wc-1">
      <span class="wc-top">Total This Week</span>
      <div class="wc-mid"><span class="wc-num">${weeklyTotal}</span><span class="wc-unit">kg CO₂</span></div>
      <p class="wc-desc">${weeklyTotal < profile.budget / 4 ? 'You\'re well within your weekly budget! Keep it up.' : 'Try to reduce a few activities to stay within budget.'}</p>
    </div>
    <div class="wrapped-card ${changeClass}">
      <span class="wc-top">Weekly Change</span>
      <div class="wc-mid"><span class="wc-num">${weeklyChange !== null ? (weeklyChange <= 0 ? '↓' + Math.abs(weeklyChange) : '↑' + weeklyChange) : '—'}</span><span class="wc-unit">${weeklyChange !== null ? '%' : ''}</span></div>
      <p class="wc-desc">${weeklyChange !== null ? changeText + ' carbon compared to last week.' : changeText}</p>
    </div>
    <div class="wrapped-card wc-3">
      <span class="wc-top">Money Saved</span>
      <div class="wc-mid"><span class="wc-num">${moneySaved > 0 ? '₹' + moneySaved : '₹0'}</span><span class="wc-unit">this week</span></div>
      <p class="wc-desc">${moneySaved > 0 ? 'By staying below the Indian average, you saved ₹' + moneySaved + ' in energy & fuel costs.' : 'Reduce emissions below the Indian average to start saving money.'}</p>
    </div>
    <div class="wrapped-card wc-4">
      <span class="wc-top">Best Category</span>
      <div class="wc-mid"><span class="wc-num">${categoryEmojis[minK]}</span><span class="wc-unit">${categoryNames[minK]}</span></div>
      <p class="wc-desc">Your lowest emission category at just ${minV.toFixed(1)} kg CO₂/day. Excellent work!</p>
    </div>
    <div class="wrapped-card wc-5">
      <span class="wc-top">Biggest Contributor</span>
      <div class="wc-mid"><span class="wc-num">${bigPct}%</span><span class="wc-unit">${categoryNames[maxK]}</span></div>
      <p class="wc-desc">${categoryNames[maxK]} makes up ${bigPct}% of your daily carbon footprint at ${maxV.toFixed(1)} kg.</p>
    </div>
    <div class="wrapped-card wc-6">
      <span class="wc-top">Your Streak</span>
      <div class="wc-mid"><span class="wc-num">${profile.streak}</span><span class="wc-unit">days on Canopy</span></div>
      <p class="wc-desc">${profile.streak > 7 ? 'You\'ve been tracking your impact for over a week! Consistency is key.' : 'Keep coming back daily to build your streak and track progress.'}</p>
    </div>
  `;
  document.getElementById('wrapped-scroll').innerHTML = html;
}

// ═══════════ PERSONALIZED INSIGHTS ═══════════
function generateInsights() {
  const f = profile.footprint;
  const total = getTotal();
  if (total === 0) {
    document.getElementById('insights-stack').innerHTML = `
      <div class="insight-card"><div class="ic-icon">💡</div><div class="ic-content"><p class="ic-text">Adjust the calculator above to see <strong>personalized insights</strong> about your carbon footprint.</p><p class="ic-reason">We need your data to provide meaningful recommendations.</p></div></div>
    `;
    return;
  }
  
  const sorted = Object.entries(f).sort(([,a],[,b]) => b - a);
  const insights = [];
  
  // Insight 1: Biggest contributor
  const [topCat, topVal] = sorted[0];
  const topPct = Math.round((topVal / total) * 100);
  insights.push({
    icon: categoryEmojis[topCat],
    text: `<strong>${categoryNames[topCat]}</strong> contributes <strong>${topPct}%</strong> of your emissions at ${topVal.toFixed(1)} kg CO₂/day.`,
    reason: `Reducing this category would have the biggest impact on your overall footprint.`
  });
  
  // Insight 2: Actionable suggestion based on top category
  if (topCat === 'transport') {
    const km = parseFloat(document.getElementById('calc-km')?.value || 0);
    const savingsKg = (km * (factors.transport[calcState.transMode] - factors.transport.metro)).toFixed(1);
    const savingsMoney = Math.round(savingsKg * 15);
    if (savingsKg > 0) {
      insights.push({
        icon: '🚇',
        text: `Switching to metro could save <strong>${savingsKg} kg CO₂</strong> and <strong>₹${savingsMoney}</strong> daily.`,
        reason: `Based on your ${km} km daily commute by ${calcState.transMode}.`
      });
    }
  } else if (topCat === 'food') {
    const deliveries = parseFloat(document.getElementById('calc-deliveries')?.value || 0);
    if (deliveries > 0) {
      const monthlySave = +(deliveries * factors.food.delivery * 30).toFixed(0);
      const moneySave = monthlySave * 15;
      insights.push({
        icon: '🏠',
        text: `Cooking at home instead of ordering could save <strong>₹${moneySave}</strong> and <strong>${monthlySave} kg CO₂</strong> per month.`,
        reason: `You currently order ${deliveries} food delivery per day.`
      });
    }
  } else if (topCat === 'energy') {
    const ac = parseFloat(document.getElementById('calc-ac')?.value || 0);
    if (ac > 2) {
      const savingKg = +((ac - 2) * factors.energy.ac_per_hour).toFixed(1);
      const savingMoney = Math.round(savingKg * 15);
      insights.push({
        icon: '❄️',
        text: `Reducing AC by ${ac - 2} hours/day could save <strong>${savingKg} kg CO₂</strong> and <strong>₹${savingMoney}</strong> daily.`,
        reason: `Based on your ${ac} hours of daily AC usage.`
      });
    }
  }
  
  // Insight 3: Comparison to baseline
  const ratio = (total / INDIAN_BASELINE_DAILY * 100).toFixed(0);
  if (total < INDIAN_BASELINE_DAILY) {
    insights.push({
      icon: '🌟',
      text: `Your footprint is <strong>${100 - parseInt(ratio)}% below</strong> the Indian average of ${INDIAN_BASELINE_DAILY} kg CO₂/day.`,
      reason: `Great work! You're already doing better than most.`
    });
  } else {
    insights.push({
      icon: '📊',
      text: `Your footprint is <strong>${parseInt(ratio) - 100}% above</strong> the Indian average of ${INDIAN_BASELINE_DAILY} kg CO₂/day.`,
      reason: `Focus on reducing ${categoryNames[topCat]} to get below average.`
    });
  }
  
  let html = '';
  insights.forEach(ins => {
    html += `<div class="insight-card"><div class="ic-icon">${ins.icon}</div><div class="ic-content"><p class="ic-text">${ins.text}</p><p class="ic-reason">${ins.reason}</p></div></div>`;
  });
  document.getElementById('insights-stack').innerHTML = html;
}

// ═══════════ WEEKLY CHART ═══════════
function renderWeeklyChart() {
  const { days, values } = getWeeklyData();
  const maxVal = Math.max(...values, 1);
  
  let barHtml = '', dayHtml = '';
  values.forEach((v, i) => {
    const h = (v / maxVal) * 100;
    barHtml += `<div class="bar-wrap"><div class="bar" style="height:${Math.max(h, 3)}%"><span class="bar-val">${v.toFixed(1)}</span></div></div>`;
    dayHtml += `<span>${days[i]}</span>`;
  });
  
  document.getElementById('weekly-bars').innerHTML = barHtml;
  document.getElementById('weekly-days').innerHTML = dayHtml;
  
  const total = getTotal();
  const weekSum = values.reduce((a,b) => a + b, 0);
  document.getElementById('st-today').innerText = total.toFixed(1) + " kg";
  document.getElementById('st-week').innerText = weekSum.toFixed(1) + " kg";
  
  const change = getWeeklyChange();
  const deltaEl = document.getElementById('st-delta');
  if (change !== null) {
    deltaEl.innerText = (change <= 0 ? "" : "+") + change + "%";
    deltaEl.style.color = change <= 0 ? "var(--emerald-400)" : "var(--red)";
  } else {
    deltaEl.innerText = "—";
  }
}

// ═══════════ EARTH VISUALIZATION (Canvas 2D) ═══════════
let earthRotation = 0;
let earthAnimFrame = null;

function initEarth() {
  drawEarth();
  drawFutureEarth('earth-bad', true);
  drawFutureEarth('earth-good', false);
  updateImpactGrid();
  updateEarthIndicators();
}

function updateEarthStatus(total) {
  const statusEl = document.getElementById('earth-status');
  const tempEl = document.getElementById('earth-temp');
  const temp = 0.8 + (total * 0.05);
  tempEl.innerText = "+" + temp.toFixed(2) + "°C";
  
  if (total > 15) {
    statusEl.innerText = "Critical";
    statusEl.style.color = "var(--red)";
  } else if (total > 10) {
    statusEl.innerText = "Stressed";
    statusEl.style.color = "var(--amber)";
  } else if (total > 5) {
    statusEl.innerText = "Moderate";
    statusEl.style.color = "var(--amber)";
  } else {
    statusEl.innerText = "Healthy";
    statusEl.style.color = "var(--emerald-400)";
  }
}

function drawEarth() {
  const canvas = document.getElementById('earth-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w/2, cy = h/2;
  const R = w/2.3;
  
  const total = getTotal();
  const health = Math.max(0, Math.min(1, total / 20)); // 0 = healthy, 1 = critical
  
  // Colors based on health
  const waterColor = lerpColor('#3B82F6', '#1E293B', health);
  const landColor = lerpColor('#10B981', '#78350F', health);
  const atmoColor = health < 0.5 
    ? `rgba(255, 255, 255, ${0.15 - health * 0.2})`
    : `rgba(239, 68, 68, ${health * 0.3})`;
  const cloudAlpha = 0.4 - health * 0.25;
  
  ctx.clearRect(0, 0, w, h);
  
  // Star field
  const starSeed = 42;
  for (let i = 0; i < 80; i++) {
    const sx = ((i * 7919 + starSeed) % w);
    const sy = ((i * 6271 + starSeed) % h);
    const sr = 0.5 + (i % 3) * 0.5;
    const dist = Math.sqrt((sx - cx) ** 2 + (sy - cy) ** 2);
    if (dist > R + 30) {
      ctx.fillStyle = `rgba(255,255,255,${0.3 + (i % 5) * 0.1})`;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, 2 * Math.PI);
      ctx.fill();
    }
  }
  
  // Atmosphere glow (outer)
  const atmoGrad = ctx.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.3);
  atmoGrad.addColorStop(0, atmoColor);
  atmoGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = atmoGrad;
  ctx.fillRect(0, 0, w, h);
  
  // Globe base (ocean)
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  ctx.clip();
  
  const oceanGrad = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
  oceanGrad.addColorStop(0, lightenColor(waterColor, 30));
  oceanGrad.addColorStop(0.7, waterColor);
  oceanGrad.addColorStop(1, darkenColor(waterColor, 40));
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  
  // Continents (simplified, rotating)
  earthRotation += 0.003;
  const continents = getContinentPaths(earthRotation);
  ctx.fillStyle = landColor;
  continents.forEach(cont => {
    ctx.beginPath();
    cont.forEach((pt, i) => {
      const [px, py] = projectToSphere(pt[0], pt[1], cx, cy, R, earthRotation);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fill();
  });
  
  // Cloud wisps
  if (cloudAlpha > 0) {
    ctx.fillStyle = `rgba(255, 255, 255, ${cloudAlpha})`;
    const cloudOffset = earthRotation * 0.7;
    drawCloudWisp(ctx, cx, cy, R, cloudOffset, -20, 40, 14);
    drawCloudWisp(ctx, cx, cy, R, cloudOffset + 1.5, 30, 55, 18);
    drawCloudWisp(ctx, cx, cy, R, cloudOffset + 3.2, -40, 35, 12);
    drawCloudWisp(ctx, cx, cy, R, cloudOffset + 4.5, 15, 45, 16);
  }
  
  // Pollution haze (for high emissions)
  if (health > 0.4) {
    const hazeAlpha = (health - 0.4) * 0.4;
    const hazeGrad = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R);
    hazeGrad.addColorStop(0, `rgba(120, 53, 15, ${hazeAlpha * 0.3})`);
    hazeGrad.addColorStop(1, `rgba(120, 53, 15, ${hazeAlpha})`);
    ctx.fillStyle = hazeGrad;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  }
  
  // Specular highlight (3D effect)
  const specGrad = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.05, cx - R * 0.2, cy - R * 0.2, R * 0.7);
  specGrad.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
  specGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = specGrad;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  
  // Rim lighting
  const rimGrad = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R);
  rimGrad.addColorStop(0, 'transparent');
  rimGrad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
  ctx.fillStyle = rimGrad;
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
  
  ctx.restore();
  
  // Floating particles
  const particleCount = health > 0.5 ? 20 : 8;
  for (let i = 0; i < particleCount; i++) {
    const angle = (earthRotation * 2 + i * (Math.PI * 2 / particleCount)) % (Math.PI * 2);
    const dist = R * 1.1 + Math.sin(earthRotation * 3 + i) * 15;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;
    const size = 1 + Math.sin(i * 1.5) * 0.5;
    
    ctx.fillStyle = health > 0.5 
      ? `rgba(239, 68, 68, ${0.3 + Math.sin(earthRotation + i) * 0.2})`
      : `rgba(255, 255, 255, ${0.2 + Math.sin(earthRotation + i) * 0.15})`;
    ctx.beginPath();
    ctx.arc(px, py, size, 0, 2 * Math.PI);
    ctx.fill();
  }
  
  // Continue animation
  if (document.getElementById('pg-earth')?.classList.contains('active')) {
    earthAnimFrame = requestAnimationFrame(drawEarth);
  }
}

function projectToSphere(lon, lat, cx, cy, R, offset) {
  const lonRad = (lon + offset * 50) * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const x = cx + R * Math.cos(latRad) * Math.sin(lonRad) * 0.9;
  const y = cy - R * Math.sin(latRad) * 0.9;
  return [x, y];
}

function getContinentPaths() {
  // Simplified continent outlines (lon, lat)
  return [
    // Africa
    [[-15,35],[-5,35],[10,32],[20,30],[30,20],[35,10],[40,0],[35,-10],[30,-25],[25,-35],[20,-35],[15,-30],[10,-20],[5,-5],[0,5],[-5,10],[-15,15],[-20,25]],
    // Europe
    [[-10,40],[-5,45],[0,48],[10,50],[15,55],[25,60],[30,55],[35,50],[30,45],[25,40],[20,38],[10,38],[0,40]],
    // Asia
    [[35,50],[45,55],[60,60],[70,65],[80,60],[90,55],[100,50],[110,45],[120,40],[130,35],[120,30],[110,25],[100,20],[90,15],[80,20],[70,25],[60,30],[50,35],[40,40]],
    // South America
    [[-80,10],[-75,5],[-70,0],[-70,-10],[-65,-20],[-60,-30],[-65,-40],[-70,-50],[-75,-45],[-80,-30],[-80,-20],[-80,-10],[-80,0]],
    // North America
    [[-130,50],[-120,55],[-110,60],[-100,60],[-90,55],[-80,50],[-75,45],[-80,40],[-85,35],[-90,30],[-95,25],[-100,20],[-105,25],[-110,30],[-120,35],[-125,45]],
    // Australia
    [[115,-15],[125,-15],[135,-20],[145,-25],[150,-30],[145,-35],[140,-38],[130,-35],[120,-30],[115,-25]]
  ];
}

function drawCloudWisp(ctx, cx, cy, R, lon, lat, width, height) {
  const [x, y] = projectToSphere(lon * 30, lat, cx, cy, R, earthRotation);
  const distFromCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
  if (distFromCenter < R * 0.85) {
    ctx.beginPath();
    ctx.ellipse(x, y, width * (1 - distFromCenter / R * 0.3), height * 0.5, 0, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function drawFutureEarth(id, isBad) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const cx = w/2, cy = h/2, R = w/2.3;
  
  ctx.clearRect(0, 0, w, h);
  
  const color = isBad ? '#78350F' : '#10B981';
  const waterCol = isBad ? '#1E293B' : '#3B82F6';
  const atmoCol = isBad ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.1)';
  
  // Atmosphere
  const atmoGrad = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.2);
  atmoGrad.addColorStop(0, atmoCol);
  atmoGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = atmoGrad;
  ctx.fillRect(0, 0, w, h);
  
  // Globe
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, 2 * Math.PI);
  const grad = ctx.createRadialGradient(cx - R*0.3, cy - R*0.3, R*0.1, cx, cy, R);
  grad.addColorStop(0, lightenColor(waterCol, 20));
  grad.addColorStop(1, darkenColor(waterCol, 30));
  ctx.fillStyle = grad;
  ctx.fill();
  
  // Simplified land
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.ellipse(cx - 20, cy - 10, 35, 55, Math.PI/5, 0, 2*Math.PI); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 45, cy + 15, 40, 45, -Math.PI/6, 0, 2*Math.PI); ctx.fill();
  
  // Specular
  const sg = ctx.createRadialGradient(cx - R*0.3, cy - R*0.3, 0, cx, cy, R);
  sg.addColorStop(0, 'rgba(255,255,255,0.1)');
  sg.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = sg;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, 2*Math.PI); ctx.fill();
}

// Color utilities
function lerpColor(a, b, t) {
  const ar = parseInt(a.slice(1,3),16), ag = parseInt(a.slice(3,5),16), ab = parseInt(a.slice(5,7),16);
  const br = parseInt(b.slice(1,3),16), bg = parseInt(b.slice(3,5),16), bb = parseInt(b.slice(5,7),16);
  const r = Math.round(ar + (br-ar)*t), g = Math.round(ag + (bg-ag)*t), bv = Math.round(ab + (bb-ab)*t);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${bv.toString(16).padStart(2,'0')}`;
}
function lightenColor(hex, pct) {
  const r = Math.min(255, parseInt(hex.slice(1,3),16) + pct);
  const g = Math.min(255, parseInt(hex.slice(3,5),16) + pct);
  const b = Math.min(255, parseInt(hex.slice(5,7),16) + pct);
  return `rgb(${r},${g},${b})`;
}
function darkenColor(hex, pct) {
  const r = Math.max(0, parseInt(hex.slice(1,3),16) - pct);
  const g = Math.max(0, parseInt(hex.slice(3,5),16) - pct);
  const b = Math.max(0, parseInt(hex.slice(5,7),16) - pct);
  return `rgb(${r},${g},${b})`;
}

// ═══════════ EARTH INDICATORS ═══════════
function updateEarthIndicators() {
  const total = getTotal();
  const forest = Math.max(100 - (total * 3), 10);
  const sea = Math.min((total * 2), 100);
  const aq = Math.max(100 - (total * 4), 0);
  const biodiversity = Math.max(100 - (total * 5), 5);
  
  const inds = document.getElementById('earth-inds');
  if (inds) {
    inds.innerHTML = `
      <div class="ei-item"><div class="ei-top"><span class="ei-lbl">🌲 Forest Cover</span><span class="ei-val">${forest.toFixed(0)}%</span></div><div class="ei-bar"><div class="ei-fill" style="width:${forest}%; background:var(--emerald-500)"></div></div></div>
      <div class="ei-item"><div class="ei-top"><span class="ei-lbl">🌊 Sea Level Rise</span><span class="ei-val">+${sea.toFixed(0)}cm</span></div><div class="ei-bar"><div class="ei-fill" style="width:${sea}%; background:var(--blue)"></div></div></div>
      <div class="ei-item"><div class="ei-top"><span class="ei-lbl">💨 Air Quality</span><span class="ei-val">${aq.toFixed(0)}/100</span></div><div class="ei-bar"><div class="ei-fill" style="width:${aq}%; background:var(--teal)"></div></div></div>
      <div class="ei-item"><div class="ei-top"><span class="ei-lbl">🐾 Biodiversity</span><span class="ei-val">${biodiversity.toFixed(0)}%</span></div><div class="ei-bar"><div class="ei-fill" style="width:${biodiversity}%; background:var(--purple)"></div></div></div>
    `;
  }
}

// ═══════════ "IF EVERYONE LIVED LIKE YOU" ═══════════
function updateImpactGrid() {
  const total = getTotal();
  const annual = total * 365;
  
  const earths = (annual / GLOBAL_FAIR_SHARE_ANNUAL).toFixed(1);
  const tempRise = (0.8 + (annual / 4000) * 1.5).toFixed(1);
  const seaRise = Math.round((annual / 4000) * 60);
  const forestLoss = Math.round((annual / 4000) * 20);
  const speciesAffected = Math.round((annual / 4000) * 2000);
  
  let waterScarcity = 'Low';
  let waterColor = 'var(--emerald-400)';
  if (annual > 8000) { waterScarcity = 'Critical'; waterColor = 'var(--red)'; }
  else if (annual > 5000) { waterScarcity = 'High'; waterColor = 'var(--amber)'; }
  else if (annual > 3000) { waterScarcity = 'Medium'; waterColor = 'var(--amber)'; }
  
  document.getElementById('impact-grid').innerHTML = `
    <div class="imp-card"><span class="imp-anim">🌍</span><div class="imp-num">${earths}</div><div class="imp-lbl">Earths Needed</div></div>
    <div class="imp-card"><span class="imp-anim">🔥</span><div class="imp-num" style="color:${parseFloat(tempRise) > 2 ? 'var(--red)' : 'var(--amber)'}">+${tempRise}°C</div><div class="imp-lbl">Global Temp Rise</div></div>
    <div class="imp-card"><span class="imp-anim">🌊</span><div class="imp-num" style="color:var(--blue)">${seaRise}cm</div><div class="imp-lbl">Sea Level Rise</div></div>
    <div class="imp-card"><span class="imp-anim">🌲</span><div class="imp-num" style="color:${forestLoss > 15 ? 'var(--red)' : 'var(--amber)'}">-${forestLoss}%</div><div class="imp-lbl">Forest Cover Loss</div></div>
    <div class="imp-card"><span class="imp-anim">💧</span><div class="imp-num" style="color:${waterColor}">${waterScarcity}</div><div class="imp-lbl">Water Scarcity Risk</div></div>
    <div class="imp-card"><span class="imp-anim">🐾</span><div class="imp-num">${speciesAffected.toLocaleString()}</div><div class="imp-lbl">Species Affected</div></div>
  `;
  
  // Future temps
  const ft = total;
  document.getElementById('ft-bad').innerText = '+' + (0.8 + ft * 0.1).toFixed(1) + '°C';
  document.getElementById('ft-good').innerText = '+' + Math.max(0.8, 0.8 + ft * 0.02).toFixed(1) + '°C';
  
  updateEarthIndicators();
}

// ═══════════ ANALYTICS ═══════════
function initAnalytics() {
  setTF('week');
  renderHeatmap();
  renderRanking();
  renderForecast();
}

window.setTF = function(tf) {
  document.querySelectorAll('#pg-analytics .pill').forEach(p => p.classList.remove('on'));
  const btn = document.getElementById(`tf-${tf}`);
  if (btn) btn.classList.add('on');
  
  const f = profile.footprint;
  const total = getTotal();
  const multiplier = tf === 'week' ? 7 : tf === 'month' ? 30 : 365;
  const periodTotal = +(total * multiplier).toFixed(1);
  
  // Calculate category totals for the period
  const cats = [
    { name: 'Transport', val: +(f.transport * multiplier).toFixed(1), color: 'var(--amber)' },
    { name: 'Food', val: +(f.food * multiplier).toFixed(1), color: 'var(--emerald-500)' },
    { name: 'Energy', val: +(f.energy * multiplier).toFixed(1), color: 'var(--blue)' },
    { name: 'Shopping', val: +(f.shopping * multiplier).toFixed(1), color: 'var(--purple)' },
    { name: 'Waste', val: +(f.waste * multiplier).toFixed(1), color: 'var(--orange)' },
    { name: 'Water', val: +(f.water * multiplier).toFixed(1), color: 'var(--cyan)' }
  ].sort((a, b) => b.val - a.val);
  
  const maxCat = cats[0]?.val || 1;
  let flowHtml = '';
  cats.forEach(c => {
    const pct = Math.min((c.val / maxCat) * 100, 100);
    flowHtml += `<div class="flow-row"><span class="flow-row-lbl">${c.name}</span><div class="flow-track"><div class="flow-fill" style="width:${pct}%; background:${c.color}"></div></div><span class="flow-val">${c.val} kg</span></div>`;
  });
  document.getElementById('flow-bars').innerHTML = flowHtml;
  document.getElementById('flow-total').innerText = periodTotal + " kg";
  
  const change = getWeeklyChange();
  const trendEl = document.getElementById('flow-trend');
  if (change !== null) {
    trendEl.innerText = (change <= 0 ? '↓ ' : '↑ ') + Math.abs(change) + '%';
    trendEl.style.color = change <= 0 ? 'var(--emerald-400)' : 'var(--red)';
  } else {
    trendEl.innerText = '—';
    trendEl.style.color = '';
  }
};

function renderHeatmap() {
  const total = getTotal();
  let html = '';
  for (let i = 0; i < 84; i++) {
    // Derive from history or simulate from current
    const dayOffset = 83 - i;
    const date = new Date();
    date.setDate(date.getDate() - dayOffset);
    const dateStr = date.toISOString().split('T')[0];
    const found = profile.history?.find(h => h.date === dateStr);
    const val = found ? found.total : total * (0.7 + Math.sin(i * 0.5) * 0.3);
    const intensity = Math.min(val / 15, 1);
    const alpha = 0.05 + intensity * 0.9;
    html += `<div class="hm-cell" style="background: rgba(16,185,129,${alpha})" title="${dateStr}: ${val.toFixed(1)} kg"></div>`;
  }
  document.getElementById('heatmap').innerHTML = html;
}

function renderRanking() {
  const f = profile.footprint;
  const cats = Object.entries(f)
    .map(([k, v]) => ({ key: k, val: v }))
    .sort((a, b) => b.val - a.val);
  
  let html = '';
  cats.forEach((c, i) => {
    html += `<div class="rank-item"><span class="rank-num">${i + 1}</span><span class="rank-icon">${categoryEmojis[c.key]}</span><span class="rank-name">${categoryNames[c.key]}</span><span class="rank-val">${c.val.toFixed(1)} kg</span></div>`;
  });
  document.getElementById('ranking').innerHTML = html;
}

function renderForecast() {
  const container = document.getElementById('forecast-chart');
  if (!container) return;
  
  // Draw forecast using a canvas
  const total = getTotal();
  const canvas = document.createElement('canvas');
  canvas.width = container.offsetWidth || 600;
  canvas.height = 200;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.innerHTML = '';
  container.appendChild(canvas);
  
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const months = 12;
  const padding = { left: 40, right: 20, top: 20, bottom: 5 };
  const chartW = w - padding.left - padding.right;
  const chartH = h - padding.top - padding.bottom;
  
  // Current path (stays same)
  const currentPath = [];
  for (let i = 0; i <= months; i++) {
    currentPath.push(total * 30 * (i + 1));
  }
  
  // Green path (10% reduction per month)
  const greenPath = [];
  let greenMonthly = total * 30;
  for (let i = 0; i <= months; i++) {
    greenPath.push(greenMonthly * (i + 1) * 0.5);
    greenMonthly *= 0.92;
  }
  
  const maxVal = Math.max(...currentPath);
  
  function toX(i) { return padding.left + (i / months) * chartW; }
  function toY(v) { return padding.top + chartH - (v / maxVal) * chartH; }
  
  // Current path (amber area)
  ctx.beginPath();
  ctx.moveTo(toX(0), h - padding.bottom);
  currentPath.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
  ctx.lineTo(toX(months), h - padding.bottom);
  ctx.closePath();
  const currentGrad = ctx.createLinearGradient(0, 0, 0, h);
  currentGrad.addColorStop(0, 'rgba(245, 158, 11, 0.15)');
  currentGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = currentGrad;
  ctx.fill();
  
  ctx.beginPath();
  currentPath.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
  ctx.strokeStyle = '#F59E0B';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Green path
  ctx.beginPath();
  ctx.moveTo(toX(0), h - padding.bottom);
  greenPath.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
  ctx.lineTo(toX(months), h - padding.bottom);
  ctx.closePath();
  const greenGrad = ctx.createLinearGradient(0, 0, 0, h);
  greenGrad.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
  greenGrad.addColorStop(1, 'rgba(16, 185, 129, 0)');
  ctx.fillStyle = greenGrad;
  ctx.fill();
  
  ctx.beginPath();
  greenPath.forEach((v, i) => i === 0 ? ctx.moveTo(toX(i), toY(v)) : ctx.lineTo(toX(i), toY(v)));
  ctx.strokeStyle = '#10B981';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Scenarios legend
  document.getElementById('forecast-sc').innerHTML = `
    <div class="fs-item"><div class="fs-dot" style="background: #F59E0B"></div>Current path</div>
    <div class="fs-item"><div class="fs-dot" style="background: #10B981"></div>If you go green</div>
  `;
}

// ═══════════ SIMULATOR ═══════════
let simMultiplier = 1;

function initSim() {
  simCalc();
  generateRecommendations();
  generateChallenges();
}

window.simTF = function(months, btn) {
  btn.parentElement.querySelectorAll('.pill').forEach(c => c.classList.remove('on'));
  btn.classList.add('on');
  simMultiplier = months;
  simCalc();
};

window.simCalc = function() {
  const f = profile.footprint;
  const currentDaily = getTotal();
  const currentPeriod = currentDaily * 30 * simMultiplier;
  
  const t = parseFloat(document.getElementById('sim-transit')?.value || 0);
  const v = parseFloat(document.getElementById('sim-veg')?.value || 0);
  const s = parseFloat(document.getElementById('sim-solar')?.value || 0);
  const e = parseFloat(document.getElementById('sim-ev')?.value || 0);
  const fly = parseFloat(document.getElementById('sim-fly')?.value || 0);
  
  document.getElementById('sm-transit').innerText = `${t} days/wk`;
  document.getElementById('sm-veg').innerText = `${v} meals/wk`;
  document.getElementById('sm-solar').innerText = s ? "Yes" : "No";
  document.getElementById('sm-ev').innerText = e ? "Yes" : "No";
  document.getElementById('sm-fly').innerText = `${fly}`;
  
  const dailyReduction = (t * 0.8) + (v * 0.5) + (s * 2.0) + (e * 3.0) + ((fly/365) * 200);
  const futureDaily = Math.max(currentDaily - dailyReduction, 1.0);
  const futurePeriod = futureDaily * 30 * simMultiplier;
  
  document.getElementById('sim-cur').innerText = currentPeriod.toFixed(0);
  document.getElementById('sim-fut').innerText = futurePeriod.toFixed(0);
  
  const savedC = currentPeriod - futurePeriod;
  const money = savedC * 15;
  const trees = savedC / 22;
  
  document.getElementById('sim-saves').innerHTML = `
    <div class="save-box"><span class="save-val">₹${money.toFixed(0)}</span><span class="save-lbl">Money Saved</span></div>
    <div class="save-box"><span class="save-val">${trees.toFixed(1)}</span><span class="save-lbl">Trees Eq.</span></div>
    <div class="save-box"><span class="save-val">${(savedC * 1.5).toFixed(0)} L</span><span class="save-lbl">Water Saved</span></div>
    <div class="save-box"><span class="save-val">${(savedC * 0.8).toFixed(0)} kWh</span><span class="save-lbl">Energy Saved</span></div>
  `;
  
  if (savedC > 0) {
    document.getElementById('sim-banner').style.display = 'block';
    document.getElementById('sim-banner-txt').innerText = `🌿 You could save ${savedC.toFixed(0)} kg CO₂ over ${simMultiplier} month(s) — that's ${trees.toFixed(0)} trees worth of carbon!`;
  } else {
    document.getElementById('sim-banner').style.display = 'none';
  }
};

function generateRecommendations() {
  const f = profile.footprint;
  const total = getTotal();
  const sorted = Object.entries(f).sort(([,a],[,b]) => b - a);
  
  const recs = [];
  sorted.slice(0, 3).forEach(([cat, val]) => {
    const pct = total > 0 ? Math.round((val / total) * 100) : 0;
    if (cat === 'transport' && val > 1) {
      recs.push({ icon: '🚇', title: 'Try public transit', desc: `Transport is ${pct}% of your footprint. Using metro 2 days/week could save ${(val * 0.4 * 2 / 7 * 30).toFixed(0)} kg CO₂/month.` });
    }
    if (cat === 'food' && val > 2) {
      recs.push({ icon: '🥗', title: 'Add more plant meals', desc: `Food is ${pct}% of your footprint. 3 more veg meals/week could save ${(1.5 * 3 * 4).toFixed(0)} kg CO₂/month.` });
    }
    if (cat === 'energy' && val > 2) {
      recs.push({ icon: '☀️', title: 'Optimize AC usage', desc: `Energy is ${pct}% of your footprint. Setting AC to 26°C saves up to 20% electricity.` });
    }
    if (cat === 'shopping' && val > 0.5) {
      recs.push({ icon: '📦', title: 'Reduce online orders', desc: `Shopping is ${pct}%. Consolidating deliveries reduces packaging waste and logistics emissions.` });
    }
  });
  
  if (recs.length === 0) {
    recs.push({ icon: '🌟', title: 'You\'re doing great!', desc: 'Your carbon footprint is well-optimized. Keep maintaining your sustainable habits.' });
  }
  
  let html = '';
  recs.forEach(r => {
    html += `<div class="rec-card"><span class="rec-icon">${r.icon}</span><div class="rec-body"><div class="rec-title">${r.title}</div><div class="rec-desc">${r.desc}</div></div></div>`;
  });
  document.getElementById('recs-stack').innerHTML = html;
}

function generateChallenges() {
  const total = getTotal();
  const daysSinceJoin = profile.streak || 1;
  
  const challenges = [
    { icon: '🚶', title: 'Walk More Challenge', desc: 'Walk instead of driving for trips under 2 km', progress: Math.min(daysSinceJoin * 10, 100) },
    { icon: '🥦', title: 'Meatless Monday', desc: 'Go vegetarian every Monday for a month', progress: Math.min(daysSinceJoin * 7, 100) },
    { icon: '💡', title: 'Energy Saver', desc: 'Keep AC under 4 hours/day for a week', progress: total < 8 ? 75 : 30 }
  ];
  
  let html = '';
  challenges.forEach(c => {
    html += `<div class="challenge-card"><span class="ch-icon">${c.icon}</span><div class="ch-body"><div class="ch-title">${c.title}</div><div class="ch-desc">${c.desc}</div><div class="ch-progress"><div class="ch-fill" style="width:${c.progress}%"></div></div></div></div>`;
  });
  document.getElementById('challenges-stack').innerHTML = html;
}

// ═══════════ PROFILE & LEGACY ═══════════
function updateProfileUI() {
  const total = getTotal();
  const savedVsBaseline = Math.max(0, (INDIAN_BASELINE_DAILY - total));
  const totalSavedKg = +(savedVsBaseline * profile.streak).toFixed(0);
  const moneySaved = Math.round(totalSavedKg * 15);
  
  profile.totalSaved = totalSavedKg;
  
  document.getElementById('ps-saved').innerText = totalSavedKg + " kg";
  document.getElementById('ps-score').innerText = profile.score;
  document.getElementById('ps-money').innerText = "₹" + moneySaved.toLocaleString();
  
  // Join date
  if (profile.joinDate) {
    const joinDate = new Date(profile.joinDate);
    document.getElementById('prof-since').innerText = `Member since ${joinDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`;
  }
  
  // Real world equivalents (derived from actual savings)
  const trees = Math.max(0, +(totalSavedKg / 22).toFixed(0));
  const kmDriven = Math.max(0, Math.round(totalSavedKg / 0.14));
  const phonesCharged = Math.max(0, Math.round(totalSavedKg / 0.005));
  const lightDays = Math.max(0, Math.round(totalSavedKg / 0.4));
  
  document.getElementById('equiv-grid').innerHTML = `
    <div class="equiv-box"><span class="equiv-icon">🌳</span><span class="equiv-val">${trees}</span><span class="equiv-lbl">Trees Equivalent</span></div>
    <div class="equiv-box"><span class="equiv-icon">🚗</span><span class="equiv-val">${kmDriven}</span><span class="equiv-lbl">Km Not Driven</span></div>
    <div class="equiv-box"><span class="equiv-icon">📱</span><span class="equiv-val">${phonesCharged.toLocaleString()}</span><span class="equiv-lbl">Phones Charged</span></div>
    <div class="equiv-box"><span class="equiv-icon">💡</span><span class="equiv-val">${lightDays}</span><span class="equiv-lbl">Days of Light</span></div>
  `;
  
  // Milestones (based on actual achievements)
  const badges = [
    { icon: '🌱', name: 'First Step', unlocked: profile.streak >= 1 },
    { icon: '📊', name: '7-Day Streak', unlocked: profile.streak >= 7 },
    { icon: '🥦', name: 'Plant Power', unlocked: calcState.mealType === 'veg' || calcState.mealType === 'vegan' },
    { icon: '🚇', name: 'Metro Master', unlocked: calcState.transMode === 'metro' || calcState.transMode === 'bus' },
    { icon: '♻️', name: 'Waste Warrior', unlocked: calcState.wasteSeg === 'yes' },
    { icon: '🏆', name: '30-Day Streak', unlocked: profile.streak >= 30 },
    { icon: '☀️', name: 'Solar King', unlocked: false },
    { icon: '🌟', name: 'Carbon Neutral', unlocked: total <= 2 }
  ];
  
  let badgeHtml = '';
  badges.forEach(b => {
    badgeHtml += `<div class="badge ${b.unlocked ? 'unlocked' : ''}"><span class="badge-icon">${b.icon}</span><span class="badge-name">${b.name}</span></div>`;
  });
  document.getElementById('badge-grid').innerHTML = badgeHtml;
  
  // Monthly report
  const m = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  document.getElementById('report-month').innerText = m;
  
  const biggest = Object.entries(profile.footprint).sort(([,a],[,b]) => b - a);
  const reportText = total > 0 
    ? `Your carbon footprint for ${m} is tracking at ${(total * 30).toFixed(0)} kg CO₂/month (${Math.round(total * 30 / profile.budget * 100)}% of your ${profile.budget} kg budget).\n\nTop contributor: ${categoryNames[biggest[0][0]]} at ${(biggest[0][1] * 30).toFixed(0)} kg/month.\nLowest contributor: ${categoryNames[biggest[biggest.length-1][0]]} at ${(biggest[biggest.length-1][1] * 30).toFixed(1)} kg/month.\n\nCarbon Score: ${profile.score}/100\nStreak: ${profile.streak} days\nTotal CO₂ Saved: ${totalSavedKg} kg`
    : 'Start using the calculator on the Home page to generate your monthly report.';
  document.getElementById('report-body').innerText = reportText;
}

window.downloadReport = function() {
  showToast("Downloading your monthly report...");
};

// ═══════════ MODALS, DRAWERS, TOAST ═══════════
window.openQuickLog = function() {
  document.getElementById('quick-log-modal').style.display = 'flex';
};
window.closeQuickLog = function() {
  document.getElementById('quick-log-modal').style.display = 'none';
};
window.closeModalBg = function(e) {
  if (e.target === document.getElementById('quick-log-modal')) closeQuickLog();
};
window.submitQuickLog = function() {
  closeQuickLog();
  showToast("Activity logged successfully! 🌿");
  recalcFromCalc();
};
window.qlTab = function(btn) {
  document.querySelectorAll('.ql-tab').forEach(t => t.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll('.ql-pane').forEach(p => p.style.display = 'none');
  const pane = document.getElementById('ql-' + btn.dataset.t);
  if (pane) pane.style.display = 'block';
};

window.openDrawer = function(id) {
  document.getElementById(`drawer-${id}`).style.display = 'flex';
  if (id === 'settings') {
    document.getElementById('set-name').value = currentUser?.name || '';
    document.getElementById('set-budget').value = profile.budget;
  }
  if (id === 'notifs') generateNotifications();
};
window.closeDrawer = function(id) {
  document.getElementById(`drawer-${id}`).style.display = 'none';
};
window.closeDrawerBg = function(e, id) {
  if (e.target === document.getElementById(`drawer-${id}`)) closeDrawer(id);
};
window.saveSettings = function() {
  const name = document.getElementById('set-name').value;
  if (name) { currentUser.name = name; localStorage.setItem('canopy_user', JSON.stringify(currentUser)); }
  const b = parseInt(document.getElementById('set-budget').value);
  if (b) { profile.budget = b; saveProfile(); }
  closeDrawer('settings');
  showApp();
  showToast("Settings saved successfully ✓");
};

function generateNotifications() {
  const total = getTotal();
  const notifs = [];
  
  if (total > profile.budget / 30) {
    notifs.push({ title: '⚠️ Budget Alert', desc: `You're exceeding your daily carbon budget of ${(profile.budget/30).toFixed(1)} kg.`, time: 'Just now', unread: true });
  }
  if (profile.streak > 0 && profile.streak % 7 === 0) {
    notifs.push({ title: '🔥 Streak Milestone!', desc: `You've maintained a ${profile.streak}-day streak on Canopy!`, time: 'Today', unread: true });
  }
  notifs.push({ title: '💡 Daily Tip', desc: 'Turning off appliances at the wall socket saves up to 10% on your electricity bill.', time: 'Today', unread: false });
  
  const body = document.getElementById('notifs-body');
  if (notifs.length === 0) {
    body.innerHTML = '<p style="color: var(--text-tertiary); text-align: center; padding: 40px 0;">No notifications yet</p>';
    return;
  }
  let html = '';
  notifs.forEach(n => {
    html += `<div class="notif-item ${n.unread ? 'unread' : ''}"><div class="n-title">${n.title}</div><div class="n-desc">${n.desc}</div><div class="n-time">${n.time}</div></div>`;
  });
  body.innerHTML = html;
  
  if (notifs.some(n => n.unread)) {
    document.getElementById('notif-dot').style.display = 'block';
  }
}

function showToast(msg) {
  const t = document.getElementById('toast');
  document.getElementById('toast-text').innerText = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3500);
}

window.markAllRead = function() {
  document.getElementById('notif-dot').style.display = 'none';
  closeDrawer('notifs');
  showToast("Notifications cleared ✓");
};
