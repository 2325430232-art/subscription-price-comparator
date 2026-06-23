#!/usr/bin/env node
// ── 数学模型验证测试 ──
// 运行: node test-math.js

let passed = 0;
let failed = 0;

const EPSILON = 0.02; // 允许 2 分钱舍入误差

function assert(label, actual, expected) {
  let ok;
  if (typeof actual === 'boolean') {
    ok = actual === expected;
  } else {
    ok = Math.abs(actual - expected) < EPSILON;
  }
  if (ok) {
    passed++;
    const a = typeof actual === 'boolean' ? actual : actual.toFixed(2);
    const e = typeof expected === 'boolean' ? expected : expected.toFixed(2);
    console.log(`  PASS  ${label}: ${a} ≈ ${e}`);
  } else {
    failed++;
    const a = typeof actual === 'boolean' ? actual : actual.toFixed(2);
    const e = typeof expected === 'boolean' ? expected : expected.toFixed(2);
    console.log(`  FAIL  ${label}: got ${a}, expected ${e}`);
  }
}

// ── 引入计算函数 ──
function compute(monthlyPrice, yearlyPrice, firstMonthDiscount,
                 discountRatePct, inflationRatePct, churnRatePct) {
  const M = monthlyPrice;
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
  return epv;
}

// ── 测试用例 ──
console.log('\n=== 退化验证（所有率为 0）===');
assert('全0 → 12M', compute(30, 360, 0, 0, 0, 0), 360);
assert('全0, 有折扣', compute(30, 360, 10, 0, 0, 0), 350);

console.log('\n=== 纯折现（无通胀、无退订）===');
// r=0.5%月, d=1/1.005=0.99502
// EPV = M + M*d*(1-d^11)/(1-d)
const discOnly = compute(30, 360, 0, 0.5, 0, 0);
// 手动: d=0.99502, d^11=0.9466, EPV=30+30*0.99502*0.0534/0.00498=30+320.2=350.2
console.log(`  折现0.5%: EPV=${discOnly.toFixed(2)} (应 < 360)`);
assert('折现率>0 则 EPV<12M', discOnly < 360, true);

console.log('\n=== 纯退订（无折现、无通胀）===');
// c=5%月, d=0.95
// EPV = M + M*0.95*(1-0.95^11)/0.05 = 30 + 30*0.95*0.4312/0.05 = 30+245.8=275.8
const churnOnly = compute(30, 360, 0, 0, 0, 5);
console.log(`  退订5%: EPV=${churnOnly.toFixed(2)} (应 < 360)`);
assert('退订率>0 则 EPV<12M', churnOnly < 360, true);

console.log('\n=== 混合场景 ===');
// 默认参数: M=30, D=0, r=0.21%, π=0.17%, c=5%
const mixed = compute(30, 288, 0, 0.21, 0.17, 5);
assert('默认参数', mixed, 270.74);

console.log('\n=== 首月折扣 ===');
const discount1 = compute(30, 288, 15, 0.21, 0.17, 5);
assert('首月半价', discount1, 255.73); // 15 + 30*d*(1-d^11)/(1-d)

console.log('\n=== 边界：极高退订率 ===');
const highChurn = compute(30, 288, 0, 0.21, 0.17, 50);
assert('退订50% → EPV很低', highChurn < 60, true);

console.log('\n=== 边界：极低退订率 ===');
const lowChurn = compute(30, 288, 0, 0.21, 0.17, 0);
// d = 1/(1.0021*1.0017) = 0.99622, EPV ~ 30*11.82 = 354.6
assert('退订0% → EPV接近12M但折现', lowChurn < 360 && lowChurn > 350, true);

console.log('\n=== 单调性验证 ===');
// 退订率递增 → EPV 递减
const c0 = compute(30, 288, 0, 0.21, 0.17, 0);
const c5 = compute(30, 288, 0, 0.21, 0.17, 5);
const c10 = compute(30, 288, 0, 0.21, 0.17, 10);
assert('c0>c5', c0 > c5, true);
assert('c5>c10', c5 > c10, true);

// 折现率递增 → EPV 递减
const r0 = compute(30, 288, 0, 0, 0.17, 5);
const r1 = compute(30, 288, 0, 0.5, 0.17, 5);
assert('r0>r1', r0 > r1, true);

// 通胀率递增 → EPV 递减
const pi0 = compute(30, 288, 0, 0.21, 0, 5);
const pi1 = compute(30, 288, 0, 0.21, 0.5, 5);
assert('π0>π1', pi0 > pi1, true);

// ── 报告 ──
console.log(`\n=== ${passed} passed / ${failed} failed ===`);
process.exit(failed > 0 ? 1 : 0);
