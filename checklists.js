(function () {
  "use strict";
  const model = window.DelaiChecklistsModel;
  const $ = (selector) => document.querySelector(selector);
  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const states = new Map();
  const unsaved = new Map();
  const errors = new Map();
  const filters = new Map();
  let initialized = false;

  function report() {
    const status = $("#checklistSaveStatus");
    const failed = [...errors.entries()].filter(([, message]) => message);
    status.classList.toggle("is-error", failed.length > 0);
    status.textContent = failed.length ? "Есть несохранённые отметки" : "Отметки сохраняются в этом браузере";
    const warning = $("#checklistStorageWarning");
    warning.hidden = !failed.length;
    warning.textContent = failed.map(([id, message]) => `«${model.lists.find((list) => list.id === id).title}»: ${message}`).join(" ");
  }

  function load(list) {
    unsaved.set(list.id, {});
    try {
      states.set(list.id, model.readDraft(localStorage.getItem(model.key(list)), list));
      errors.delete(list.id);
    } catch (error) {
      states.set(list.id, {});
      errors.set(list.id, "не удалось прочитать сохранённые отметки. Они не перезаписаны. Попробуйте открыть страницу снова; для начала заново используйте сброс этого списка.");
    }
  }

  function saveItem(list, itemId, value) {
    states.get(list.id)[itemId] = value;
    unsaved.get(list.id)[itemId] = value;
    try {
      // Merge individual changes with the latest draft to keep edits from another tab.
      const merged = { ...model.readDraft(localStorage.getItem(model.key(list)), list), ...unsaved.get(list.id) };
      const normalized = model.readDraft(JSON.stringify({ version: 1, items: merged }), list);
      localStorage.setItem(model.key(list), JSON.stringify({ version: 1, items: normalized }));
      states.set(list.id, normalized);
      unsaved.set(list.id, {});
      errors.delete(list.id);
    } catch (error) {
      errors.set(list.id, "отметки на экране не сохранены. Не закрывайте страницу; проверьте разрешение на сохранение данных и повторите действие. Можно скачать DOCX и продолжить работу в нём.");
    }
    report();
    sync(list);
  }

  function itemHTML(item) {
    return `<li class="checklist-item" data-checklist-item="${item.id}"><label class="checklist-label"><input type="checkbox" data-checklist-done="${item.id}"><span>${esc(item.text)}</span></label><button class="checklist-skip" type="button" data-checklist-skip="${item.id}" aria-pressed="false" aria-label="Не требуется: ${esc(item.text)}">Не требуется</button></li>`;
  }

  function cardHTML(list) {
    return `<article class="checklist-card" id="checklist-${list.id}" data-checklist-id="${list.id}">
      <header class="checklist-card-head"><div class="checklist-card-heading"><h3><button class="checklist-toggle" type="button" data-checklist-toggle="${list.id}" aria-expanded="false" aria-controls="checklist-body-${list.id}">${esc(list.title)}<span class="checklist-chevron" aria-hidden="true">⌄</span></button></h3><p class="checklist-when">${esc(list.when)}</p><p class="checklist-count" data-checklist-count></p><progress data-checklist-progress aria-label="Выполнение чек-листа ${esc(list.title)}" max="1" value="0"></progress></div><a class="button secondary checklist-download" href="${esc(list.docx)}" download aria-label="Скачать шаблон DOCX: ${esc(list.title)}">Скачать шаблон · DOCX</a></header>
      <div class="checklist-body" id="checklist-body-${list.id}" hidden><div class="checklist-actions"><label><input type="checkbox" data-checklist-filter>Показать невыполненные</label><button class="text-button" type="button" data-checklist-reset>Сбросить отметки</button></div>
      ${list.sections.map((section) => `<section class="checklist-section" data-checklist-section><h4>${esc(section.title)}</h4>${section.groups.map((group) => `<div class="checklist-group" data-checklist-group>${group.title ? `<h5>${esc(group.title)}</h5>` : ""}<ul>${group.items.map(itemHTML).join("")}</ul></div>`).join("")}</section>`).join("")}
      <p class="checklist-empty" data-checklist-empty hidden>Невыполненных пунктов нет. Снимите фильтр, чтобы увидеть все отметки.</p></div></article>`;
  }

  function sync(list) {
    const card = $(`[data-checklist-id="${list.id}"]`);
    if (!card) return;
    const state = states.get(list.id);
    const progress = model.progress(list, state);
    card.querySelector("[data-checklist-count]").textContent = progress.applicable ? `Выполнено ${progress.done} из ${progress.applicable}${progress.skipped ? ` · Не требуется: ${progress.skipped}` : ""}` : `Все ${progress.total} пунктов отмечены как «Не требуется»`;
    const bar = card.querySelector("progress");
    bar.max = progress.applicable || 1;
    bar.value = progress.done;
    const focusRow = document.activeElement?.closest("[data-checklist-item]");
    const elements = [...card.querySelectorAll("[data-checklist-item]")];
    elements.forEach((row) => {
      const value = state[row.dataset.checklistItem] || "pending";
      const skipped = value === "skipped";
      row.dataset.state = value;
      row.hidden = !!filters.get(list.id) && value !== "pending";
      const checkbox = row.querySelector("input");
      checkbox.checked = value === "done";
      checkbox.disabled = skipped;
      const button = row.querySelector("button");
      button.setAttribute("aria-pressed", String(skipped));
      button.textContent = skipped ? "Вернуть в список" : "Не требуется";
      button.setAttribute("aria-label", `${skipped ? "Вернуть в список" : "Не требуется"}: ${row.querySelector(".checklist-label span").textContent}`);
    });
    card.querySelectorAll("[data-checklist-group]").forEach((group) => { group.hidden = ![...group.querySelectorAll("[data-checklist-item]")].some((row) => !row.hidden); });
    card.querySelectorAll("[data-checklist-section]").forEach((section) => { section.hidden = ![...section.querySelectorAll("[data-checklist-group]")].some((group) => !group.hidden); });
    card.querySelector("[data-checklist-empty]").hidden = !filters.get(list.id) || progress.remaining > 0;
    if (focusRow?.hidden && card.contains(focusRow)) {
      const next = elements.slice(elements.indexOf(focusRow) + 1).find((row) => !row.hidden) || elements.find((row) => !row.hidden);
      (next?.querySelector("input") || card.querySelector("[data-checklist-filter]")).focus();
    }
  }

  function reset(list) {
    if (!confirm(`Сбросить все отметки в чек-листе «${list.title}»? Другие чек-листы сохранятся.`)) return;
    try {
      // Explicit reset is the only operation that can replace an unreadable draft.
      localStorage.setItem(model.key(list), JSON.stringify({ version: 1, items: {} }));
      states.set(list.id, {});
      unsaved.set(list.id, {});
      errors.delete(list.id);
    } catch (error) {
      errors.set(list.id, "не удалось сбросить сохранённые отметки. Данные на экране сохранены; проверьте разрешение браузера на сохранение данных.");
    }
    report();
    sync(list);
  }

  function expand(id, expanded, scroll = false) {
    const card = $(`[data-checklist-id="${id}"]`);
    if (!card) return false;
    const button = card.querySelector("[data-checklist-toggle]");
    button.setAttribute("aria-expanded", String(expanded));
    card.querySelector(".checklist-body").hidden = !expanded;
    card.classList.toggle("is-open", expanded);
    if (scroll) {
      // Stage links must expose the full checklist even if a filter was used earlier.
      filters.set(id, false);
      card.querySelector("[data-checklist-filter]").checked = false;
      sync(model.lists.find((list) => list.id === id));
      button.focus({ preventScroll: true });
      card.scrollIntoView({ block: "start", behavior: "smooth" });
    }
    return true;
  }

  function init() {
    if (initialized) return;
    initialized = true;
    model.lists.forEach(load);
    $("#checklistCards").innerHTML = model.lists.map(cardHTML).join("");
    model.lists.forEach(sync);
    report();
    $("#checklistCards").addEventListener("change", (event) => {
      const card = event.target.closest("[data-checklist-id]");
      const list = model.lists.find((list) => list.id === card?.dataset.checklistId);
      if (!list) return;
      if (event.target.matches("[data-checklist-filter]")) {
        filters.set(list.id, event.target.checked);
        sync(list);
      } else if (event.target.dataset.checklistDone) saveItem(list, event.target.dataset.checklistDone, event.target.checked ? "done" : "pending");
    });
    $("#checklistCards").addEventListener("click", (event) => {
      const button = event.target.closest("button");
      const card = button?.closest("[data-checklist-id]");
      const list = model.lists.find((list) => list.id === card?.dataset.checklistId);
      if (!list) return;
      if (button.dataset.checklistToggle) expand(list.id, button.getAttribute("aria-expanded") !== "true");
      if (button.dataset.checklistSkip) saveItem(list, button.dataset.checklistSkip, states.get(list.id)[button.dataset.checklistSkip] === "skipped" ? "pending" : "skipped");
      if (button.matches("[data-checklist-reset]")) reset(list);
    });
    window.addEventListener("storage", (event) => {
      for (const list of model.lists) {
        if (event.key !== null && event.key !== model.key(list)) continue;
        try {
          const latest = model.readDraft(localStorage.getItem(model.key(list)), list);
          states.set(list.id, { ...latest, ...unsaved.get(list.id) });
          if (!Object.keys(unsaved.get(list.id)).length) errors.delete(list.id);
          sync(list);
        } catch (error) { errors.set(list.id, "сохранение изменилось в другой вкладке, но прочитать его не удалось. Текущие отметки остаются на экране."); }
      }
      report();
    });
  }

  window.DelaiChecklists = Object.freeze({ init, open: (id) => { init(); return expand(id, true, true); } });
})();
