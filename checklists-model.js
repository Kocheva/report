(function (root) {
  "use strict";
  const lists = root.DELAI_CHECKLISTS_DATA;
  const items = (list) => list.sections.flatMap((section) => section.groups.flatMap((group) => group.items));
  const key = (list) => `delai_checklist_v1_${list.id}`;
  function readDraft(raw, list) {
    if (raw === null) return {};
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !value.items || typeof value.items !== "object" || Array.isArray(value.items)) throw new Error("Некорректное сохранение чек-листа");
    const result = {};
    for (const item of items(list)) {
      if (["done", "skipped"].includes(value.items[item.id])) result[item.id] = value.items[item.id];
    }
    return result;
  }
  function progress(list, state) {
    const all = items(list);
    const done = all.filter((item) => state[item.id] === "done").length;
    const skipped = all.filter((item) => state[item.id] === "skipped").length;
    return { total: all.length, done, skipped, applicable: all.length - skipped, remaining: all.length - skipped - done };
  }
  root.DelaiChecklistsModel = Object.freeze({ lists, items, key, readDraft, progress });
})(typeof window !== "undefined" ? window : globalThis);
