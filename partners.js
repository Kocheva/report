(function () {
  "use strict";
  const model = window.DelaiPartnersModel;
  const { FIELDS, TYPES, STATUSES, STORAGE_KEY } = model;
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const scriptBase = document.currentScript?.src || document.baseURI;
  let rows = [];
  let initialized = false;
  let expandedId = null;
  let undo = null;
  let lastRaw = null;
  let storageBlocked = false;
  let excelLoading;
  let exporting = false;

  function saveStatus(text, error = false) {
    $("#partnerSaveStatus").textContent = text;
    $("#partnerSaveStatus").classList.toggle("is-error", error);
  }

  function warning(text, reload = false) {
    const box = $("#partnerStorageWarning");
    box.hidden = !text;
    box.textContent = text;
    if (reload) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button";
      button.textContent = "Загрузить сохранённую версию";
      button.addEventListener("click", () => {
        if (!confirm("Загрузить реестр из хранилища? Сначала скачайте XLSX, если хотите сохранить текущие правки.")) return;
        load();
        undo = null;
        render();
      });
      box.append(button);
    }
  }

  function load() {
    storageBlocked = false;
    warning("");
    try {
      lastRaw = localStorage.getItem(STORAGE_KEY);
      rows = model.readDraft(lastRaw);
      saveStatus(lastRaw ? "Сохранено в этом браузере" : "Готов к заполнению");
    } catch (error) {
      rows = [model.createRow()];
      storageBlocked = true;
      warning("Не удалось прочитать сохранённый реестр. Он не перезаписан. Попробуйте открыть страницу снова. Для нового реестра нажмите «Очистить реестр».");
      saveStatus("Автосохранение недоступно — скачайте XLSX", true);
    }
    expandedId = rows[0].id;
  }

  function persist() {
    if (storageBlocked) { saveStatus("Не сохранено — скачайте XLSX", true); return; }
    try {
      if (localStorage.getItem(STORAGE_KEY) !== lastRaw) {
        storageBlocked = true;
        warning("Реестр изменён в другой вкладке. Ваши текущие правки остаются на экране: скачайте их или загрузите сохранённую версию.", true);
        saveStatus("Изменения не сохранены", true);
        return;
      }
      const raw = JSON.stringify({ version: 1, rows });
      localStorage.setItem(STORAGE_KEY, raw);
      lastRaw = raw;
      saveStatus("Сохранено в этом браузере");
    } catch (error) {
      saveStatus("Не удалось сохранить — скачайте XLSX", true);
    }
  }

  function resize(input) {
    if (!input.offsetParent) return;
    input.style.height = "auto";
    input.style.height = `${Math.max(72, input.scrollHeight)}px`;
  }

  function counts() {
    $("#partnerCount").textContent = `Заполнено строк: ${rows.filter(model.isFilled).length}`;
    $("#exportPartners").disabled = exporting || !rows.some(model.isFilled);
  }

  function cell(row, field, index) {
    const label = `${field.label}, строка ${index + 1}`;
    if (field.kind === "types") return `<details class="partner-types"><summary>${row.types.length ? esc(row.types.join(", ")) : "Выбрать вклад"}</summary><div class="partner-type-options">${TYPES.map((type) => `<label><input type="checkbox" data-partner-type="${esc(type)}" aria-label="${esc(type)}, строка ${index + 1}"${row.types.includes(type) ? " checked" : ""}><span>${esc(type)}</span></label>`).join("")}</div></details>`;
    if (field.kind === "status") return `<select data-partner-field="status" aria-label="${esc(label)}"><option value="">Не выбран</option>${STATUSES.map((status) => `<option${row.status === status ? " selected" : ""}>${esc(status)}</option>`).join("")}</select>`;
    if (field.kind === "check") return `<label class="partner-check"><input type="checkbox" data-partner-field="${field.key}" aria-label="${esc(label)}"${row[field.key] ? " checked" : ""}></label>`;
    const input = `<textarea rows="2" maxlength="32000" data-partner-field="${field.key}" aria-label="${esc(label)}" placeholder="${field.key === "partner" ? "Название партнёра" : "Введите текст"}">${esc(row[field.key])}</textarea>`;
    return field.key !== "partner" ? input : `<span class="partner-row-number">Партнёр ${index + 1}</span>${input}<div class="partner-row-actions"><button class="text-button partner-expand" type="button" data-partner-action="expand" aria-expanded="${expandedId === row.id}">${expandedId === row.id ? "Свернуть" : "Заполнить / изменить"}</button><button class="text-button partner-delete" type="button" data-partner-action="delete" aria-label="Удалить строку ${index + 1}">Удалить</button></div>`;
  }

  function render() {
    $("#partnerRows").innerHTML = rows.map((row, index) => `<tr data-partner-id="${row.id}" class="${expandedId === row.id ? "is-expanded" : ""}">${FIELDS.map((field) => `<td class="partner-cell-${field.kind}" data-label="${esc(field.label)}">${cell(row, field, index)}</td>`).join("")}</tr>`).join("");
    $("#partnerRows").querySelectorAll("textarea").forEach(resize);
    $("#partnerUndo").hidden = !undo;
    counts();
  }

  function input(event) {
    const target = event.target;
    const tr = target.closest("[data-partner-id]");
    const row = tr && rows.find((row) => row.id === tr.dataset.partnerId);
    if (!row) return;
    const type = target.dataset.partnerType;
    const field = FIELDS.find((field) => field.key === target.dataset.partnerField);
    if (type && TYPES.includes(type)) {
      row.types = TYPES.filter((type) => [...tr.querySelectorAll("[data-partner-type]:checked")].some((input) => input.dataset.partnerType === type));
      tr.querySelector("summary").textContent = row.types.join(", ") || "Выбрать вклад";
    } else if (field) {
      row[field.key] = field.kind === "check" ? target.checked : target.value;
      if (target.tagName === "TEXTAREA") resize(target);
    } else return;
    counts();
    persist();
  }

  function add() {
    const row = model.createRow();
    rows.push(row);
    expandedId = row.id;
    persist();
    render();
    const input = $(`#partnerRows [data-partner-id="${row.id}"] textarea`);
    input.focus();
    input.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  function rowAction(event) {
    const button = event.target.closest("[data-partner-action]");
    const tr = button?.closest("[data-partner-id]");
    if (!tr) return;
    const index = rows.findIndex((row) => row.id === tr.dataset.partnerId);
    if (index < 0) return;
    if (button.dataset.partnerAction === "expand") {
      expandedId = expandedId === rows[index].id ? null : rows[index].id;
      render();
      $(`[data-partner-id="${tr.dataset.partnerId}"] [data-partner-action="expand"]`).focus();
      return;
    }
    const deleted = rows.splice(index, 1)[0];
    undo = { rows: [deleted], index, placeholderId: null };
    if (!rows.length) {
      rows.push(model.createRow());
      undo.placeholderId = rows[0].id;
    }
    $("#partnerUndoText").textContent = `Строка «${deleted.partner.trim() || "Без названия"}» удалена.`;
    persist();
    render();
    $("#undoPartnerDelete").focus();
  }

  function clear() {
    if (!confirm("Очистить весь реестр в этом браузере? Сначала скачайте XLSX, если данные нужно сохранить.")) return;
    const oldRows = rows;
    rows = [model.createRow()];
    undo = { rows: oldRows, index: 0, placeholderId: rows[0].id };
    expandedId = rows[0].id;
    // Только явная очистка разрешает начать заново при повреждённом сохранении.
    try { lastRaw = localStorage.getItem(STORAGE_KEY); storageBlocked = false; warning(""); } catch (error) { /* persist покажет ошибку */ }
    $("#partnerUndoText").textContent = "Реестр очищен.";
    persist();
    render();
  }

  function restore() {
    if (!undo) return;
    rows = rows.filter((row) => row.id !== undo.placeholderId || model.isFilled(row));
    rows.splice(Math.min(undo.index, rows.length), 0, ...undo.rows);
    expandedId = undo.rows[0]?.id || rows[0].id;
    undo = null;
    persist();
    render();
    $("#partnerRows textarea").focus();
  }

  function loadExcel() {
    if (window.ExcelJS) return Promise.resolve(window.ExcelJS);
    if (!excelLoading) excelLoading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = new URL("vendor/exceljs-4.4.0.min.js", scriptBase).href;
      script.onload = () => window.ExcelJS ? resolve(window.ExcelJS) : reject(new Error("Не загружен модуль XLSX"));
      script.onerror = () => { script.remove(); reject(new Error("Не загружен модуль XLSX")); };
      document.head.append(script);
    }).catch((error) => { excelLoading = null; throw error; });
    return excelLoading;
  }

  async function download() {
    if (exporting || !rows.some(model.isFilled)) return;
    const button = $("#exportPartners");
    const snapshot = rows.map(model.normalizeRow);
    exporting = true;
    button.disabled = true;
    button.textContent = "Готовим XLSX…";
    try {
      const ExcelJS = await loadExcel();
      const buffer = await model.createWorkbook(ExcelJS, snapshot).xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      const date = new Date();
      const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      link.download = `reestr-partnerov-${stamp}.xlsx`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (error) {
      warning("Не удалось скачать XLSX. Данные остались в таблице. Проверьте, что папка vendor из архива находится рядом с index.html, и попробуйте снова.");
    } finally {
      exporting = false;
      button.textContent = "Скачать мой реестр · XLSX";
      counts();
    }
  }

  function init() {
    if (initialized) { $("#partnerRows").querySelectorAll("textarea").forEach(resize); return; }
    initialized = true;
    load();
    $("#partnerTableHead").innerHTML = `<tr>${FIELDS.map((field) => `<th scope="col" class="partner-col-${field.kind}">${esc(field.label)}</th>`).join("")}</tr>`;
    $("#partnerRows").addEventListener("input", input);
    $("#partnerRows").addEventListener("click", rowAction);
    $("#addPartner").addEventListener("click", add);
    $("#clearPartners").addEventListener("click", clear);
    $("#undoPartnerDelete").addEventListener("click", restore);
    $("#exportPartners").addEventListener("click", download);
    window.addEventListener("resize", () => $("#partnerRows").querySelectorAll("textarea").forEach(resize));
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      storageBlocked = true;
      warning("Реестр изменён в другой вкладке. Скачайте текущие данные или загрузите сохранённую версию, чтобы продолжить с ней.", true);
      saveStatus("Автосохранение приостановлено", true);
    });
    render();
  }
  window.DelaiPartners = Object.freeze({ init });
})();
