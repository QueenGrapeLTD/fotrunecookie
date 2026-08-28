import { requireAdminAccess } from './adminGuard.js';
import { escapeHtml } from './securityUtils.js';
import {
  generateFortuneDrafts,
  listFortuneContent,
  reviewFortuneContent,
  seedFortuneContentLibrary,
  upsertFortuneContent,
} from './firebaseService.js';

let contentItems = [];
let isLoading = false;

const filterLang = document.getElementById('filter-lang');
const filterCat = document.getElementById('filter-cat');
const searchInput = document.getElementById('search-fortune-input');
const tableBody = document.getElementById('fortunes-table-body');
const totalCountBadge = document.getElementById('total-count-badge');
const formManualAdd = document.getElementById('form-manual-add');
const addLang = document.getElementById('add-lang');
const addCat = document.getElementById('add-cat');
const addText = document.getElementById('add-text');
const formAiGen = document.getElementById('form-ai-gen');
const aiTargetLang = document.getElementById('ai-target-lang');
const aiTargetCat = document.getElementById('ai-target-cat');
const aiCount = document.getElementById('ai-count');
const btnAiSubmit = document.getElementById('btn-ai-submit');
const btnAiText = document.getElementById('btn-ai-text');
const btnExportJson = document.getElementById('btn-export-json');
const btnSeedLibrary = document.getElementById('btn-reset-default');
const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

const filterStatus = document.createElement('select');
filterStatus.id = 'filter-status';
filterStatus.className = 'filter-select';
filterStatus.innerHTML = `
  <option value="">Tüm durumlar</option>
  <option value="approved">Onaylı</option>
  <option value="draft">İncelemede</option>
  <option value="rejected">Reddedildi</option>
`;
filterCat?.insertAdjacentElement('afterend', filterStatus);

function showToast(message) {
  if (!toast || !toastMessage) return;
  toastMessage.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3200);
}

function setLoading(value) {
  isLoading = value;
  if (btnAiSubmit) btnAiSubmit.disabled = value;
  if (tableBody && value) {
    tableBody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:24px;">İçerikler yükleniyor…</td></tr>';
  }
}

function configurePage() {
  document.title = 'Şans Kurabiyesi İçerik Stüdyosu';
  addText.maxLength = 80;
  addText.placeholder = '15-80 karakterlik doğal ve merak uyandıran bir mesaj';

  if (aiCount) {
    [...aiCount.options].forEach((option) => {
      if (Number(option.value) > 10) option.remove();
    });
  }
  if (btnAiText) btnAiText.textContent = '✨ İncelenecek AI taslakları üret';
  if (btnSeedLibrary) btnSeedLibrary.textContent = '🌱 Onaylı başlangıç havuzunu yükle';

  const tableHeader = tableBody?.closest('table')?.querySelector('thead tr');
  if (tableHeader) {
    tableHeader.innerHTML = `
      <th>#</th>
      <th>Şans Kurabiyesi metni</th>
      <th>Kategori</th>
      <th>Durum / Kalite</th>
      <th>Gösterim</th>
      <th>Paylaşım</th>
      <th>İşlem</th>
    `;
  }
}

async function loadContent() {
  if (isLoading) return;
  setLoading(true);
  try {
    const response = await listFortuneContent();
    contentItems = Array.isArray(response?.items) ? response.items : [];
    renderTable();
  } catch (error) {
    console.error(error);
    tableBody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:24px;color:#b42318;">İçerik kütüphanesi alınamadı.</td></tr>';
    showToast('İçerik kütüphanesi alınamadı.');
  } finally {
    isLoading = false;
    if (btnAiSubmit) btnAiSubmit.disabled = false;
  }
}

function filteredItems() {
  const lang = filterLang?.value || '';
  const category = filterCat?.value || '';
  const status = filterStatus.value;
  const term = searchInput?.value.trim().toLocaleLowerCase() || '';
  return contentItems.filter((item) => (
    (!lang || item.lang === lang) &&
    (!category || item.category === category) &&
    (!status || item.status === status) &&
    (!term || item.text.toLocaleLowerCase().includes(term))
  ));
}

function statusLabel(status) {
  if (status === 'approved') return 'Onaylı';
  if (status === 'rejected') return 'Reddedildi';
  return 'İncelemede';
}

function renderTable() {
  const items = filteredItems();
  if (totalCountBadge) {
    const approved = items.filter((item) => item.status === 'approved').length;
    totalCountBadge.textContent = `${items.length} içerik · ${approved} onaylı`;
  }
  if (!items.length) {
    tableBody.innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:24px;color:#667085;">Bu filtrede içerik yok.</td></tr>';
    return;
  }
  tableBody.innerHTML = items.map((item, index) => {
    const metrics = item.metrics || {};
    const views = Number(metrics.resultViews) || 0;
    const shares = Number(metrics.shareCompletes) || 0;
    const shareRate = views ? `${((shares / views) * 100).toFixed(1)}%` : '—';
    return `
      <tr data-id="${escapeHtml(item.id)}">
        <td>${index + 1}</td>
        <td>
          <div style="font-weight:700;color:#344054;">${escapeHtml(item.text)}</div>
          <small style="color:#98a2b3;">${escapeHtml(item.lang)} · ${escapeHtml(item.source || 'manual')} · ${item.text.length}/80</small>
        </td>
        <td>${escapeHtml(item.category)}</td>
        <td>
          <span class="content-status content-status-${escapeHtml(item.status)}">${statusLabel(item.status)}</span>
          <select class="quality-select" aria-label="Kalite puanı">
            ${[1, 2, 3, 4, 5].map((score) =>
              `<option value="${score}" ${Number(item.qualityScore) === score ? 'selected' : ''}>${score}/5</option>`
            ).join('')}
          </select>
        </td>
        <td>${views}<br><small>${Number(metrics.storyOpens) || 0} kart</small></td>
        <td>${shares}<br><small>${shareRate}</small></td>
        <td>
          <div style="display:flex;flex-wrap:wrap;gap:5px;">
            <button type="button" class="content-action" data-action="approved">Onayla</button>
            <button type="button" class="content-action" data-action="draft">Taslak</button>
            <button type="button" class="content-action btn-action-del" data-action="rejected">Reddet</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

async function handleReview(button) {
  const row = button.closest('tr[data-id]');
  const id = row?.dataset.id;
  const status = button.dataset.action;
  const qualityScore = Number(row?.querySelector('.quality-select')?.value) || 3;
  if (!id || !status) return;
  button.disabled = true;
  try {
    await reviewFortuneContent(id, status, qualityScore);
    const item = contentItems.find((candidate) => candidate.id === id);
    if (item) {
      item.status = status;
      item.qualityScore = qualityScore;
    }
    renderTable();
    showToast(`İçerik ${statusLabel(status).toLocaleLowerCase('tr')} olarak kaydedildi.`);
  } catch (error) {
    console.error(error);
    showToast('İnceleme kararı kaydedilemedi.');
    button.disabled = false;
  }
}

async function handleManualAdd(event) {
  event.preventDefault();
  const text = addText.value.trim();
  if (text.length < 15 || text.length > 80) {
    showToast('Metin 15-80 karakter arasında olmalı.');
    return;
  }
  try {
    await upsertFortuneContent({
      text,
      lang: addLang.value,
      category: addCat.value,
      status: 'draft',
      qualityScore: 3,
      source: 'manual',
    });
    addText.value = '';
    filterLang.value = addLang.value;
    filterCat.value = addCat.value;
    filterStatus.value = 'draft';
    await loadContent();
    showToast('Yeni içerik inceleme kuyruğuna eklendi.');
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'İçerik eklenemedi.');
  }
}

async function handleAiGenerate(event) {
  event.preventDefault();
  btnAiSubmit.disabled = true;
  if (btnAiText) btnAiText.textContent = 'Taslaklar hazırlanıyor…';
  try {
    const result = await generateFortuneDrafts({
      lang: aiTargetLang.value,
      category: aiTargetCat.value,
      count: Math.min(Number(aiCount.value) || 5, 10),
    });
    filterLang.value = aiTargetLang.value;
    filterCat.value = aiTargetCat.value;
    filterStatus.value = 'draft';
    await loadContent();
    showToast(`${Number(result?.count) || 0} güvenli taslak inceleme kuyruğuna eklendi.`);
  } catch (error) {
    console.error(error);
    showToast('AI taslakları üretilemedi.');
  } finally {
    btnAiSubmit.disabled = false;
    if (btnAiText) btnAiText.textContent = '✨ İncelenecek AI taslakları üret';
  }
}

function exportJson() {
  const payload = JSON.stringify(contentItems, null, 2);
  const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `fortune_content_${Date.now()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 500);
}

async function seedLibrary() {
  btnSeedLibrary.disabled = true;
  try {
    const result = await seedFortuneContentLibrary();
    await loadContent();
    showToast(`${Number(result?.count) || 0} onaylı içerik buluta yüklendi.`);
  } catch (error) {
    console.error(error);
    showToast('Başlangıç havuzu yüklenemedi.');
  } finally {
    btnSeedLibrary.disabled = false;
  }
}

async function init() {
  if (!(await requireAdminAccess())) return;
  configurePage();
  filterLang?.addEventListener('change', renderTable);
  filterCat?.addEventListener('change', renderTable);
  filterStatus.addEventListener('change', renderTable);
  searchInput?.addEventListener('input', renderTable);
  tableBody?.addEventListener('click', (event) => {
    const button = event.target.closest('button.content-action');
    if (button) void handleReview(button);
  });
  formManualAdd?.addEventListener('submit', handleManualAdd);
  formAiGen?.addEventListener('submit', handleAiGenerate);
  btnExportJson?.addEventListener('click', exportJson);
  btnSeedLibrary?.addEventListener('click', seedLibrary);
  await loadContent();
}

document.addEventListener('DOMContentLoaded', init);
