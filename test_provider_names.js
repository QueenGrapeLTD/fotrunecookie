import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('./firebaseService.js', import.meta.url), 'utf8');

function harness() {
  const context = vm.createContext({
    getAdditionalUserInfo: result => result.additionalUserInfo,
    updateProfile: async (user, updates) => Object.assign(user, updates),
    cleanString: (value, length = 160) => String(value || '').trim().slice(0, length),
    hasOwn: (object, key) => Object.hasOwn(object, key),
    setTimeout, clearTimeout, console,
    auth: { currentUser: null },
    onAuthStateChanged: (_auth, callback) => { context.observer = callback; },
    syncUserWithDatabase: async user => {
      context.syncedName = user.displayName;
      return { displayName: user.displayName };
    },
  });
  vm.runInContext(source.slice(source.indexOf('const socialProviderNames'), source.indexOf('function isNativeMobileAuthRuntime')), context);
  vm.runInContext(source.slice(source.indexOf('export function onAuthChange'), source.indexOf('export function waitForInitialAuth')).replace('export ', ''), context);
  return context;
}

test('Google structured given/family names preserve a multiword surname', () => {
  const c = harness();
  c.user = { displayName: 'María de la Cruz' };
  vm.runInContext(`rememberProviderNames({ user, additionalUserInfo: { profile: { given_name: 'María', family_name: 'de la Cruz' } } }); names = getProfileNames(user, {}, {}, user.displayName);`, c);
  assert.equal(c.names.firstName, 'María');
  assert.equal(c.names.lastName, 'de la Cruz');
});

test('full names without provider components are not split by word position', () => {
  const c = harness();
  c.user = { displayName: '山田 太郎' };
  vm.runInContext('rememberProviderNames({ user }); names = getProfileNames(user, {}, {}, user.displayName);', c);
  assert.equal(c.names.firstName, '');
  assert.equal(c.names.lastName, '');
});

test('repeat sign-in with no provider name retains saved name components', () => {
  const c = harness();
  vm.runInContext(`names = getProfileNames({}, {}, { displayName: 'Ada Lovelace', firstName: 'Ada', lastName: 'Lovelace' }, 'Ada Lovelace');`, c);
  assert.equal(c.names.firstName, 'Ada');
  assert.equal(c.names.lastName, 'Lovelace');
});

test('editing full name clears obsolete components rather than keeping a previous surname', () => {
  const c = harness();
  vm.runInContext(`names = getProfileNames({}, { name: 'Yeni İsim' }, { displayName: 'Eski Soyad', firstName: 'Eski', lastName: 'Soyad' }, 'Yeni İsim');`, c);
  assert.equal(c.names.firstName, '');
  assert.equal(c.names.lastName, '');
});

test('native Apple first-consent name is ready before profile hydration starts', async () => {
  const c = harness();
  c.user = { uid: 'test-user', displayName: '' };
  c.auth.currentUser = c.user;
  vm.runInContext(`onAuthChange(() => {}); pending = prepareSocialSignIn(async () => {
    observerPromise = observer(user);
    await preserveNativeAppleDisplayName({ user }, { user: { displayName: 'Ada Lovelace' } }, 'apple');
    return { user };
  });`, c);
  await c.pending;
  await c.observerPromise;
  assert.equal(c.syncedName, 'Ada Lovelace');
});

test('Apple name restoration never overwrites an existing Firebase display name', async () => {
  const c = harness();
  c.user = { displayName: 'My chosen name' };
  await vm.runInContext(`preserveNativeAppleDisplayName({ user }, { user: { displayName: 'Provider name' } }, 'apple')`, c);
  assert.equal(c.user.displayName, 'My chosen name');
  await vm.runInContext(`preserveNativeAppleDisplayName({ user }, { user: null }, 'apple')`, c);
  assert.equal(c.user.displayName, 'My chosen name');
});
