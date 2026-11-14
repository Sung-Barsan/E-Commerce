import Chart from "chart.js/auto";
export function startChart() {
  const canvas = document.getElementById("orders-chart");
  const data = JSON.parse(canvas.dataset.chart);
  new Chart(canvas, {
    type: "line",
    data: {
      labels: data.map((d) => d.day.slice(5)),
      datasets: [
        {
          label: "Demo orders",
          data: data.map((d) => d.count),
          borderColor: "#8b9c4d",
          backgroundColor: "#d8ed7b44",
          fill: true,
          tension: 0.35,
          pointRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}
