let genTemplates = [];
let currentDetail = null;
let currentPlaceholderValues = {};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function switchTab(tab) {
  const tabs = { gen: 'genTab', cases: 'casesTab', regs: 'regsTab', stats: 'statsTab' };
  const btns = { gen: 'tabBtnGen', cases: 'tabBtnCases', regs: 'tabBtnRegs', stats: 'tabBtnStats' };
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
