// ── 订阅价格比较器 — 核心逻辑 ──

const BENCHMARKS_URL = 'data/benchmarks.json';
let benchmarks = null;

const $ = id => document.getElementById(id);
const els = {
  monthlyPrice: $('monthlyPrice'),
  yearlyPrice: $('yearlyPrice'),
  firstMonthDiscount: $('firstMonthDiscount'),
  discountRate: $('discountRate'),
  inflationRate: $('inflationRate'),
  churnRate: $('churnRate'),
  epvValue: $('epvValue'),
  epvSub: $('epvSub'),
  yearValue: $('yearValue'),
  yearSub: $('yearSub'),
  conclusion: $('conclusion'),
  breakeven: $('breakeven'),
  tableBody: $('tableBody'),
  footPay: $('footPay'),
  footEPV: $('footEPV'),
  churnSlider: $('churnSlider'),
  sliderVal: $('sliderVal'),
  churnPresetWrapper: $('churnPresetWrapper'),
  discountPresets: $('discountPresets'),
  inflationPresets: $('inflationPresets'),
  discountSrc: $('discountSrc'),
  inflationSrc: $('inflationSrc'),
  churnSrc: $('churnSrc'),
  dataDate: $('dataDate'),
};

// ── Custom Dropdown ──
class CustomSelect {
  constructor(container) {
    this.container = container;
    this.container.className = 'cs input-row';
    this.value = '';
    this.options = [];
    this._onSelect = null;

    this.trigger = document.createElement('div');
    this.trigger.className = 'cs-trigger';
    this.trigger.textContent = '品类快捷填充（选填）';
    this.trigger.addEventListener('click', () => this.toggle());

    this.arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.arrow.setAttribute('viewBox', '0 0 24 24');
    this.arrow.setAttribute('width', '12');
    this.arrow.setAttribute('height', '12');
    this.arrow.classList.add('cs-arrow');
    this.arrow.innerHTML = '<path d="m6 9 6 6 6-6" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
    this.trigger.appendChild(this.arrow);

    this.optionsPanel = document.createElement('div');
    this.optionsPanel.className = 'cs-options';

    this.container.appendChild(this.trigger);
    this.container.appendChild(this.optionsPanel);

    this._closeHandler = (e) => {
      if (!this.container.contains(e.target)) this.close();
    };
  }

  setOptions(categories) {
    this.options = categories;
    this.optionsPanel.innerHTML = '';
    for (const cat of categories) {
      const opt = document.createElement('div');
      opt.className = 'cs-option';
      opt.textContent = `${cat.label}（约 ${cat.value.toFixed(1)}%/月）`;
      opt.addEventListener('click', () => {
        this.select(cat.value, opt);
      });
      this.optionsPanel.appendChild(opt);
    }
  }

  toggle() {
    this.container.classList.contains('open') ? this.close() : this.open();
  }

  open() {
    this.container.classList.add('open');
    document.addEventListener('click', this._closeHandler, { once: true });
  }

  close() {
    this.container.classList.remove('open');
    document.removeEventListener('click', this._closeHandler);
  }

  select(value, optEl) {
    this.value = value;
    this.trigger.firstChild.textContent = optEl.textContent;
    this.trigger.style.color = '#fff';
    for (const child of this.optionsPanel.children) {
      child.classList.remove('selected');
    }
    optEl.classList.add('selected');
    this.close();
    if (this._onSelect) this._onSelect(value);
  }

  onSelect(fn) { this._onSelect = fn; }
}

// ── 数学模型 ──
// d = (1-c) / ((1+r)(1+π))
// EPV = (M-D) + M × d × (1 - d^11) / (1 - d)

function compute(monthlyPrice, yearlyPrice, firstMonthDiscount,
                 discountRatePct, inflationRatePct, churnRatePct) {
  const M = monthlyPrice;
  const Y = yearlyPrice;
  const D = firstMonthDiscount;
  const r = discountRatePct / 100;
  const pi = inflationRatePct / 100;
  const c = churnRatePct / 100;

  const d = (1 - c) / ((1 + r) * (1 + pi));
  const MONTHS = 12;
  let epv;

  if (Math.abs(1 - d) < 1e-12) {
    epv = (M - D) + M * (MONTHS - 1);
  } else {
    epv = (M - D) + M * d * (1 - Math.pow(d, MONTHS - 1)) / (1 - d);
  }

  const rows = [];
  let totalNominal = 0;
  const survivalFactor = 1 - c;
  const discountFactor = 1 / ((1 + r) * (1 + pi));

  for (let i = 0; i < MONTHS; i++) {
    const payment = i === 0 ? (M - D) : M;
    totalNominal += payment;
    const survival = Math.pow(survivalFactor, i);
    const discount = Math.pow(discountFactor, i);
    const contribution = payment * survival * discount;
    rows.push({
      month: i + 1,
      payment,
      survival,
      discount,
      contribution,
      isFirst: i === 0,
    });
  }

  const diff = Y - epv;
  const pct = Y > 0 ? (Math.abs(diff) / Y * 100) : 0;

  return { epv, Y, diff, pct, rows, totalNominal, d, c };
}

// ── 盈亏平衡退订率（二分法） ──
function breakevenChurn(M, Y, D, r, pi) {
  let lo = 0, hi = 1;
  for (let iter = 0; iter < 60; iter++) {
    const mid = (lo + hi) / 2;
    const d = (1 - mid) / ((1 + r) * (1 + pi));
    let epv;
    if (Math.abs(1 - d) < 1e-12) {
      epv = (M - D) + M * 11;
    } else {
      epv = (M - D) + M * d * (1 - Math.pow(d, 11)) / (1 - d);
    }
    if (epv < Y) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// ── 渲染 ──
function render(result) {
  const { epv, Y, diff, pct, rows, totalNominal } = result;
  const absDiff = Math.abs(diff);
  const cls = absDiff < 1 ? 'equal' : (diff > 0 ? 'cheaper' : 'pricier');

  let conclusionText;
  if (cls === 'cheaper') {
    conclusionText = `月付更划算 — 等效年成本 ¥${epv.toFixed(2)}，比年付少 ¥${absDiff.toFixed(2)}（节省 ${pct.toFixed(1)}%）`;
  } else if (cls === 'pricier') {
    conclusionText = `年付更划算 — 等效年成本 ¥${epv.toFixed(2)}，比年付多 ¥${absDiff.toFixed(2)}（多花 ${pct.toFixed(1)}%）`;
  } else {
    conclusionText = `两者相当 — 等效年成本 ¥${epv.toFixed(2)} ≈ 年付 ¥${Y.toFixed(2)}`;
  }

  els.epvValue.textContent = `¥${epv.toFixed(2)}`;
  els.epvSub.textContent = `期望现值（名义合计 ¥${totalNominal.toFixed(2)}）`;
  els.yearValue.textContent = `¥${Y.toFixed(2)}`;
  els.yearSub.textContent = '标价';
  els.conclusion.textContent = conclusionText;
  els.conclusion.className = 'conclusion ' + cls;

  // 盈亏平衡
  const M = parseFloat(els.monthlyPrice.value) || 0;
  const D = parseFloat(els.firstMonthDiscount.value) || 0;
  const r = (parseFloat(els.discountRate.value) || 0) / 100;
  const pi = (parseFloat(els.inflationRate.value) || 0) / 100;
  const beChurn = breakevenChurn(M, Y, D, r, pi);

  if (beChurn > 0 && beChurn < 1) {
    els.breakeven.innerHTML =
      `在当前折现率 & 通胀率下，<strong>退订率低于 ${(beChurn * 100).toFixed(1)}%</strong> 时年付更划算；` +
      `高于此值时月付更划算。`;
  } else if (beChurn <= 0) {
    els.breakeven.innerHTML = `在所有退订率下，<strong>月付都更划算</strong>。`;
  } else {
    els.breakeven.innerHTML = `在所有退订率下，<strong>年付都更划算</strong>。`;
  }

  // 月度明细表
  let tbodyHTML = '';
  for (const row of rows) {
    tbodyHTML += `<tr>
      <td>${row.isFirst ? '第 1 月 (首月)' : '第 ' + row.month + ' 月'}</td>
      <td>¥${row.payment.toFixed(2)}</td>
      <td>${(row.survival * 100).toFixed(1)}%</td>
      <td>${row.discount.toFixed(4)}</td>
      <td>¥${row.contribution.toFixed(2)}</td>
    </tr>`;
  }
  els.tableBody.innerHTML = tbodyHTML;
  els.footPay.textContent = `¥${totalNominal.toFixed(2)}`;
  els.footEPV.textContent = `¥${epv.toFixed(2)}`;
}

// ── 重新计算 ──
function recalc() {
  const M = parseFloat(els.monthlyPrice.value) || 0;
  const Y = parseFloat(els.yearlyPrice.value) || 0;
  const D = parseFloat(els.firstMonthDiscount.value) || 0;
  const r = parseFloat(els.discountRate.value) || 0;
  const pi = parseFloat(els.inflationRate.value) || 0;
  const c = parseFloat(els.churnRate.value) || 0;
  render(compute(M, Y, D, r, pi, c));
}

// ── 事件绑定 ──
function bindInputs() {
  const inputs = [els.monthlyPrice, els.yearlyPrice, els.firstMonthDiscount,
                  els.discountRate, els.inflationRate, els.churnRate];
  for (const el of inputs) el.addEventListener('input', recalc);
}

// ── 敏感性滑块 ──
els.churnSlider.addEventListener('input', () => {
  const val = parseFloat(els.churnSlider.value);
  els.sliderVal.textContent = val.toFixed(1) + '%';
  els.churnRate.value = val;
  recalc();
});

els.churnRate.addEventListener('input', () => {
  const val = parseFloat(els.churnRate.value) || 0;
  els.churnSlider.value = Math.min(30, Math.max(0, val));
  els.sliderVal.textContent = val.toFixed(1) + '%';
});

// ── URL 状态保存/恢复 ──
const URL_FIELDS = ['monthlyPrice','yearlyPrice','firstMonthDiscount',
                    'discountRate','inflationRate','churnRate'];

function saveURL() {
  const params = new URLSearchParams();
  for (const f of URL_FIELDS) {
    const el = $(f);
    if (el && el.value) params.set(f, el.value);
  }
  const hash = params.toString();
  if (hash) window.location.hash = hash;
}

function loadURL() {
  if (!window.location.hash) return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  for (const f of URL_FIELDS) {
    const v = params.get(f);
    if (v !== null) {
      const el = $(f);
      if (el) el.value = v;
    }
  }
}

window.addEventListener('hashchange', () => { loadURL(); recalc(); });

let urlTimer;
function debouncedSaveURL() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(saveURL, 500);
}

for (const el of [els.monthlyPrice, els.yearlyPrice, els.firstMonthDiscount,
                  els.discountRate, els.inflationRate, els.churnRate]) {
  el.addEventListener('input', debouncedSaveURL);
}

// ── 基准值加载 ──
async function loadBenchmarks() {
  try {
    const resp = await fetch(BENCHMARKS_URL);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    benchmarks = await resp.json();
    applyBenchmarks();
  } catch (e) {
    console.warn('Benchmarks unavailable, using defaults:', e.message);
    applyDefaults();
  }
}

function applyDefaults() {
  buildDiscountPresets(0.13, 0.21, 0.42, '余额宝 ~2.5% 年化');
  buildInflationPresets(0.17, '国家统计局 CPI ~2% 年');
  buildChurnPresets([
    { label: '视频流媒体', value: 5.5 },
    { label: '音乐流媒体', value: 2.0 },
    { label: '云存储/网盘', value: 2.0 },
    { label: 'SaaS/工具软件', value: 4.8 },
    { label: '健身/健康', value: 12.0 },
    { label: '教育/学习', value: 7.6 },
    { label: '新闻/媒体', value: 9.0 },
    { label: '游戏通行证', value: 10.0 },
    { label: '电商会员', value: 6.6 },
  ]);
  els.dataDate.textContent = '基准值更新：2026-06-23（默认值）';
}

function applyBenchmarks() {
  const b = benchmarks;
  const src = b.sources || {};

  const disc = b.discount_monthly || {};
  buildDiscountPresets(
    disc.conservative || 0.13,
    disc.neutral || 0.21,
    disc.aggressive || 0.42,
    src.discount || ''
  );

  const infl = b.inflation_monthly;
  buildInflationPresets(infl || 0.17, src.inflation || '');

  const cats = b.churn_benchmarks?.categories || {};
  const catList = Object.entries(cats).map(([, val]) => ({
    label: val.label || '',
    value: (val.monthly_churn || 0) * 100,
  }));
  if (catList.length === 0) { applyDefaults(); return; }
  buildChurnPresets(catList);

  els.dataDate.textContent = `基准值更新：${b.last_updated || '—'}`;
}

function buildDiscountPresets(conservative, neutral, aggressive, source) {
  els.discountPresets.innerHTML = '';
  const btns = [
    { label: '保守', value: conservative },
    { label: '中性', value: neutral },
    { label: '进取', value: aggressive },
  ];
  for (const b of btns) {
    const btn = document.createElement('button');
    btn.className = 'quick-btn';
    btn.textContent = `${b.label} ${b.value.toFixed(2)}%`;
    btn.addEventListener('click', () => {
      els.discountRate.value = b.value;
      highlightActive(els.discountPresets, btn);
      recalc();
      debouncedSaveURL();
    });
    els.discountPresets.appendChild(btn);
    if (Math.abs(parseFloat(els.discountRate.value) - b.value) < 0.005) {
      btn.classList.add('active');
    }
  }
  els.discountSrc.textContent = source ? `来源：${source}` : '';
}

function buildInflationPresets(value, source) {
  els.inflationPresets.innerHTML = '';
  const btn = document.createElement('button');
  btn.className = 'quick-btn';
  btn.textContent = `当前 CPI ${value.toFixed(2)}%`;
  btn.addEventListener('click', () => {
    els.inflationRate.value = value;
    highlightActive(els.inflationPresets, btn);
    recalc();
    debouncedSaveURL();
  });
  if (Math.abs(parseFloat(els.inflationRate.value) - value) < 0.005) {
    btn.classList.add('active');
  }
  els.inflationPresets.appendChild(btn);
  els.inflationSrc.textContent = source ? `来源：${source}` : '';
}

function buildChurnPresets(categories) {
  const cs = new CustomSelect(els.churnPresetWrapper);
  cs.setOptions(categories);
  cs.onSelect((val) => {
    els.churnRate.value = val;
    els.churnSlider.value = Math.min(30, Math.max(0, val));
    els.sliderVal.textContent = val.toFixed(1) + '%';
    recalc();
    debouncedSaveURL();
  });

  if (benchmarks?.churn_benchmarks?.source) {
    els.churnSrc.textContent = `来源：${benchmarks.churn_benchmarks.source}（手动维护）`;
  } else {
    els.churnSrc.textContent = '来源：Recurly Research, Churnkey（手动维护）';
  }
}

function highlightActive(container, activeBtn) {
  for (const child of container.children) child.classList.remove('active');
  activeBtn.classList.add('active');
}

// ── 启动 ──
loadURL();
bindInputs();
recalc();
loadBenchmarks();
