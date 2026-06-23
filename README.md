# 订阅价格比较器

**包月 vs 包年，用折现率 + 通胀率 + 退订率看清真实成本。**

## 功能

- 输入月付/年付价格、折现率、通胀率、退订率、首月折扣
- 计算调整后的期望现值（EPV），与年付对比
- 月度明细表：逐月展示存活概率、折现因子、贡献值
- 盈亏平衡分析：在当前参数下，退订率多少时月付=年付
- 敏感性滑块：拖动退订率查看连续变化
- URL 分享：参数编码在 hash，复制即分享
- 快捷填值：折现率三档 + 品类退订率基准 + CPI 预设
- 数据自动更新：每 2 月通过 GitHub Actions 更新 CPI 和利率基准

## 使用方法

直接在浏览器中打开 `index.html`，或部署到任意静态托管（GitHub Pages / Vercel / Netlify）。

## 数学模型

```
d = (1 - 退订率) / ((1 + 月折现率) × (1 + 月通胀率))

期望现值 = (月付 - 首月折扣) + 月付 × d × (1 - d¹¹) / (1 - d)
```

## 数据来源

| 参数 | 来源 | 更新方式 |
|------|------|---------|
| CPI 通胀率 | 国家统计局 | GitHub Actions 自动（每 2 月） |
| 折现率基准 | 中债 10 年期国债收益率 | GitHub Actions 自动（每 2 月） |
| 退订率品类基准 | Recurly Research, Churnkey | 手动维护 |

## 项目结构

```
├── index.html          # 应用主文件
├── styles.css          # 样式（瑞士国际主义风格）
├── app.js              # 计算逻辑 + UI 绑定
├── data/
│   └── benchmarks.json # 基准值数据
├── scripts/
│   └── update-benchmarks.js  # 数据自动更新脚本
├── .github/workflows/
│   └── bimonthly-update.yml  # 定时任务
└── README.md
```
