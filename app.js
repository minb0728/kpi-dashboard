(function () {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const core = window.KpiCore;
  const repository = core.createSampleRepository();
  const monthFilter = $("#month-filter");
  const teamFilter = $("#team-filter");
  const tbody = $("#records-body");
  let records = [];
  let toastTimer;

  function filteredRecords() {
    return core.filterRecords(records, { month: monthFilter.value || "all", team: teamFilter.value || "all" });
  }
  function populateFilters() {
    const selectedMonth = monthFilter.value || "all";
    const selectedTeam = teamFilter.value || "all";
    const months = [...new Set(records.map((record) => record.month))].sort().reverse();
    const teams = [...new Set(records.map((record) => record.team))].sort((a, b) => a.localeCompare(b, "ko"));
    monthFilter.innerHTML = '<option value="all">전체 기간</option>' + months.map((month) => `<option value="${month}">${core.formatMonth(month)}</option>`).join("");
    teamFilter.innerHTML = '<option value="all">전체 부서</option>' + teams.map((team) => `<option value="${core.escapeHtml(team)}">${core.escapeHtml(team)}</option>`).join("");
    monthFilter.value = months.includes(selectedMonth) ? selectedMonth : "all";
    teamFilter.value = teams.includes(selectedTeam) ? selectedTeam : "all";
  }
  function renderSummary(filtered) {
    const summary = core.summarize(filtered);
    $("#target-total").textContent = core.formatWon(summary.target);
    $("#actual-total").textContent = core.formatWon(summary.actual);
    $("#attainment-rate").textContent = summary.rate === null ? "목표 미설정" : `${summary.rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
    $("#rate-track-fill").style.width = `${summary.rate === null ? 0 : Math.min(summary.rate, 100)}%`;
    $("#rate-caption").textContent = summary.rate === null ? "목표 금액을 입력하면 달성률을 계산합니다" : summary.rate >= 100 ? "목표를 달성했어요" : "목표까지 조금 더 힘내요";
    $("#record-count").textContent = String(summary.count);
    $("#record-pill").textContent = `${summary.count}건`;
    $("#table-count").textContent = `총 ${summary.count}건`;
  }
  function render() {
    const filtered = filteredRecords();
    renderSummary(filtered);
    $("#error-state").hidden = true;
    $("#empty-state").hidden = filtered.length > 0;
    $(".table-scroll").hidden = filtered.length === 0;
    $(".table-footer").hidden = filtered.length === 0;
    if (filtered.length === 0) {
      const noRecords = records.length === 0;
      $("#empty-title").textContent = noRecords ? "아직 등록된 KPI가 없습니다" : "조건에 맞는 데이터가 없습니다";
      $("#empty-description").textContent = noRecords ? "첫 KPI를 입력해 목표와 실적을 비교해보세요." : "선택한 기간이나 부서를 바꾸거나 필터를 초기화해보세요.";
      $("#empty-action").textContent = noRecords ? "KPI 입력하기" : "필터 초기화";
    }
    tbody.innerHTML = filtered.map((record) => {
      const rate = core.attainment(record.actual, record.target);
      const delta = record.actual - record.target;
      const rateText = rate === null ? '<span class="unset-chip">목표 미설정</span>' : `${rate.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}%`;
      const status = rate === null ? "neutral" : rate >= 100 ? "good" : "steady";
      return `<tr><td class="month-cell">${core.formatMonth(record.month)}</td><td><span class="team-chip"><i></i>${core.escapeHtml(record.team)}</span></td><td class="numeric">${core.formatWon(record.target)}</td><td class="numeric actual-cell">${core.formatWon(record.actual)}</td><td class="numeric"><span class="rate-chip ${status}"><i></i>${rateText}</span></td><td class="numeric delta ${delta >= 0 ? "positive" : "negative"}">${delta > 0 ? "+" : ""}${core.formatWon(delta)}</td><td class="row-action"><button class="row-more" aria-label="${core.escapeHtml(record.team)} 행 작업" title="${core.escapeHtml(record.team)} 행">···</button></td></tr>`;
    }).join("");
  }
  function toast(message) {
    const node = $("#toast");
    node.textContent = message;
    node.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("visible"), 2600);
  }
  async function loadRecords() {
    $("#error-state").hidden = true;
    try {
      records = await repository.list();
      populateFilters();
      render();
    } catch (error) {
      $("#empty-state").hidden = true;
      $(".table-scroll").hidden = true;
      $(".table-footer").hidden = true;
      $("#error-description").textContent = error.message || "데이터를 불러오지 못했습니다.";
      $("#error-state").hidden = false;
    }
  }
  monthFilter.addEventListener("change", render);
  teamFilter.addEventListener("change", render);
  $("#reset-filters").addEventListener("click", () => { monthFilter.value = "all"; teamFilter.value = "all"; render(); });
  const dialog = $("#entry-dialog");
  function openDialog() { $("#form-error").hidden = true; dialog.showModal(); }
  $("#open-entry").addEventListener("click", openDialog);
  $("#empty-action").addEventListener("click", () => {
    if (records.length === 0) openDialog();
    else { monthFilter.value = "all"; teamFilter.value = "all"; render(); }
  });
  document.querySelectorAll(".close-dialog").forEach((button) => button.addEventListener("click", () => dialog.close()));
  $("#entry-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = $("#form-error");
    errorBox.hidden = true;
    try {
      const input = { month: $("#input-month").value, team: $("#input-team").value, target: $("#input-target").value, actual: $("#input-actual").value };
      const record = core.validateRecord(input, records);
      const button = $("#save-record");
      button.disabled = true;
      button.textContent = "추가하는 중…";
      try { await repository.create(record); }
      finally { button.disabled = false; button.textContent = "샘플 데이터로 추가"; }
      dialog.close();
      event.currentTarget.reset();
      monthFilter.value = record.month;
      teamFilter.value = record.team;
      await loadRecords();
      toast("샘플 KPI를 추가했습니다.");
    } catch (error) {
      errorBox.textContent = error.message || "입력값을 확인해주세요.";
      errorBox.hidden = false;
    }
  });
  $("#retry-button").addEventListener("click", loadRecords);
  $("#export-button").addEventListener("click", () => {
    const rows = filteredRecords();
    if (rows.length === 0) { toast("내보낼 데이터가 없습니다."); return; }
    const csv = ["월,부서,목표 금액,실적 금액,달성률", ...rows.map((record) => {
      const rate = core.attainment(record.actual, record.target);
      return [record.month, `"${record.team.replaceAll('"', '""')}"`, record.target, record.actual, rate === null ? "목표 미설정" : `${rate.toFixed(2)}%`].join(",");
    })].join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kpi-records.csv";
    link.click();
    URL.revokeObjectURL(url);
    toast("CSV 파일을 저장했습니다.");
  });
  loadRecords();
})();
