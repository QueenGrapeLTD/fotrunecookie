import {
  currentUserIsAdmin,
  loginWithGoogle,
  logoutUser,
  waitForInitialAuth,
} from "./firebaseService.js";

const ADMIN_SESSION_KEY = "fc_admin_verified_v1";
const ADMIN_AUTH_SHELL_ID = "admin-auth-shell";

function setAdminContentHidden(hidden) {
  document.querySelectorAll(".admin-container").forEach((container) => {
    container.hidden = hidden;
  });
}

function safeLoginErrorMessage(error) {
  const code = typeof error === "string" ? error.split(" ")[0] : "";
  const messages = {
    "auth/popup-closed-by-user": "Google giriş penceresi kapatıldı. Tekrar deneyin.",
    "auth/cancelled-popup-request": "Google giriş işlemi iptal edildi. Tekrar deneyin.",
    "auth/popup-blocked": "Tarayıcı Google giriş penceresini engelledi. Açılır pencerelere izin verip tekrar deneyin.",
    "auth/network-request-failed": "Ağ bağlantısı kurulamadı. Bağlantınızı kontrol edip tekrar deneyin.",
    "auth/unauthorized-domain": "Bu alan adı Google girişi için yetkilendirilmemiş. Yöneticiyle iletişime geçin.",
    "auth/operation-not-allowed": "Google girişi şu anda kullanılamıyor. Yöneticiyle iletişime geçin.",
  };
  return messages[code] || "Google girişi tamamlanamadı. Tekrar deneyin.";
}

function setDocumentMode(mode) {
  document.documentElement.classList.remove(
    "admin-authorized",
    "admin-auth-screen",
  );
  document.documentElement.classList.add(mode);
}

function renderAccessScreen({ denied = false, error = "" } = {}) {
  setDocumentMode("admin-auth-screen");
  setAdminContentHidden(true);

  // Firebase App Check owns reCAPTCHA nodes attached to document.body. Only
  // replace our auth shell so SDK-managed placeholders remain connected.
  document.getElementById(ADMIN_AUTH_SHELL_ID)?.remove();

  const wrapper = document.createElement("main");
  wrapper.id = ADMIN_AUTH_SHELL_ID;
  wrapper.className = "admin-auth-shell";
  wrapper.style.cssText =
    "min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at top,#fff7ed,#fffbeb 48%,#f0fdfa);font-family:system-ui,sans-serif;padding:24px;color:#422006";

  const card = document.createElement("section");
  card.style.cssText =
    "width:min(440px,100%);background:#ffffffeb;border:1px solid #fed7aa;border-radius:24px;padding:34px;text-align:center;box-shadow:0 24px 70px #9a341222;backdrop-filter:blur(14px)";

  const mark = document.createElement("div");
  mark.textContent = "🥠";
  mark.style.cssText = "font-size:48px;margin-bottom:8px";

  const title = document.createElement("h1");
  title.textContent = denied ? "Yetkisiz hesap" : "Yönetici girişi";
  title.style.cssText = "font-size:28px;margin:0 0 10px;color:#9a3412";

  const message = document.createElement("p");
  message.textContent = denied
    ? "Seçilen Google hesabında yönetici yetkisi bulunmuyor. Yetkili hesapla tekrar giriş yapın."
    : "Fortune Cookie AI yönetim paneline erişmek için yetkili Google hesabınızı doğrulayın.";
  message.style.cssText = "line-height:1.55;color:#6b4f3b;margin:0 0 22px";

  const status = document.createElement("p");
  status.textContent = error;
  status.style.cssText =
    "min-height:20px;color:#b42318;font-size:14px;margin:0 0 12px";

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = denied
    ? "Başka Google hesabıyla dene"
    : "Google ile güvenli giriş";
  button.style.cssText =
    "width:100%;border:1px solid #fdba74;border-radius:14px;padding:13px 18px;background:linear-gradient(135deg,#fb923c,#ea580c);color:white;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 8px 22px #ea580c33";
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "Hesap doğrulanıyor…";
    status.textContent = "";
    sessionStorage.removeItem(ADMIN_SESSION_KEY);

    // The consumer app can leave an anonymous or non-admin Firebase session
    // in the same browser. Start the admin challenge from a clean session so
    // the account picker always establishes the intended identity.
    await logoutUser().catch(() => {});
    const result = await loginWithGoogle();
    if (!result.success) {
      status.textContent = safeLoginErrorMessage(result.error);
      button.disabled = false;
      button.textContent = "Google ile güvenli giriş";
      return;
    }

    if (!(await currentUserIsAdmin())) {
      await logoutUser().catch(() => {});
      renderAccessScreen({ denied: true });
      return;
    }

    sessionStorage.setItem(ADMIN_SESSION_KEY, "verified");
    window.location.reload();
  });

  card.append(mark, title, message, status, button);
  wrapper.append(card);
  document.body.append(wrapper);
}

function installAdminLogout() {
  const nav = document.querySelector(".admin-nav-tabs");
  if (!nav || document.getElementById("btn-admin-logout")) return;
  const button = document.createElement("button");
  button.id = "btn-admin-logout";
  button.type = "button";
  button.className = "nav-tab";
  button.textContent = "Güvenli çıkış";
  button.addEventListener("click", async () => {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    await logoutUser().catch(() => {});
    window.location.reload();
  });
  nav.append(button);
}

export async function requireAdminAccess() {
  // Even a previously authenticated admin must explicitly unlock each new
  // browser tab/session. Firebase claims remain the real authorization layer;
  // this session gate prevents an unattended consumer session exposing UI.
  if (sessionStorage.getItem(ADMIN_SESSION_KEY) !== "verified") {
    renderAccessScreen();
    return false;
  }

  const user = await waitForInitialAuth();
  if (!user || user.isAnonymous || !(await currentUserIsAdmin())) {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    renderAccessScreen({ denied: Boolean(user && !user.isAnonymous) });
    return false;
  }

  setDocumentMode("admin-authorized");
  document.getElementById(ADMIN_AUTH_SHELL_ID)?.remove();
  setAdminContentHidden(false);
  installAdminLogout();
  return true;
}
