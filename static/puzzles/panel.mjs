function renderStatsRow(cells) {
  return `
    <tr>
      ${cells.map(({ label, value, valueColSpan = 1 }) => `
        <th scope="row">${label}</th>
        <td${valueColSpan > 1 ? ` colspan="${valueColSpan}"` : ''}>${value}</td>
      `).join('')}
    </tr>
  `;
}

export function renderPuzzlePanelHeader({
  title,
  description,
  levelPicker,
  statsLabel = `${title} stats`,
  rows = [],
}) {
  return `
    <header class="puzzle-panel-header">
      <div class="puzzle-panel-top">
        <p class="puzzle-kicker">${title}</p>
        ${levelPicker}
      </div>
      <p class="puzzle-panel-copy">${description}</p>
      <table class="puzzle-stats-table" aria-label="${statsLabel}">
        <tbody>
          ${rows.map((row) => renderStatsRow(row)).join('')}
        </tbody>
      </table>
    </header>
  `;
}
