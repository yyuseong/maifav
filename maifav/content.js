// content.js — 체크 로직 교체 + 카운터 강제 갱신 유틸

(function () {
  const form = document.querySelector('form[action$="/home/userOption/favorite/updateMusic/set"]');
  if (!form) return;

  const normalizeTitle = (s) => (s||"").toString().normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

  function allCheckboxEntries() {
    const labels = Array.from(document.querySelectorAll('label.favorite_checkbox_frame'));
    return labels.map(label => {
      const input = label.querySelector('input[name="music[]"][type="checkbox"]');
      const nameEl = label.querySelector('.favorite_music_name');
      const title = nameEl ? nameEl.textContent.trim() : "";
      return { label, input, title, norm: normalizeTitle(title) };
    }).filter(e => e.input);
  }

  // ✅ 상단 카운터를 강제로 갱신 (이벤트/텍스트 모두 시도)
  function refreshFavoriteCountUI() {
    // 1) change/input 이벤트를 한 번 발생시켜 사이트 스크립트가 스스로 갱신하도록 유도
    try {
      form.dispatchEvent(new Event('change', { bubbles: true }));
      form.dispatchEvent(new Event('input',  { bubbles: true }));
    } catch (_) {}

    // 2) 그래도 안 바뀌면 직접 텍스트를 갱신 (기존 "x/30"에서 총량 파싱)
    const span = document.querySelector('[name="favoriteCount"]');
    if (span) {
      const checked = allCheckboxEntries().filter(e => e.input.checked).length;
      const m = (span.textContent || '').match(/\/\s*(\d+)/);
      const total = m ? parseInt(m[1], 10) : null;
      span.textContent = total ? `${checked}/${total}` : String(checked);
    }
  }

  // ✅ 체크할 때 실제 이벤트가 나가도록 처리
  function setCheckedWithEvent(input, desired) {
    if (input.disabled) return false;
    if (input.checked !== desired) {
      // 실제 클릭으로 토글 → 사이트의 onChange 핸들러가 확실히 작동
      input.click();
      return true;
    } else {
      // 상태는 같아도 change 이벤트를 한 번 보내 카운터 갱신 유도
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return false;
    }
  }

  async function clickDeselectAllOnce() {
    let clicked = false;
    const btnByOnclick = document.querySelector('button[onclick*="favoriteAllOffClick"]');
    if (btnByOnclick) { btnByOnclick.click(); clicked = true; }
    else {
      const imgs = Array.from(document.querySelectorAll('button img'));
      const resetImg = imgs.find(img => /btn_allreset\.png/i.test(img.getAttribute('src') || ''));
      if (resetImg) { resetImg.closest('button')?.click(); clicked = true; }
    }
    // (필요 시) 완전 해제될 때까지 짧게 대기
    if (clicked) await new Promise(r => setTimeout(r, 80));
  }

  function checkByTitles(targetNormTitles) {
    const entries = allCheckboxEntries();
    const index = new Map(entries.map(e => [e.norm, e]));
    const matched = [];
    const disabled = [];
    const notFound = [];

    for (const normTitle of targetNormTitles) {
      const hit = index.get(normTitle);
      if (!hit) { notFound.push(normTitle); continue; }
      if (hit.input.disabled) { disabled.push(hit.title); continue; }
      setCheckedWithEvent(hit.input, true);   // ← 여기!
      matched.push(hit.title);
    }

    // 체크 후 카운터 강제 갱신
    refreshFavoriteCountUI();

    return { matched, notFound, disabled, totalChecked: entries.filter(e => e.input.checked).length };
  }

  async function submitDecide() {
    const btn = form.querySelector('button[type="submit"]');
    if (btn) btn.click(); else form.submit();
  }

  window.__maimaiFavSync = {
    async run(targetNormTitles, { autoSubmit = true } = {}) {
      await clickDeselectAllOnce();            // 전체 해제 버튼 한 번 클릭
      const result = checkByTitles(targetNormTitles);  // 체크(이벤트 동반)
      if (autoSubmit) await submitDecide();    // 옵션일 때만 제출
      return result;
    }
  };
})();
