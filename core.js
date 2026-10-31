/* KPI calculations, validation, and virtual sample data.
   The page reads this in-memory sample directly, so opening index.html as file:// works without fetch. */
(function (global) {
  "use strict";
  const SAMPLE_RECORDS = [
    { id: "sample-01", month: "2026-09", team: "영업A", target: 10000000, actual: 9000000 },
    { id: "sample-02", month: "2026-09", team: "영업B", target: 8000000, actual: 8800000 },
    { id: "sample-03", month: "2026-09", team: "영업C", target: 12000000, actual: 10800000 },
    { id: "sample-04", month: "2026-10", team: "영업A", target: 10000000, actual: 11000000 },
    { id: "sample-05", month: "2026-10", team: "영업B", target: 8000000, actual: 7200000 },
    { id: "sample-06", month: "2026-10", team: "영업C", target: 12000000, actual: 12600000 }
  ];
  const copyRecords = (records) => records.map((record) => ({ ...record }));
  const formatWon = (value) => `${new Intl.NumberFormat("ko-KR").format(value)}원`;
  function formatMonth(value) {
    const [year, month] = value.split("-");
    return `${year}년 ${Number(month)}월`;
  }
  const attainment = (actual, target) => target === 0 ? null : actual / target * 100;
  function summarize(records) {
    const target = records.reduce((sum, record) => sum + record.target, 0);
    const actual = records.reduce((sum, record) => sum + record.actual, 0);
    return { target, actual, count: records.length, rate: attainment(actual, target) };
  }
  function filterRecords(records, filters) {
    return records.filter((record) => (filters.month === "all" || record.month === filters.month)
      && (filters.team === "all" || record.team === filters.team))
      .sort((a, b) => b.month.localeCompare(a.month) || a.team.localeCompare(b.team, "ko"));
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function validateRecord(input, existingRecords) {
    const month = String(input.month || "");
    const team = String(input.team || "").trim();
    const target = Number(input.target);
    const actual = Number(input.actual);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("올바른 월을 선택해주세요.");
    if (!team || Array.from(team).length > 80) throw new Error("부서명은 1~80자로 입력해주세요.");
    const targetMissing = input.target === null || input.target === undefined || String(input.target).trim() === "";
    const actualMissing = input.actual === null || input.actual === undefined || String(input.actual).trim() === "";
    if (targetMissing || actualMissing || !Number.isSafeInteger(target) || !Number.isSafeInteger(actual) || target < 0 || actual < 0) {
      throw new Error("목표와 실적은 0 이상의 정수로 입력해주세요.");
    }
    if (existingRecords.some((record) => record.month === month && record.team === team)) {
      throw new Error("같은 월과 부서의 KPI가 이미 있습니다.");
    }
    return { month, team, target, actual };
  }
  function createSampleRepository() {
    let records = copyRecords(SAMPLE_RECORDS);
    return {
      async list() { return copyRecords(records); },
      async create(input) {
        const record = validateRecord(input, records);
        const created = { ...record, id: `sample-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
        records = [...records, created];
        return { ...created };
      }
    };
  }
  global.KpiCore = { sampleRecords: () => copyRecords(SAMPLE_RECORDS), formatWon, formatMonth, attainment, summarize, filterRecords, escapeHtml, validateRecord, createSampleRepository };
})(window);
