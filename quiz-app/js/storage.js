const STORAGE_KEY = 'chaoxing_quiz_banks_v1';

const Storage = {
  loadBanks() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  saveBanks(banks) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(banks));
  },

  addBank(bank) {
    const banks = this.loadBanks();
    const id = bank.id || `bank_${Date.now()}`;
    const entry = { ...bank, id, importedAt: bank.importedAt || new Date().toISOString() };
    const idx = banks.findIndex((b) => b.id === id);
    if (idx >= 0) banks[idx] = entry;
    else banks.unshift(entry);
    this.saveBanks(banks);
    return entry;
  },

  removeBank(id) {
    const banks = this.loadBanks().filter((b) => b.id !== id);
    this.saveBanks(banks);
  },

  getBank(id) {
    return this.loadBanks().find((b) => b.id === id) || null;
  },
};
