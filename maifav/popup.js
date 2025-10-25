// popup.js (v1.5.1): dark mode, newline fix, notFound list

const $ = (sel) => document.querySelector(sel);
const statusEl = $("#status");
const detailsEl = $("#details");

function setStatus(html, cls = "") {
  statusEl.className = `row small ${cls}`.trim();
  statusEl.innerHTML = html;
  if (detailsEl) detailsEl.innerHTML = "";
}

function setDetails(notFound) {
  if (!detailsEl) return;
  if (!notFound || !notFound.length) { detailsEl.innerHTML = ""; return; }
  const count = notFound.length;
  const items = notFound.map(t => `<li>${t}</li>`).join("");
  detailsEl.innerHTML = `
    <div class="notfound-title">${count}곡 불러오기 실패</div>
    <ul class="notfound-list">${items}</ul>
  `;
}

// Keep only the part before the first pipe (| or full-width ｜)
function preProcessRawTitle(raw) {
  if (raw == null) return "";
  let s = String(raw).trim();
  const idxAscii = s.indexOf("|");
  const idxFull = s.indexOf("｜");
  let cut = -1;
  if (idxAscii >= 0 && idxFull >= 0) cut = Math.min(idxAscii, idxFull);
  else cut = Math.max(idxAscii, idxFull);
  if (cut >= 0) s = s.slice(0, cut);
  return s.trim();
}

// Split escaped \n into actual lines
function splitEscapedLines(s) {
  if (!s) return [];
  const expanded = s.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  return expanded.split(/\n+/).map(x => x.trim()).filter(Boolean);
}

// Normalize
function normalizeTitle(s) {
  if (!s) return "";
  return s.toString().normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

// Parse YAML-like: supports "- item" lists and "key: value". Fallback: one-per-line from raw text.
function parseYamlTitles(yamlText) {
  const titles = new Set();
  const push = (v) => {
    const pre = preProcessRawTitle(v);
    if (!pre) return;
    for (const one of splitEscapedLines(pre)) titles.add(one);
  };

  const raw = yamlText;
  // First, convert any escaped newline sequences in the whole file to real newlines, so a single scalar with "\n" expands.
  const t = raw.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");

  const lines = t.split(/\r?\n/);
  let anyPattern = false;

  for (let rawLine of lines) {
    let line = rawLine.replace(/\s+#.*$/, "");
    if (!line.trim()) continue;

    const mArr = line.match(/^\s*-\s+(.*)$/);
    if (mArr) { push(mArr[1]); anyPattern = true; continue; }

    const mKV = line.match(/^\s*(title|name|song)\s*:\s*(.+)$/i);
    if (mKV) { push(mKV[2]); anyPattern = true; continue; }
  }

  // Fallback: if nothing matched patterns, treat every non-empty line as a title
  if (!anyPattern) {
    for (const line of lines) {
      const s = line.trim();
      if (s) push(s);
    }
  }

  return Array.from(titles);
}

$("#loadYaml").addEventListener("click", async () => {
  const file = $("#yamlFile").files?.[0];
  if (!file) return setStatus("YAML 파일을 선택하세요", "warn");
  try {
    const text = await file.text();
    const titles = parseYamlTitles(text);
    if (!titles.length) return setStatus("곡 불러오기 실패", "warn");
    // One song per line in textarea (real newlines)
    $("#titles").value = titles.join("\n");
    setStatus(`${titles.length}곡 불러옴`, "ok");
  } catch (e) {
    console.error(e);
    setStatus("YAML 불러오기 실패 " + e.message, "err");
  }
});

$("#apply").addEventListener("click", async () => {
  // Ensure any literal \n typed in the textarea become actual newlines
  const raw = $("#titles").value.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  const lines = raw.split(/\n+/).map(s => preProcessRawTitle(s)).map(s => s.trim()).filter(Boolean);
  if (!lines.length) return setStatus("최소 1개의 곡을 포함해야 합니다.", "warn");

  const normalized = lines.map(normalizeTitle);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return setStatus("활성화된 탭 없음", "err");

  try {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (titles, autoSubmit) => window.__maimaiFavSync?.run(titles, { autoSubmit }),
      args: [normalized, $("#autoSubmit").checked]
    });

    if (!result) return setStatus("CHANGE FAVORITE SONGS 페이지로 이동해주세요.", "warn");

    const { matched, notFound, disabled, totalChecked } = result;

// 항상 "n곡 적용 완료" 문구를 포함
const summary = `<b>${totalChecked}</b>곡 적용 완료`
  + ($("#autoSubmit").checked ? " · DECIDE 완료" : "");;
setStatus(summary, "ok");

    setDetails(notFound);
  } catch (e) {
    console.error(e);
    setStatus("이 탭에 적용 불가", "err");
  }
});
