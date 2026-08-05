import { getFortunesDatabase, saveFortunesDatabase } from './fortunes.js';
import { requireAdminAccess } from './adminGuard.js';
import { escapeHtml } from './securityUtils.js';

let db = getFortunesDatabase();

// DOM Elements
const filterLang = document.getElementById('filter-lang');
const filterCat = document.getElementById('filter-cat');
const tableBody = document.getElementById('fortunes-table-body');
const totalCountBadge = document.getElementById('total-count-badge');

const formManualAdd = document.getElementById('form-manual-add');
const addLang = document.getElementById('add-lang');
const addCat = document.getElementById('add-cat');
const addText = document.getElementById('add-text');

const formAiGen = document.getElementById('form-ai-gen');
const aiApiKey = document.getElementById('ai-api-key');
const aiProvider = document.getElementById('ai-provider');
const aiTargetLang = document.getElementById('ai-target-lang');
const aiTargetCat = document.getElementById('ai-target-cat');
const aiCount = document.getElementById('ai-count');
const btnAiSubmit = document.getElementById('btn-ai-submit');
const btnAiText = document.getElementById('btn-ai-text');

const btnExportJson = document.getElementById('btn-export-json');
const btnResetDefault = document.getElementById('btn-reset-default');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

async function initAdmin() {
  if (!(await requireAdminAccess())) return;
  renderTable();
  setupEventListeners();
}

function renderTable() {
  const selectedLang = filterLang.value;
  const selectedCat = filterCat.value;

  const langData = db[selectedLang] || {};
  let items = [];

  if (selectedCat === 'all') {
    Object.keys(langData).forEach(cat => {
      if (Array.isArray(langData[cat])) {
        langData[cat].forEach((text, index) => {
          items.push({ cat, text, index });
        });
      }
    });
  } else {
    const list = langData[selectedCat] || [];
    list.forEach((text, index) => {
      items.push({ cat: selectedCat, text, index });
    });
  }

  // Calculate total across all languages
  let totalCount = 0;
  Object.keys(db).forEach(l => {
    Object.keys(db[l]).forEach(c => {
      if (Array.isArray(db[l][c])) totalCount += db[l][c].length;
    });
  });
  totalCountBadge.textContent = `${totalCount} Total Fortunes`;

  if (items.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#9CA3AF; padding:20px;">No fortunes found for this filter.</td></tr>`;
    return;
  }

  tableBody.innerHTML = items.map((item, idx) => `
    <tr>
      <td><strong>${idx + 1}</strong></td>
      <td><span class="cat-pill" style="font-size:0.75rem;">${escapeHtml(item.cat)}</span></td>
      <td>${escapeHtml(item.text)}</td>
      <td>
        <button class="btn-action-del" data-lang="${escapeHtml(selectedLang)}" data-cat="${escapeHtml(item.cat)}" data-index="${item.index}">Delete</button>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.btn-action-del').forEach(btn => {
    btn.addEventListener('click', () => {
      const l = btn.getAttribute('data-lang');
      const c = btn.getAttribute('data-cat');
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      deleteFortune(l, c, idx);
    });
  });
}

function deleteFortune(lang, cat, index) {
  if (db[lang] && db[lang][cat] && db[lang][cat][index] !== undefined) {
    db[lang][cat].splice(index, 1);
    saveFortunesDatabase(db);
    renderTable();
    showToast('Fortune deleted.');
  }
}

function handleManualAdd(e) {
  e.preventDefault();
  const lang = addLang.value;
  const cat = addCat.value;
  const text = addText.value.trim();

  if (!text) return;

  if (!db[lang]) db[lang] = {};
  if (!db[lang][cat]) db[lang][cat] = [];

  db[lang][cat].push(text);
  saveFortunesDatabase(db);

  addText.value = '';
  filterLang.value = lang;
  filterCat.value = cat;
  renderTable();
  showToast('New fortune added to database! ✨');
}

// AI Generation Engine (Gemini / OpenAI API)
async function handleAiGenerate(e) {
  e.preventDefault();
  const apiKey = aiApiKey.value.trim();
  const provider = aiProvider.value;
  const lang = aiTargetLang.value;
  const cat = aiTargetCat.value;
  const count = parseInt(aiCount.value, 10);

  btnAiSubmit.disabled = true;
  btnAiText.textContent = 'Generating AI Fortunes...';

  const culturePrompt = `Generate ${count} culturally authentic, short, inspiring fortune cookie sayings in language/culture code "${lang}" for category "${cat}". Respond strictly as a JSON array of strings, e.g. ["Quote 1", "Quote 2"]. Do not include extra text.`;

  try {
    let newQuotes = [];

    if (provider === 'gemini') {
      if (!apiKey) {
        // Mock fallback simulation if key not provided
        newQuotes = Array.from({ length: count }, (_, i) => `AI Generated Wisdom #${i + 1} for ${lang} (${cat})`);
      } else {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: culturePrompt }] }]
          })
        });
        const resData = await response.json();
        const rawText = resData.candidates[0].content.parts[0].text;
        const cleanJson = rawText.replace(/```json|```/g, '').trim();
        newQuotes = JSON.parse(cleanJson);
      }
    } else {
      // OpenAI Fallback or mock
      newQuotes = Array.from({ length: count }, (_, i) => `AI Generated Wisdom #${i + 1} for ${lang} (${cat})`);
    }

    if (!db[lang]) db[lang] = {};
    if (!db[lang][cat]) db[lang][cat] = [];

    db[lang][cat].push(...newQuotes);
    saveFortunesDatabase(db);

    filterLang.value = lang;
    filterCat.value = cat;
    renderTable();
    showToast(`Successfully added ${newQuotes.length} AI fortunes! ✨`);
  } catch (err) {
    console.error(err);
    showToast('AI Generation failed. Check API key.');
  } finally {
    btnAiSubmit.disabled = false;
    btnAiText.textContent = 'Generate & Import';
  }
}

function handleExportJson() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute("href", dataStr);
  downloadAnchor.setAttribute("download", "fortune_database_export.json");
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

function showToast(msg) {
  toastMessage.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2500);
}

function setupEventListeners() {
  filterLang.addEventListener('change', renderTable);
  filterCat.addEventListener('change', renderTable);
  formManualAdd.addEventListener('submit', handleManualAdd);
  formAiGen.addEventListener('submit', handleAiGenerate);
  btnExportJson.addEventListener('click', handleExportJson);

  // Load & save branding settings
  const inputBrandingIg = document.getElementById('branding-instagram');
  const inputBrandingName = document.getElementById('branding-name');
  if (inputBrandingIg) inputBrandingIg.value = localStorage.getItem('fc_app_branding_instagram') || '@fortunecookie.ai';
  if (inputBrandingName) inputBrandingName.value = localStorage.getItem('fc_app_branding_name') || 'Fortune Cookie AI App';

  const formBranding = document.getElementById('form-branding');
  if (formBranding) {
    formBranding.addEventListener('submit', (e) => {
      e.preventDefault();
      const igVal = inputBrandingIg.value.trim() || '@fortunecookie.ai';
      const nameVal = inputBrandingName.value.trim() || 'Fortune Cookie AI App';
      localStorage.setItem('fc_app_branding_instagram', igVal);
      localStorage.setItem('fc_app_branding_name', nameVal);
      showToast('🏷️ Marka ve Instagram ayarları kaydedildi!');
    });
  }

  btnResetDefault.addEventListener('click', () => {
    if (confirm('Are you sure you want to reset all content database to defaults?')) {
      localStorage.removeItem('fortune_cookie_dynamic_db_v2');
      db = getFortunesDatabase();
      renderTable();
      showToast('Database reset to defaults.');
    }
  });
}

document.addEventListener('DOMContentLoaded', initAdmin);
