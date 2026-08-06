import {
  getAllUsersFromFirestore,
  toggleUserPremiumStatusInCloud,
  deleteUserFromCloud,
  getUserHistoryForAdmin,
  getAppSettingsFromCloud,
  saveAppSettingsToCloud
} from './firebaseService.js';
import { requireAdminAccess } from './adminGuard.js';
import { escapeHtml, safeHttpsUrl } from './securityUtils.js';

let allUsers = [];
let appConfig = {};

// DOM Elements
const statTotalUsers = document.getElementById('stat-total-users');
const statPremiumUsers = document.getElementById('stat-premium-users');
const statTodayFortunes = document.getElementById('stat-today-fortunes');
const usersTableBody = document.getElementById('users-table-body');
const searchUserInput = document.getElementById('search-user-input');

const inputInstagramHandle = document.getElementById('input-instagram-handle');
const inputAppName = document.getElementById('input-app-name');
const inputFreeLimit = document.getElementById('input-free-limit');
const inputPremiumLimit = document.getElementById('input-premium-limit');
const btnSaveSettings = document.getElementById('btn-save-settings');

const modalUserFortunes = document.getElementById('modal-user-fortunes');
const modalUserFortunesBody = document.getElementById('modal-user-fortunes-body');
const btnCloseUserFortunes = document.getElementById('btn-close-user-fortunes');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

function showToast(msg) {
  if (!toast || !toastMessage) return;
  toastMessage.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3000);
}

async function initAdminDashboard() {
  if (!(await requireAdminAccess())) return;
  showToast('🔄 Kullanıcılar ve Sistem Verileri Yükleniyor...');

  // 1. Fetch Config
  appConfig = await getAppSettingsFromCloud(true);
  if (inputInstagramHandle) inputInstagramHandle.value = appConfig.instagramHandle || '@fortunecookie.ai';
  if (inputAppName) inputAppName.value = appConfig.appName || 'Fortune Cookie AI';
  if (inputFreeLimit) inputFreeLimit.value = appConfig.freeDailyLimit || 1;
  if (inputPremiumLimit) inputPremiumLimit.value = appConfig.premiumDailyLimit || 5;

  // 2. Fetch Users
  try {
    allUsers = await getAllUsersFromFirestore();
  } catch (error) {
    console.error('Admin data load failed:', error?.code);
    allUsers = [];
    showToast('⚠️ Kullanıcı verileri yüklenemedi.');
  }

  renderStats();
  renderUsersTable(allUsers);
  setupDashboardEventListeners();
}

function renderStats() {
  if (statTotalUsers) statTotalUsers.textContent = allUsers.length.toString();
  
  const premCount = allUsers.filter(u => u.isPremium).length;
  if (statPremiumUsers) statPremiumUsers.textContent = `${premCount} / ${allUsers.length}`;

  let totalFortunes = 0;
  allUsers.forEach(u => {
    if (u.fortuneHistory && Array.isArray(u.fortuneHistory)) {
      totalFortunes += u.fortuneHistory.length;
    }
  });
  if (statTodayFortunes) statTodayFortunes.textContent = totalFortunes.toString();
}

function renderUsersTable(usersToRender) {
  if (!usersTableBody) return;

  if (usersToRender.length === 0) {
    usersTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 20px; color: #9CA3AF;">Kullanıcı bulunamadı.</td></tr>`;
    return;
  }

  usersTableBody.innerHTML = usersToRender.map(user => {
    const isPrem = Boolean(user.isPremium);
    const regDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString('tr-TR') : '-';
    const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '-';
    const historyCount = user.fortuneHistory ? user.fortuneHistory.length : 0;

    const safeUid = escapeHtml(user.uid);
    const avatarFallback = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.uid)}`;
    const avatarUrl = escapeHtml(safeHttpsUrl(user.photoURL, avatarFallback));
    return `
      <tr>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <img src="${avatarUrl}" style="width: 34px; height: 34px; border-radius: 50%; border: 1px solid #D1D5DB;" alt="Avatar" />
            <div>
              <strong style="color: #1F2937; font-size: 0.9rem;">${escapeHtml(user.displayName || 'Kullanıcı')}</strong>
              <div style="font-size: 0.72rem; color: #9CA3AF;">ID: ${escapeHtml(user.uid.substring(0, 10))}...</div>
            </div>
          </div>
        </td>
        <td style="font-size: 0.85rem; color: #4B5563;">${escapeHtml(user.email || 'Google / Misafir')}</td>
        <td>
          <span class="user-badge ${isPrem ? 'badge-premium' : 'badge-free'}">
            ${isPrem ? '⭐ Premium AI' : '🌱 Ücretsiz'}
          </span>
        </td>
        <td style="font-size: 0.82rem; color: #6B7280;">${regDate}</td>
        <td style="font-size: 0.82rem; color: #6B7280;">${lastLogin}</td>
        <td>
          <button class="btn-sm btn-fortunes" data-uid="${safeUid}" title="Fallarını Gör">📜 (${historyCount})</button>
        </td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-sm btn-toggle-prem" data-uid="${safeUid}" data-prem="${isPrem}">
              ${isPrem ? '🚫 Ücretsiz Yap' : '👑 Premium Yap'}
            </button>
            <button class="btn-sm btn-del-user" data-uid="${safeUid}">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Wire Table Action Buttons
  usersTableBody.querySelectorAll('.btn-toggle-prem').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-uid');
      const currentPrem = btn.getAttribute('data-prem') === 'true';
      const targetPrem = !currentPrem;

      btn.disabled = true;
      btn.textContent = '...';

      const success = await toggleUserPremiumStatusInCloud(uid, targetPrem);
      if (success) {
        const userObj = allUsers.find(u => u.uid === uid);
        if (userObj) userObj.isPremium = targetPrem;
        renderStats();
        renderUsersTable(allUsers);
        showToast(targetPrem ? '⭐ Kullanıcı Premium AI Statüsüne Yükseltildi!' : '🌱 Kullanıcı Ücretsiz Statüye Alındı');
      } else {
        showToast('⚠️ Güncelleme başarısız oldu.');
      }
    });
  });

  usersTableBody.querySelectorAll('.btn-fortunes').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-uid');
      const userObj = allUsers.find(u => u.uid === uid);
      if (userObj) {
        btn.disabled = true;
        btn.textContent = '...';
        try {
          userObj.fortuneHistory = await getUserHistoryForAdmin(uid);
        } catch (error) {
          console.error('Admin history load failed:', error?.code || error?.message);
          showToast('⚠️ Kullanıcı geçmişi yüklenemedi.');
        } finally {
          btn.disabled = false;
          btn.textContent = `📜 (${userObj.fortuneHistory?.length || 0})`;
        }
        showUserFortunesModal(userObj);
      }
    });
  });

  usersTableBody.querySelectorAll('.btn-del-user').forEach(btn => {
    btn.addEventListener('click', async () => {
      const uid = btn.getAttribute('data-uid');
      if (confirm('Bu kullanıcıyı ve verilerini silmek istediğinize emin misiniz?')) {
        const success = await deleteUserFromCloud(uid);
        if (success) {
          allUsers = allUsers.filter(u => u.uid !== uid);
          renderStats();
          renderUsersTable(allUsers);
          showToast('🗑️ Kullanıcı hesabı ve verileri silindi.');
        } else {
          showToast('⚠️ Kullanıcı silinemedi.');
        }
      }
    });
  });
}

function showUserFortunesModal(userObj) {
  if (!modalUserFortunes || !modalUserFortunesBody) return;

  const history = userObj.fortuneHistory || [];
  if (history.length === 0) {
    modalUserFortunesBody.innerHTML = `<p style="padding: 20px; text-align: center; color: #6B7280;">Bu kullanıcının henüz buluta yedeklenmiş falı yok.</p>`;
  } else {
    modalUserFortunesBody.innerHTML = history.map(item => `
      <div style="background: #FFFBEB; border: 1px solid #FDE68A; padding: 12px; border-radius: 12px; margin-bottom: 10px;">
        <div style="font-size: 0.78rem; color: #B45309; font-weight: 700; margin-bottom: 4px;">
          📅 ${escapeHtml(new Date(item.timestamp).toLocaleString('tr-TR'))}
        </div>
        <div style="font-size: 0.92rem; color: #1F2937; font-style: italic;">
          "${escapeHtml(item.quote || item.text || '')}"
        </div>
      </div>
    `).join('');
  }

  modalUserFortunes.classList.remove('hidden');
}

function setupDashboardEventListeners() {
  if (searchUserInput) {
    searchUserInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      const filtered = allUsers.filter(u =>
        (u.displayName && u.displayName.toLowerCase().includes(term)) ||
        (u.email && u.email.toLowerCase().includes(term)) ||
        (u.uid && u.uid.toLowerCase().includes(term))
      );
      renderUsersTable(filtered);
    });
  }

  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async () => {
      const updatedConfig = {
        instagramHandle: inputInstagramHandle ? inputInstagramHandle.value.trim() : '@fortunecookie.ai',
        appName: inputAppName ? inputAppName.value.trim() : 'Fortune Cookie AI',
        freeDailyLimit: inputFreeLimit ? parseInt(inputFreeLimit.value, 10) || 1 : 1,
        premiumDailyLimit: inputPremiumLimit ? parseInt(inputPremiumLimit.value, 10) || 5 : 5
      };

      btnSaveSettings.disabled = true;
      btnSaveSettings.textContent = 'Kaydediliyor...';

      const success = await saveAppSettingsToCloud(updatedConfig);

      btnSaveSettings.disabled = false;
      btnSaveSettings.textContent = '💾 Sistem Ayarlarını Kaydet';
      showToast(success ? '⚙️ Sistem ayarları kaydedildi.' : '⚠️ Sistem ayarları kaydedilemedi.');
    });
  }

  if (btnCloseUserFortunes) {
    btnCloseUserFortunes.addEventListener('click', () => {
      modalUserFortunes.classList.add('hidden');
    });
  }
}

document.addEventListener('DOMContentLoaded', initAdminDashboard);
