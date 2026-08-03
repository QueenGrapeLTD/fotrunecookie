const fs = require("node:fs");
const path = require("node:path");
const firebaseAuth = require("../node_modules/firebase-tools/lib/auth");

const PROJECT_ID = "fortunecookieai-prod";

async function fetchWithRetry(url, options, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 300));
      }
    }
  }
  throw lastError;
}

function readEnvValue(name) {
  const envPath = path.resolve(__dirname, "../.env");
  const line = fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/u)
    .find((entry) => entry.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim().replace(/^['"]|['"]$/gu, "") : "";
}

async function identityRequest(endpoint, token, body) {
  const response = await fetchWithRetry(
    `https://identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts:${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Identity Toolkit HTTP ${response.status}`);
  }
  return data;
}

async function main() {
  const email = String(
    process.env.STORE_REVIEW_EMAIL || "test@fortunecookieai.com",
  ).trim().toLowerCase();
  const password = String(process.env.STORE_REVIEW_PASSWORD || "");
  if (password.length < 12) {
    throw new Error("STORE_REVIEW_PASSWORD en az 12 karakter olmalıdır.");
  }

  const account = firebaseAuth.getGlobalDefaultAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error("Firebase CLI oturumu bulunamadı. Önce firebase login çalıştırın.");
  }
  const access = await firebaseAuth.getAccessToken(
    account.tokens.refresh_token,
    [],
  );
  const token = access.access_token;

  const lookup = await identityRequest("lookup", token, { email: [email] });
  const existing = lookup.users?.[0];
  let localId = existing?.localId;

  if (!localId) {
    const apiKey = readEnvValue("VITE_FIREBASE_API_KEY");
    if (!apiKey) throw new Error("VITE_FIREBASE_API_KEY bulunamadı.");
    const response = await fetchWithRetry(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, returnSecureToken: true }),
      },
    );
    const created = await response.json();
    if (!response.ok) {
      throw new Error(created?.error?.message || `Account creation HTTP ${response.status}`);
    }
    localId = created.localId;
  }

  const claims = {
    ...(existing?.customAttributes ? JSON.parse(existing.customAttributes) : {}),
    storeReviewer: true,
  };
  await identityRequest("update", token, {
    localId,
    email,
    password,
    emailVerified: true,
    disableUser: false,
    displayName: "App Review",
    customAttributes: JSON.stringify(claims),
  });

  const firestoreResponse = await fetchWithRetry(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${encodeURIComponent(localId)}?updateMask.fieldPaths=uid&updateMask.fieldPaths=displayName&updateMask.fieldPaths=email&updateMask.fieldPaths=photoURL&updateMask.fieldPaths=isPremium&updateMask.fieldPaths=membershipTier&updateMask.fieldPaths=storeReviewer`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: {
          uid: { stringValue: localId },
          displayName: { stringValue: "App Review" },
          email: { stringValue: email },
          photoURL: { stringValue: "" },
          isPremium: { booleanValue: true },
          membershipTier: { stringValue: "premium" },
          storeReviewer: { booleanValue: true },
        },
      }),
    },
  );
  if (!firestoreResponse.ok) {
    const firestoreError = await firestoreResponse.json();
    throw new Error(firestoreError?.error?.message || "Firestore reviewer write failed");
  }

  const apiKey = readEnvValue("VITE_FIREBASE_API_KEY");
  const loginResponse = await fetchWithRetry(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  const login = await loginResponse.json();
  if (!loginResponse.ok) throw new Error(login?.error?.message || "Reviewer login failed");
  const accountResponse = await fetchWithRetry(
    `https://us-central1-${PROJECT_ID}.cloudfunctions.net/getAccountState`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${login.idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ data: {} }),
    },
  );
  const accountState = await accountResponse.json();
  const state = accountState?.data || accountState?.result;
  if (!accountResponse.ok || state?.isStoreReviewer !== true) {
    throw new Error(
      `Reviewer Premium doğrulaması başarısız oldu: ${JSON.stringify(accountState)}`,
    );
  }

  console.log(
    `Store inceleme hesabı hazır: ${email} (${localId}), günlük hak: ${state.premiumUsage.limit}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
