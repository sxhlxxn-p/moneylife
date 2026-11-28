// Shared outline icons. Names and paths are application-owned, never user HTML.
const MoneyLifeIcons = {
  home: "m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8",
  wallet: "M3 6h18v14H3zM3 10h18M16 14h5",
  sliders: "M4 6h16M4 12h16M4 18h16M8 3v6m8 0v6m-6 0v6",
  target:
    "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10",
  chart: "M4 3v17h17M7 15l5-5 4 3 5-8",
  work: "M3 7h18v14H3zM8 7V3h8v4M3 12h18M10 12v3h4v-3",
  coins:
    "M4 5c0-4 16-4 16 0s-16 4-16 0v7c0 4 16 4 16 0V5M4 12v7c0 4 16 4 16 0v-7",
  stock: "M5 3v18m7-20v22m7-19v16M3 7h4v7H3zm7-3h4v8h-4zm7 5h4v7h-4z",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  back: "M20 12H4m6-6-6 6 6 6",
  up: "M5 17 19 3M7 3h12v12",
  down: "M5 5l14 14m-8 0h8v-8",
  play: "m8 4 12 8-12 8z",
  pause: "M8 4v16m8-16v16",
  refresh: "M20 10a8 8 0 1 0 0 5M20 3v7h-7",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  check: "m5 12 4 4L19 6",
  message: "M4 3h16v13H9l-5 5zM8 7h8M8 11h5",
  calendar: "M3 5h18v16H3zM7 2v6m10-6v6M3 11h18",
};
function mlIcon(name) {
  const path = MoneyLifeIcons[name] || MoneyLifeIcons.chart;
  return `<svg class="ml-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}
