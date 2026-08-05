const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

initializeApp();

async function main() {
  const identifier = process.argv[2];
  if (!identifier) {
    throw new Error("Kullanım: npm run set-admin -- <firebase-uid-veya-email>");
  }

  const auth = getAuth();
  const user = identifier.includes("@")
    ? await auth.getUserByEmail(identifier)
    : await auth.getUser(identifier);
  await auth.setCustomUserClaims(user.uid, {
    ...(user.customClaims || {}),
    admin: true,
  });
  console.log(`Admin yetkisi verildi: ${user.uid}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
