import { useMemo, useState } from 'react'
import {
  calculateBill,
  ECO_MODE_FACTOR,
  getTemperatureFactor,
  MAX_INPUT_TEMPERATURE,
  MAX_DAILY_HOURS,
  MIN_INPUT_TEMPERATURE,
  type ResidentInput,
} from './calculation'

const INITIAL_TOTAL_BILL = 7733
const INITIAL_BASE_FEE = 600

const INITIAL_RESIDENTS: ResidentInput[] = [
  { id: 'resident-a', name: 'A', temperature: 24, hoursPerDay: 14, eco: false },
  { id: 'resident-b', name: 'B', temperature: 21, hoursPerDay: 10, eco: false },
  { id: 'resident-c', name: 'C', temperature: 24, hoursPerDay: 4, eco: false },
  { id: 'resident-d', name: 'D', temperature: 26, hoursPerDay: 8, eco: true },
]

let nextResidentNumber = 1

function makeResident(): ResidentInput {
  const number = nextResidentNumber
  nextResidentNumber += 1
  return {
    id: `resident-new-${number}`,
    name: `住戶 ${number}`,
    temperature: 26,
    hoursPerDay: 0,
    eco: false,
  }
}

function formatMoney(value: number): string {
  return `NT$ ${value.toLocaleString('zh-TW')}`
}

function formatNumber(value: number, digits = 2): string {
  return value.toLocaleString('zh-TW', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
}

function numberInputValue(value: number): number | string {
  return Number.isFinite(value) ? value : ''
}

function App() {
  const [totalBill, setTotalBill] = useState(INITIAL_TOTAL_BILL)
  const [baseFee, setBaseFee] = useState(INITIAL_BASE_FEE)
  const [residents, setResidents] = useState<ResidentInput[]>(INITIAL_RESIDENTS)

  const result = useMemo(
    () => calculateBill({ totalBill, baseFee, residents }),
    [baseFee, residents, totalBill],
  )

  const updateResident = (id: string, changes: Partial<ResidentInput>) => {
    setResidents((current) =>
      current.map((resident) =>
        resident.id === id ? { ...resident, ...changes } : resident,
      ),
    )
  }

  const addResident = () => {
    setResidents((current) => [...current, makeResident()])
  }

  const removeResident = (id: string) => {
    setResidents((current) => current.filter((resident) => resident.id !== id))
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" role="presentation">
              <path d="M18.2 2.8 6.9 18h7.6l-1.1 11.2L25.1 14h-7.4l.5-11.2Z" />
            </svg>
          </div>
          <div>
            <p className="eyebrow">室友共用工具</p>
            <h1>電費分攤計算器</h1>
          </div>
        </div>
        <p className="header-note">純前端・即時更新</p>
      </header>

      <div className="intro-row">
        <p className="intro-copy">
          用冷氣使用權重分攤共同電費，每個人的條件都清楚列出來。
        </p>
        <p className="intro-note">估算相對用電責任，不代表冷氣實際 kWh。</p>
      </div>

      <div className="dashboard-grid">
        <aside className="setup-panel" aria-labelledby="bill-settings-title">
          <div className="section-kicker">01 / 帳單</div>
          <h2 id="bill-settings-title">本月帳單</h2>
          <p className="section-description">先填共同帳單，再調整每位住戶的冷氣使用。</p>

          <div className="field-stack">
            <label className="field-label" htmlFor="total-bill">
              總電費
              <span className="field-hint">台幣整數</span>
            </label>
            <div className="input-with-unit">
              <input
                id="total-bill"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={numberInputValue(totalBill)}
                onChange={(event) =>
                  setTotalBill(event.target.value === '' ? Number.NaN : Number(event.target.value))
                }
              />
              <span>元</span>
            </div>
          </div>

          <div className="field-stack">
            <label className="field-label" htmlFor="base-fee">
              每人基礎電費
              <span className="field-hint">共同使用部分</span>
            </label>
            <div className="input-with-unit">
              <input
                id="base-fee"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={numberInputValue(baseFee)}
                onChange={(event) =>
                  setBaseFee(event.target.value === '' ? Number.NaN : Number(event.target.value))
                }
              />
              <span>元</span>
            </div>
          </div>

          {result.ok && (
            <div className="bill-breakdown" aria-label="帳單拆分">
              <div>
                <span>基礎費合計</span>
                <strong>{formatMoney(result.baseTotal)}</strong>
              </div>
              <div className="bill-breakdown-highlight">
                <span>冷氣分攤池</span>
                <strong>{formatMoney(result.variableBill)}</strong>
              </div>
            </div>
          )}

          <div className="formula-card">
            <div className="formula-card-heading">
              <span className="formula-dot" aria-hidden="true" />
              分攤規則
            </div>
            <p>溫度係數 = 1 + (26 − 設定溫度) × 0.08，限制在 0.8～1.5。</p>
            <p>個人權重 = 時數 × 溫度係數 × 模式係數</p>
            <p>省電模式係數 = {ECO_MODE_FACTOR}</p>
            <p>冷氣分攤池 = 總電費 − (基礎費 × 住戶人數)</p>
            <p>個人冷氣分攤 = 冷氣分攤池 × 個人權重 ÷ 全部權重</p>
            <p>個人應付總額 = 基礎費 + 個人冷氣分攤</p>
          </div>
        </aside>

        <section className="workspace-panel" aria-labelledby="residents-title">
          <div className="workspace-heading">
            <div>
              <div className="section-kicker">02 / 使用情況</div>
              <h2 id="residents-title">住戶與冷氣設定</h2>
            </div>
            <button className="button button-primary" type="button" onClick={addResident}>
              <span className="button-plus" aria-hidden="true">＋</span>
              新增住戶
            </button>
          </div>

          <div className="resident-list">
            {residents.map((resident, index) => (
              <article className="resident-row" key={resident.id}>
                <div className="resident-name-field">
                  <span className="resident-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
                  <label className="field-label" htmlFor={`name-${resident.id}`}>
                    姓名
                    <input
                      id={`name-${resident.id}`}
                      type="text"
                      value={resident.name}
                      onChange={(event) => updateResident(resident.id, { name: event.target.value })}
                      placeholder="例如：A"
                    />
                  </label>
                </div>

                <label className="field-label" htmlFor={`temperature-${resident.id}`}>
                  設定溫度
                  <span className="number-input-with-unit">
                    <input
                      id={`temperature-${resident.id}`}
                      type="number"
                      min={MIN_INPUT_TEMPERATURE}
                      max={MAX_INPUT_TEMPERATURE}
                      step="1"
                      inputMode="numeric"
                      value={numberInputValue(resident.temperature)}
                      onChange={(event) =>
                        updateResident(resident.id, {
                          temperature: event.target.value === '' ? Number.NaN : Number(event.target.value),
                        })
                      }
                    />
                    <span>°C</span>
                  </span>
                </label>

                <label className="field-label" htmlFor={`hours-${resident.id}`}>
                  每日使用
                  <span className="number-input-with-unit">
                    <input
                      id={`hours-${resident.id}`}
                      type="number"
                      min="0"
                      max={MAX_DAILY_HOURS}
                      step="0.5"
                      inputMode="decimal"
                      value={numberInputValue(resident.hoursPerDay)}
                      onChange={(event) =>
                        updateResident(resident.id, {
                          hoursPerDay: event.target.value === '' ? Number.NaN : Number(event.target.value),
                        })
                      }
                    />
                    <span>小時</span>
                  </span>
                </label>

                <label className="eco-toggle" htmlFor={`eco-${resident.id}`}>
                  <input
                    id={`eco-${resident.id}`}
                    type="checkbox"
                    checked={resident.eco}
                    onChange={(event) => updateResident(resident.id, { eco: event.target.checked })}
                  />
                  <span className="toggle-track" aria-hidden="true"><span /></span>
                  <span>
                    <strong>省電模式</strong>
                    <small>{resident.eco ? '係數 0.85' : '一般模式'}</small>
                  </span>
                </label>

                <button
                  className="button-delete"
                  type="button"
                  onClick={() => removeResident(resident.id)}
                  aria-label={`刪除 ${resident.name || `第 ${index + 1} 位住戶`}`}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 7h14M9 7V5h6v2m-8 0 .8 12h6.4L15 7M10 10v6m4-6v6" />
                  </svg>
                </button>
              </article>
            ))}
          </div>

          {!result.ok && (
            <div className="validation-message" role="alert">
              <span className="validation-icon" aria-hidden="true">!</span>
              <div>
                <strong>目前還不能完成分攤</strong>
                <p>{result.error.message}</p>
              </div>
            </div>
          )}

          {result.ok && <Results result={result} />}
        </section>
      </div>

      <footer className="app-footer">
        <span>權重會隨輸入即時更新，金額採整數台幣並以最大餘數法分配。</span>
        <span>資料只留在目前瀏覽器分頁。</span>
      </footer>
    </main>
  )
}

function Results({ result }: { result: Extract<ReturnType<typeof calculateBill>, { ok: true }> }) {
  return (
    <section className="results-section" aria-labelledby="results-title">
      <div className="results-heading">
        <div>
          <div className="section-kicker">03 / 分攤結果</div>
          <h2 id="results-title">每人應付金額</h2>
        </div>
        <div className="result-total">
          <span>本月合計</span>
          <strong>{formatMoney(result.totalBill)}</strong>
        </div>
      </div>

      <div className="result-summary" aria-label="分攤摘要">
        <div>
          <span>住戶人數</span>
          <strong>{result.residents.length} 人</strong>
        </div>
        <div>
          <span>冷氣總權重</span>
          <strong>{formatNumber(result.totalWeight)}</strong>
        </div>
        <div>
          <span>冷氣分攤池</span>
          <strong>{formatMoney(result.variableBill)}</strong>
        </div>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col">住戶</th>
              <th scope="col">權重</th>
              <th scope="col">比例</th>
              <th scope="col">基礎費</th>
              <th scope="col">冷氣分攤</th>
              <th scope="col" className="total-column">應付總額</th>
            </tr>
          </thead>
          <tbody>
            {result.residents.map((resident) => (
              <tr key={resident.id}>
                <th scope="row">
                  <span className="table-name">{resident.name}</span>
                  <span className="table-detail">
                    {resident.temperature}°C · {formatNumber(resident.hoursPerDay)} 小時
                    {resident.eco ? ' · 省電' : ''}
                  </span>
                </th>
                <td data-label="權重">{formatNumber(resident.weight)}</td>
                <td data-label="比例">
                  <span className="share-cell">
                    <span className="share-bar" aria-hidden="true"><span style={{ width: `${resident.sharePercent}%` }} /></span>
                    {formatNumber(resident.sharePercent)}%
                  </span>
                </td>
                <td data-label="基礎費">{formatMoney(resident.baseFee)}</td>
                <td data-label="冷氣分攤">{formatMoney(resident.airconFee)}</td>
                <td data-label="應付總額" className="total-column"><strong>{formatMoney(resident.totalFee)}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">合計</th>
              <td data-label="權重">{formatNumber(result.totalWeight)}</td>
              <td data-label="比例">{result.totalWeight === 0 ? '0%' : '100%'}</td>
              <td data-label="基礎費">{formatMoney(result.baseTotal)}</td>
              <td data-label="冷氣分攤">{formatMoney(result.variableBill)}</td>
              <td data-label="應付總額" className="total-column"><strong>{formatMoney(result.totalBill)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

export default App
