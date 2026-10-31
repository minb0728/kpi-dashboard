(function () {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const core = window.KpiCore;
  const runtime = window.KpiRepository.createRuntime(window.KPI_CONFIG, window.supabase, core);
  const repository = runtime.repository;
  const monthFilter = $("#month-filter");
  const teamFilter = $("#team-filter");
  const tbody = $("#records-body");
  const dialog = $("#entry-dialog");
  let records = [];
  let currentUser = null;
  let loadedUserId = null;
  let loadingUserId = null;
  let authRevision = 0;
  let toastTimer;

  function setConnection(state, title, detail) {
    const panel = $("#connection-panel");
    panel.dataset.state = state;
    $("#connection-status").textContent = title;
    $("#connection-detail").textContent = detail;
    const badge = $("#mode-badge");
    badge.classList.toggle("sample-badge", state === "sample");
    badge.classList.toggle("connection-badge", state !== "sample");
    badge.innerHTML = `<i></i>${state === "sample" ? "샘플 모드" : state === "error" ? "연결 오류" : "DB 모드"}`;
  }

  function setUserControls(user) {
    const signedIn = Boolean(user);
    $("#login-form").hidden = runtime.mode !== "database" || signedIn;
    $("#signed-in-controls").hidden = runtime.mode !== "database" || !signedIn;
    $("#signed-in-email").textContent = user ? user.email || "로그인 사용자" : "";
    const canEnter = runtime.mode === "sample" || (runtime.mode === "database" && signedIn && loadedUserId === user.id);
    $("#open-entry").hidden = !canEnter;
    $("#profile-name").textContent = user ? user.email || "로그인 사용자" : "김민지";
    $("#profile-role").textContent = user ? "로그인 사용자" : runtime.mode === "sample" ? "샘플 모드" : "로그인 필요";
    const initial = user && user.email ? user.email.trim().charAt(0).toUpperCase() : "김";
    $("#top-avatar").textContent = initial;
  }

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
      if (runtime.mode === "database" && !currentUser) {
        $("#empty-title").textContent = "로그인 후 KPI를 조회할 수 있습니다";
        $("#empty-description").textContent = "기존 앱 사용자로 로그인하면 본인 자료만 불러옵니다.";
        $("#empty-action").hidden = true;
      } else {
        $("#empty-title").textContent = noRecords ? "아직 등록된 KPI가 없습니다" : "조건에 맞는 데이터가 없습니다";
        $("#empty-description").textContent = noRecords ? "첫 KPI를 입력해 목표와 실적을 비교해보세요." : "선택한 기간이나 부서를 바꾸거나 필터를 초기화해보세요.";
        $("#empty-action").hidden = false;
        $("#empty-action").textContent = noRecords ? "KPI 입력하기" : "필터 초기화";
      }
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

  function showReadError(message) {
    $("#error-description").textContent = message;
    $("#error-state").hidden = false;
    if (records.length === 0) $("#empty-state").hidden = true;
    setConnection("error", "KPI 조회 실패", message);
  }

  async function loadUserRows(userId) {
    const revision = ++authRevision;
    loadingUserId = userId;
    setConnection("loading", "KPI 불러오는 중", "로그인 사용자에게 허용된 행을 조회합니다.");
    try {
      const loaded = await repository.list(userId);
      if (revision !== authRevision || !currentUser || currentUser.id !== userId) return false;
      records = loaded;
      loadedUserId = userId;
      loadingUserId = null;
      populateFilters();
      setUserControls(currentUser);
      render();
      setConnection("signed-in", "DB 연결됨 · 로그인됨", "본인 계정의 KPI 자료를 불러왔습니다.");
      return true;
    } catch (error) {
      if (revision !== authRevision || !currentUser || currentUser.id !== userId) return false;
      loadingUserId = null;
      showReadError(error.message || "KPI를 불러오지 못했습니다.");
      return false;
    }
  }

  async function syncSession(session) {
    const nextUser = session && session.user ? session.user : null;
    const nextUserId = nextUser ? nextUser.id : null;
    const currentUserId = currentUser ? currentUser.id : null;
    if (nextUserId !== currentUserId) {
      authRevision += 1;
      loadedUserId = null;
      loadingUserId = null;
      records = [];
      monthFilter.value = "all";
      teamFilter.value = "all";
      if (dialog.open) dialog.close();
      $("#entry-form").reset();
      currentUser = nextUser;
      setUserControls(currentUser);
      populateFilters();
      render();
    } else {
      currentUser = nextUser;
      setUserControls(currentUser);
    }
    if (!currentUser) {
      authRevision += 1;
      records = [];
      loadedUserId = null;
      loadingUserId = null;
      populateFilters();
      render();
      setConnection("auth", "로그인 필요", "기존 앱 사용자 이메일과 비밀번호로 로그인해주세요.");
      return;
    }
    if (loadedUserId === currentUser.id || loadingUserId === currentUser.id) return;
    await loadUserRows(currentUser.id);
  }

  async function boot() {
    if (runtime.mode === "sample") {
      setUserControls(null);
      $("#entry-mode-note").textContent = "샘플 모드입니다. 추가 내용은 이 브라우저 메모리에서만 유지됩니다.";
      $("#save-record").textContent = "샘플 데이터로 추가";
      setConnection("sample", "샘플 모드 · DB 미설정", runtime.message);
      try {
        records = await repository.list();
        populateFilters();
        render();
      } catch (error) { showReadError(error.message); }
      return;
    }
    if (runtime.mode === "error") {
      setUserControls(null);
      setConnection("error", "Supabase 설정 오류", runtime.message);
      showReadError(runtime.message);
      return;
    }
    $("#entry-mode-note").textContent = "저장하면 로그인한 사용자 소유의 KPI 행으로 Supabase에 기록됩니다.";
    $("#save-record").textContent = "KPI 저장";
    setUserControls(null);
    setConnection("auth", "로그인 필요", runtime.message);
    repository.onAuthStateChange((_event, session) => {
      // Auth callback은 동기적으로 반환하고, 데이터 요청은 그 뒤에 실행합니다.
      setTimeout(() => { void syncSession(session); }, 0);
    });
    try {
      const session = await repository.getSession();
      await syncSession(session);
    } catch (error) {
      setConnection("error", "세션 확인 실패", error.message);
      showReadError(error.message);
    }
  }

  monthFilter.addEventListener("change", render);
  teamFilter.addEventListener("change", render);
  $("#reset-filters").addEventListener("click", () => { monthFilter.value = "all"; teamFilter.value = "all"; render(); });
  function openDialog() { $("#form-error").hidden = true; dialog.showModal(); }
  $("#open-entry").addEventListener("click", openDialog);
  $("#empty-action").addEventListener("click", () => {
    if (runtime.mode === "database" && !currentUser) return;
    if (records.length === 0) openDialog();
    else { monthFilter.value = "all"; teamFilter.value = "all"; render(); }
  });
  document.querySelectorAll(".close-dialog").forEach((button) => button.addEventListener("click", () => dialog.close()));

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("#login-button");
    const email = $("#login-email").value.trim();
    const password = $("#login-password").value;
    button.disabled = true;
    button.textContent = "로그인 중…";
    setConnection("loading", "로그인 중", "인증 결과를 기다리고 있습니다.");
    try {
      const session = await repository.signIn(email, password);
      $("#login-password").value = "";
      await syncSession(session);
    } catch (error) {
      $("#login-password").value = "";
      setConnection("error", "로그인 실패", error.message || "로그인 정보를 확인해주세요.");
    } finally {
      button.disabled = false;
      button.textContent = "로그인";
    }
  });

  $("#logout-button").addEventListener("click", async () => {
    const button = $("#logout-button");
    button.disabled = true;
    try { await repository.signOut(); }
    catch (error) { setConnection("error", "로그아웃 실패", error.message); }
    finally { button.disabled = false; }
  });

  $("#entry-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorBox = $("#form-error");
    errorBox.hidden = true;
    const button = $("#save-record");
    try {
      if (runtime.mode === "database" && (!currentUser || loadedUserId !== currentUser.id)) throw new Error("로그인 사용자 자료를 불러온 뒤 저장할 수 있습니다.");
      const input = { month: $("#input-month").value, team: $("#input-team").value, target: $("#input-target").value, actual: $("#input-actual").value };
      const record = core.validateRecord(input, records);
      button.disabled = true;
      button.textContent = runtime.mode === "database" ? "저장 중…" : "추가 중…";
      await repository.create(record, currentUser ? currentUser.id : null);
      dialog.close();
      event.currentTarget.reset();
      monthFilter.value = record.month;
      teamFilter.value = record.team;
      if (runtime.mode === "database") {
        setConnection("loading", "저장됨 · 목록 확인 중", "저장 결과를 다시 조회하고 있습니다.");
        const refreshed = await loadUserRows(currentUser.id);
        if (refreshed) toast("KPI를 저장하고 다시 확인했습니다.");
        else toast("저장은 완료했지만 목록을 다시 불러오지 못했습니다.");
      } else {
        records = await repository.list();
        populateFilters();
        render();
        toast("샘플 KPI를 추가했습니다. DB에는 저장되지 않았습니다.");
      }
    } catch (error) {
      errorBox.textContent = error.message || "KPI 저장에 실패했습니다.";
      errorBox.hidden = false;
      if (runtime.mode === "database") setConnection("error", "KPI 저장 실패", errorBox.textContent);
    } finally {
      button.disabled = false;
      button.textContent = runtime.mode === "database" ? "KPI 저장" : "샘플 데이터로 추가";
    }
  });

  $("#retry-button").addEventListener("click", () => {
    if (runtime.mode === "database" && currentUser) void loadUserRows(currentUser.id);
    else void boot();
  });

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

  boot();
})();
