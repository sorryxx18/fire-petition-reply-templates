let genTemplates = [];
let currentDetail = null;
let currentPlaceholderValues = {};

function renderTransferClausesHtml(clauses) {
  if (!clauses || !clauses.length) return '';
  return '🔀 改分／加分其他局處參考（依過往案例整理，請依實際案情判斷是否適用）：<br>' +
    clauses.map(c => `・${escapeHtml(c.matter)} → ${escapeHtml(c.agency)}`).join('<br>');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function switchTab(tab) {
  const tabs = { gen: 'genTab', ai: 'aiTab', cases: 'casesTab', regs: 'regsTab', stats: 'statsTab' };
  const btns = { gen: 'tabBtnGen', ai: 'tabBtnAi', cases: 'tabBtnCases', regs: 'tabBtnRegs', stats: 'tabBtnStats' };
  Object.keys(tabs).forEach(key => {
    document.getElementById(tabs[key]).classList.toggle('hidden', key !== tab);
    const btn = document.getElementById(btns[key]);
    if (key === tab) {
      btn.classList.add('border-blue-600', 'text-blue-600');
      btn.classList.remove('border-transparent', 'text-slate-400');
    } else {
      btn.classList.remove('border-blue-600', 'text-blue-600');
      btn.classList.add('border-transparent', 'text-slate-400');
    }
  });
  if (tab === 'ai') aiRefreshQuotaUi();
  if (tab === 'cases' && !casesLoaded) loadCases();
  if (tab === 'regs' && !regsLoaded) loadRegulations();
  if (tab === 'stats' && !statsLoaded) loadStats();
}

// ---------- 範本產生器 ----------

async function loadGenTemplates() {
  try {
    const res = await fetch(`${GAS_URL}?action=list`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    genTemplates = data.templates.filter(t => t.type === 'standard');
    document.getElementById('genLoadingMsg').classList.add('hidden');
    renderGenList(genTemplates);
  } catch (e) {
    document.getElementById('genLoadingMsg').innerText = '載入失敗，請重新整理頁面再試一次。';
  }
}

function renderGenList(items) {
  const container = document.getElementById('genList');
  if (items.length === 0) {
    container.innerHTML = '<p class="col-span-2 text-center text-slate-400 py-8">找不到符合的範本。</p>';
    return;
  }
  container.innerHTML = items.map(t => `
    <button onclick="openGenerator('${t.id}')" class="text-left bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 transition">
      <div class="flex justify-between items-start mb-1">
        <span class="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">${escapeHtml(t.category)}</span>
        <span class="text-xs text-slate-400">${escapeHtml(t.status || '')}</span>
      </div>
      <h3 class="font-semibold text-slate-800 text-sm">${escapeHtml(t.title)}</h3>
      <p class="text-xs text-slate-400 mt-1">${escapeHtml(t.keywords || '')}</p>
    </button>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('genSearchBox').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (!q) { renderGenList(genTemplates); return; }
    const filtered = genTemplates.filter(t =>
      (t.title || '').includes(q) || (t.keywords || '').includes(q) ||
      (t.category || '').includes(q) || (t.legal_references || '').includes(q)
    );
    renderGenList(filtered);
  });
});

async function openGenerator(id) {
  const res = await fetch(`${GAS_URL}?action=detail&id=${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!data.ok) { alert(data.error || '載入失敗'); return; }
  currentDetail = data.template;
  currentPlaceholderValues = {};

  document.getElementById('genTitle').innerText = currentDetail.title;
  document.getElementById('genMeta').innerText = `${currentDetail.category} ｜ ${currentDetail.status || ''} ｜ 引用法規：${(currentDetail.legal_references || []).join('、') || '無標註'}`;

  const flagsBox = document.getElementById('genReviewFlags');
  if (currentDetail.review_flags && currentDetail.review_flags.length) {
    flagsBox.classList.remove('hidden');
    flagsBox.innerHTML = '⚠️ 覆核提醒：<br>' + currentDetail.review_flags.map(f => `・${escapeHtml(f)}`).join('<br>');
  } else {
    flagsBox.classList.add('hidden');
  }

  const transferBox = document.getElementById('genTransferBox');
  const transferHtml = renderTransferClausesHtml(currentDetail.transfer_clauses);
  if (transferHtml) {
    transferBox.classList.remove('hidden');
    transferBox.innerHTML = transferHtml;
  } else {
    transferBox.classList.add('hidden');
  }

  const fieldsBox = document.getElementById('placeholderFields');
  fieldsBox.innerHTML = (currentDetail.placeholders || []).map(p => `
    <div>
      <label class="block text-sm font-medium text-slate-700 mb-1">${escapeHtml(p.label)}</label>
      <input data-key="${escapeHtml(p.key)}" type="text" placeholder="請填入實際內容（原範本標示：${escapeHtml(p.source_pattern)}）"
        class="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm placeholder-input">
    </div>
  `).join('');

  fieldsBox.querySelectorAll('.placeholder-input').forEach(input => {
    input.addEventListener('input', updatePreview);
  });

  document.getElementById('genCaseNumber').value = '';
  document.getElementById('genHandler').value = '';
  updatePreview();
  document.getElementById('generatorPanel').classList.remove('hidden');
  document.getElementById('generatorPanel').scrollIntoView({ behavior: 'smooth' });
}

function closeGenerator() {
  document.getElementById('generatorPanel').classList.add('hidden');
  currentDetail = null;
}

function buildFilledText() {
  if (!currentDetail) return '';
  let text = currentDetail.response_text;
  const fieldsBox = document.getElementById('placeholderFields');
  (currentDetail.placeholders || []).forEach(p => {
    const input = fieldsBox.querySelector(`[data-key="${p.key}"]`);
    const val = input ? input.value.trim() : '';
    if (val && text.includes(p.source_pattern)) {
      text = text.replace(p.source_pattern, val);
    }
  });
  return text;
}

function updatePreview() {
  const text = buildFilledText();
  const hasBlank = text.includes('○');
  const previewBox = document.getElementById('previewBox');
  previewBox.innerHTML = escapeHtml(text).replace(/○+/g, m => `<span class="blank-input">${m}</span>`);
  document.getElementById('validationMsg').classList.toggle('hidden', !hasBlank);
  document.getElementById('produceBtn').disabled = hasBlank;
  document.getElementById('produceBtn').classList.toggle('opacity-40', hasBlank);
}

async function produceReply() {
  const text = buildFilledText();
  if (text.includes('○')) { alert('還有欄位尚未填寫。'); return; }
  const caseNumber = document.getElementById('genCaseNumber').value.trim();
  if (!caseNumber) { alert('請填寫案號。'); return; }

  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {}

  const originalLength = currentDetail.response_text.length;
  const finalLength = text.length;
  let diffChars = 0;
  const maxLen = Math.max(originalLength, finalLength);
  for (let i = 0; i < maxLen; i++) {
    if (currentDetail.response_text[i] !== text[i]) diffChars++;
  }
  const diffRatio = maxLen ? diffChars / maxLen : 0;

  await fetch(GAS_URL, {
    method: 'POST',
    mode: 'no-cors',
    body: JSON.stringify({
      action: 'logUsage',
      templateId: currentDetail.id,
      caseNumber,
      handler: document.getElementById('genHandler').value.trim(),
      originalLength, finalLength, diffRatio
    })
  });

  alert('已複製到剪貼簿，請貼到正式公文系統送出前再次確認案情細節。');
}

// ---------- 案例參考 ----------
let allCases = [];
let casesLoaded = false;

async function loadCases() {
  try {
    const res = await fetch(`${GAS_URL}?action=list`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error);
    allCases = data.templates.filter(t => t.type === 'case_example');
    casesLoaded = true;
    document.getElementById('caseLoadingMsg').classList.add('hidden');
    renderCaseList(allCases);
  } catch (e) {
    document.getElementById('caseLoadingMsg').innerText = '載入失敗，請重新整理頁面再試一次。';
  }
}

function renderCaseList(items) {
  const container = document.getElementById('caseList');
  if (items.length === 0) {
    container.innerHTML = '<p class="text-center text-slate-400 py-8">找不到符合的案例。</p>';
    return;
  }
  container.innerHTML = items.map(t => `
    <button onclick="openCaseDetail('${t.id}')" class="w-full text-left bg-white rounded-xl border border-slate-200 px-4 py-3 hover:border-blue-300 transition">
      <div class="flex justify-between items-start mb-1">
        <span class="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">${escapeHtml(t.category)}</span>
        <span class="text-xs text-slate-400">${escapeHtml(t.status || '')}</span>
      </div>
      <h3 class="font-semibold text-slate-800 text-sm">${escapeHtml(t.title)}</h3>
    </button>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('caseSearchBox').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    if (!q) { renderCaseList(allCases); return; }
    const filtered = allCases.filter(t =>
      (t.title || '').includes(q) || (t.keywords || '').includes(q) ||
      (t.category || '').includes(q) || (t.legal_references || '').includes(q)
    );
    renderCaseList(filtered);
  });
});

async function openCaseDetail(id) {
  const res = await fetch(`${GAS_URL}?action=detail&id=${encodeURIComponent(id)}`);
  const data = await res.json();
  if (!data.ok) { alert(data.error); return; }
  const t = data.template;
  alert(`${t.title}\n\n${t.response_text}`);
}

// ---------- 法規追蹤 ----------
let regsLoaded = false;

async function loadRegulations() {
  try {
    const [regRes, listRes] = await Promise.all([
      fetch(`${GAS_URL}?action=regulations`),
      fetch(`${GAS_URL}?action=list`)
    ]);
    const regData = await regRes.json();
    const listData = await listRes.json();
    regsLoaded = true;
    document.getElementById('regsLoadingMsg').classList.add('hidden');
    renderRegs(regData.regulations, listData.templates);
  } catch (e) {
    document.getElementById('regsLoadingMsg').innerText = '載入失敗，請重新整理頁面再試一次。';
  }
}

function renderRegs(regs, templates) {
  const tbody = document.getElementById('regsTableBody');
  tbody.innerHTML = regs.map(r => {
    const name = r['法規名稱'];
    const status = r['狀態'];
    const linked = templates.filter(t => (t.legal_references || '').split('、').includes(name));
    const statusBadge = status === '待覆核'
      ? '<span class="text-xs font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">待覆核</span>'
      : '<span class="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">現行</span>';
    const linkedList = linked.length
      ? linked.map(t => escapeHtml(t.title)).join('<br>')
      : '<span class="text-slate-300">無範本引用</span>';
    return `
      <tr class="border-t border-slate-100">
        <td class="px-4 py-2.5 font-medium">${escapeHtml(name)}</td>
        <td class="px-4 py-2.5">${statusBadge}</td>
        <td class="px-4 py-2.5 text-xs">${linkedList}</td>
        <td class="px-4 py-2.5">
          <button onclick="flagRegulation('${escapeHtml(name).replace(/'/g, "\\'")}')" class="text-xs text-amber-600 underline">標記待覆核</button>
        </td>
      </tr>
    `;
  }).join('');
}

async function flagRegulation(name) {
  if (!confirm(`確定要把「${name}」標記為待覆核嗎？（需要管理密鑰）`)) return;
  await fetch(GAS_URL, {
    method: 'POST',
    mode: 'no-cors',
    body: JSON.stringify({ action: 'flagRegulation', key: ADMIN_KEY, regulation: name })
  });
  alert('已標記，重新整理頁面查看。');
  regsLoaded = false;
  loadRegulations();
}

// ---------- 使用統計 ----------
let statsLoaded = false;

async function loadStats() {
  try {
    const [statsRes, listRes] = await Promise.all([
      fetch(`${GAS_URL}?action=usageStats&key=${ADMIN_KEY}`),
      fetch(`${GAS_URL}?action=list`)
    ]);
    const statsData = await statsRes.json();
    const listData = await listRes.json();
    statsLoaded = true;
    document.getElementById('statsLoadingMsg').classList.add('hidden');
    const templateMap = {};
    listData.templates.forEach(t => { templateMap[t.id] = t.title; });
    renderStats(statsData.stats, templateMap);
  } catch (e) {
    document.getElementById('statsLoadingMsg').innerText = '載入失敗，請重新整理頁面再試一次。';
  }
}

function renderStats(stats, templateMap) {
  const tbody = document.getElementById('statsTableBody');
  if (!stats.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="text-center text-slate-400 py-8">目前還沒有使用紀錄。</td></tr>';
    return;
  }
  tbody.innerHTML = stats.map(s => `
    <tr class="border-t border-slate-100">
      <td class="px-4 py-2.5">${escapeHtml(templateMap[s.templateId] || s.templateId)}</td>
      <td class="px-4 py-2.5">${s.count}</td>
      <td class="px-4 py-2.5">${(s.avgDiffRatio * 100).toFixed(1)}%</td>
    </tr>
  `).join('');
}

loadGenTemplates();

// ---------- AI輔助分類 ----------

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js';
}

let aiLastResult = null;

// ---------- 每日AI判讀次數限制（前端localStorage倒數，以中原標準時間UTC+8為準）----------
const AI_DAILY_LIMIT = 20;

function aiTodayKey_() {
  const taipeiNow = new Date(Date.now() + 8 * 3600 * 1000);
  return 'aiUsage_' + taipeiNow.toISOString().slice(0, 10);
}

function aiGetUsedCount_() {
  try {
    return parseInt(localStorage.getItem(aiTodayKey_()) || '0', 10);
  } catch (e) { return 0; }
}

function aiIncrementUsedCount_() {
  try {
    localStorage.setItem(aiTodayKey_(), String(aiGetUsedCount_() + 1));
  } catch (e) {}
}

function aiRefreshQuotaUi() {
  const used = aiGetUsedCount_();
  const remaining = Math.max(0, AI_DAILY_LIMIT - used);
  const msg = document.getElementById('aiQuotaMsg');
  const btn = document.getElementById('aiSubmitBtn');
  if (!msg || !btn) return;
  msg.innerText = `今日AI判讀剩餘次數：${remaining} / ${AI_DAILY_LIMIT}（每日00:00台灣時間重置）`;
  if (remaining <= 0) {
    btn.disabled = true;
    btn.classList.add('opacity-40');
    msg.innerText = '今日AI判讀次數已用完，請明天再試（每日00:00台灣時間重置）。';
    msg.classList.add('text-red-500');
  } else {
    btn.disabled = false;
    btn.classList.remove('opacity-40');
    msg.classList.remove('text-red-500');
  }
}

document.addEventListener('DOMContentLoaded', aiRefreshQuotaUi);

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Resize/compress an image before upload — mobile screenshots can be several MB,
// which caused "Failed to fetch" on phones (upload timeout / payload too large for
// the backend's NVIDIA UrlFetchApp call). Downscaling + re-encoding as JPEG keeps
// text legible for AI reading while cutting payload size drastically.
function resizeImageToDataUrl(file, maxWidth = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round(height * maxWidth / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('圖片解碼失敗'));
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file) {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join('') + '\n';
  }
  return text.trim();
}

async function pdfFirstPageToImage(file) {
  const buf = await readFileAsArrayBuffer(file);
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toDataURL('image/jpeg', 0.85);
}

async function aiClassifySubmit() {
  const statusEl = document.getElementById('aiFileStatus');
  const loadingMsg = document.getElementById('aiLoadingMsg');
  const errorMsg = document.getElementById('aiErrorMsg');
  const resultPanel = document.getElementById('aiResultPanel');
  errorMsg.classList.add('hidden');
  resultPanel.classList.add('hidden');

  if (aiGetUsedCount_() >= AI_DAILY_LIMIT) {
    aiRefreshQuotaUi();
    return;
  }

  const file = document.getElementById('aiFileInput').files[0];
  const pastedText = document.getElementById('aiTextInput').value.trim();

  let payload = {};
  try {
    if (file) {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        statusEl.innerText = '正在抽取PDF文字...';
        const text = await extractPdfText(file);
        if (text.length > 30) {
          payload = { text: text };
          statusEl.innerText = `已抽取 ${text.length} 字純文字（若判讀結果不理想，可能是掃描件，建議改用圖片上傳）。`;
        } else {
          statusEl.innerText = 'PDF幾乎沒有可抽取的文字，改用第一頁截圖辨識（掃描件模式）...';
          const imageDataUrl = await pdfFirstPageToImage(file);
          payload = { imageDataUrl: imageDataUrl };
        }
      } else if (file.type.startsWith('image/')) {
        statusEl.innerText = '正在讀取並壓縮圖片...';
        const imageDataUrl = await resizeImageToDataUrl(file);
        statusEl.innerText = `圖片已壓縮至約 ${Math.round(imageDataUrl.length / 1024)} KB。`;
        payload = { imageDataUrl: imageDataUrl };
      } else {
        errorMsg.innerText = '不支援的檔案類型，請上傳PDF或圖片。';
        errorMsg.classList.remove('hidden');
        return;
      }
    } else if (pastedText) {
      payload = { text: pastedText };
    } else {
      errorMsg.innerText = '請上傳檔案或貼上文字。';
      errorMsg.classList.remove('hidden');
      return;
    }
  } catch (e) {
    errorMsg.innerText = '檔案讀取失敗：' + e.message;
    errorMsg.classList.remove('hidden');
    return;
  }

  loadingMsg.classList.remove('hidden');
  document.getElementById('aiSubmitBtn').disabled = true;

  try {
    payload.action = 'aiClassify';
    const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    loadingMsg.classList.add('hidden');
    document.getElementById('aiSubmitBtn').disabled = false;
    if (!data.ok) {
      errorMsg.innerText = 'AI判讀失敗：' + (data.error || '未知錯誤');
      errorMsg.classList.remove('hidden');
      return;
    }
    aiLastResult = data;
    aiIncrementUsedCount_();
    aiRefreshQuotaUi();
    renderAiResult(data);
  } catch (e) {
    loadingMsg.classList.add('hidden');
    document.getElementById('aiSubmitBtn').disabled = false;
    errorMsg.innerText = '連線失敗：' + e.message + '（若持續失敗，可改用文字貼上，或换一張較小的圖片再試）';
    errorMsg.classList.remove('hidden');
  }
}

function renderAiResult(data) {
  document.getElementById('aiDraftBox').classList.add('hidden');
  document.getElementById('aiResultCategory').innerText = data.category || '（無法判斷分類）';
  document.getElementById('aiResultTemplate').innerText = data.template_id
    ? '建議範本：' + (data.template_title || data.template_id)
    : '找不到明確對應的範本，請自行到範本產生器搜尋。';
  document.getElementById('aiResultReasoning').innerText = data.reasoning || '';
  document.getElementById('aiResultCaseText').innerText = data.caseText || '';

  const aiTransferBox = document.getElementById('aiResultTransferBox');
  const aiTransferHtml = renderTransferClausesHtml(data.transfer_clauses);
  if (aiTransferHtml) {
    aiTransferBox.classList.remove('hidden');
    aiTransferBox.innerHTML = aiTransferHtml;
  } else {
    aiTransferBox.classList.add('hidden');
  }

  const fieldsBox = document.getElementById('aiResultFields');
  const fields = data.fields || {};
  const keys = Object.keys(fields);
  if (keys.length === 0) {
    fieldsBox.innerHTML = '';
  } else {
    fieldsBox.innerHTML = '<p class="text-xs font-medium text-slate-500 mb-1">AI擷取到的欄位（前往填寫後仍可修改）：</p>' +
      keys.map(k => `<p class="text-slate-700">・${escapeHtml(k)}：${escapeHtml(fields[k] || '（未擷取到）')}</p>`).join('');
  }

  document.getElementById('aiApplyBtn').classList.toggle('hidden', !data.template_id);
  document.getElementById('aiResultPanel').classList.remove('hidden');
  document.getElementById('aiResultPanel').scrollIntoView({ behavior: 'smooth' });
}

async function aiApplyToGenerator() {
  if (!aiLastResult || !aiLastResult.template_id) return;
  switchTab('gen');
  await openGenerator(aiLastResult.template_id);
  const fields = aiLastResult.fields || {};
  const fieldsBox = document.getElementById('placeholderFields');
  Object.keys(fields).forEach(key => {
    const input = fieldsBox.querySelector(`[data-key="${key}"]`);
    if (input && fields[key]) input.value = fields[key];
  });
  updatePreview();
}

// ---------- AI直接生成回覆草稿 ----------

async function aiGenerateReplyDraft() {
  if (!aiLastResult || !aiLastResult.caseText) return;
  const loadingMsg = document.getElementById('aiGenerateLoadingMsg');
  const draftBox = document.getElementById('aiDraftBox');
  const btn = document.getElementById('aiGenerateReplyBtn');
  loadingMsg.classList.remove('hidden');
  draftBox.classList.add('hidden');
  btn.disabled = true;

  try {
    const payload = {
      action: 'aiGenerateReply',
      caseText: aiLastResult.caseText,
      template_id: aiLastResult.template_id || null,
      transfer_clauses: aiLastResult.transfer_clauses || []
    };
    const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
    const data = await res.json();
    loadingMsg.classList.add('hidden');
    btn.disabled = false;
    if (!data.ok) {
      alert('AI生成草稿失敗：' + (data.error || '未知錯誤'));
      return;
    }
    document.getElementById('aiDraftText').value = data.draft;
    draftBox.classList.remove('hidden');
    draftBox.scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    loadingMsg.classList.add('hidden');
    btn.disabled = false;
    alert('連線失敗：' + e.message);
  }
}

async function aiCopyDraft() {
  const text = document.getElementById('aiDraftText').value;
  try {
    await navigator.clipboard.writeText(text);
    alert('已複製到剪貼簿，請貼到正式公文系統前再次確認案情細節。');
  } catch (e) {
    alert('複製失敗，請手動選取文字複製。');
  }
}
