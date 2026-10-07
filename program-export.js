/* DOCX и печать используют одну модель программы. Шаблон и JSZip хранятся локально. */
(function (root) {
  "use strict";
  const NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const base = typeof document === "undefined" ? null : (document.currentScript?.src || document.baseURI);
  const loading = {};
  const text = value => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  const escape = value => text(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const dateValue = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value + "T00:00:00Z")) ? value : "";
  const dateLabel = value => dateValue(value) ? value.split("-").reverse().join(".") : "";
  const timeValue = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || "") ? value : "";
  const range = (start, end) => start && end ? `${start} — ${end}` : start ? `с ${start}` : end ? `по ${end}` : "";

  function activityTime(start, duration) {
    start = timeValue(start);
    if (!start) return "";
    const minutes = Number(duration);
    if (!Number.isFinite(minutes) || minutes <= 0) return start;
    const [h, m] = start.split(":").map(Number);
    const end = h * 60 + m + Math.round(minutes);
    const clock = `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    const extra = Math.floor(end / 1440);
    return `${start}–${clock}${extra ? ` (+${extra} дн.)` : ""}`;
  }

  function buildModel(rows, details = {}) {
    const groups = new Map();
    rows.forEach(({ item, meta }) => {
      const day = /^День [1-4]$/.test(meta.day) ? meta.day : "День 1";
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push({ title: text(item.title), description: text(item.description), place: text(meta.place), time: activityTime(meta.start, meta.duration) });
    });
    const days = [...groups].sort(([a], [b]) => a.localeCompare(b, "ru", { numeric: true })).map(([label, activities]) => ({ label, activities, date: "" }));
    const start = dateValue(details.dateStart), end = days.length > 1 ? dateValue(details.dateEnd) : "";
    if (start && end && end < start) throw new Error("Дата окончания не может быть раньше даты начала.");
    // Dates within a multi-day interval are inferred only when every day is accounted for.
    // Otherwise the document shows the entered interval and day numbers without invented dates.
    const consecutive = start && end && (Date.parse(end) - Date.parse(start)) / 86400000 === days.length - 1;
    if (days.length === 1) days[0].date = dateLabel(start);
    else if (consecutive) days.forEach((day, index) => { day.date = dateLabel(new Date(Date.parse(start) + index * 86400000).toISOString().slice(0, 10)); });
    const from = timeValue(details.timeStart), to = timeValue(details.timeEnd);
    if (from && to && to <= from) throw new Error("Время окончания должно быть позже времени начала.");
    return {
      title: text(details.title), place: text(details.place),
      dates: days.length === 1 ? dateLabel(start) : range(dateLabel(start), dateLabel(end)),
      hours: from && to ? `с ${from} до ${to}` : from ? `с ${from}` : to ? `до ${to}` : "",
      days
    };
  }

  function printHTML(model) {
    const e = escape;
    return `<header class="program-print-header"><p>БИБЛИОТЕКА ОРГАНИЗАТОРА · ДЕЛАЙ-САММИТ</p><h1>ПРОГРАММА ДЕЛАЙ-САММИТА</h1><h2>${e(model.title) || "&nbsp;"}</h2><dl><div><dt>${model.days.length === 1 ? "ДАТА" : "ДАТЫ"}</dt><dd>${e(model.dates) || "&nbsp;"}</dd></div><div><dt>МЕСТО</dt><dd>${e(model.place) || "&nbsp;"}</dd></div><div><dt>ВРЕМЯ</dt><dd>${e(model.hours) || "&nbsp;"}</dd></div></dl></header>` + model.days.map(day => `<section class="program-print-day"><h2>${e(day.label)}${day.date ? ` · ${e(day.date)}` : ""}</h2><table><colgroup><col style="width:13%"><col style="width:22%"><col style="width:65%"></colgroup><thead><tr><th>Время</th><th>Место</th><th>Программа</th></tr></thead><tbody>${day.activities.map(row => `<tr><td>${e(row.time)}</td><td>${e(row.place)}</td><td><strong>${e(row.title)}</strong><p>${e(row.description) || "&nbsp;"}</p><p>Ведущий (ФИО): </p><p>Должность, организация: </p></td></tr>`).join("")}</tbody></table></section>`).join("");
  }

  function loadLocal(name, path) {
    if (root[name]) return Promise.resolve(root[name]);
    if (!loading[name]) loading[name] = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const fail = () => { clearTimeout(timer); script.remove(); reject(new Error("Не удалось загрузить шаблон или модуль DOCX. Попробуйте ещё раз.")); };
      const timer = setTimeout(fail, 15000);
      script.src = new URL(path, base).href;
      script.onload = () => { clearTimeout(timer); if (root[name]) resolve(root[name]); else fail(); };
      script.onerror = fail;
      document.head.append(script);
    }).catch(error => { delete loading[name]; throw error; });
    return loading[name];
  }

  function documentXML(template, model) {
    const xml = new root.DOMParser().parseFromString(template, "application/xml");
    if (xml.getElementsByTagName("parsererror").length) throw new Error("Повреждён шаблон DOCX.");
    const descendants = (node, name) => [...node.getElementsByTagNameNS(NS, name)];
    const children = (node, name) => [...node.children].filter(child => child.localName === name);
    const create = (name, attrs = {}) => {
      const node = xml.createElementNS(NS, "w:" + name);
      Object.entries(attrs).forEach(([key, value]) => node.setAttributeNS(NS, "w:" + key, value));
      return node;
    };
    function paragraph(node, value, size) {
      const run = descendants(node, "r")[0]?.cloneNode(true) || create("r");
      [...node.children].forEach(child => { if (child.localName !== "pPr") child.remove(); });
      [...run.children].forEach(child => { if (child.localName !== "rPr") child.remove(); });
      if (size) {
        let props = children(run, "rPr")[0];
        if (!props) { props = create("rPr"); run.prepend(props); }
        descendants(props, "sz").forEach(child => child.remove());
        props.append(create("sz", { val: String(size) }));
      }
      text(value).split("\n").forEach((line, index) => {
        if (index) run.append(create("br"));
        const t = create("t"); t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve"); t.textContent = line || " "; run.append(t);
      });
      node.append(run);
    }
    const body = descendants(xml, "body")[0], original = [...body.children];
    const metadata = original[3].cloneNode(true), tableTemplate = original[5];
    const rowTemplates = children(tableTemplate, "tr");
    body.replaceChildren(original[0].cloneNode(true), original[1].cloneNode(true), original[2].cloneNode(true));
    paragraph(body.children[2], model.title, 24);
    children(children(metadata, "tr")[0], "tc").forEach((cell, index) => {
      const paragraphs = children(cell, "p");
      paragraph(paragraphs[0], [model.days.length === 1 ? "ДАТА" : "ДАТЫ", "МЕСТО", "ВРЕМЯ"][index], 16);
      paragraph(paragraphs[1], [model.dates, model.place, model.hours][index], 20);
    });
    body.append(metadata);
    model.days.forEach((day, index) => {
      const heading = original[4].cloneNode(true);
      paragraph(heading, day.label + (day.date ? ` · ${day.date}` : ""));
      if (index) children(heading, "pPr")[0].append(create("pageBreakBefore"));
      body.append(heading);
      const table = tableTemplate.cloneNode(true);
      children(table, "tr").forEach(row => row.remove());
      const widths = [2000, 3400, 10304];
      descendants(table, "gridCol").forEach((column, i) => column.setAttributeNS(NS, "w:w", String(widths[i])));
      const header = rowTemplates[0].cloneNode(true);
      let headerProps = children(header, "trPr")[0];
      if (!headerProps) { headerProps = create("trPr"); header.prepend(headerProps); }
      if (!children(headerProps, "tblHeader").length) headerProps.append(create("tblHeader"));
      descendants(header, "p").forEach(p => paragraph(p, descendants(p, "t").map(t => t.textContent).join(""), 20));
      table.append(header);
      day.activities.forEach(activity => {
        const row = rowTemplates[2].cloneNode(true), cells = children(row, "tc");
        paragraph(children(cells[0], "p")[0], activity.time, 20);
        paragraph(children(cells[1], "p")[0], activity.place, 20);
        const p = children(cells[2], "p");
        paragraph(p[0], activity.title, 21);
        paragraph(p[1], activity.description, 19);
        paragraph(p[2], "Ведущий (ФИО): ", 19);
        paragraph(p[3], "Должность, организация: ", 19);
        table.append(row);
      });
      children(table, "tr").forEach(row => {
        descendants(row, "trHeight").forEach(height => height.remove());
        children(row, "tc").forEach((cell, i) => {
          descendants(cell, "tcW")[0].setAttributeNS(NS, "w:w", String(widths[i]));
          descendants(cell, "tcMar").forEach(margin => [...margin.children].forEach(side => side.setAttributeNS(NS, "w:w", "100")));
        });
      });
      body.append(table);
    });
    const section = original.at(-1).cloneNode(true);
    const margin = descendants(section, "pgMar")[0];
    // Keep the supplied landscape layout; leave room for its running header/footer.
    for (const [key, value] of Object.entries({ top: "1000", bottom: "850", header: "425", footer: "425" })) margin.setAttributeNS(NS, "w:" + key, value);
    body.append(section);
    return new root.XMLSerializer().serializeToString(xml);
  }

  async function createDocx(model) {
    if (!model.days.length) throw new Error("Сначала добавьте форматы в программу.");
    const [JSZip, template] = await Promise.all([loadLocal("JSZip", "vendor/jszip-3.10.1.min.js"), loadLocal("DELAI_PROGRAM_TEMPLATE", "data/program-template.js")]);
    const zip = await JSZip.loadAsync(template, { base64: true });
    zip.file("word/document.xml", documentXML(await zip.file("word/document.xml").async("string"), model));
    // A generated program is no longer a sample. Keep the template's header and styles.
    for (const name of ["word/footer1.xml", "word/footer2.xml"]) {
      zip.file(name, (await zip.file(name).async("string")).replace("Шаблон программы • форумный формат • параллельные площадки", "Программа Делай-саммита"));
    }
    return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  }

  async function download(model) {
    const bytes = await createDocx(model);
    const url = URL.createObjectURL(new Blob([bytes], { type: MIME }));
    const link = document.createElement("a");
    link.href = url; link.download = "moya-programma-delai-summit.docx";
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  root.DelaiProgramExport = Object.freeze({ buildModel, printHTML, documentXML, createDocx, download });
})(typeof window === "undefined" ? globalThis : window);
