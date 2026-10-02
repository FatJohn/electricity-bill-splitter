# Electricity Bill Splitter

一個純前端的繁體中文電費分攤計算器。它把每人的固定基礎電費先扣除，再按照冷氣設定溫度、每日使用時間與省電模式計算相對權重，適合直接在瀏覽器使用或部署到 GitHub Pages。

## 分攤公式

預設值是總電費 `7,733` 元、每人基礎電費 `600` 元，並預載 A、B、C、D 四位住戶的範例資料。

```text
溫度係數 = clamp(1 + (26 - 設定溫度) × 0.08, 0.8, 1.5)
模式係數 = 一般模式 1.00；省電模式 0.85
個人權重 = 每日使用時數 × 溫度係數 × 模式係數

基礎費合計 = 每人基礎電費 × 住戶人數
冷氣分攤池 = 總電費 - 基礎費合計
個人冷氣分攤 = 冷氣分攤池 × 個人權重 ÷ 全部住戶權重
個人應付總額 = 每人基礎電費 + 個人冷氣分攤
```

金額使用整數台幣。冷氣分攤採最大餘數法，把最後的零頭依小數餘數由大到小分配；餘數相同時依畫面上的住戶順序，因此每次結果都能精確加總回總電費。

溫度係數會限制在 `0.8` 到 `1.5`，畫面輸入溫度限制為 `16°C` 到 `32°C`；每日使用時數限制為 `0` 到 `24` 小時。當總電費不足以支付所有基礎費、沒有住戶，或冷氣分攤池大於零但所有時數都是零時，畫面會顯示原因並停止產生誤導性的結果。冷氣分攤池為零時，即使所有權重都是零也會正常顯示基礎費。

## 本機使用

需要 Node.js 20.19 以上版本（GitHub Actions 使用 Node.js 24）。

```bash
npm ci
npm run dev
```

其他指令：

```bash
npm test         # 執行 Vitest 純函式測試
npm run build    # TypeScript 檢查並產生 dist/
npm run preview  # 預覽 production build
```

## GitHub Pages 部署

Vite 已設定 `base: './'`，因此可以在 localhost 與 GitHub Pages 的專案子路徑中使用相同的 build。專案包含 `.github/workflows/deploy.yml`，每次推送到 `main` 或手動執行 workflow 都會測試、build 並發布 `dist/`。

若要從這個目錄建立 public repository 並推送初始版本：

```bash
git init -b main
git add .
git commit -m 'feat: add electricity bill splitter'
gh repo create electricity-bill-splitter --public --source=. --remote=origin --push
```

第一次使用 workflow 部署前，可以用目前登入的 GitHub 帳號建立 Pages site：

```bash
OWNER="$(gh api user --jq '.login')"
gh api --method POST "repos/${OWNER}/electricity-bill-splitter/pages" -f build_type=workflow
```

也可以在 GitHub repository 的 **Settings → Pages** 將 **Source** 設成 **GitHub Actions**，再到 **Actions** 手動執行 `Deploy to GitHub Pages`。workflow 使用 GitHub 官方 Pages actions：`actions/checkout@v6`、`actions/setup-node@v6`、`actions/configure-pages@v5`、`actions/upload-pages-artifact@v4` 與 `actions/deploy-pages@v4`。

## 專案結構

```text
src/calculation.ts       # 純計算核心與輸入驗證
src/calculation.test.ts  # clamp、分配、零頭與錯誤邊界測試
src/App.tsx              # 繁體中文互動介面
src/styles.css           # responsive layout 與 visual tokens
.github/workflows/       # GitHub Pages workflow
```

這個工具不需要後端，也不會將輸入資料寫入伺服器或 local storage。
