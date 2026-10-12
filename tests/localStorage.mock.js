/* 内存版 localStorage（仅用于 Node 测试，不改动线上代码） */
class LocalStorageMock {
  constructor() { this.store = {}; }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
  key(index) { return Object.keys(this.store)[index] || null; }
  get length() { return Object.keys(this.store).length; }
}

module.exports = { LocalStorageMock };
