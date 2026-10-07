(function () {
  "use strict";

  // ПАРОЛЬ САЙТА: замените значение между кавычками и опубликуйте сайт заново.
  const SITE_PASSWORD = "start";
  const ACCESS_SESSION_KEY = "delai_summit_library_access_v1";

  function accessMarker(password) {
    let hash = 5381;
    for (let index = 0; index < password.length; index += 1) {
      hash = ((hash << 5) + hash) ^ password.charCodeAt(index);
    }
    return `v1-${(hash >>> 0).toString(36)}`;
  }

  function unlockSite(shouldFocus = false) {
    const gate = document.querySelector("#accessGate");
    const shell = document.querySelector("#siteShell");
    document.body.classList.remove("auth-locked");
    gate.hidden = true;
    shell.removeAttribute("inert");
    shell.removeAttribute("aria-hidden");
    if (shouldFocus) window.requestAnimationFrame(() => document.querySelector(".brand")?.focus());
  }

  function initAccessGate() {
    const marker = accessMarker(SITE_PASSWORD);
    let granted = false;
    try { granted = sessionStorage.getItem(ACCESS_SESSION_KEY) === marker; } catch {}
    if (granted) {
      unlockSite();
      return;
    }

    const form = document.querySelector("#accessForm");
    const input = document.querySelector("#accessPassword");
    const toggle = document.querySelector("#accessToggle");
    const error = document.querySelector("#accessError");

    window.requestAnimationFrame(() => input.focus());
    toggle.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      toggle.textContent = show ? "Скрыть" : "Показать";
      toggle.setAttribute("aria-pressed", String(show));
      input.focus();
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (input.value === SITE_PASSWORD) {
        try { sessionStorage.setItem(ACCESS_SESSION_KEY, marker); } catch {}
        input.removeAttribute("aria-invalid");
        error.textContent = "";
        unlockSite(true);
        return;
      }
      input.setAttribute("aria-invalid", "true");
      error.textContent = "Неверный пароль. Проверьте ввод и попробуйте ещё раз.";
      input.select();
    });
  }

  initAccessGate();

  const data = window.DELAI_LIBRARY_DATA;
  if (!data) {
    document.body.innerHTML = "<p style='padding:32px'>Не удалось загрузить данные библиотеки.</p>";
    return;
  }

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const storage = {
    get(key, fallback) {
      try {
        const value = localStorage.getItem(key);
        return value ? JSON.parse(value) : fallback;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
    }
  };

  const state = {
    route: "home",
    formatView: "catalog",
    guideView: "manual",
    visibleFormats: 18,
    selection: storage.get("delai_program_selection_v1", []),
    programMeta: storage.get("delai_program_meta_v1", {}),
    programDetails: storage.get("delai_program_details_v1", {}),
    planState: storage.get("delai_plan_state_v1", {}),
    budget: storage.get("delai_budget_v1", null),
    stageId: storage.get("delai_stage_v1", data.stages[0].id),
    rescueCategory: "all",
    dialogFormatId: null
  };

  const formatById = new Map(data.formats.map((item) => [item.id, item]));
  state.selection = state.selection.filter((id) => formatById.has(id));
  if (!state.budget || !Array.isArray(state.budget.rows)) {
    state.budget = { limit: data.budget.limit, rows: structuredClone(data.budget.rows) };
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function norm(value) {
    return String(value ?? "").toLocaleLowerCase("ru").replaceAll("ё", "е").trim();
  }

  function unique(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  }

  function rub(value) {
    return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(Number(value) || 0) + " ₽";
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function persistProgram() {
    storage.set("delai_program_selection_v1", state.selection);
    storage.set("delai_program_meta_v1", state.programMeta);
    storage.set("delai_program_details_v1", state.programDetails);
  }

  function activateRoute(route, pushHash = true) {
    if (!["home", "formats", "guide", "rescue", "sources"].includes(route)) route = "home";
    state.route = route;
    $$(".route-page").forEach((page) => page.classList.toggle("active", page.dataset.page === route));
    $$(".main-nav [data-route]").forEach((item) => item.classList.toggle("active", item.dataset.route === route));
    $("#mainNav").classList.remove("open");
    $("#menuToggle").setAttribute("aria-expanded", "false");
    if (pushHash) history.replaceState(null, "", route === "home" ? "#home" : `#${route}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (route === "formats") renderProgram();
    if (route === "guide") updatePlanProgress();
  }

  function setFormatView(view) {
    state.formatView = view === "program" ? "program" : "catalog";
    $("#catalogView").hidden = state.formatView !== "catalog";
    $("#programView").hidden = state.formatView !== "program";
    $$('[data-format-view]').forEach((button) => {
      if (button.closest(".segmented")) button.classList.toggle("active", button.dataset.formatView === state.formatView);
    });
    if (state.formatView === "program") renderProgram();
    window.scrollTo({ top: 250, behavior: "smooth" });
  }

  function setGuideView(view) {
    const valid = ["manual", "plan", "budget", "checklists", "partners"];
    state.guideView = valid.includes(view) ? view : "manual";
    $$(".guide-view").forEach((panel) => { panel.hidden = panel.id !== `${state.guideView}View`; });
    $$('[data-guide-view]').forEach((button) => {
      if (button.closest(".guide-tabs")) button.classList.toggle("active", button.dataset.guideView === state.guideView);
    });
    if (state.guideView === "plan") renderPlan();
    if (state.guideView === "budget") renderBudget();
    if (state.guideView === "checklists") {
      window.DelaiChecklists.init();
      if (!location.hash.startsWith("#guide/checklists")) history.replaceState(null, "", "#guide/checklists");
    } else if (location.hash.startsWith("#guide/checklists")) history.replaceState(null, "", "#guide");
    if (state.guideView === "partners") renderPartners();
    window.scrollTo({ top: 250, behavior: "smooth" });
  }

  function initRouting() {
    document.addEventListener("click", (event) => {
      const checklistTarget = event.target.closest("[data-open-checklist]");
      if (checklistTarget) {
        event.preventDefault();
        const id = checklistTarget.dataset.openChecklist;
        activateRoute("guide", false);
        setGuideView("checklists");
        if (window.DelaiChecklists.open(id)) history.replaceState(null, "", `#guide/checklists/${id}`);
        return;
      }
      const routeTarget = event.target.closest("[data-route]");
      if (routeTarget) {
        const route = routeTarget.dataset.route;
        if (route) {
          event.preventDefault();
          if (routeTarget.dataset.guideView) state.guideView = routeTarget.dataset.guideView;
          activateRoute(route);
          if (route === "guide" && routeTarget.dataset.guideView) setGuideView(routeTarget.dataset.guideView);
        }
      }
      const formatViewTarget = event.target.closest("[data-format-view]");
      if (formatViewTarget) setFormatView(formatViewTarget.dataset.formatView);
      const guideViewTarget = event.target.closest("[data-guide-view]");
      if (guideViewTarget && guideViewTarget.closest(".guide-tabs")) setGuideView(guideViewTarget.dataset.guideView);
    });
    $("#menuToggle").addEventListener("click", () => {
      const open = $("#mainNav").classList.toggle("open");
      $("#menuToggle").setAttribute("aria-expanded", String(open));
    });
    const initial = location.hash.replace("#", "") || "home";
    if (initial.startsWith("guide/")) {
      activateRoute("guide", false);
      const [, view, id] = initial.split("/");
      setGuideView(view);
      if (view === "checklists" && id) window.DelaiChecklists.open(id);
    } else activateRoute(initial, false);
  }

  function populateFormatFilters() {
    const lines = unique(data.formats.flatMap((item) => item.lines || []));
    const tasks = unique(data.formats.flatMap((item) => item.tasks || []));
    const places = unique(data.formats.flatMap((item) => item.places || []));
    $("#lineFilter").insertAdjacentHTML("beforeend", lines.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join(""));
    $("#taskFilter").insertAdjacentHTML("beforeend", tasks.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join(""));
    $("#placeFilter").insertAdjacentHTML("beforeend", places.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join(""));
  }

  function filteredFormats() {
    const query = norm($("#formatSearch").value);
    const line = $("#lineFilter").value;
    const task = $("#taskFilter").value;
    const place = $("#placeFilter").value;
    return data.formats.filter((item) => {
      if (line && !(item.lines || []).includes(line)) return false;
      if (task && !(item.tasks || []).includes(task)) return false;
      if (place && !(item.places || []).includes(place)) return false;
      if (!query) return true;
      const haystack = norm([
        item.title,
        ...(item.aliases || []),
        item.description,
        item.examples,
        ...(item.tasks || []),
        ...(item.lines || []),
        ...(item.audiences || [])
      ].join(" "));
      return haystack.includes(query);
    });
  }

  function formatDescription(item) {
    if (item.description) return item.description.replace(/\s+/g, " ");
    if ((item.tasks || []).length) return `Подходит для задач: ${item.tasks.join(", ").toLocaleLowerCase("ru")}.`;
    return "Описание доступно по внешней ссылке каталога; карточку можно добавить в программу.";
  }

  function renderFormats(resetVisible = false) {
    if (resetVisible) state.visibleFormats = 18;
    const matches = filteredFormats();
    const visible = matches.slice(0, state.visibleFormats);
    $("#formatResultCount").textContent = `${matches.length} найдено`;
    $("#materialHint").textContent = `${matches.filter((item) => (item.materials || []).some((material) => material.available)).length} с готовыми материалами`;
    $("#formatGrid").innerHTML = visible.length ? visible.map((item) => {
      const selected = state.selection.includes(item.id);
      const hasMaterials = (item.materials || []).some((material) => material.available);
      const index = (item.catalog_numbers || [])[0];
      return `<article class="format-card">
        <div class="format-card-top"><span class="format-index">${index ? `№ ${index}` : "МЕТОД"}</span>${hasMaterials ? '<span class="material-mark">3 материала</span>' : ""}</div>
        <h3>${esc(item.title)}</h3>
        <p>${esc(formatDescription(item))}</p>
        <div class="tag-list">${(item.tasks || []).slice(0, 3).map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}</div>
        <div class="format-card-actions">
          <button class="button secondary small" type="button" data-open-format="${esc(item.id)}">Подробнее</button>
          <button class="icon-button ${selected ? "selected" : ""}" type="button" data-toggle-format="${esc(item.id)}" aria-label="${selected ? "Удалить из программы" : "Добавить в программу"}">${selected ? "✓" : "+"}</button>
        </div>
      </article>`;
    }).join("") : '<div class="empty-state"><strong>Ничего не найдено</strong><p>Попробуйте изменить запрос или сбросить фильтры.</p></div>';
    $("#loadMoreFormats").hidden = visible.length >= matches.length;
    renderSelection();
  }

  function defaultProgramMeta(item) {
    return {
      day: "День 1",
      start: "",
      duration: 60,
      place: ""
    };
  }

  function toggleFormat(id) {
    const item = formatById.get(id);
    if (!item) return;
    if (state.selection.includes(id)) {
      state.selection = state.selection.filter((itemId) => itemId !== id);
      delete state.programMeta[id];
      showToast("Формат удалён из программы");
    } else {
      state.selection.push(id);
      state.programMeta[id] = defaultProgramMeta(item);
      showToast("Формат добавлен в программу");
    }
    persistProgram();
    renderFormats();
    renderProgram();
  }

  function renderSelection() {
    const count = state.selection.length;
    ["#selectionCount", "#programCountTab", "#programCountHero"].forEach((selector) => { $(selector).textContent = count; });
    const selected = state.selection.map((id) => formatById.get(id)).filter(Boolean);
    $("#selectionPreview").innerHTML = selected.length
      ? selected.slice(0, 7).map((item) => `<div class="selection-preview-item"><span>${esc(item.title)}</span><button type="button" data-toggle-format="${esc(item.id)}" aria-label="Удалить">×</button></div>`).join("") + (selected.length > 7 ? `<div class="selection-placeholder">Ещё ${selected.length - 7}</div>` : "")
      : '<div class="selection-placeholder">Нажимайте «+» на карточках — выбранные форматы появятся здесь.</div>';
  }

  function renderFormatMaterials(item) {
    const labels = {
      org_checklist: "Чек-лист организатора",
      fac_checklist: "Чек-лист ведущего",
      scenario: "Сценарий"
    };
    const order = Object.keys(labels);
    const separator = '<span class="format-material-separator" aria-hidden="true">·</span>';
    const fileLink = (label, type, href) => `<a href="${esc(href)}" ${type === "pdf" ? 'target="_blank" rel="noopener"' : "download"} aria-label="${esc(label)} — ${type.toUpperCase()}${type === "pdf" ? " (откроется в новой вкладке)" : " (скачать)"}">${type.toUpperCase()}</a>`;
    const row = (label, links) => `<li class="format-material-row"><span>${esc(label)}</span><span class="format-material-options">${separator}${links.join(separator)}</span></li>`;
    const rows = (item.materials || []).filter((material) => material.available).slice()
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
      .map((material) => {
        const label = labels[material.key] || material.label;
        const files = material.files || {};
        const links = ["pdf", "docx"].flatMap((type) => {
          const href = files[type] || (material.file?.toLowerCase().endsWith(`.${type}`) ? material.file : null);
          return href ? [fileLink(label, type, href)] : [];
        });
        return links.length ? row(label, links) : "";
      }).filter(Boolean);
    if (item.full_description_pdf) {
      rows.push(row("Полное описание", [fileLink("Полное описание", "pdf", item.full_description_pdf)]));
    } else {
      // Keep access to the existing full description until its PDF is supplied.
      const googleDescription = (item.external_urls || []).find((url) => /^https:\/\/(docs|drive)\.google\.com\//.test(url));
      if (googleDescription) rows.push(row("Полное описание", [`<a href="${esc(googleDescription)}" target="_blank" rel="noopener">Google Документ ↗</a>`]));
    }
    const materialsSection = rows.length ? `<section class="dialog-section"><h3>Материалы для проведения</h3><ul class="format-material-list">${rows.join("")}</ul></section>` : "";
    const detailsSection = item.grani_url ? `<section class="dialog-section"><h3>Подробнее</h3><a class="format-source-link" href="${esc(item.grani_url)}" target="_blank" rel="noopener">Материал Центра ГРАНИ ↗</a></section>` : "";
    return materialsSection + detailsSection;
  }

  function openFormatDialog(id) {
    const item = formatById.get(id);
    if (!item) return;
    state.dialogFormatId = id;
    $("#dialogLine").textContent = (item.lines || ["ФОРМАТ"])[0];
    $("#dialogTitle").textContent = item.title;
    const description = item.description || formatDescription(item);
    const examples = item.examples;
    $("#dialogBody").innerHTML = `
      <p class="dialog-description">${esc(description).replaceAll("\n", "<br>")}</p>
      ${(item.tasks || []).length ? `<section class="dialog-section"><h3>Какие задачи решает</h3><div class="tag-list">${item.tasks.map((task) => `<span class="tag">${esc(task)}</span>`).join("")}</div></section>` : ""}
      ${examples ? `<section class="dialog-section"><h3>Как использовать</h3><p>${esc(examples).replaceAll("\n", "<br>")}</p></section>` : ""}
      ${renderFormatMaterials(item)}`;
    const selected = state.selection.includes(id);
    $("#dialogAdd").textContent = selected ? "Удалить из программы" : "Добавить в программу";
    $("#formatDialog").showModal();
  }

  function renderProgram() {
    renderSelection();
    const rows = state.selection.map((id) => ({ item: formatById.get(id), meta: state.programMeta[id] || defaultProgramMeta(formatById.get(id)) })).filter((entry) => entry.item);
    $("#programEmpty").hidden = rows.length > 0;
    $("#programList").hidden = rows.length === 0;
    $("#programSummary").hidden = rows.length === 0;
    $("#programList").innerHTML = rows.map(({ item, meta }) => `<div class="program-row" data-program-id="${esc(item.id)}">
      <div class="program-order"><button type="button" data-move="up" aria-label="Поднять">▲</button><button type="button" data-move="down" aria-label="Опустить">▼</button></div>
      <div class="program-title"><strong>${esc(item.title)}</strong><span>${esc((item.tasks || []).slice(0, 2).join(" · "))}</span></div>
      <label>День<select data-program-field="day"><option${meta.day === "День 1" ? " selected" : ""}>День 1</option><option${meta.day === "День 2" ? " selected" : ""}>День 2</option><option${meta.day === "День 3" ? " selected" : ""}>День 3</option><option${meta.day === "День 4" ? " selected" : ""}>День 4</option></select></label>
      <label>Начало<input type="time" data-program-field="start" value="${esc(meta.start)}"></label>
      <label>Минут<input type="number" min="1" step="1" data-program-field="duration" value="${esc(meta.duration)}"></label>
      <label>Площадка<input type="text" data-program-field="place" value="${esc(meta.place)}"></label>
      <button class="program-remove" type="button" data-remove-program>Удалить</button>
    </div>`).join("");
    const totalMinutes = rows.reduce((sum, row) => sum + (Number(row.meta.duration) || 0), 0);
    const days = unique(rows.map((row) => row.meta.day));
    updateProgramDateFields(days.length);
    $("#programSummary").innerHTML = `<div><span>Форматов</span><strong>${rows.length}</strong></div><div><span>Общая длительность</span><strong>${Math.floor(totalMinutes / 60)} ч ${totalMinutes % 60} мин</strong></div><div><span>Дней</span><strong>${days.length}</strong></div><div><span>Сценариев и чек-листов</span><strong>${rows.reduce((sum, row) => sum + (row.item.materials || []).filter((m) => m.available).length, 0)}</strong></div>`;
  }

  function moveProgram(id, direction) {
    const index = state.selection.indexOf(id);
    const next = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || next < 0 || next >= state.selection.length) return;
    [state.selection[index], state.selection[next]] = [state.selection[next], state.selection[index]];
    persistProgram();
    renderProgram();
  }

  function updateProgramDateFields(dayCount) {
    if (dayCount === undefined) dayCount = new Set(state.selection.map(id => (state.programMeta[id] || defaultProgramMeta(formatById.get(id))).day)).size;
    $("#programDateLabel").textContent = dayCount > 1 ? "Дата начала" : "Дата";
    $("#programEndDateField").hidden = dayCount < 2;
    $("#programDetails [name=dateEnd]").disabled = dayCount < 2;
    $("#programDetails [name=dateEnd]").min = $("#programDetails [name=dateStart]").value;
  }

  function captureProgramInputs() {
    $$("#programDetails input").forEach(input => { state.programDetails[input.name] = input.value; });
    $$("#programList [data-program-id]").forEach(row => {
      const meta = state.programMeta[row.dataset.programId] ||= defaultProgramMeta(formatById.get(row.dataset.programId));
      $$('[data-program-field]', row).forEach(input => { meta[input.dataset.programField] = input.value; });
    });
    persistProgram();
    updateProgramDateFields();
  }

  function currentProgram() {
    captureProgramInputs();
    return window.DelaiProgramExport.buildModel(state.selection.map(id => ({ item: formatById.get(id), meta: state.programMeta[id] || defaultProgramMeta(formatById.get(id)) })), state.programDetails);
  }

  function programExportError(message) {
    $("#programExportStatus").textContent = message;
    $("#programExportStatus").classList.add("is-error");
  }

  async function exportProgram() {
    if (!state.selection.length) return showToast("Сначала добавьте форматы");
    const button = $("#exportProgram"), status = $("#programExportStatus");
    if (button.disabled) return;
    status.textContent = ""; status.classList.remove("is-error");
    captureProgramInputs();
    if (!$("#programDetails").reportValidity() || !$$("#programList input").every(input => input.reportValidity())) return;
    const label = button.textContent;
    try {
      const model = currentProgram();
      button.disabled = true; button.textContent = "Готовим DOCX…"; button.setAttribute("aria-busy", "true");
      await window.DelaiProgramExport.download(model);
      status.textContent = "DOCX подготовлен. Пустые поля можно заполнить в скачанном документе.";
    } catch (error) {
      programExportError(error.message || "Не удалось создать DOCX. Попробуйте ещё раз — ваша программа сохранена.");
    } finally {
      button.disabled = false; button.textContent = label; button.removeAttribute("aria-busy");
    }
  }

  function initFormats() {
    if (!state.programDetails || typeof state.programDetails !== "object") state.programDetails = {};
    $$("#programDetails input").forEach(input => { input.value = state.programDetails[input.name] || ""; });
    $("#programDetails").addEventListener("submit", event => event.preventDefault());
    $("#programDetails").addEventListener("input", captureProgramInputs);
    populateFormatFilters();
    ["#formatSearch", "#lineFilter", "#taskFilter", "#placeFilter"].forEach((selector) => $(selector).addEventListener("input", () => renderFormats(true)));
    $("#clearFormatFilters").addEventListener("click", () => {
      $("#formatSearch").value = "";
      $("#lineFilter").value = "";
      $("#taskFilter").value = "";
      $("#placeFilter").value = "";
      renderFormats(true);
    });
    $("#loadMoreFormats").addEventListener("click", () => { state.visibleFormats += 18; renderFormats(); });
    $("#clearSelection").addEventListener("click", () => {
      if (!state.selection.length || !confirm("Очистить текущую подборку форматов?")) return;
      state.selection = [];
      state.programMeta = {};
      persistProgram();
      renderFormats();
      renderProgram();
    });
    document.addEventListener("click", (event) => {
      const toggle = event.target.closest("[data-toggle-format]");
      if (toggle) toggleFormat(toggle.dataset.toggleFormat);
      const open = event.target.closest("[data-open-format]");
      if (open) openFormatDialog(open.dataset.openFormat);
    });
    $("#closeDialog").addEventListener("click", () => $("#formatDialog").close());
    $("#formatDialog").addEventListener("click", (event) => { if (event.target === $("#formatDialog")) $("#formatDialog").close(); });
    $("#dialogAdd").addEventListener("click", () => {
      if (state.dialogFormatId) toggleFormat(state.dialogFormatId);
      $("#formatDialog").close();
    });
    $("#programList").addEventListener("click", (event) => {
      const row = event.target.closest("[data-program-id]");
      if (!row) return;
      if (event.target.closest("[data-remove-program]")) toggleFormat(row.dataset.programId);
      const move = event.target.closest("[data-move]");
      if (move) moveProgram(row.dataset.programId, move.dataset.move);
    });
    $("#programList").addEventListener("change", (event) => {
      const field = event.target.dataset.programField;
      const row = event.target.closest("[data-program-id]");
      if (!field || !row) return;
      state.programMeta[row.dataset.programId] ||= defaultProgramMeta(formatById.get(row.dataset.programId));
      state.programMeta[row.dataset.programId][field] = event.target.value;
      persistProgram();
      if (field === "duration" || field === "day") renderProgram();
    });
    $("#programList").addEventListener("input", captureProgramInputs);
    $("#exportProgram").addEventListener("click", exportProgram);
    $("#printProgram").addEventListener("click", () => {
      if (!state.selection.length) return showToast("Сначала добавьте форматы");
      captureProgramInputs();
      if (!$("#programDetails").reportValidity() || !$$("#programList input").every(input => input.reportValidity())) return;
      try {
        $("#programPrint").innerHTML = window.DelaiProgramExport.printHTML(currentProgram());
        $("#programExportStatus").textContent = "";
        window.print();
      } catch (error) { programExportError(error.message); }
    });
    window.addEventListener("beforeprint", () => {
      try { $("#programPrint").innerHTML = state.selection.length ? window.DelaiProgramExport.printHTML(currentProgram()) : ""; }
      catch (error) { $("#programPrint").textContent = error.message; }
    });
    renderFormats();
  }

  function renderBlock(block) {
    if (block.type === "resources") {
      return `<section class="guide-resource-section"><h3>${esc(block.title)}</h3><ul class="guide-resource-list">${(block.items || []).map((item) => {
        let label;
        if (item.kind === "internal") {
          label = `<a href="#guide/${esc(item.view)}" data-route="guide" data-guide-view="${esc(item.view)}">${esc(item.label)}</a>`;
        } else if (item.kind === "download") {
          label = `<a href="${esc(item.url)}" download>${esc(item.label)} <span class="resource-format">· ${esc(item.format)}</span></a>`;
        } else if (item.kind === "external") {
          label = `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.label)} <span aria-hidden="true">↗</span></a>`;
        } else {
          label = `<span>${esc(item.label)}</span>${item.note ? `<span class="resource-note">${esc(item.note)}</span>` : ""}`;
        }
        return `<li>${label}${item.description ? `<p class="resource-description">${esc(item.description)}</p>` : ""}</li>`;
      }).join("")}</ul></section>`;
    }
    if (block.type === "heading") {
      const level = block.level === 3 ? "h3" : "h2";
      return `<${level}>${esc(block.text)}</${level}>`;
    }
    if (block.type === "list") {
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag}>${(block.items || []).map((item) => `<li>${esc(item.text ?? item)}</li>`).join("")}</${tag}>`;
    }
    const links = (block.links || []).map((link) => ` <a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)} ↗</a>`).join("");
    return `<p>${esc(block.text).replaceAll("\n", "<br>")}${links}</p>`;
  }

  function renderStageMaterial(material, stageId) {
    const checklist = window.DELAI_CHECKLISTS_DATA.find((list) => list.stageId === stageId && list.materialKey === material.key);
    if (checklist && material.available) return `<div class="stage-checklist-material"><strong>${esc(material.label)}</strong><div><button class="material-link" type="button" data-open-checklist="${esc(checklist.id)}">Открыть интерактивный чек-лист</button><a class="material-link" href="${esc(material.file)}" download>Шаблон · DOCX</a></div></div>`;
    return material.available ? `<a class="material-link" href="${esc(material.file)}" download>${esc(material.label)}</a>` : `<span class="material-link unavailable">${esc(material.label)} · будет добавлено</span>`;
  }

  function renderStages() {
    $("#stageNav").innerHTML = data.stages.map((stage) => `<button class="stage-button ${stage.id === state.stageId ? "active" : ""}" type="button" data-stage-id="${esc(stage.id)}"><span>${String(stage.order).padStart(2, "0")}</span><span><strong>${esc(stage.short_title)}</strong><small>${esc(stage.when_to_start)}</small></span></button>`).join("");
    const stage = data.stages.find((item) => item.id === state.stageId) || data.stages[0];
    const materialItems = stage.show_materials === false ? [] : (stage.expected_materials || stage.materials || []);
    const materialSection = materialItems.length ? `<section class="material-section"><p class="eyebrow">ПРИЛОЖЕНИЯ ЭТАПА</p><div class="material-links">${materialItems.map((material) => renderStageMaterial(material, stage.id)).join("")}</div></section>` : "";
    const next = data.stages[stage.order] || null;
    $("#stageContent").innerHTML = `<div class="stage-meta"><span>Этап ${stage.order} из ${data.stages.length}</span><span>${esc(stage.when_to_start)}</span></div><h2>${esc(stage.title)}</h2><p class="manual-lead">${esc(stage.summary)}</p><div class="manual-content">${(stage.content || []).map(renderBlock).join("")}</div>${materialSection}${next ? `<div class="next-stage"><div><span class="eyebrow">СЛЕДУЮЩИЙ ЭТАП</span><strong>${esc(next.title)}</strong></div><button class="button secondary small" type="button" data-stage-id="${esc(next.id)}">Продолжить →</button></div>` : ""}`;
  }

  const statusLabels = window.DelaiWorkbookExports.PLAN_STATUSES;

  function taskState(task) {
    return state.planState[task.id] || { status: task.default_status || "not_started", responsible: task.responsible || "" };
  }

  function updatePlanProgress() {
    const done = data.plan.tasks.filter((task) => taskState(task).status === "done").length;
    const percent = Math.round((done / data.plan.tasks.length) * 100);
    $("#planProgressHero").textContent = `${percent}%`;
    $("#planProgressText").textContent = `${done} из ${data.plan.tasks.length}`;
    $("#planProgressBar").style.width = `${percent}%`;
  }

  function renderPlan() {
    const search = norm($("#planSearch").value);
    const statusFilter = $("#planStatusFilter").value;
    const matches = data.plan.tasks.filter((task) => {
      const current = taskState(task);
      return (!statusFilter || current.status === statusFilter) && (!search || norm(`${task.task} ${task.direction} ${task.expected_result}`).includes(search));
    });
    const groups = matches.reduce((result, task) => {
      const key = task.timing || "Без срока";
      (result[key] ||= []).push(task);
      return result;
    }, {});
    $("#planGroups").innerHTML = Object.entries(groups).map(([timing, tasks]) => `<section class="plan-group"><h3>${esc(timing)} · ${tasks.length}</h3>${tasks.map((task) => {
      const current = taskState(task);
      return `<div class="plan-task ${current.status === "done" ? "status-done" : ""}" data-task-id="${esc(task.id)}"><div class="plan-task-main"><strong>${esc(task.task)}</strong><span>${esc(task.direction)} · ${esc(task.expected_result)}</span></div><select data-task-field="status">${Object.entries(statusLabels).map(([value, label]) => `<option value="${value}"${current.status === value ? " selected" : ""}>${label}</option>`).join("")}</select><input data-task-field="responsible" type="text" placeholder="Ответственный" value="${esc(current.responsible)}"></div>`;
    }).join("")}</section>`).join("") || '<div class="empty-state"><strong>Задачи не найдены</strong><p>Измените фильтры.</p></div>';
    updatePlanProgress();
  }

  function renderBudget() {
    $("#budgetLimit").value = state.budget.limit;
    let needTotal = 0;
    let partnerTotal = 0;
    let requiredTotal = 0;
    $("#budgetRows").innerHTML = state.budget.rows.map((row) => {
      const need = (Number(row.quantity) || 0) * (Number(row.unit_cost) || 0);
      const partner = Number(row.partner_contribution) || 0;
      const required = Math.max(0, need - partner);
      needTotal += need;
      partnerTotal += partner;
      requiredTotal += required;
      return `<tr data-budget-id="${esc(row.id)}"><td><input data-budget-field="title" type="text" value="${esc(row.title)}"></td><td><input data-budget-field="quantity" type="number" min="0" step="1" value="${Number(row.quantity) || 0}"></td><td><input data-budget-field="unit_cost" type="number" min="0" step="100" value="${Number(row.unit_cost) || 0}"></td><td class="computed">${rub(need)}</td><td><input data-budget-field="partner_contribution" type="number" min="0" step="100" value="${partner}"></td><td class="computed">${rub(required)}</td><td><button class="budget-delete" type="button" data-delete-budget aria-label="Удалить">×</button></td></tr>`;
    }).join("");
    const balance = (Number(state.budget.limit) || 0) - requiredTotal;
    $("#budgetNeed").textContent = rub(needTotal);
    $("#budgetPartners").textContent = rub(partnerTotal);
    $("#budgetRequired").textContent = rub(requiredTotal);
    $("#budgetBalance").textContent = rub(balance);
    $("#budgetBalanceCard").classList.toggle("over-budget", balance < 0);
    storage.set("delai_budget_v1", state.budget);
  }

  function renderPartners() {
    window.DelaiPartners.init();
  }

  function exportPlan() {
    // Берём весь план, независимо от поиска и фильтров; фиксируем данные до загрузки XLSX-модуля.
    const snapshot = data.plan.tasks.map((task) => ({ ...task, ...taskState(task) }));
    window.DelaiWorkbookExports.download({
      button: $("#exportPlan"), status: $("#planExportStatus"), filename: "moy-plan-podgotovki",
      build: (ExcelJS) => window.DelaiWorkbookExports.createPlanWorkbook(ExcelJS, snapshot)
    });
  }

  function exportBudget() {
    // Учитываем последний ввод, даже если поле ещё не потеряло фокус.
    const byId = new Map(state.budget.rows.map((row) => [String(row.id), row]));
    $$("#budgetRows tr[data-budget-id]").forEach((rowElement) => {
      const row = byId.get(rowElement.dataset.budgetId);
      if (!row) return;
      $$("[data-budget-field]", rowElement).forEach((input) => {
        const field = input.dataset.budgetField;
        row[field] = field === "title" ? input.value : Number(input.value) || 0;
      });
    });
    state.budget.limit = Number($("#budgetLimit").value) || 0;
    renderBudget();
    const snapshot = structuredClone(state.budget);
    window.DelaiWorkbookExports.download({
      button: $("#exportBudget"), status: $("#budgetExportStatus"), filename: "moy-byudzhet",
      build: (ExcelJS) => window.DelaiWorkbookExports.createBudgetWorkbook(ExcelJS, snapshot)
    });
  }

  function initGuide() {
    $("#stageNav").addEventListener("click", (event) => {
      const button = event.target.closest("[data-stage-id]");
      if (!button) return;
      state.stageId = button.dataset.stageId;
      storage.set("delai_stage_v1", state.stageId);
      renderStages();
      window.scrollTo({ top: 250, behavior: "smooth" });
    });
    $("#stageContent").addEventListener("click", (event) => {
      const button = event.target.closest("[data-stage-id]");
      if (!button) return;
      state.stageId = button.dataset.stageId;
      storage.set("delai_stage_v1", state.stageId);
      renderStages();
      window.scrollTo({ top: 250, behavior: "smooth" });
    });
    $("#planSearch").addEventListener("input", renderPlan);
    $("#exportPlan").addEventListener("click", exportPlan);
    $("#exportBudget").addEventListener("click", exportBudget);
    $("#planStatusFilter").addEventListener("change", renderPlan);
    $("#planGroups").addEventListener("input", (event) => {
      const field = event.target.dataset.taskField;
      const row = event.target.closest("[data-task-id]");
      if (!field || !row) return;
      state.planState[row.dataset.taskId] ||= taskState(data.plan.tasks.find((task) => task.id === row.dataset.taskId));
      state.planState[row.dataset.taskId][field] = event.target.value;
      storage.set("delai_plan_state_v1", state.planState);
      if (field === "status") renderPlan();
      else updatePlanProgress();
    });
    $("#budgetLimit").addEventListener("input", (event) => { state.budget.limit = Number(event.target.value) || 0; renderBudget(); });
    $("#budgetRows").addEventListener("change", (event) => {
      const field = event.target.dataset.budgetField;
      const rowEl = event.target.closest("[data-budget-id]");
      if (!field || !rowEl) return;
      const row = state.budget.rows.find((item) => item.id === rowEl.dataset.budgetId);
      if (!row) return;
      row[field] = field === "title" ? event.target.value : Number(event.target.value) || 0;
      renderBudget();
    });
    $("#budgetRows").addEventListener("click", (event) => {
      const button = event.target.closest("[data-delete-budget]");
      const row = event.target.closest("[data-budget-id]");
      if (!button || !row) return;
      state.budget.rows = state.budget.rows.filter((item) => item.id !== row.dataset.budgetId);
      renderBudget();
    });
    $("#addBudgetRow").addEventListener("click", () => {
      state.budget.rows.push({ id: `custom_${Date.now()}`, title: "Новая статья", quantity: 1, unit_cost: 0, partner_contribution: 0, actual: 0, comment: "" });
      renderBudget();
    });
    $("#resetBudget").addEventListener("click", () => {
      if (!confirm("Вернуть исходный пример бюджета? Ваши изменения будут удалены.")) return;
      state.budget = { limit: data.budget.limit, rows: structuredClone(data.budget.rows) };
      renderBudget();
    });
    renderStages();
    renderPlan();
    renderBudget();
    renderPartners();
  }

  function filteredRescue() {
    const query = norm($("#rescueSearch").value);
    return data.rescue.categories.map((category) => ({
      ...category,
      issues: category.issues.filter((issue) => {
        if (state.rescueCategory !== "all" && category.id !== state.rescueCategory) return false;
        if (!query) return true;
        return norm(`${issue.title} ${issue.why_bad} ${(issue.actions || []).join(" ")}`).includes(query);
      })
    })).filter((category) => category.issues.length);
  }

  function renderRescue() {
    const categories = filteredRescue();
    const count = categories.reduce((sum, category) => sum + category.issues.length, 0);
    $("#rescueResultCount").textContent = `${count} найдено`;
    $("#rescueResults").innerHTML = categories.length ? categories.map((category) => `<section class="rescue-category"><div class="rescue-category-head"><h2>${esc(category.title)}</h2><span>${category.issues.length} ситуаций</span></div><div class="rescue-issues">${category.issues.map((issue) => `<details class="rescue-issue"><summary>${esc(issue.title)}</summary><div class="issue-body"><div class="why-bad"><strong>Почему это важно</strong><p>${esc(issue.why_bad)}</p></div><h4>Что делать</h4><ol>${(issue.actions || []).map((action) => `<li>${esc(action)}</li>`).join("")}</ol>${(issue.tools || []).length ? `<div class="material-links">${issue.tools.map((tool) => `<span class="material-link">${esc(tool)}</span>`).join("")}</div>` : ""}</div></details>`).join("")}</div></section>`).join("") : '<div class="empty-state"><strong>Ситуация не найдена</strong><p>Попробуйте более общий запрос или выберите все разделы.</p></div>';
  }

  function initRescue() {
    $("#rescueCategories").innerHTML = `<button class="chip active" type="button" data-rescue-category="all">Все разделы</button>` + data.rescue.categories.map((category) => `<button class="chip" type="button" data-rescue-category="${esc(category.id)}">${esc(category.title)} · ${category.issues.length}</button>`).join("");
    $("#rescueCategories").addEventListener("click", (event) => {
      const button = event.target.closest("[data-rescue-category]");
      if (!button) return;
      state.rescueCategory = button.dataset.rescueCategory;
      $$("[data-rescue-category]").forEach((item) => item.classList.toggle("active", item === button));
      renderRescue();
    });
    $("#rescueSearch").addEventListener("input", renderRescue);
    renderRescue();
  }

  initRouting();
  initFormats();
  initGuide();
  initRescue();
})();
