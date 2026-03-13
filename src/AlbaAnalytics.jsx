import React from "react";

const ranges = [
  { id: "month", label: "Місяць" },
  { id: "quarter", label: "Квартал" },
  { id: "year", label: "Рік" },
  { id: "all", label: "Весь час" },
];

const trendGranularities = [
  { id: "day", label: "По днях" },
  { id: "month", label: "По місяцях" },
  { id: "quarter", label: "По кварталах" },
  { id: "year", label: "По роках" },
];

function parseDateValue(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === "object" && typeof value.toDate === "function") {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed : null;
  }
  return null;
}

function startOfBucket(date, granularity) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();

  if (granularity === "day") return new Date(year, month, day);
  if (granularity === "month") return new Date(year, month, 1);
  if (granularity === "quarter") return new Date(year, Math.floor(month / 3) * 3, 1);
  return new Date(year, 0, 1);
}

function buildBucketKey(startDate, granularity) {
  const year = startDate.getFullYear();
  const month = startDate.getMonth() + 1;
  const day = startDate.getDate();

  if (granularity === "day") {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  if (granularity === "month") {
    return `${year}-${String(month).padStart(2, "0")}`;
  }
  if (granularity === "quarter") {
    return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
  }
  return String(year);
}

function formatBucketLabel(startDate, granularity) {
  if (granularity === "day") {
    return startDate.toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit" });
  }
  if (granularity === "month") {
    return startDate.toLocaleDateString("uk-UA", { month: "short" }).replace(".", "");
  }
  if (granularity === "quarter") {
    return `Q${Math.floor(startDate.getMonth() / 3) + 1} ${startDate.getFullYear()}`;
  }
  return String(startDate.getFullYear());
}

function computeNiceMax(value) {
  if (!value || value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  let factor = 10;
  if (normalized <= 1) factor = 1;
  else if (normalized <= 2) factor = 2;
  else if (normalized <= 5) factor = 5;
  return factor * magnitude;
}

function addBucket(date, granularity) {
  if (granularity === "day") return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  if (granularity === "month") return new Date(date.getFullYear(), date.getMonth() + 1, 1);
  if (granularity === "quarter") return new Date(date.getFullYear(), date.getMonth() + 3, 1);
  return new Date(date.getFullYear() + 1, 0, 1);
}

function isDateInActiveWindow(date, granularity, now) {
  if (granularity === "day") {
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  }
  if (granularity === "month" || granularity === "quarter") {
    return date.getFullYear() === now.getFullYear();
  }
  return true;
}

function trendWindowStart(granularity, now, dates) {
  if (granularity === "day") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (granularity === "month") return new Date(now.getFullYear(), 0, 1);
  if (granularity === "quarter") return new Date(now.getFullYear(), 0, 1);

  const earliest = dates.reduce((minDate, date) => {
    if (!minDate) return date;
    return date.getTime() < minDate.getTime() ? date : minDate;
  }, null);

  return earliest ? new Date(earliest.getFullYear(), 0, 1) : new Date(now.getFullYear(), 0, 1);
}

export default function AlbaAnalytics({
  analyticsCategoryRows,
  analyticsIncomeRows,
  analyticsMonthlyRows,
  analyticsRange,
  onChangeRange,
  totalExpense,
  money,
  transactions,
}) {
  const [trendGranularity, setTrendGranularity] = React.useState("month");
  const [isTrendMenuOpen, setTrendMenuOpen] = React.useState(false);

  const trendMenuRef = React.useRef(null);

  React.useEffect(() => {
    function handleOutside(event) {
      if (!trendMenuRef.current) return;
      if (!trendMenuRef.current.contains(event.target)) {
        setTrendMenuOpen(false);
      }
    }

    if (isTrendMenuOpen) {
      document.addEventListener("pointerdown", handleOutside);
    }
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [isTrendMenuOpen]);

  const trendRows = React.useMemo(() => {
    const expenseDates = [];
    const totals = new Map();
    const now = new Date();

    (transactions || []).forEach((transaction) => {
      if (transaction.type !== "expense") return;
      const amount = Number(transaction.amount || 0);
      if (!amount || Number.isNaN(amount)) return;

      const date = parseDateValue(transaction.createdAt);
      if (!date) return;
      if (!isDateInActiveWindow(date, trendGranularity, now)) return;

      expenseDates.push(date);

      const startDate = startOfBucket(date, trendGranularity);
      const key = buildBucketKey(startDate, trendGranularity);
      const existing = totals.get(key);

      if (!existing) {
        totals.set(key, amount);
      } else {
        totals.set(key, existing + amount);
      }
    });

    const start = trendWindowStart(trendGranularity, now, expenseDates);
    const end = startOfBucket(now, trendGranularity);
    const rows = [];

    for (let cursor = new Date(start); cursor.getTime() <= end.getTime(); cursor = addBucket(cursor, trendGranularity)) {
      const key = buildBucketKey(cursor, trendGranularity);
      rows.push({
        key,
        startDate: new Date(cursor),
        amount: Number(totals.get(key) || 0),
        label: formatBucketLabel(cursor, trendGranularity),
      });
    }

    return rows;
  }, [transactions, trendGranularity]);

  const trendMax = React.useMemo(
    () => computeNiceMax(trendRows.reduce((max, row) => Math.max(max, row.amount), 0)),
    [trendRows]
  );

  const trendTicks = React.useMemo(
    () => Array.from({ length: 5 }, (_, index) => Math.round((trendMax / 4) * (4 - index))),
    [trendMax]
  );

  const trendGeometry = React.useMemo(() => {
    if (!trendRows.length) return null;

    const width = 100;
    const height = 112;
    const step = trendRows.length > 1 ? width / (trendRows.length - 1) : 0;

    const points = trendRows.map((row, index) => {
      const x = trendRows.length > 1 ? index * step : width / 2;
      const ratio = Math.max(0, Math.min(1, Number(row.amount || 0) / trendMax));
      const y = height - ratio * height;
      return { x, y };
    });

    const line = points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
    const area = `${line} ${width},${height} 0,${height}`;

    return { points, line, area, width, height };
  }, [trendRows, trendMax]);

  const donutSegments = React.useMemo(() => {
    const total = analyticsCategoryRows.reduce((acc, row) => acc + Number(row.amount || 0), 0);
    if (!total) return [];

    let start = 0;
    return analyticsCategoryRows.map((row) => {
      const share = (Number(row.amount || 0) / total) * 100;
      const segment = {
        key: row.categoryId,
        color: row.color,
        from: start,
        to: start + share,
        label: row.name,
        amount: row.amount,
      };
      start += share;
      return segment;
    });
  }, [analyticsCategoryRows]);

  const donutStyle = React.useMemo(() => {
    if (!donutSegments.length) return undefined;
    const gradient = donutSegments
      .map((segment) => `${segment.color} ${segment.from.toFixed(2)}% ${segment.to.toFixed(2)}%`)
      .join(", ");
    return { background: `conic-gradient(${gradient})` };
  }, [donutSegments]);

  return (
    <section className="alba-analytics" aria-label="Аналітика">
      <article className="alba-analytics-card">
        <div className="alba-analytics-trend-head">
          <div>
            <p className="alba-label">Динаміка загального бюджету</p>
            <h3>Тренд витрат</h3>
          </div>
          <div className="alba-analytics-kebab" ref={trendMenuRef}>
            <button
              type="button"
              className="alba-analytics-kebab-trigger"
              aria-label="Опції групування"
              aria-haspopup="menu"
              aria-expanded={isTrendMenuOpen}
              onClick={() => setTrendMenuOpen((value) => !value)}
            >
              ⋯
            </button>
            {isTrendMenuOpen ? (
              <div className="alba-analytics-kebab-menu" role="menu" aria-label="Групування динаміки">
                {trendGranularities.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={trendGranularity === option.id}
                    className={trendGranularity === option.id ? "is-active" : ""}
                    onClick={() => {
                      setTrendGranularity(option.id);
                      setTrendMenuOpen(false);
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {trendRows.length ? (
          <div className="alba-budget-trend">
            <div className="alba-budget-trend-y">
              {trendTicks.map((tick) => (
                <span key={tick}>{money(tick)}</span>
              ))}
            </div>

            <div className="alba-budget-trend-chart" role="img" aria-label="Графік динаміки витрат">
              <div className="alba-budget-trend-grid" aria-hidden="true">
                {trendTicks.map((tick) => (
                  <span key={`line-${tick}`} />
                ))}
              </div>

              {trendGeometry ? (
                <div className="alba-budget-trend-line-wrap">
                  <svg
                    className="alba-budget-trend-svg"
                    viewBox={`0 0 ${trendGeometry.width} ${trendGeometry.height}`}
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <polygon className="alba-budget-trend-area" points={trendGeometry.area} />
                    <polyline className="alba-budget-trend-line" points={trendGeometry.line} />
                    {trendGeometry.points.map((point, index) => (
                      <circle
                        key={`dot-${trendRows[index].key}`}
                        className="alba-budget-trend-dot"
                        cx={point.x}
                        cy={point.y}
                        r="2.2"
                      />
                    ))}
                  </svg>

                  <div className="alba-budget-trend-x">
                    {trendRows.map((row) => (
                      <div key={row.key} className="alba-budget-trend-col">
                        <div className="alba-budget-trend-amount">{money(row.amount)}</div>
                        <div className="alba-budget-trend-label">{row.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <p className="alba-subtle">Поки недостатньо витрат для побудови динаміки.</p>
        )}
      </article>

      <article className="alba-analytics-card">
        <div className="alba-analytics-headline">
          <div>
            <p className="alba-label">Зріз аналітики</p>
            <h3>Період</h3>
          </div>
          <div className="alba-analytics-filters" role="tablist" aria-label="Фільтр періоду">
            {ranges.map((range) => (
              <button
                key={range.id}
                type="button"
                className={analyticsRange === range.id ? "is-active" : ""}
                onClick={() => onChangeRange(range.id)}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </article>

      <article className="alba-analytics-card">
        <p className="alba-label">Структура витрат</p>
        <h3>Donut + топ категорій</h3>
        <div className="alba-analytics-overview">
          <div className="alba-analytics-donut-wrap">
            {donutSegments.length ? (
              <div className="alba-analytics-donut" style={donutStyle} aria-hidden="true">
                <div className="alba-analytics-donut-center">
                  <small>Разом</small>
                  <strong>{money(totalExpense)}</strong>
                </div>
              </div>
            ) : (
              <div className="alba-analytics-donut is-empty">
                <div className="alba-analytics-donut-center">
                  <small>Разом</small>
                  <strong>{money(0)}</strong>
                </div>
              </div>
            )}
          </div>

          <div className="alba-analytics-bars">
            {analyticsCategoryRows.length ? (
              analyticsCategoryRows.map((row) => (
                <div key={row.categoryId} className="alba-analytics-row">
                  <div className="alba-analytics-row-head">
                    <span>{row.name}</span>
                    <strong>{money(row.amount)}</strong>
                  </div>
                  <div className="alba-analytics-track" role="presentation">
                    <div
                      className="alba-analytics-fill"
                      style={{ width: `${row.percent}%`, background: row.color }}
                      role="presentation"
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="alba-subtle">Поки немає витрат для побудови графіка.</p>
            )}
          </div>
        </div>
      </article>

      <article className="alba-analytics-card">
        <p className="alba-label">Динаміка витрат</p>
        <h3>Останні 8 місяців</h3>
        {analyticsCategoryRows.length ? (
          analyticsMonthlyRows.length ? (
          <div className="alba-analytics-months">
            {analyticsMonthlyRows.map((row) => (
              <div key={row.monthKey} className="alba-analytics-month-col">
                <div className="alba-analytics-month-value">{money(row.amount)}</div>
                <div className="alba-analytics-month-track" role="presentation">
                  <div className="alba-analytics-month-bar" style={{ height: `${row.percent}%` }} role="presentation" />
                </div>
                <div className="alba-analytics-month-label">{row.label}</div>
              </div>
            ))}
          </div>
          ) : (
            <p className="alba-subtle">Дані з'являться після перших витрат.</p>
          )
        ) : (
          <p className="alba-subtle">Немає достатньо даних для тренду.</p>
        )}
      </article>

      <article className="alba-analytics-card">
        <p className="alba-label">Джерела доходу</p>
        <h3>Хто скільки приніс</h3>
        {analyticsIncomeRows.length ? (
          <div className="alba-analytics-bars">
            {analyticsIncomeRows.map((row) => (
              <div key={row.incomeId} className="alba-analytics-row">
                <div className="alba-analytics-row-head">
                  <span>{row.name}</span>
                  <strong>{money(row.amount)}</strong>
                </div>
                <div className="alba-analytics-track" role="presentation">
                  <div
                    className="alba-analytics-fill alba-analytics-fill-income"
                    style={{ width: `${row.percent}%` }}
                    role="presentation"
                  />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="alba-subtle">Ще немає зафіксованих надходжень у вибраному періоді.</p>
        )}
      </article>
    </section>
  );
}
