/* Выгрузка текущего плана и бюджета. ExcelJS поставляется в папке vendor. */
(function (root) {
  "use strict";

  const PLAN_STATUSES = Object.freeze({ not_started: "Не начато", in_progress: "В работе", blocked: "Заблокировано", done: "Выполнено" });
  const MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const MONEY = '#,##0.00" ₽"';
  const scriptBase = typeof document === "undefined" ? null : (document.currentScript?.src || document.baseURI);
  let excelLoading;
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const text = (value) => String(value ?? "");

  function loadExcel() {
    if (root.ExcelJS) return Promise.resolve(root.ExcelJS);
    if (!excelLoading) excelLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("vendor/exceljs-4.4.0.min.js", scriptBase).href;
      script.onload = () => {
        if (root.ExcelJS) resolve(root.ExcelJS);
        else { script.remove(); reject(new Error("Не загружен модуль XLSX")); }
      };
      script.onerror = () => { script.remove(); reject(new Error("Не загружен модуль XLSX")); };
      document.head.append(script);
    }).catch((error) => { excelLoading = null; throw error; });
    return excelLoading;
  }

  function newWorkbook(ExcelJS) {
    const book = new ExcelJS.Workbook();
    book.creator = "Библиотека организатора Делай-саммита";
    book.calcProperties.fullCalcOnLoad = true;
    return book;
  }

  function formatTable(sheet, columns, headerRow, lastDataRow) {
    sheet.columns = columns.map((column) => ({ width: column.width }));
    const header = sheet.getRow(headerRow);
    header.values = columns.map((column) => column.label);
    header.height = 48;
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B1734" } };
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    for (let index = headerRow + 1; index <= lastDataRow; index += 1) {
      const row = sheet.getRow(index);
      let lines = 1;
      columns.forEach((column, i) => {
        const cell = row.getCell(i + 1);
        const value = typeof cell.value === "object" ? cell.value?.result : cell.value;
        lines = Math.max(lines, text(value).split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(8, column.width - 4))), 0));
        cell.numFmt = column.money ? MONEY : column.number ? "0.##" : "@";
        cell.font = { name: "Calibri", size: 11, color: { argb: "FF0B1734" } };
        cell.alignment = { vertical: "top", wrapText: true, horizontal: column.money || column.number ? "right" : "left" };
        if ((index - headerRow) % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4F8" } };
      });
      row.height = Math.max(36, Math.min(409, lines * 15 + 10));
    }
    if (lastDataRow > headerRow) sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastDataRow, column: columns.length } };
    sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${headerRow}:${headerRow}` };
  }

  // tasks содержит все задачи с уже подставленными текущими status/responsible.
  function createPlanWorkbook(ExcelJS, tasks) {
    const book = newWorkbook(ExcelJS);
    const sheet = book.addWorksheet("Мой план подготовки", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });
    tasks.forEach((task, index) => {
      sheet.getRow(index + 2).values = [
        text(task.task), PLAN_STATUSES[task.status] || PLAN_STATUSES.not_started,
        text(task.direction), text(task.responsible),
        [task.plan_stage, task.timing].filter((value) => value !== null && value !== undefined && value !== "").join(": "),
        text(task.due_date), text(task.expected_result), text(task.ready_documents)
      ];
      sheet.getCell(index + 2, 2).dataValidation = {
        type: "list", allowBlank: true, formulae: ['"' + Object.values(PLAN_STATUSES).join(",") + '"'],
        showErrorMessage: true, errorTitle: "Выберите статус", error: "Используйте значение из списка."
      };
    });
    formatTable(sheet, [
      { label: "Задача", width: 54 }, { label: "Статус", width: 22 },
      { label: "Направление", width: 22 }, { label: "Ответственный", width: 28 },
      { label: "Этап", width: 28 }, { label: "Срок выполнения", width: 20 },
      { label: "Ожидаемый результат", width: 58 }, { label: "Готовые документы", width: 38 }
    ], 1, tasks.length + 1);
    return book;
  }

  function createBudgetWorkbook(ExcelJS, budget) {
    const book = newWorkbook(ExcelJS);
    const sheet = book.addWorksheet("Мой бюджет", { views: [{ state: "frozen", xSplit: 1, ySplit: 9 }] });
    sheet.mergeCells("A1:H1");
    sheet.getCell("A1").value = "Бюджет Делай-саммита";
    sheet.getCell("A1").font = { name: "Calibri", size: 18, bold: true, color: { argb: "FF0B1734" } };
    sheet.getRow(1).height = 30;
    const totals = { need: 0, partner: 0, required: 0, actual: 0 };
    budget.rows.forEach((row, index) => {
      const n = index + 10;
      const quantity = number(row.quantity), cost = number(row.unit_cost), partner = number(row.partner_contribution);
      const need = quantity * cost, required = Math.max(0, need - partner), actual = number(row.actual);
      totals.need += need; totals.partner += partner; totals.required += required; totals.actual += actual;
      sheet.getRow(n).values = [
        text(row.title), quantity, cost, { formula: `B${n}*C${n}`, result: need }, partner,
        { formula: `MAX(0,D${n}-E${n})`, result: required }, actual, text(row.comment)
      ];
    });
    const last = budget.rows.length + 9, totalRow = last + 1;
    const total = sheet.getRow(totalRow);
    total.getCell(1).value = "Итого";
    for (const [column, key] of [["D", "need"], ["E", "partner"], ["F", "required"], ["G", "actual"]]) {
      sheet.getCell(`${column}${totalRow}`).value = { formula: budget.rows.length ? `SUM(${column}10:${column}${last})` : "0", result: totals[key] };
      sheet.getCell(`${column}${totalRow}`).numFmt = MONEY;
    }
    total.height = 28;
    for (let column = 1; column <= 8; column += 1) {
      const cell = total.getCell(column);
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF0B1734" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4EBF3" } };
    }
    const summary = [
      ["Бюджет проекта (лимит)", number(budget.limit)],
      ["Потребность", { formula: `D${totalRow}`, result: totals.need }],
      ["Вклад партнёров", { formula: `E${totalRow}`, result: totals.partner }],
      ["Нужно из бюджета", { formula: `F${totalRow}`, result: totals.required }],
      ["Остаток бюджета", { formula: "D3-D6", result: number(budget.limit) - totals.required }]
    ];
    summary.forEach(([label, value], index) => {
      const n = index + 3;
      sheet.mergeCells(`A${n}:C${n}`);
      sheet.getCell(`A${n}`).value = label;
      sheet.getCell(`A${n}`).font = { name: "Calibri", size: 11 };
      sheet.getCell(`D${n}`).value = value;
      sheet.getCell(`D${n}`).numFmt = MONEY;
      sheet.getCell(`D${n}`).font = { name: "Calibri", size: 11, bold: true };
      sheet.getRow(n).height = 23;
    });
    formatTable(sheet, [
      { label: "Статья расходов", width: 42 }, { label: "Количество", width: 14, number: true },
      { label: "Стоимость", width: 20, money: true }, { label: "Потребность", width: 22, money: true },
      { label: "Вклад партнёров", width: 22, money: true }, { label: "Из бюджета", width: 22, money: true },
      { label: "Факт", width: 20, money: true }, { label: "Комментарии", width: 42 }
    ], 9, last);
    return book;
  }

  async function download({ button, status, filename, build }) {
    if (button.disabled) return;
    const label = button.textContent;
    button.disabled = true;
    button.textContent = "Готовим XLSX…";
    button.setAttribute("aria-busy", "true");
    status.textContent = "";
    status.classList.remove("is-error");
    try {
      const ExcelJS = await loadExcel();
      const buffer = await build(ExcelJS).xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: MIME }));
      const link = document.createElement("a");
      link.href = url;
      const date = new Date();
      const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      link.download = `${filename}-${stamp}.xlsx`;
      document.body.append(link);
      try { link.click(); } finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
      status.textContent = "Файл с текущими данными подготовлен для скачивания.";
    } catch {
      status.classList.add("is-error");
      status.textContent = "Не удалось подготовить XLSX. Ваши данные остались на странице. Попробуйте скачать ещё раз.";
    } finally {
      button.disabled = false;
      button.textContent = label;
      button.removeAttribute("aria-busy");
    }
  }

  root.DelaiWorkbookExports = Object.freeze({ PLAN_STATUSES, createPlanWorkbook, createBudgetWorkbook, download });
})(typeof window !== "undefined" ? window : globalThis);
