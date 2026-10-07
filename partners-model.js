/* Модель реестра. Не использует сеть и не меняет другие разделы библиотеки. */
(function (root) {
  "use strict";
  const STORAGE_KEY = "delai_partners_v1";
  const TYPES = ["Деньги", "Скидки", "Площадка", "Техника", "Питание", "Привлечение участников", "Волонтёры", "Проведение мероприятий"];
  const STATUSES = ["Получено согласие", "Получена помощь", "Отказ"];
  const FIELDS = [
    { key: "partner", label: "Партнёр", kind: "text", width: 32 },
    { key: "types", label: "Тип вклада", kind: "types", width: 26 },
    { key: "contribution", label: "Что предоставляет партнёр", kind: "text", width: 40 },
    { key: "status", label: "Статус", kind: "status", width: 25 },
    { key: "obligations", label: "Обязательства перед партнёром", kind: "text", width: 40 },
    { key: "letter", label: "Отправили письмо", kind: "check", width: 17 },
    { key: "details", label: "Согласовали детали", kind: "check", width: 17 },
    { key: "agreement", label: "Есть соглашение о сотрудничестве", kind: "check", width: 22 },
    { key: "fulfilled", label: "Обязательства перед партнёром выполнены", kind: "check", width: 24 },
    { key: "thanks", label: "Благодарность отправлена", kind: "check", width: 21 },
    { key: "report", label: "Отправлен отчёт о саммите", kind: "check", width: 21 },
    { key: "responsible", label: "Ответственный", kind: "text", width: 25 },
    { key: "contacts", label: "Контакты", kind: "text", width: 30 },
    { key: "comment", label: "Комментарии", kind: "text", width: 40 }
  ];
  const id = () => root.crypto?.randomUUID?.() || `partner_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  function createRow() {
    return Object.fromEntries([["id", id()], ...FIELDS.map(({ key, kind }) => [key, kind === "check" ? false : kind === "types" ? [] : ""])]);
  }

  function normalizeRow(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Некорректная строка реестра");
    const row = createRow();
    if (typeof value.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value.id)) row.id = value.id;
    for (const field of FIELDS) {
      const v = value[field.key];
      if (field.kind === "check") row[field.key] = v === true;
      else if (field.kind === "types") row.types = TYPES.filter((type) => Array.isArray(v) && v.includes(type));
      else if (field.kind === "status") row.status = STATUSES.includes(v) ? v : "";
      else row[field.key] = typeof v === "string" ? v : "";
    }
    return row;
  }

  function readDraft(raw) {
    if (raw === null) return [createRow()];
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.rows)) throw new Error("Неизвестная версия сохранения");
    const seen = new Set();
    const rows = value.rows.map((value) => {
      const row = normalizeRow(value);
      if (seen.has(row.id)) row.id = id();
      seen.add(row.id);
      return row;
    });
    return rows.length ? rows : [createRow()];
  }

  function isFilled(row) {
    return FIELDS.some(({ key, kind }) => kind === "check" ? row[key] === true : kind === "types" ? row[key].length > 0 : row[key].trim() !== "");
  }

  function exportValues(rows) {
    return rows.filter(isFilled).map((row) => FIELDS.map(({ key, kind }) => kind === "check" ? (row[key] ? "Да" : "Нет") : kind === "types" ? row[key].join("; ") : row[key]));
  }

  function createWorkbook(ExcelJS, rows) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Библиотека организатора Делай-саммита";
    const sheet = workbook.addWorksheet("Реестр партнёров", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
    sheet.columns = FIELDS.map((field) => ({ header: field.label, key: field.key, width: field.width }));
    const values = exportValues(rows);
    values.forEach((values) => sheet.addRow(values));
    sheet.getRow(1).height = 64;
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1734" } };
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    values.forEach((values, index) => {
      const row = sheet.getRow(index + 2);
      const lines = Math.max(...values.map((value, i) => String(value).split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(8, FIELDS[i].width - 5))), 0)));
      row.height = Math.max(36, Math.min(409, lines * 15 + 10));
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        const field = FIELDS[col - 1];
        cell.numFmt = "@";
        cell.font = { name: "Calibri", size: 11, color: { argb: "FF0B1734" } };
        cell.alignment = { vertical: "top", wrapText: true, horizontal: field.kind === "check" ? "center" : "left" };
        if (index % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4F8" } };
        if (field.kind === "status" || field.kind === "check") {
          cell.dataValidation = { type: "list", allowBlank: true, formulae: ['"' + (field.kind === "status" ? STATUSES.join(",") : "Да,Нет") + '"'], showErrorMessage: true, errorTitle: "Выберите значение", error: "Используйте значение из списка." };
        }
      });
    });
    if (values.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: values.length + 1, column: FIELDS.length } };
    sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:1" };
    return workbook;
  }

  root.DelaiPartnersModel = Object.freeze({ STORAGE_KEY, TYPES, STATUSES, FIELDS, createRow, normalizeRow, readDraft, isFilled, exportValues, createWorkbook });
})(typeof window !== "undefined" ? window : globalThis);
