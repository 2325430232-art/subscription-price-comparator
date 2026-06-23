#!/usr/bin/env node
// ── 基准值自动更新脚本 ──
// 由 GitHub Actions 每 2 个月触发
// 抓取: CPI (国家统计局) + 国债收益率 (替代数据源)
// 退订率基准保持手动维护，此脚本不更新

const fs = require('fs');
const path = require('path');

const BENCHMARKS_PATH = path.join(__dirname, '..', 'data', 'benchmarks.json');
const USER_AGENT = 'subscription-calculator-bot/1.0 (data update)';

function loadBenchmarks() {
  return JSON.parse(fs.readFileSync(BENCHMARKS_PATH, 'utf-8'));
}

function saveBenchmarks(data) {
  fs.writeFileSync(BENCHMARKS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// ── 1. CPI 数据 ──
// 国家统计局 easyquery API
// 指标: A010101（居民消费价格指数 上月=100）
// 如果请求失败，保留上次值，输出告警
async function fetchCPI() {
  try {
    // 取最近 12 个月的 CPI 月度环比数据，求几何平均
    const now = new Date();
    const endMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 国家统计局公开 API
    const url = 'https://data.stats.gov.cn/easyquery.htm' +
      '?m=QueryData&dbcode=hgnd&rowcode=zb&colcode=sj&wds=[]' +
      '&dfwds=[{"wdcode":"zb","valuecode":"A010101"},{"wdcode":"sj","valuecode":"' + endMonth + '"}]';

    const resp = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!resp.ok) throw new Error(`CPI fetch failed: HTTP ${resp.status}`);

    const json = await resp.json();
    const datanodes = json?.returndata?.datanodes || [];

    if (datanodes.length === 0) throw new Error('CPI: no data returned');

    // 取最近节点值，转换为月环比
    const values = datanodes
      .map(n => {
        const v = n.data?.data;
        return v ? parseFloat(v) : null;
      })
      .filter(v => v !== null && !isNaN(v));

    if (values.length === 0) throw new Error('CPI: no valid values');

    // 月度环比均值 → 转为月化率
    // CPI 数据 "上月=100"，值 100.2 表示环比 +0.2%
    const avgCPI = values.reduce((a, b) => a + b, 0) / values.length;
    const monthlyInflation = (avgCPI - 100) / 100;

    console.log(`CPI: avg value = ${avgCPI.toFixed(2)}, monthly inflation = ${(monthlyInflation * 100).toFixed(3)}%`);

    return Math.max(0, monthlyInflation);
  } catch (e) {
    console.warn(`CPI fetch warning: ${e.message} — using previous value`);
    return null;
  }
}

// ── 2. 国债收益率 ──
// 使用中国人民银行或替代源获取 10 年期国债收益率
// 年化 → 月化: r_monthly = (1 + r_annual)^(1/12) - 1 ≈ r_annual / 12
async function fetchBondYield() {
  try {
    // 尝试从中债信息网获取（可能不稳定，加容错）
    const url = 'https://yield.chinabond.com.cn/cbweb-mn/yield_main' +
      '?locale=zh_CN&workTime=1';
    const resp = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!resp.ok) throw new Error(`Bond yield fetch failed: HTTP ${resp.status}`);

    const text = await resp.text();
    // 尝试解析 JSON（中债接口格式可能变化，需容错）
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Bond yield: not JSON');
    }

    // 中债返回格式较复杂，尝试提取 10 年期收益率
    // 如果解析失败则使用备选方案
    let annualYield = null;

    // 尝试多种可能的数据路径
    if (data?.data?.length > 0) {
      for (const item of data.data) {
        if (item.name?.includes('10年') || item.term === '10Y') {
          annualYield = parseFloat(item.yield || item.value || 0);
          break;
        }
      }
    }

    if (!annualYield || isNaN(annualYield)) {
      throw new Error('Bond yield: could not extract 10Y rate');
    }

    const monthly = annualYield / 100 / 12;
    console.log(`Bond yield: annual = ${annualYield.toFixed(2)}%, monthly = ${(monthly * 100).toFixed(3)}%`);

    return monthly;
  } catch (e) {
    console.warn(`Bond yield fetch warning: ${e.message} — using previous value`);
    return null;
  }
}

// ── 主流程 ──
async function main() {
  console.log(`=== Benchmarks Update — ${new Date().toISOString()} ===\n`);

  const data = loadBenchmarks();
  let changed = false;

  // CPI
  const cpi = await fetchCPI();
  if (cpi !== null) {
    data.inflation_monthly = parseFloat(cpi.toFixed(4));
    data.inflation_annual_pct = parseFloat((cpi * 12 * 100).toFixed(1));
    changed = true;
  }

  // 国债收益率
  const bond = await fetchBondYield();
  if (bond !== null) {
    const monthlyPct = bond * 100;
    data.discount_monthly.neutral = parseFloat(monthlyPct.toFixed(2));
    data.discount_monthly.conservative = parseFloat((monthlyPct * 0.6).toFixed(2));
    data.discount_monthly.aggressive = parseFloat((monthlyPct * 2).toFixed(2));
    changed = true;
  }

  // 更新日期
  data.last_updated = new Date().toISOString().split('T')[0];

  if (changed) {
    saveBenchmarks(data);
    console.log(`\n✓ Benchmarks updated successfully: ${data.last_updated}`);
    console.log(`  CPI monthly: ${(data.inflation_monthly * 100).toFixed(3)}%`);
    console.log(`  Discount neutral: ${data.discount_monthly.neutral}%/month`);
  } else {
    console.log('\n⚠ No data fetched successfully — benchmarks unchanged');
    console.log('  Previous values retained, manual investigation needed');
  }

  console.log('\nNote: churn_benchmarks are manually maintained — not updated by this script.');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
