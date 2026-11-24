'use strict';
// Firestore giả lập trong bộ nhớ cho kiểm thử Cloud-First v2 (doc/collection/getDoc/getDocs/setDoc/writeBatch, tùy chọn runTransaction).
function makeFirestoreMock({ withTransaction = false } = {}) {
  const store = new Map();
  const keyOf = segs => segs.join('/');
  const copy = v => JSON.parse(JSON.stringify(v));
  const snapOf = (ref) => {
    const val = store.get(ref.path);
    return { id: ref.id, exists: () => val !== undefined, data: () => (val === undefined ? undefined : copy(val)) };
  };
  const helpers = {
    doc(_db, ...segs) { return { path: keyOf(segs), id: segs[segs.length - 1] }; },
    collection(_db, ...segs) { return { path: keyOf(segs) }; },
    async getDoc(ref) { return snapOf(ref); },
    async getDocs(colRef) {
      const prefix = colRef.path + '/';
      const docs = [];
      for (const [k, v] of store.entries()) {
        if (!k.startsWith(prefix) || k.slice(prefix.length).includes('/')) continue;
        docs.push({ id: k.slice(prefix.length), data: () => copy(v) });
      }
      return { docs, forEach(fn) { docs.forEach(fn); } };
    },
    async setDoc(ref, data) { store.set(ref.path, copy(data)); },
    async deleteDoc(ref) { store.delete(ref.path); },
    writeBatch() {
      const ops = [];
      return {
        set(ref, data) { ops.push({ type: 'set', path: ref.path, data }); },
        delete(ref) { ops.push({ type: 'delete', path: ref.path }); },
        async commit() {
          for (const op of ops) {
            if (op.type === 'set') store.set(op.path, copy(op.data));
            else store.delete(op.path);
          }
        }
      };
    }
  };
  if (withTransaction) {
    helpers.runTransaction = async (_db, fn) => {
      const writes = [];
      const tx = {
        async get(ref) { return snapOf(ref); },
        set(ref, data) { writes.push({ type: 'set', path: ref.path, data }); return tx; },
        delete(ref) { writes.push({ type: 'delete', path: ref.path }); return tx; }
      };
      const result = await fn(tx); // lỗi trong fn -> không áp dụng ghi nào
      for (const w of writes) {
        if (w.type === 'set') store.set(w.path, copy(w.data));
        else store.delete(w.path);
      }
      return result;
    };
  }
  return { db: { store }, helpers, store };
}

module.exports = { makeFirestoreMock };
