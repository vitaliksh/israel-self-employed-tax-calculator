// Client records are stored only in this browser (localStorage).
// Each client keeps a dated history of saved calculator inputs.
const STORAGE_KEY = 'calcClients2026';
const FORMAT = 'israel-self-employed-tax-calculator/clients';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

function emptyStore() { return { version: 1, clients: [] }; }

function isValidStore(store) {
  return store && Array.isArray(store.clients) && store.clients.every((client) =>
    typeof client.id === 'string' && typeof client.name === 'string' && Array.isArray(client.records)
    && client.records.every((record) => typeof record.id === 'string' && typeof record.savedAt === 'string' && record.inputs && typeof record.inputs === 'object'));
}

function readStore() {
  try {
    const store = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return isValidStore(store) ? store : emptyStore();
  } catch { return emptyStore(); }
}

function writeStore(store) { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); }

const byNewest = (a, b) => b.savedAt.localeCompare(a.savedAt);

export function listClients() {
  return readStore().clients
    .map((client) => ({ ...client, records: [...client.records].sort(byNewest) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export function getClient(clientId) { return listClients().find((client) => client.id === clientId) || null; }

export function findClientByName(name) {
  const normalized = name.trim().replace(/\s+/g, ' ');
  return listClients().find((client) => client.name === normalized) || null;
}

/** Appends a new dated version. Creates the client when clientId is empty. Returns { clientId, recordId }. */
export function saveRecord(clientId, name, inputs) {
  const store = readStore();
  const cleanName = name.trim().replace(/\s+/g, ' ');
  let client = store.clients.find((item) => item.id === clientId);
  if (!client) {
    client = { id: newId(), name: cleanName, createdAt: new Date().toISOString(), records: [] };
    store.clients.push(client);
  }
  client.name = cleanName;
  const record = { id: newId(), savedAt: new Date().toISOString(), inputs: { ...inputs } };
  client.records.push(record);
  writeStore(store);
  return { clientId: client.id, recordId: record.id };
}

export function deleteRecord(clientId, recordId) {
  const store = readStore();
  const client = store.clients.find((item) => item.id === clientId);
  if (!client) return;
  client.records = client.records.filter((record) => record.id !== recordId);
  writeStore(store);
}

export function deleteClient(clientId) {
  const store = readStore();
  store.clients = store.clients.filter((client) => client.id !== clientId);
  writeStore(store);
}

export function exportClients() {
  return JSON.stringify({ format: FORMAT, exportedAt: new Date().toISOString(), ...readStore() }, null, 2);
}

/** Merges a backup file into the local store. Existing versions are kept; nothing is overwritten. */
export function importClients(text) {
  const incoming = JSON.parse(text);
  if (incoming?.format !== FORMAT || !isValidStore(incoming)) throw new Error('invalid-backup');
  const store = readStore();
  let addedClients = 0;
  let addedRecords = 0;
  incoming.clients.forEach((client) => {
    let target = store.clients.find((item) => item.id === client.id);
    if (!target) {
      target = { id: client.id, name: client.name, createdAt: client.createdAt || new Date().toISOString(), records: [] };
      store.clients.push(target);
      addedClients += 1;
    }
    client.records.forEach((record) => {
      if (target.records.some((item) => item.id === record.id)) return;
      target.records.push({ id: record.id, savedAt: record.savedAt, inputs: { ...record.inputs } });
      addedRecords += 1;
    });
  });
  writeStore(store);
  return { addedClients, addedRecords };
}
