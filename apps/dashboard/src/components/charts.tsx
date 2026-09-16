import { useId, useState } from 'react';

/**
 * Two small charts, drawn by hand rather than with a charting library.
 *
 * That keeps the dependency count at zero, keeps the code out of the customer
 * widget bundle entirely, and means nothing extra is loaded on the public
 * homepage. Both charts ship an accessible table of the same numbers.
 *
 * The daily chart is an inline SVG: geometry expressed in the SVG's own
 * coordinate space cannot be perturbed by the surrounding flex layout, which
 * an earlier HTML implementation was.
 */

function formatDay(iso: string): string {
  // The API returns UTC calendar days; render them as such rather than shifting
  // into the reader's zone, which would move counts between columns.
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

const SLOT = 10;
const BAR = 3.6;
const PLOT = 100;
/** A day with no reports still gets a visible hairline rather than nothing. */
const ZERO_HEIGHT = 1.2;

export function DailyBarChart({ data, timezone }: { data: Array<{ date: string; count: number }>; timezone: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const tableId = useId();

  // Integer axis starting at zero: the top of the plot is a whole number.
  const axisTop = Math.max(1, ...data.map((point) => point.count));
  const total = data.reduce((sum, point) => sum + point.count, 0);
  // Keep the date labels readable when a 30 day range is selected.
  const tickEvery = data.length > 14 ? Math.ceil(data.length / 7) : 1;
  const alwaysLabel = data.length <= 14;
  const width = data.length * SLOT;

  return (
    <div className="chart-wrap">
      <div className="toolbar">
        <span className="muted" style={{ fontSize: 12.5 }}>
          0 – {axisTop} report{axisTop === 1 ? '' : 's'} per day · days are {timezone}
        </span>
      </div>

      <div className="chart-plot">
        {/* Counts sit above the plot in HTML so they stay upright and legible. */}
        <div className="chart-values" aria-hidden="true">
          {data.map((point, index) => (
            <span key={point.date} style={{ opacity: alwaysLabel || hovered === index ? 1 : 0 }}>
              {point.count}
            </span>
          ))}
        </div>

        <svg
          className="chart-svg"
          viewBox={`0 0 ${width} ${PLOT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Reports received per day. ${total} in total. The table below lists each day.`}
        >
          {data.map((point, index) => {
            const height = point.count === 0 ? ZERO_HEIGHT : Math.max(2, (point.count / axisTop) * PLOT);
            return (
              <rect
                key={point.date}
                x={index * SLOT + (SLOT - BAR) / 2}
                y={PLOT - height}
                width={BAR}
                height={height}
                className={point.count === 0 ? 'bar-rect empty' : 'bar-rect'}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered((current) => (current === index ? null : current))}
              >
                <title>{`${formatDay(point.date)}: ${point.count} report${point.count === 1 ? '' : 's'}`}</title>
              </rect>
            );
          })}
        </svg>

        <div className="chart-labels" aria-hidden="true">
          {data.map((point, index) => (
            <span key={point.date}>
              {index % tickEvery === 0 || index === data.length - 1 ? formatDay(point.date) : ''}
            </span>
          ))}
        </div>
      </div>

      <details className="chart-data">
        <summary aria-controls={tableId}>View these numbers as a table</summary>
        <table id={tableId}>
          <caption className="visually-hidden">Reports received per day, in {timezone}</caption>
          <thead>
            <tr>
              <th scope="col">Day ({timezone})</th>
              <th scope="col">Reports received</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.date}>
                <td>{point.date}</td>
                <td className="numeric">{point.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export interface StatusSlice {
  key: 'new' | 'in_progress' | 'resolved';
  label: string;
  count: number;
}

export function StatusBreakdown({ slices, total }: { slices: StatusSlice[]; total: number }) {
  const tableId = useId();

  return (
    <div className="chart-wrap">
      <div className="status-bars">
        {slices.map((slice) => {
          const share = total === 0 ? 0 : Math.round((slice.count / total) * 100);
          return (
            <div className="status-row" key={slice.key}>
              <span className="name">
                <span className={`dot ${slice.key}`} aria-hidden="true" />
                {slice.label}
              </span>
              <span className="track">
                <span className={`fill ${slice.key}`} style={{ width: `${share}%` }} />
              </span>
              <span className="value">{slice.count}</span>
            </div>
          );
        })}
      </div>

      <details className="chart-data">
        <summary aria-controls={tableId}>View these numbers as a table</summary>
        <table id={tableId}>
          <caption className="visually-hidden">Current status of the reports received in this period</caption>
          <thead>
            <tr>
              <th scope="col">Current status</th>
              <th scope="col">Reports</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {slices.map((slice) => (
              <tr key={slice.key}>
                <td>{slice.label}</td>
                <td className="numeric">{slice.count}</td>
                <td className="numeric">{total === 0 ? '—' : `${Math.round((slice.count / total) * 100)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
