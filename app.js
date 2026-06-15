const ZONES = [
  { id: 'A', name: 'Zone A', count: 18, description: 'Rangée du bas — emplacements 1 à 18' },
  { id: 'B', name: 'Zone B', count: 18, description: 'Rangée centrale — emplacements 19 à 36' },
  { id: 'C', name: 'Zone C', count: 10, description: 'Rangée du haut — emplacements 37 à 46' },
];

/**
 * Calage auto sur les rectangles noirs de plan emplacements.png (1549×605)
 * haut = 10 (C), milieu = 18 (B), bas = 18 (A)
 */
const ZONE_GEOMETRY = {
  C: { left: '10.85%', top: '0.17%', width: '55.65%', height: '25.95%' },
  B: { left: '0.19%', top: '46.78%', width: '99.03%', height: '23.95%' },
  A: { left: '0.19%', top: '71.9%', width: '99.03%', height: '25.05%' },
};

const PLAN_REFERENCE_IMAGE = 'assets/plan-reference.png';

const TOTAL_SPOTS = ZONES.reduce((sum, zone) => sum + zone.count, 0);

function getGlobalSlotNumber(zoneId, slotNumber) {
  let offset = 0;
  for (const zone of ZONES) {
    if (zone.id === zoneId) {
      return offset + Number(slotNumber);
    }
    offset += zone.count;
  }
  return Number(slotNumber);
}

function getZoneSlotFromGlobal(globalNumber) {
  const n = Number(globalNumber);
  if (!Number.isFinite(n) || n < 1 || n > TOTAL_SPOTS) return null;
  let offset = 0;
  for (const zone of ZONES) {
    if (n <= offset + zone.count) {
      return { zone_id: zone.id, slot_number: n - offset };
    }
    offset += zone.count;
  }
  return null;
}

function formatEmplacement(zoneId, slotNumber) {
  return `Emplacement ${getGlobalSlotNumber(zoneId, slotNumber)}`;
}

const STATUS_LABELS = {
  actif: 'Actif',
  hivernage: 'Hivernage',
  maintenance: 'Maintenance',
  archive: 'Archivé',
};

const ROLE_LABELS = {
  admin: 'Administrateur',
  manager: 'Gestion',
  viewer: 'Lecture seule',
};

const STORAGE_KEYS = {
  DEMO_ACCOUNTS: 'cnh-demo-accounts-v3',
  DEMO_SESSION: 'cnh-demo-session-v3',
  DEMO_BOATS: 'cnh-demo-boats-v3',
  SUPABASE_SESSION: 'cnh-supabase-session-v1',
  UI_PREFS: 'cnh-ui-prefs-v1',
};

const CONFIG = window.CNH_CONFIG || {};
const MOBILE_BREAKPOINT = 760;
const PLAN_IMAGE_WIDTH = 1549;
const PLAN_IMAGE_HEIGHT = 605;
const PLAN_FULLSCREEN_FILL = 0.96;
const PLAN_FULLSCREEN_PAN_PAD = 24;
const DEFAULT_PHOTO = 'assets/placeholder-boat.svg';

let planMapResizeObserver = null;

// --- Appwrite Initialization ---
const client = new Appwrite.Client();
client
    .setEndpoint(CONFIG.appwriteEndpoint)
    .setProject(CONFIG.appwriteProjectId);

const databases = new Appwrite.Databases(client);
const account = new Appwrite.Account(client);

const state = {
  mode: 'appwrite', // Force Appwrite mode
  boats: [],
// ...existing code...
  profiles: [],
  session: null,
  currentProfile: null,
  selectedSlot: { zone_id: 'A', slot_number: 1 },
  selectedBoatId: null,
  activeTab: 'dashboardTab',
  forcePasswordChange: false,
  filters: {
    search: '',
    zone: 'all',
    status: 'all',
  },
  ui: loadUiPrefs(),
  planView: 'map',
  focusZone: null,
  swipe: {
    activeId: null,
    startX: 0,
    startY: 0,
    deltaX: 0,
    moved: false,
  },
};

const els = {
  authView: document.getElementById('authView'),
  appView: document.getElementById('appView'),
  modeBadge: document.getElementById('modeBadge'),
  demoHelp: document.getElementById('demoHelp'),
  loginForm: document.getElementById('loginForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  logoutButton: document.getElementById('logoutButton'),
  userDisplayName: document.getElementById('userDisplayName'),
  userDisplayRole: document.getElementById('userDisplayRole'),
  syncPill: document.getElementById('syncPill'),
  workspaceTitle: document.getElementById('workspaceTitle'),
  workspaceSubtitle: document.getElementById('workspaceSubtitle'),
  refreshButton: document.getElementById('refreshButton'),
  exportButton: document.getElementById('exportButton'),
  importInput: document.getElementById('importInput'),
  openCreateBoatButton: document.getElementById('openCreateBoatButton'),
  floatingAddButton: document.getElementById('floatingAddButton'),
  statTotalSpots: document.getElementById('statTotalSpots'),
  statOccupied: document.getElementById('statOccupied'),
  statFree: document.getElementById('statFree'),
  statComplete: document.getElementById('statComplete'),
  zonesBoard: document.getElementById('zonesBoard'),
  sitePlanMap: document.getElementById('sitePlanMap'),
  sitePlanSection: document.getElementById('sitePlanSection'),
  zoneFocusBar: document.getElementById('zoneFocusBar'),
  zoneFocusTitle: document.getElementById('zoneFocusTitle'),
  zoneFocusMeta: document.getElementById('zoneFocusMeta'),
  zoneFocusAllBtn: document.getElementById('zoneFocusAllBtn'),
  zoneFocusGridBtn: document.getElementById('zoneFocusGridBtn'),
  planMapViewBtn: document.getElementById('planMapViewBtn'),
  planGridViewBtn: document.getElementById('planGridViewBtn'),
  openPlanFullscreenBtn: document.getElementById('openPlanFullscreenBtn'),
  closePlanFullscreenBtn: document.getElementById('closePlanFullscreenBtn'),
  planFullscreen: document.getElementById('planFullscreen'),
  planFullscreenBody: document.getElementById('planFullscreenBody'),
  sitePlanAnchor: document.getElementById('sitePlanAnchor'),
  sidebarZoneStats: document.getElementById('sidebarZoneStats'),
  searchInput: document.getElementById('searchInput'),
  zoneFilter: document.getElementById('zoneFilter'),
  statusFilter: document.getElementById('statusFilter'),
  cardModeButton: document.getElementById('cardModeButton'),
  compactModeButton: document.getElementById('compactModeButton'),
  boatGrid: document.getElementById('boatGrid'),
  accountCardName: document.getElementById('accountCardName'),
  accountCardEmail: document.getElementById('accountCardEmail'),
  accountRoleChip: document.getElementById('accountRoleChip'),
  accountPasswordChip: document.getElementById('accountPasswordChip'),
  openPasswordModalButton: document.getElementById('openPasswordModalButton'),
  profilesNotice: document.getElementById('profilesNotice'),
  profilesList: document.getElementById('profilesList'),
  boatModal: document.getElementById('boatModal'),
  boatModalTitle: document.getElementById('boatModalTitle'),
  boatForm: document.getElementById('boatForm'),
  boatId: document.getElementById('boatId'),
  boatPhotoData: document.getElementById('boatPhotoData'),
  boatPhotoInput: document.getElementById('boatPhotoInput'),
  boatPhotoPreview: document.getElementById('boatPhotoPreview'),
  removeBoatPhotoButton: document.getElementById('removeBoatPhotoButton'),
  boatName: document.getElementById('boatName'),
  licenceNumber: document.getElementById('licenceNumber'),
  registrationNumber: document.getElementById('registrationNumber'),
  boatType: document.getElementById('boatType'),
  boatStatus: document.getElementById('boatStatus'),
  ownerName: document.getElementById('ownerName'),
  ownerPhone: document.getElementById('ownerPhone'),
  ownerEmail: document.getElementById('ownerEmail'),
  emergencyContact: document.getElementById('emergencyContact'),
  zoneSelect: document.getElementById('zoneSelect'),
  slotSelect: document.getElementById('slotSelect'),
  lengthInput: document.getElementById('lengthInput'),
  widthInput: document.getElementById('widthInput'),
  equipmentInput: document.getElementById('equipmentInput'),
  notesInput: document.getElementById('notesInput'),
  duplicateBoatButton: document.getElementById('duplicateBoatButton'),
  deleteBoatButton: document.getElementById('deleteBoatButton'),
  passwordModal: document.getElementById('passwordModal'),
  passwordModalText: document.getElementById('passwordModalText'),
  passwordForm: document.getElementById('passwordForm'),
  newPassword: document.getElementById('newPassword'),
  confirmPassword: document.getElementById('confirmPassword'),
  toastContainer: document.getElementById('toastContainer'),
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  sidebarClose: document.getElementById('sidebarClose'),
  sidebarBackdrop: document.getElementById('sidebarBackdrop'),
};

const tabMeta = {
  dashboardTab: {
    title: 'Plan des emplacements',
    subtitle: 'Photo aérienne interactive — 46 places en zones A (18), B (18) et C (10).',
  },
  fleetTab: {
    title: 'Registre des bateaux',
    subtitle: 'Recherche, filtres et mode compact mobile avec actions rapides par swipe.',
  },
  adminTab: {
    title: 'Administration',
    subtitle: 'Sécurité, rôles et synchronisation en ligne Supabase.',
  },
};

function isSupabaseReady() {
  return Boolean(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey);
}

function loadUiPrefs() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.UI_PREFS) || '{}');
    if (parsed.viewMode) {
      return { viewMode: parsed.viewMode };
    }
  } catch {
    // ignore
  }
  return { viewMode: window.innerWidth <= MOBILE_BREAKPOINT ? 'compact' : 'cards' };
}

function saveUiPrefs() {
  localStorage.setItem(STORAGE_KEYS.UI_PREFS, JSON.stringify(state.ui));
}

function getZone(zoneId) {
  return ZONES.find((zone) => zone.id === zoneId) || ZONES[0];
}

function getRole() {
  return state.currentProfile?.role || 'viewer';
}

function canManageBoats() {
  return ['admin', 'manager'].includes(getRole());
}

function isAdmin() {
  return getRole() === 'admin';
}

function createId(prefix = 'id') {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeText(value) {
  return value == null ? '' : String(value).trim();
}

function safeImage(value) {
  const text = safeText(value);
  return text.startsWith('data:image/') ? text : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function displayBoatName(boat) {
  const name = safeText(boat?.boat_name);
  if (name) return name;
  if (boat?.zone_id && boat?.slot_number) {
    return `Bateau non renseigné • ${formatEmplacement(boat.zone_id, boat.slot_number)}`;
  }
  return 'Bateau non renseigné';
}

function displayOwnerName(boat) {
  return safeText(boat?.owner_name) || 'Propriétaire non renseigné';
}

function truncatePlanText(value, max = 10) {
  const text = safeText(value);
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function planSlotTooltip(zoneId, slot, boat) {
  const global = getGlobalSlotNumber(zoneId, slot);
  if (!boat) return `${formatEmplacement(zoneId, slot)} (${getZone(zoneId).name}) — libre`;
  const parts = [
    formatEmplacement(zoneId, slot),
    getZone(zoneId).name,
    displayBoatName(boat),
    displayOwnerName(boat),
    boat.owner_phone ? `Tél. ${boat.owner_phone}` : '',
    boat.licence_number ? `Licence ${boat.licence_number}` : '',
    STATUS_LABELS[boat.status],
  ].filter(Boolean);
  return parts.join(' • ');
}

function planSlotPhotoSrc(boat) {
  return boat?.photo_data || DEFAULT_PHOTO;
}

function renderPlanSlotMarkup(zoneId, slot, boat) {
  const global = getGlobalSlotNumber(zoneId, slot);
  if (!boat) {
    return `<span class="plan-slot-num">${global}</span>`;
  }
  const alt = escapeHtml(displayBoatName(boat));
  return `
    <img class="plan-slot-photo" src="${planSlotPhotoSrc(boat)}" alt="${alt}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${DEFAULT_PHOTO}'" />
    <span class="plan-slot-num" aria-hidden="true">${global}</span>
  `;
}

function hasMeaningfulBoatInfo(data = {}) {
  return Boolean(
    safeText(data.boat_name) ||
      safeText(data.licence_number) ||
      safeText(data.registration_number) ||
      safeText(data.boat_type) ||
      safeText(data.owner_name) ||
      safeText(data.owner_phone) ||
      safeText(data.owner_email) ||
      safeText(data.emergency_contact) ||
      safeText(data.length_m) ||
      safeText(data.width_m) ||
      safeText(data.equipment) ||
      safeText(data.notes) ||
      safeImage(data.photo_data)
  );
}

function sortBoats(a, b) {
  const slotA = getGlobalSlotNumber(a.zone_id, a.slot_number);
  const slotB = getGlobalSlotNumber(b.zone_id, b.slot_number);
  if (slotA !== slotB) return slotA - slotB;
  return a.boat_name.localeCompare(b.boat_name, 'fr');
}

function normalizeBoat(raw = {}) {
  const zone = getZone(raw.zone_id || raw.zoneId || 'A');
  const parsedSlot = Number(raw.slot_number ?? raw.slotNumber ?? 1);
  return {
    id: raw.id || createId('boat'),
    boat_name: safeText(raw.boat_name ?? raw.boatName),
    licence_number: safeText(raw.licence_number ?? raw.licenceNumber),
    registration_number: safeText(raw.registration_number ?? raw.registrationNumber),
    boat_type: safeText(raw.boat_type ?? raw.boatType),
    status: STATUS_LABELS[raw.status] ? raw.status : 'actif',
    owner_name: safeText(raw.owner_name ?? raw.ownerName),
    owner_phone: safeText(raw.owner_phone ?? raw.ownerPhone),
    owner_email: safeText(raw.owner_email ?? raw.ownerEmail),
    emergency_contact: safeText(raw.emergency_contact ?? raw.emergencyContact),
    zone_id: zone.id,
    slot_number:
      Number.isFinite(parsedSlot) && parsedSlot >= 1 && parsedSlot <= zone.count ? parsedSlot : 1,
    length_m: safeText(raw.length_m ?? raw.length),
    width_m: safeText(raw.width_m ?? raw.width),
    equipment: safeText(raw.equipment),
    notes: safeText(raw.notes),
    photo_data: safeImage(raw.photo_data ?? raw.photoData),
    created_at: raw.created_at || raw.createdAt || new Date().toISOString(),
    updated_at: raw.updated_at || raw.updatedAt || new Date().toISOString(),
  };
}

function normalizeProfile(raw = {}) {
  return {
    id: raw.id || createId('profile'),
    email: safeText(raw.email),
    full_name: safeText(raw.full_name || raw.fullName || raw.email || 'Utilisateur'),
    role: ROLE_LABELS[raw.role] ? raw.role : 'viewer',
    must_change_password: Boolean(raw.must_change_password),
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString(),
  };
}

function makeFallbackProfile(user = {}) {
  return normalizeProfile({
    id: user.id || createId('profile'),
    email: safeText(user.email),
    full_name: safeText(user.user_metadata?.full_name || user.email || 'Utilisateur'),
    role: 'viewer',
    must_change_password: false,
  });
}

const demoApi = {
  ensureSeed() {
    const accountsRaw = localStorage.getItem(STORAGE_KEYS.DEMO_ACCOUNTS);
    if (!accountsRaw) {
      const accounts = [
        normalizeProfile({ id: 'demo-admin', email: 'admin@cnh.local', full_name: 'Admin CNH', role: 'admin', must_change_password: true }),
        normalizeProfile({ id: 'demo-manager', email: 'equipe@cnh.local', full_name: 'Équipe CNH', role: 'manager' }),
        normalizeProfile({ id: 'demo-viewer', email: 'lecture@cnh.local', full_name: 'Consultation CNH', role: 'viewer' }),
      ].map((profile) => ({
        ...profile,
        password: profile.role === 'admin' ? 'Admin1234!' : profile.role === 'manager' ? 'Staff1234!' : 'View1234!',
      }));
      localStorage.setItem(STORAGE_KEYS.DEMO_ACCOUNTS, JSON.stringify(accounts));
    }

    const boatsRaw = localStorage.getItem(STORAGE_KEYS.DEMO_BOATS);
    if (!boatsRaw) {
      const boats = [
        normalizeBoat({
          id: 'demo-boat-1',
          boat_name: 'Alizé',
          licence_number: 'CNH-2026-001',
          registration_number: 'DK123456',
          boat_type: 'Catamaran',
          status: 'actif',
          owner_name: 'Marc Lefebvre',
          owner_phone: '06 11 22 33 44',
          owner_email: 'marc.lefebvre@email.fr',
          zone_id: 'A',
          slot_number: 3,
          length_m: '5.4',
          width_m: '2.4',
          equipment: 'Bâche bleue, remorque club',
          notes: 'Présence régulière les week-ends.',
        }),
        normalizeBoat({
          id: 'demo-boat-2',
          boat_name: 'Goéland',
          licence_number: 'CNH-2026-014',
          registration_number: 'BD998877',
          boat_type: 'Dériveur',
          status: 'maintenance',
          owner_name: 'Claire Duhamel',
          owner_phone: '06 98 76 54 32',
          owner_email: 'claire.duhamel@email.fr',
          zone_id: 'B',
          slot_number: 8,
          length_m: '4.7',
          width_m: '1.8',
          equipment: 'Taud neuf, mise à l’eau facile',
          notes: 'Révision safran prévue en juin.',
        }),
        normalizeBoat({
          id: 'demo-boat-3',
          boat_name: 'Mistral',
          licence_number: 'CNH-2026-021',
          boat_type: 'Semi-rigide',
          status: 'hivernage',
          owner_name: 'Jean Martin',
          owner_phone: '07 44 55 66 77',
          zone_id: 'C',
          slot_number: 2,
          length_m: '5.9',
          width_m: '2.3',
          equipment: 'Moteur protégé, bâche noire',
        }),
      ].sort(sortBoats);
      localStorage.setItem(STORAGE_KEYS.DEMO_BOATS, JSON.stringify(boats));
    }
  },

  getAccounts() {
    this.ensureSeed();
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.DEMO_ACCOUNTS) || '[]');
  },

  setAccounts(accounts) {
    localStorage.setItem(STORAGE_KEYS.DEMO_ACCOUNTS, JSON.stringify(accounts));
  },

  getBoats() {
    this.ensureSeed();
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.DEMO_BOATS) || '[]').map(normalizeBoat).sort(sortBoats);
  },

  setBoats(boats) {
    localStorage.setItem(STORAGE_KEYS.DEMO_BOATS, JSON.stringify(boats.map(normalizeBoat).sort(sortBoats)));
  },

  async signIn(email, password) {
    const account = this.getAccounts().find(
      (item) => item.email.toLowerCase() === safeText(email).toLowerCase() && item.password === password,
    );
    if (!account) throw new Error('Email ou mot de passe invalide.');

    localStorage.setItem(
      STORAGE_KEYS.DEMO_SESSION,
      JSON.stringify({ profileId: account.id, signedAt: new Date().toISOString() }),
    );

    return {
      session: { access_token: 'demo-token', user: { id: account.id, email: account.email } },
      profile: normalizeProfile(account),
    };
  },

  async restoreSession() {
    this.ensureSeed();
    const raw = localStorage.getItem(STORAGE_KEYS.DEMO_SESSION);
    if (!raw) return null;
    const sessionData = JSON.parse(raw);
    const account = this.getAccounts().find((item) => item.id === sessionData.profileId);
    if (!account) return null;
    return {
      session: { access_token: 'demo-token', user: { id: account.id, email: account.email } },
      profile: normalizeProfile(account),
    };
  },

  async signOut() {
    localStorage.removeItem(STORAGE_KEYS.DEMO_SESSION);
  },

  async changePassword(newPassword) {
    const raw = localStorage.getItem(STORAGE_KEYS.DEMO_SESSION);
    if (!raw) throw new Error('Session introuvable.');
    const sessionData = JSON.parse(raw);
    const accounts = this.getAccounts().map((item) =>
      item.id === sessionData.profileId
        ? { ...item, password: newPassword, must_change_password: false, updated_at: new Date().toISOString() }
        : item,
    );
    this.setAccounts(accounts);
    return normalizeProfile(accounts.find((item) => item.id === sessionData.profileId));
  },

  async fetchBoats() {
    return this.getBoats();
  },

  async upsertBoat(boat) {
    const boats = this.getBoats();
    const index = boats.findIndex((item) => item.id === boat.id);
    const payload = normalizeBoat(boat);
    if (index >= 0) boats[index] = payload;
    else boats.push(payload);
    this.setBoats(boats);
    return payload;
  },

  async deleteBoat(boatId) {
    this.setBoats(this.getBoats().filter((boat) => boat.id !== boatId));
  },

  async fetchProfiles() {
    return this.getAccounts().map(normalizeProfile);
  },

  async updateProfile(profileId, patch) {
    const accounts = this.getAccounts().map((item) =>
      item.id === profileId ? { ...item, ...patch, updated_at: new Date().toISOString() } : item,
    );
    this.setAccounts(accounts);
    return normalizeProfile(accounts.find((item) => item.id === profileId));
  },
};

const appwriteApi = {
  async signIn(email, password) {
    try {
      const session = await account.createEmailSession(email, password);
      // Appwrite doesn't have a "profiles" table by default, we use our collection
      let profile;
      try {
        const response = await databases.listDocuments(CONFIG.appwriteDatabaseId, CONFIG.appwriteCollectionId, [
          Appwrite.Query.equal('email', email)
        ]);
        profile = normalizeProfile(response.documents[0] || { email, role: 'viewer' });
      } catch (e) {
        profile = normalizeProfile({ email, role: 'viewer' });
      }
      return { session, profile };
    } catch (e) {
      throw new Error('Email ou mot de passe invalide.');
    }
  },

  async restoreSession() {
    try {
      const user = await account.get();
      let profile;
      try {
        const response = await databases.listDocuments(CONFIG.appwriteDatabaseId, CONFIG.appwriteCollectionId, [
          Appwrite.Query.equal('email', user.email)
        ]);
        profile = normalizeProfile(response.documents[0] || { email: user.email, role: 'viewer' });
      } catch (e) {
        profile = normalizeProfile({ email: user.email, role: 'viewer' });
      }
      return { session: { user }, profile };
    } catch (e) {
      return null;
    }
  },

  async signOut() {
    await account.deleteSession('current');
  },

  async changePassword(newPassword) {
    await account.updatePassword(newPassword);
    return { role: 'viewer' }; // Simplified
  },

  async fetchBoats() {
    const response = await databases.listDocuments(
      CONFIG.appwriteDatabaseId,
      CONFIG.appwriteCollectionId
    );
    return response.documents.map(doc => ({
      id: doc.$id,
      ...doc
    })).map(normalizeBoat).sort(sortBoats);
  },

  async upsertBoat(boat) {
    const payload = normalizeBoat(boat);
    const id = boat.id || Appwrite.ID.unique();
    
    try {
      // Try to update
      await databases.updateDocument(CONFIG.appwriteDatabaseId, CONFIG.appwriteCollectionId, id, payload);
    } catch (e) {
      // If not found, create
      await databases.createDocument(CONFIG.appwriteDatabaseId, CONFIG.appwriteCollectionId, id, payload);
    }
    return { id, ...payload };
  },

  async deleteBoat(boatId) {
    await databases.deleteDocument(CONFIG.appwriteDatabaseId, CONFIG.appwriteCollectionId, boatId);
  },

  async fetchProfiles() {
    const response = await databases.listDocuments(
      CONFIG.appwriteDatabaseId,
      'profiles_col' // Using the ID from our setup script
    );
    return response.documents.map(doc => normalizeProfile({ id: doc.$id, ...doc }));
  },

  async updateProfile(profileId, patch) {
    const updated = await databases.updateDocument(
      CONFIG.appwriteDatabaseId,
      'profiles_col',
      profileId,
      { ...patch, updated_at: new Date().toISOString() }
    );
    return normalizeProfile(updated);
  },
};

const api = state.mode === 'appwrite' ? appwriteApi : (state.mode === 'supabase' ? supabaseApi : demoApi);

function populateZones() {
  els.zoneFilter.innerHTML = ['<option value="all">Toutes les zones</option>']
    .concat(ZONES.map((zone) => `<option value="${zone.id}">${zone.name}</option>`))
    .join('');
  els.zoneSelect.innerHTML = ZONES.map(
    (zone) => `<option value="${zone.id}">${zone.name} (${zone.count} places)</option>`,
  ).join('');
  updateSlotSelect(state.selectedSlot.zone_id, state.selectedSlot.slot_number);
}

function updateSlotSelect(zoneId, selectedSlotNumber = 1) {
  const zone = getZone(zoneId);
  els.slotSelect.innerHTML = Array.from({ length: zone.count }, (_, index) => {
    const slot = index + 1;
    return `<option value="${slot}">${formatEmplacement(zoneId, slot)}</option>`;
  }).join('');
  els.slotSelect.value = String(selectedSlotNumber);
}

function bindEvents() {
  populateZones();
  updateModeBadge();
  updateViewModeButtons();
  bindSidebar();

  els.loginForm.addEventListener('submit', handleLogin);
  els.logoutButton.addEventListener('click', handleLogout);
  els.refreshButton.addEventListener('click', async () => reloadData(true));
  els.exportButton.addEventListener('click', exportData);
  els.importInput.addEventListener('change', handleImport);
  els.openCreateBoatButton.addEventListener('click', () => openBoatModal(null, state.selectedSlot));
  els.floatingAddButton?.addEventListener('click', () => openBoatModal(null, state.selectedSlot));

  els.searchInput.addEventListener('input', (event) => {
    state.filters.search = event.target.value.trim().toLowerCase();
    renderBoatGrid();
  });
  els.zoneFilter.addEventListener('change', (event) => {
    state.filters.zone = event.target.value;
    renderBoatGrid();
  });
  els.statusFilter.addEventListener('change', (event) => {
    state.filters.status = event.target.value;
    renderBoatGrid();
  });

  els.cardModeButton.addEventListener('click', () => setViewMode('cards'));
  els.compactModeButton.addEventListener('click', () => setViewMode('compact'));

  document.querySelectorAll('.nav-button, .bottom-nav-button').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tabTarget));
  });

  els.zonesBoard.addEventListener('click', (event) => {
    const slotButton = event.target.closest('.slot-card');
    if (!slotButton) return;
    selectSlot(slotButton.dataset.zone, Number(slotButton.dataset.slot), true);
  });

  els.sitePlanMap?.addEventListener('click', (event) => {
    const planSlot = event.target.closest('.plan-slot');
    if (planSlot) {
      event.stopPropagation();
      selectSlot(planSlot.dataset.zone, Number(planSlot.dataset.slot), true);
      return;
    }
    const zoneFocusBtn = event.target.closest('.zone-overlay-focus');
    if (zoneFocusBtn && !isPlanFullscreenOpen()) {
      setFocusZone(zoneFocusBtn.dataset.zone, false);
    }
  });

  els.planMapViewBtn?.addEventListener('click', () => setPlanView('map'));
  els.planGridViewBtn?.addEventListener('click', () => setPlanView('grid'));
  els.openPlanFullscreenBtn?.addEventListener('click', openPlanFullscreen);
  els.closePlanFullscreenBtn?.addEventListener('click', closePlanFullscreen);
  els.zoneFocusAllBtn?.addEventListener('click', () => setFocusZone(null));
  els.zoneFocusGridBtn?.addEventListener('click', () => {
    setPlanView('grid');
  });

  els.sidebarZoneStats?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-sidebar-zone]');
    if (!item) return;
    switchTab('dashboardTab');
    setPlanView('map');
    setFocusZone(item.dataset.sidebarZone, false);
  });

  els.boatGrid.addEventListener('click', handleBoatGridClick);
  els.boatGrid.addEventListener('touchstart', handleSwipeStart, { passive: true });
  els.boatGrid.addEventListener('touchmove', handleSwipeMove, { passive: false });
  els.boatGrid.addEventListener('touchend', handleSwipeEnd, { passive: true });
  els.boatGrid.addEventListener('touchcancel', handleSwipeEnd, { passive: true });

  els.boatForm.addEventListener('submit', saveBoatFlow);
  els.duplicateBoatButton.addEventListener('click', duplicateBoatFlow);
  els.deleteBoatButton.addEventListener('click', () => deleteBoatFlow(els.boatId.value));
  els.boatPhotoInput.addEventListener('change', handlePhotoChange);
  els.removeBoatPhotoButton.addEventListener('click', removeBoatPhoto);
  els.zoneSelect.addEventListener('change', (event) => updateSlotSelect(event.target.value, 1));

  document.addEventListener('click', (event) => {
    const closer = event.target.closest('[data-close-modal]');
    if (closer) closeModal(closer.dataset.closeModal);

    if (!event.target.closest('.swipe-item')) {
      closeAllSwipeRows();
    }
  });

  els.openPasswordModalButton.addEventListener('click', () => openPasswordModal(false));
  els.passwordForm.addEventListener('submit', handlePasswordChange);

  els.profilesList.addEventListener('click', async (event) => {
    const saveButton = event.target.closest('[data-save-profile]');
    if (!saveButton) return;
    await updateProfileRow(saveButton.dataset.saveProfile);
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (isPlanFullscreenOpen()) {
        closePlanFullscreen();
        return;
      }
      setSidebarOpen(false);
      if (!state.forcePasswordChange) closeModal('passwordModal');
      closeModal('boatModal');
    }
  });

  window.addEventListener('resize', handleResize);
}

function handleResize() {
  if (window.innerWidth > MOBILE_BREAKPOINT && isPlanFullscreenOpen()) {
    closePlanFullscreen();
  }
  if (window.innerWidth <= MOBILE_BREAKPOINT && !state.ui.viewMode) {
    setViewMode('compact');
  }
  updatePlanFullscreenButton();
  syncPlanDisplaySize();
}

function isPlanFullscreenOpen() {
  return document.body.classList.contains('plan-fullscreen-open');
}

function isMobileViewport() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function updatePlanFullscreenButton() {
  if (!els.openPlanFullscreenBtn) return;
  const show =
    isMobileViewport() &&
    state.activeTab === 'dashboardTab' &&
    state.planView === 'map' &&
    !isPlanFullscreenOpen();
  els.openPlanFullscreenBtn.classList.toggle('hidden', !show);
}

function openPlanFullscreen() {
  if (!isMobileViewport() || !els.planFullscreenBody || !els.sitePlanSection) return;

  setPlanView('map');
  setSidebarOpen(false);
  state.focusZone = null;

  els.planFullscreenBody.appendChild(els.sitePlanSection);
  els.zoneFocusBar?.classList.add('hidden');

  els.planFullscreen?.classList.remove('hidden');
  els.planFullscreen?.setAttribute('aria-hidden', 'false');
  document.body.classList.add('plan-fullscreen-open');

  renderSitePlan();
  updatePlanFullscreenButton();
  syncPlanDisplaySize();
  els.closePlanFullscreenBtn?.focus();
}

function closePlanFullscreen() {
  if (!els.sitePlanAnchor || !els.sitePlanSection) return;

  const parent = els.sitePlanAnchor.parentNode;
  if (parent) {
    parent.insertBefore(els.sitePlanSection, els.sitePlanAnchor.nextSibling);
    if (els.zoneFocusBar) {
      parent.insertBefore(els.zoneFocusBar, els.sitePlanSection.nextSibling);
    }
  }

  els.planFullscreen?.classList.add('hidden');
  els.planFullscreen?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('plan-fullscreen-open');

  resetPlanFullscreenLayout();
  updatePlanFullscreenButton();
  syncPlanDisplaySize();
}

function resetPlanFullscreenLayout() {
  const props = ['width', 'min-width', 'min-height', 'padding', 'box-sizing'];
  props.forEach((prop) => {
    els.sitePlanSection?.style.removeProperty(prop);
    els.sitePlanMap?.style.removeProperty(prop);
  });
  els.sitePlanMap?.style.removeProperty('max-width');
}

function updateModeBadge() {
  if (state.mode === 'supabase') {
    els.modeBadge.textContent = 'Mode connecté • Supabase + synchronisation en ligne';
    els.demoHelp.classList.add('hidden');
  } else {
    els.modeBadge.textContent = 'Mode démo local • expérience interactive immédiate';
    els.demoHelp.classList.remove('hidden');
  }
}

function setSidebarOpen(open) {
  const isOpen = Boolean(open);
  els.sidebar?.classList.toggle('is-open', isOpen);
  els.sidebarBackdrop?.classList.toggle('hidden', !isOpen);
  els.sidebarToggle?.setAttribute('aria-expanded', String(isOpen));
  document.body.classList.toggle('sidebar-open', isOpen);
}

function bindSidebar() {
  els.sidebarToggle?.addEventListener('click', () => setSidebarOpen(true));
  els.sidebarClose?.addEventListener('click', () => setSidebarOpen(false));
  els.sidebarBackdrop?.addEventListener('click', () => setSidebarOpen(false));
  bindWorkspaceHeaderScroll();
}

function bindWorkspaceHeaderScroll() {
  const header = document.querySelector('.workspace-header');
  if (!header) return;

  const update = () => {
    header.classList.toggle('is-scrolled', window.scrollY > 16);
  };

  window.addEventListener('scroll', update, { passive: true });
  update();
}

function switchTab(tabId) {
  if (isPlanFullscreenOpen()) closePlanFullscreen();
  state.activeTab = tabId;
  setSidebarOpen(false);
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
  document.querySelectorAll('.nav-button, .bottom-nav-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tabTarget === tabId);
  });
  els.workspaceTitle.textContent = tabMeta[tabId].title;
  els.workspaceSubtitle.textContent = tabMeta[tabId].subtitle;
  closeAllSwipeRows();
  updatePlanFullscreenButton();
}

function setViewMode(mode) {
  state.ui.viewMode = mode;
  saveUiPrefs();
  updateViewModeButtons();
  renderBoatGrid();
}

function updateViewModeButtons() {
  els.cardModeButton.classList.toggle('active', state.ui.viewMode === 'cards');
  els.compactModeButton.classList.toggle('active', state.ui.viewMode === 'compact');
}

async function init() {
  bindEvents();
  registerServiceWorker();

  if (state.mode === 'demo') {
    demoApi.ensureSeed();
  }

  try {
    const restored = await api.restoreSession();
    if (restored) {
      state.session = restored.session;
      state.currentProfile = restored.profile;
      await bootstrapWorkspace();
      return;
    }
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Impossible de restaurer la session.', 'error');
  }

  showAuth();
}

async function handleLogin(event) {
  event.preventDefault();
  
  // BYPASS MODE: Connect automatically as Admin
  try {
    showToast('Connexion automatique (Mode Bypass)...', 'info');
    
    const mockProfile = {
      id: '6a2fc6b90021f0ecedf2',
      email: 'hhugo.liegeois@gmail.com',
      full_name: 'Hugo Liegeois',
      role: 'admin',
      must_change_password: false
    };

    state.session = { user: { id: mockProfile.id, email: mockProfile.email } };
    state.currentProfile = mockProfile;
    
    await bootstrapWorkspace();
    showAuthView(false);
    showToast(`Bienvenue, ${mockProfile.full_name} !`, 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleLogout() {
  try {
    await api.signOut();
  } finally {
    state.session = null;
    state.currentProfile = null;
    state.profiles = [];
    state.boats = [];
    state.selectedBoatId = null;
    state.selectedSlot = { zone_id: 'A', slot_number: 1 };
    state.forcePasswordChange = false;
    closeModal('boatModal');
    closeModal('passwordModal');
    setSidebarOpen(false);
    showAuth();
  }
}

async function bootstrapWorkspace() {
  showApp();
  applyRoleVisibility();
  hydrateCurrentUserCard();
  setPlanView('map');
  await reloadData(false);
  if (state.currentProfile?.must_change_password) {
    openPasswordModal(true);
  }
}

async function reloadData(showSuccessToast = false) {
  try {
    state.boats = (await api.fetchBoats()).map(normalizeBoat).sort(sortBoats);
    state.profiles = isAdmin() ? await api.fetchProfiles() : state.currentProfile ? [state.currentProfile] : [];
    renderAll();
    if (showSuccessToast) showToast('Synchronisation terminée.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Synchronisation impossible.', 'error');
  }
}

function showAuth() {
  els.authView.classList.remove('hidden');
  els.appView.classList.add('hidden');
}

function showApp() {
  els.authView.classList.add('hidden');
  els.appView.classList.remove('hidden');
  setSidebarOpen(false);
}

function applyRoleVisibility() {
  document.querySelectorAll('.admin-only').forEach((element) => {
    element.classList.toggle('hidden-by-role', !isAdmin());
  });
  document.querySelectorAll('.manage-only').forEach((element) => {
    element.classList.toggle('hidden-by-role', !canManageBoats());
  });
  if (!isAdmin() && state.activeTab === 'adminTab') {
    switchTab('dashboardTab');
  }
}

function hydrateCurrentUserCard() {
  if (!state.currentProfile) return;
  const profile = state.currentProfile;
  els.userDisplayName.textContent = profile.full_name || profile.email;
  els.userDisplayRole.textContent = `${ROLE_LABELS[profile.role]} • ${profile.email}`;
  els.accountCardName.textContent = profile.full_name || profile.email;
  els.accountCardEmail.textContent = profile.email;
  els.accountRoleChip.textContent = ROLE_LABELS[profile.role];
  els.accountRoleChip.className = `chip ${profile.role === 'admin' ? 'selected' : profile.role === 'manager' ? 'occupied' : 'free'}`;
  els.accountPasswordChip.textContent = profile.must_change_password ? 'Mot de passe à renouveler' : 'Mot de passe à jour';
  els.accountPasswordChip.className = `chip ${profile.must_change_password ? 'occupied' : 'free'}`;
  els.syncPill.textContent = state.mode === 'supabase' ? 'Synchronisé en ligne' : 'Mode démo local';
  els.syncPill.className = `sync-pill ${state.mode === 'supabase' ? 'online' : 'demo'}`;
}

function renderAll() {
  hydrateCurrentUserCard();
  renderStats();
  renderSitePlan();
  renderSidebarZoneStats();
  renderZonesBoard();
  renderBoatGrid();
  renderProfiles();
  syncPlanGridVisibility();
  updatePlanViewButtons();
  updateViewModeButtons();
  updatePlanFullscreenButton();
}

function setPlanView(view) {
  state.planView = view;
  if (view === 'grid') {
    state.focusZone = null;
    if (isPlanFullscreenOpen()) closePlanFullscreen();
  }
  updatePlanViewButtons();
  renderZonesBoard();
  renderSidebarZoneStats();
  syncPlanGridVisibility();
  updatePlanFullscreenButton();
}

/** Plan aérien et grille détaillée ne s’affichent jamais en même temps */
function syncPlanGridVisibility() {
  const isMap = state.planView === 'map';
  els.sitePlanSection?.classList.toggle('hidden', !isMap);
  els.zonesBoard?.classList.toggle('plan-grid-hidden', isMap);
  updateZoneFocusBar();
}

function updatePlanViewButtons() {
  els.planMapViewBtn?.classList.toggle('active', state.planView === 'map');
  els.planGridViewBtn?.classList.toggle('active', state.planView === 'grid');
}

function setFocusZone(zoneId, scrollToGrid = false) {
  state.focusZone = zoneId || null;
  if (zoneId) {
    state.selectedSlot = { zone_id: zoneId, slot_number: state.selectedSlot.zone_id === zoneId ? state.selectedSlot.slot_number : 1 };
  }
  renderSitePlan();
  renderSidebarZoneStats();
  renderZonesBoard();
  syncPlanGridVisibility();

  if (scrollToGrid && state.focusZone) {
    setPlanView('grid');
    scrollToZoneSection(state.focusZone);
  }
}

function updateZoneFocusBar() {
  if (!els.zoneFocusBar) return;
  if (!state.focusZone || state.planView === 'grid' || isPlanFullscreenOpen()) {
    els.zoneFocusBar.classList.add('hidden');
    return;
  }
  const zone = getZone(state.focusZone);
  const occupied = state.boats.filter((b) => b.zone_id === zone.id).length;
  els.zoneFocusBar.classList.remove('hidden');
  els.zoneFocusTitle.textContent = zone.name;
  els.zoneFocusMeta.textContent = `${occupied} / ${zone.count} occupées • ${zone.description}`;
}

function scrollToZoneSection(zoneId) {
  const section = document.querySelector(`.zone-section[data-zone-id="${zoneId}"]`);
  section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function selectSlot(zoneId, slotNumber, openModal = false) {
  state.selectedSlot = { zone_id: zoneId, slot_number: slotNumber };
  if (!isPlanFullscreenOpen()) {
    state.focusZone = zoneId;
  }
  const boat = getBoatBySlot(zoneId, slotNumber);
  state.selectedBoatId = boat?.id || null;
  renderSitePlan();
  renderSidebarZoneStats();
  renderZonesBoard();
  syncPlanGridVisibility();
  if (openModal && (boat || canManageBoats())) {
    openBoatModal(boat, state.selectedSlot);
  }
}

function getZoneOccupancyRate(zoneId) {
  const zone = getZone(zoneId);
  const occupied = state.boats.filter((b) => b.zone_id === zoneId).length;
  return Math.round((occupied / zone.count) * 100);
}

function renderSitePlan() {
  if (!els.sitePlanMap) return;

  const overlays = ZONES.map((zone) => {
    const geom = ZONE_GEOMETRY[zone.id];
    const occupied = state.boats.filter((b) => b.zone_id === zone.id).length;
    const rate = getZoneOccupancyRate(zone.id);
    const zoneFocusActive = !isPlanFullscreenOpen() && state.focusZone;
    const focused = zoneFocusActive && state.focusZone === zone.id;
    const dimmed = zoneFocusActive && state.focusZone !== zone.id;
    const highOccupancy = rate >= 85;

    const slots = Array.from({ length: zone.count }, (_, index) => {
      const slot = index + 1;
      const boat = getBoatBySlot(zone.id, slot);
      const selected =
        state.selectedSlot.zone_id === zone.id && state.selectedSlot.slot_number === slot;
      const statusClass = boat ? `status-${boat.status}` : '';
      const occupiedClass = boat ? 'is-occupied has-photo' : 'plan-slot-free';
      const selectedClass = selected ? 'is-selected' : '';
      const tooltip = escapeHtml(planSlotTooltip(zone.id, slot, boat));
      const ariaLabel = boat
        ? `${formatEmplacement(zone.id, slot)}, ${displayBoatName(boat)}, ${displayOwnerName(boat)}`
        : `${formatEmplacement(zone.id, slot)}, libre`;
      return `<button type="button" class="plan-slot ${occupiedClass} ${statusClass} ${selectedClass}" data-zone="${zone.id}" data-slot="${slot}" title="${tooltip}" aria-label="${escapeHtml(ariaLabel)}">${renderPlanSlotMarkup(zone.id, slot, boat)}</button>`;
    }).join('');

    return `
      <div
        class="zone-overlay zone-overlay-row zone-overlay-${zone.id.toLowerCase()} ${focused ? 'is-focused' : ''} ${dimmed ? 'is-dimmed' : ''} ${highOccupancy ? 'zone-high' : ''}"
        data-zone="${zone.id}"
        style="left:${geom.left};top:${geom.top};width:${geom.width};height:${geom.height}"
        role="group"
        aria-label="${escapeHtml(zone.name)}, ${occupied} sur ${zone.count} places occupées"
      >
        <button type="button" class="zone-overlay-header zone-overlay-focus" data-zone="${zone.id}" aria-label="Sélectionner ${escapeHtml(zone.name)}">
          <span class="zone-overlay-label">${escapeHtml(zone.name)}</span>
          <span class="zone-overlay-count">${occupied}/${zone.count}</span>
        </button>
        <div class="zone-overlay-fill" aria-hidden="true"><span style="width:${rate}%"></span></div>
        <div class="zone-mini-slots">${slots}</div>
      </div>
    `;
  }).join('');

  const panHint = isPlanFullscreenOpen()
    ? 'Glissez pour explorer tout le plan • touchez une place'
    : 'Touchez une place pour le détail';
  els.sitePlanMap.innerHTML = `
    <p class="plan-mobile-hint" aria-hidden="true">${panHint}</p>
    <div class="site-plan-scroll">
      <div class="site-plan-frame">
        <img class="site-plan-photo" src="${PLAN_REFERENCE_IMAGE}" alt="Vue aérienne des emplacements CNH — zones A, B et C" />
        <div class="site-plan-overlays">${overlays}</div>
      </div>
    </div>
  `;
  ensurePlanMapResizeObserver();
  syncPlanDisplaySize();
}

function ensurePlanMapResizeObserver() {
  if (!els.sitePlanMap || planMapResizeObserver) return;
  planMapResizeObserver = new ResizeObserver(() => syncPlanDisplaySize());
  planMapResizeObserver.observe(els.sitePlanMap);
  if (els.planFullscreenBody) planMapResizeObserver.observe(els.planFullscreenBody);
}

/** Affiche le plan à la bonne échelle (sans étirement) pour que les zones restent alignées */
function syncPlanDisplaySize() {
  const map = els.sitePlanMap;
  const scroll = map?.querySelector('.site-plan-scroll');
  const frame = map?.querySelector('.site-plan-frame');
  const img = map?.querySelector('.site-plan-photo');
  if (!map || !frame || !img) return;

  const apply = () => {
    const natW = img.naturalWidth || PLAN_IMAGE_WIDTH;
    const natH = img.naturalHeight || PLAN_IMAGE_HEIGHT;
    const aspect = natW / natH;
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
    const isFullscreen = isPlanFullscreenOpen();

    map.classList.toggle('site-plan-map--mobile', isMobile && !isFullscreen);
    map.classList.toggle('site-plan-map--fullscreen', isFullscreen);

    if (isFullscreen) {
      const headH = els.planFullscreen?.querySelector('.plan-fullscreen-head')?.offsetHeight || 56;
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const maxHeight = Math.max(viewportH - headH - 8, 240);
      const maxWidth = viewportW;
      const pad = PLAN_FULLSCREEN_PAN_PAD;

      const scale = Math.max(maxWidth / natW, maxHeight / natH) * PLAN_FULLSCREEN_FILL;
      const displayW = Math.round(natW * scale);
      const displayH = Math.round(natH * scale);
      const contentW = displayW + pad * 2;
      const contentH = displayH + pad * 2;

      frame.style.width = `${displayW}px`;
      frame.style.height = `${displayH}px`;

      if (els.sitePlanSection) {
        els.sitePlanSection.style.boxSizing = 'content-box';
        els.sitePlanSection.style.padding = `${pad}px`;
        els.sitePlanSection.style.width = `${contentW}px`;
        els.sitePlanSection.style.minHeight = `${contentH}px`;
      }
      map.style.width = `${displayW}px`;
      map.style.maxWidth = 'none';
      map.style.overflow = 'visible';

      centerPlanFullscreenScroll(contentW, contentH);
      return;
    }

    resetPlanFullscreenLayout();

    if (isMobile) {
      const containerW = Math.max(map.clientWidth, 1);
      const minWidth = Math.min(720, Math.max(containerW, 520));
      const maxHeight = Math.min(Math.max(window.innerHeight * 0.46, 220), 380);
      let displayH = Math.round(minWidth / aspect);
      let displayW = minWidth;

      if (displayH > maxHeight) {
        displayH = maxHeight;
        displayW = Math.round(displayH * aspect);
      }

      frame.style.width = `${displayW}px`;
      frame.style.height = `${displayH}px`;
      centerPlanInScroll(scroll || map, frame);
      return;
    }

    const maxHeight = Math.min(window.innerHeight * 0.78, 900);
    const maxWidth = Math.max(map.clientWidth - 8, 1);
    const scale = Math.min(maxHeight / natH, maxWidth / natW);
    const displayW = Math.round(natW * scale);
    const displayH = Math.round(natH * scale);

    frame.style.width = `${displayW}px`;
    frame.style.height = `${displayH}px`;
    if (scroll) scroll.scrollLeft = 0;
  };

  if (img.complete) {
    apply();
  } else {
    img.addEventListener('load', apply, { once: true });
  }
}

function centerPlanInScroll(map, frame) {
  if (!map || !frame || window.innerWidth > MOBILE_BREAKPOINT) return;
  requestAnimationFrame(() => {
    const frameW = frame.offsetWidth;
    const excess = frameW - map.clientWidth;
    map.scrollLeft = excess > 8 ? Math.round(excess / 2) : 0;
  });
}

function centerPlanFullscreenScroll(contentW, contentH) {
  requestAnimationFrame(() => {
    const scrollEl = els.planFullscreenBody;
    if (!scrollEl) return;
    scrollEl.scrollLeft = Math.max(0, Math.round((contentW - scrollEl.clientWidth) / 2));
    scrollEl.scrollTop = Math.max(0, Math.round((contentH - scrollEl.clientHeight) / 2));
  });
}

function renderSidebarZoneStats() {
  if (!els.sidebarZoneStats) return;
  els.sidebarZoneStats.innerHTML = `
    <small>Plan du site</small>
    ${ZONES.map((zone) => {
      const occupied = state.boats.filter((b) => b.zone_id === zone.id).length;
      const rate = getZoneOccupancyRate(zone.id);
      const active = state.focusZone === zone.id;
      const slotRange = `${getGlobalSlotNumber(zone.id, 1)}–${getGlobalSlotNumber(zone.id, zone.count)}`;
      return `
        <button type="button" class="sidebar-zone-item ${active ? 'is-active' : ''}" data-sidebar-zone="${zone.id}">
          <strong>${escapeHtml(zone.name)}</strong>
          <span class="sidebar-zone-bar" aria-hidden="true"><span style="width:${rate}%"></span></span>
          <span>${slotRange} · ${occupied}/${zone.count}</span>
        </button>
      `;
    }).join('')}
  `;
}

function renderStats() {
  const total = ZONES.reduce((sum, zone) => sum + zone.count, 0);
  const occupied = state.boats.length;
  const complete = state.boats.filter(isBoatComplete).length;
  const completeness = state.boats.length ? Math.round((complete / state.boats.length) * 100) : 0;
  els.statTotalSpots.textContent = String(total);
  els.statOccupied.textContent = String(occupied);
  els.statFree.textContent = String(Math.max(total - occupied, 0));
  els.statComplete.textContent = `${completeness}%`;
}

function renderCompactSlotCard(zoneId, slot, boat, selected) {
  const global = getGlobalSlotNumber(zoneId, slot);
  const title = boat ? truncatePlanText(displayBoatName(boat), 14) : 'Libre';
  const meta = boat ? truncatePlanText(displayOwnerName(boat), 12) : '';
  return `
    <button type="button" class="slot-card slot-card-compact ${boat ? 'is-occupied' : ''} ${selected ? 'is-selected' : ''}" data-zone="${zoneId}" data-slot="${slot}" title="${escapeHtml(planSlotTooltip(zoneId, slot, boat))}">
      <span class="slot-index">${global}</span>
      <span class="slot-compact-text">
        <span class="slot-title">${escapeHtml(title)}</span>
        ${meta ? `<span class="slot-meta">${escapeHtml(meta)}</span>` : ''}
      </span>
    </button>
  `;
}

function renderZonesBoard() {
  const isCompact = state.planView === 'grid';
  const zonesToShow =
    isCompact || !state.focusZone ? ZONES : ZONES.filter((z) => z.id === state.focusZone);

  els.zonesBoard.classList.toggle('zones-board-compact', isCompact);

  els.zonesBoard.innerHTML = zonesToShow
    .map((zone) => {
      const boatsInZone = state.boats.filter((boat) => boat.zone_id === zone.id);
      const rate = Math.round((boatsInZone.length / zone.count) * 100);
      const slotRange = `${getGlobalSlotNumber(zone.id, 1)}–${getGlobalSlotNumber(zone.id, zone.count)}`;
      const highlighted = state.focusZone === zone.id;
      const slots = Array.from({ length: zone.count }, (_, index) => {
        const slot = index + 1;
        const boat = getBoatBySlot(zone.id, slot);
        const selected = state.selectedSlot.zone_id === zone.id && state.selectedSlot.slot_number === slot;
        if (isCompact) {
          return renderCompactSlotCard(zone.id, slot, boat, selected);
        }
        const global = getGlobalSlotNumber(zone.id, slot);
        return `
        <button type="button" class="slot-card ${boat ? 'is-occupied' : ''} ${selected ? 'is-selected' : ''}" data-zone="${zone.id}" data-slot="${slot}">
          <span class="slot-index">${global}</span>
          <span class="slot-title">${escapeHtml(boat ? displayBoatName(boat) : 'Libre')}</span>
          <span class="slot-subtitle">${boat ? `${escapeHtml(displayOwnerName(boat))}${boat.owner_phone ? ` • ${escapeHtml(boat.owner_phone)}` : ''} • ${escapeHtml(STATUS_LABELS[boat.status])}` : 'Disponible'}</span>
        </button>
      `;
      }).join('');

      const slotGridClass = isCompact
        ? `slot-grid-compact slot-grid-cols-${zone.count > 12 ? 'dense' : 'std'}`
        : 'slot-grid slot-grid-vertical';

      return `
      <section class="zone-section ${highlighted ? 'is-highlighted' : ''}" data-zone-id="${zone.id}" id="zoneSection-${zone.id}">
        <div class="zone-header zone-header-compact">
          <div>
            <h4>${escapeHtml(zone.name)}</h4>
            ${isCompact ? `<div class="zone-meta">N° ${slotRange} • ${boatsInZone.length}/${zone.count} • ${rate}%</div>` : `<div class="zone-meta">Emplacements ${slotRange} • ${zone.count} places</div>`}
          </div>
          ${isCompact ? '' : `<div class="chip-row">
            <span class="chip occupied">${boatsInZone.length} occupées</span>
            <span class="chip free">${zone.count - boatsInZone.length} libres</span>
            <span class="chip selected">${rate}%</span>
          </div>`}
        </div>
        <div class="${slotGridClass}" aria-label="Places ${escapeHtml(zone.name)}">${slots}</div>
      </section>
    `;
    })
    .join('');
}

function matchesFilters(boat) {
  if (state.filters.zone !== 'all' && boat.zone_id !== state.filters.zone) return false;
  if (state.filters.status !== 'all' && boat.status !== state.filters.status) return false;
  if (!state.filters.search) return true;

  const zone = getZone(boat.zone_id);
  const haystack = [
    boat.boat_name,
    boat.owner_name,
    boat.owner_phone,
    boat.owner_email,
    boat.licence_number,
    boat.registration_number,
    boat.boat_type,
    boat.notes,
    boat.equipment,
    zone.name,
    formatEmplacement(boat.zone_id, boat.slot_number),
    `emplacement ${getGlobalSlotNumber(boat.zone_id, boat.slot_number)}`,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(state.filters.search);
}

function renderBoatGrid() {
  const boats = state.boats.filter(matchesFilters);
  closeAllSwipeRows();

  if (!boats.length) {
    els.boatGrid.innerHTML = `
      <div class="empty-state">
        <h3>Aucun bateau trouvé</h3>
        <p>Ajoutez une fiche ou ajustez vos filtres.</p>
      </div>
    `;
    return;
  }

  if (state.ui.viewMode === 'compact') {
    els.boatGrid.className = 'boat-grid compact-grid';
    els.boatGrid.innerHTML = boats.map(renderCompactBoat).join('');
  } else {
    els.boatGrid.className = 'boat-grid';
    els.boatGrid.innerHTML = boats.map(renderCardBoat).join('');
  }
}

function renderCardBoat(boat) {
  const zone = getZone(boat.zone_id);
  return `
    <article class="boat-card">
      <div class="boat-card-media">
        <img src="${boat.photo_data || DEFAULT_PHOTO}" alt="Photo de ${escapeHtml(boat.boat_name)}" />
      </div>
      <div class="boat-card-body">
        <div class="boat-card-top">
          <div>
            <h4>${escapeHtml(displayBoatName(boat))}</h4>
            <div class="subtle-text">${escapeHtml(displayOwnerName(boat))}</div>
          </div>
          <span class="chip ${boat.status === 'actif' ? 'free' : boat.status === 'archive' ? 'selected' : 'occupied'}">${escapeHtml(STATUS_LABELS[boat.status])}</span>
        </div>
        <div class="chip-row">
          <span class="chip selected">${escapeHtml(formatEmplacement(boat.zone_id, boat.slot_number))}</span>
          <span class="chip occupied">${escapeHtml(boat.licence_number || 'Sans licence')}</span>
        </div>
        <div class="boat-card-meta">
          <strong>Téléphone :</strong> ${escapeHtml(boat.owner_phone || '—')}<br />
          <strong>Email :</strong> ${escapeHtml(boat.owner_email || '—')}<br />
          <strong>Type :</strong> ${escapeHtml(boat.boat_type || '—')}<br />
          <strong>Immatriculation :</strong> ${escapeHtml(boat.registration_number || '—')}
        </div>
        <div class="card-actions">
          <button class="card-button" data-action="open" data-id="${boat.id}">Ouvrir</button>
          <button class="card-button" data-action="locate" data-id="${boat.id}">Voir la place</button>
          ${canManageBoats() ? `<button class="card-button danger" data-action="delete" data-id="${boat.id}">Supprimer</button>` : ''}
        </div>
      </div>
    </article>
  `;
}

function renderCompactBoat(boat) {
  const zone = getZone(boat.zone_id);
  const hasPhoto = Boolean(boat.photo_data);
  return `
    <article class="swipe-item" data-boat-id="${boat.id}">
      <div class="swipe-actions left-actions">
        <button class="swipe-action-button locate" data-action="locate" data-id="${boat.id}">Voir</button>
      </div>
      <div class="swipe-actions right-actions">
        <button class="swipe-action-button open" data-action="open" data-id="${boat.id}">${canManageBoats() ? 'Éditer' : 'Ouvrir'}</button>
        ${canManageBoats() ? `<button class="swipe-action-button delete" data-action="delete" data-id="${boat.id}">Suppr.</button>` : ''}
      </div>
      <div class="swipe-content" data-swipe-content data-id="${boat.id}">
        <div class="compact-boat-card" data-action="open" data-id="${boat.id}">
          <div class="compact-boat-leading ${hasPhoto ? 'has-photo' : ''}">
            ${hasPhoto ? `<img src="${boat.photo_data}" alt="${escapeHtml(displayBoatName(boat))}" />` : '<span>⛵</span>'}
          </div>
          <div class="compact-boat-main">
            <div class="compact-top-row">
              <strong class="compact-boat-title">${escapeHtml(displayBoatName(boat))}</strong>
              <span class="compact-status ${boat.status}">${escapeHtml(STATUS_LABELS[boat.status])}</span>
            </div>
            <div class="compact-boat-meta">${escapeHtml(displayOwnerName(boat))}</div>
            <div class="compact-boat-subline">${escapeHtml(formatEmplacement(boat.zone_id, boat.slot_number))} • ${escapeHtml(boat.licence_number || 'Sans licence')}</div>
          </div>
          <div class="compact-boat-chevron">›</div>
        </div>
      </div>
    </article>
  `;
}

function renderProfiles() {
  els.profilesNotice.textContent =
    state.mode === 'supabase'
      ? 'Version en ligne finalisée : créez les comptes dans Supabase Auth, puis gérez ici leurs rôles et le changement de mot de passe.'
      : 'Mode démo : comptes locaux inclus pour tester les rôles et la sécurité.';

  if (!isAdmin()) {
    els.profilesList.innerHTML = `
      <div class="empty-state">
        <h3>Accès réservé à l’administrateur</h3>
        <p>Connectez-vous avec un compte admin pour gérer les profils.</p>
      </div>
    `;
    return;
  }

  if (!state.profiles.length) {
    els.profilesList.innerHTML = `
      <div class="empty-state">
        <h3>Aucun profil disponible</h3>
        <p>Les profils apparaîtront après création / connexion des utilisateurs.</p>
      </div>
    `;
    return;
  }

  els.profilesList.innerHTML = state.profiles.map((profile) => `
    <article class="profile-card">
      <div class="profile-head">
        <div>
          <strong>${escapeHtml(profile.full_name || profile.email)}</strong>
          <div class="subtle-text">${escapeHtml(profile.email)}</div>
        </div>
        <span class="chip ${profile.role === 'admin' ? 'selected' : profile.role === 'manager' ? 'occupied' : 'free'}">${escapeHtml(ROLE_LABELS[profile.role])}</span>
      </div>
      <div class="profile-actions">
        <div class="field-group">
          <label for="role-${profile.id}">Rôle</label>
          <select id="role-${profile.id}" data-profile-role="${profile.id}">
            <option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>Administrateur</option>
            <option value="manager" ${profile.role === 'manager' ? 'selected' : ''}>Gestion</option>
            <option value="viewer" ${profile.role === 'viewer' ? 'selected' : ''}>Lecture seule</option>
          </select>
        </div>
        <div class="field-group">
          <label for="must-${profile.id}">Forcer nouveau MDP</label>
          <select id="must-${profile.id}" data-profile-password="${profile.id}">
            <option value="false" ${!profile.must_change_password ? 'selected' : ''}>Non</option>
            <option value="true" ${profile.must_change_password ? 'selected' : ''}>Oui</option>
          </select>
        </div>
        <button class="secondary-button" data-save-profile="${profile.id}">Enregistrer</button>
      </div>
    </article>
  `).join('');
}

async function updateProfileRow(profileId) {
  try {
    const role = document.querySelector(`[data-profile-role="${profileId}"]`)?.value || 'viewer';
    const mustChange = document.querySelector(`[data-profile-password="${profileId}"]`)?.value === 'true';
    const updated = await api.updateProfile(profileId, { role, must_change_password: mustChange });
    state.profiles = state.profiles.map((profile) => (profile.id === profileId ? updated : profile));
    if (state.currentProfile?.id === profileId) {
      state.currentProfile = { ...state.currentProfile, ...updated };
      hydrateCurrentUserCard();
      applyRoleVisibility();
    }
    renderProfiles();
    showToast('Profil mis à jour.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Impossible de mettre à jour le profil.', 'error');
  }
}

function isBoatComplete(boat) {
  return hasMeaningfulBoatInfo(boat);
}

function getBoatBySlot(zoneId, slotNumber) {
  return state.boats.find((boat) => boat.zone_id === zoneId && boat.slot_number === slotNumber) || null;
}

function getBoatById(id) {
  return state.boats.find((boat) => boat.id === id) || null;
}

function isSlotConstraintError(error) {
  const message = String(error?.message || '');
  return message.includes('boats_zone_id_slot_number_key') || message.includes('duplicate key value violates unique constraint');
}

function openBoatModal(boat = null, presetSlot = { zone_id: 'A', slot_number: 1 }) {
  const canEdit = canManageBoats();
  const slot = boat ? { zone_id: boat.zone_id, slot_number: boat.slot_number } : presetSlot;
  els.boatModalTitle.textContent = boat
    ? `Fiche • ${displayBoatName(boat)}`
    : `Nouvelle fiche • ${formatEmplacement(slot.zone_id, slot.slot_number)}`;

  els.boatId.value = boat?.id || '';
  els.boatPhotoData.value = boat?.photo_data || '';
  els.boatPhotoPreview.src = boat?.photo_data || DEFAULT_PHOTO;
  els.boatName.value = boat?.boat_name || '';
  els.licenceNumber.value = boat?.licence_number || '';
  els.registrationNumber.value = boat?.registration_number || '';
  els.boatType.value = boat?.boat_type || '';
  els.boatStatus.value = boat?.status || 'actif';
  els.ownerName.value = boat?.owner_name || '';
  els.ownerPhone.value = boat?.owner_phone || '';
  els.ownerEmail.value = boat?.owner_email || '';
  els.emergencyContact.value = boat?.emergency_contact || '';
  els.zoneSelect.value = slot.zone_id;
  updateSlotSelect(slot.zone_id, slot.slot_number);
  els.lengthInput.value = boat?.length_m || '';
  els.widthInput.value = boat?.width_m || '';
  els.equipmentInput.value = boat?.equipment || '';
  els.notesInput.value = boat?.notes || '';

  toggleBoatFormEditability(canEdit);
  els.deleteBoatButton.style.display = boat && canEdit ? 'inline-flex' : 'none';
  els.duplicateBoatButton.style.display = boat && canEdit ? 'inline-flex' : 'none';
  openModal('boatModal');
}

function toggleBoatFormEditability(enabled) {
  [
    els.boatName,
    els.licenceNumber,
    els.registrationNumber,
    els.boatType,
    els.boatStatus,
    els.ownerName,
    els.ownerPhone,
    els.ownerEmail,
    els.emergencyContact,
    els.zoneSelect,
    els.slotSelect,
    els.lengthInput,
    els.widthInput,
    els.equipmentInput,
    els.notesInput,
  ].forEach((field) => {
    field.disabled = !enabled;
  });
  document.querySelectorAll('#boatModal .manage-only').forEach((element) => {
    element.classList.toggle('hidden-by-role', !enabled);
  });
}

async function saveBoatFlow(event) {
  event.preventDefault();
  if (!canManageBoats()) return;

  const boatId = els.boatId.value || createId('boat');
  const zoneId = els.zoneSelect.value;
  const slotNumber = Number(els.slotSelect.value);
  const conflicting = state.boats.find(
    (boat) => boat.zone_id === zoneId && boat.slot_number === slotNumber && boat.id !== boatId,
  );
  if (conflicting) {
    showToast(`${formatEmplacement(zoneId, slotNumber)} est déjà occupé par ${conflicting.boat_name}.`, 'error');
    return;
  }

  const existing = getBoatById(boatId);
  const draftPayload = {
    id: boatId,
    boat_name: els.boatName.value,
    licence_number: els.licenceNumber.value,
    registration_number: els.registrationNumber.value,
    boat_type: els.boatType.value,
    status: els.boatStatus.value,
    owner_name: els.ownerName.value,
    owner_phone: els.ownerPhone.value,
    owner_email: els.ownerEmail.value,
    emergency_contact: els.emergencyContact.value,
    zone_id: zoneId,
    slot_number: slotNumber,
    length_m: els.lengthInput.value,
    width_m: els.widthInput.value,
    equipment: els.equipmentInput.value,
    notes: els.notesInput.value,
    photo_data: els.boatPhotoData.value,
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (!hasMeaningfulBoatInfo(draftPayload)) {
    draftPayload.boat_name = `Bateau non renseigné • ${formatEmplacement(zoneId, slotNumber)}`;
    draftPayload.notes = 'Fiche créée avec informations minimales.';
  } else if (!safeText(draftPayload.boat_name)) {
    draftPayload.boat_name = `Bateau non renseigné • ${formatEmplacement(zoneId, slotNumber)}`;
  }

  const payload = normalizeBoat(draftPayload);

  try {
    const saved = await api.upsertBoat(payload);
    state.boats = state.boats.filter((boat) => boat.id !== saved.id);
    state.boats.push(saved);
    state.boats = state.boats.map(normalizeBoat).sort(sortBoats);
    state.selectedBoatId = saved.id;
    state.selectedSlot = { zone_id: saved.zone_id, slot_number: saved.slot_number };
    state.filters = { search: '', zone: 'all', status: 'all' };
    els.searchInput.value = '';
    els.zoneFilter.value = 'all';
    els.statusFilter.value = 'all';
    renderAll();
    closeModal('boatModal');
    showToast('Fiche bateau enregistrée.', 'success');
    await reloadData(false);
  } catch (error) {
    console.error(error);
    if (isSlotConstraintError(error)) {
      await reloadData(false);
      const occupant = getBoatBySlot(zoneId, slotNumber);
      showToast(
        `${formatEmplacement(zoneId, slotNumber)} déjà occupé${occupant ? ` par ${displayBoatName(occupant)}` : ''}.`,
        'error',
      );
      return;
    }
    showToast(error.message || 'Enregistrement impossible.', 'error');
  }
}

function duplicateBoatFlow() {
  const boat = getBoatById(els.boatId.value);
  if (!boat || !canManageBoats()) return;
  els.boatId.value = '';
  els.boatModalTitle.textContent = `Dupliquer • ${boat.boat_name}`;
  showToast('La fiche est prête à être enregistrée comme nouveau bateau.', 'success');
}

async function deleteBoatFlow(boatId) {
  if (!canManageBoats()) return;
  const boat = getBoatById(boatId);
  if (!boat) return;
  const confirmed = window.confirm(`Supprimer la fiche du bateau “${displayBoatName(boat)}” ?`);
  if (!confirmed) return;

  try {
    await api.deleteBoat(boatId);
    state.selectedBoatId = null;
    state.selectedSlot = { zone_id: boat.zone_id, slot_number: boat.slot_number };
    await reloadData(false);
    closeModal('boatModal');
    showToast('Fiche supprimée.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Suppression impossible.', 'error');
  }
}

async function handlePhotoChange(event) {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    const dataUrl = await fileToDataUrl(file, 1200, 0.84);
    els.boatPhotoData.value = dataUrl;
    els.boatPhotoPreview.src = dataUrl;
  } catch (error) {
    console.error(error);
    showToast('Impossible de charger la photo.', 'error');
  } finally {
    event.target.value = '';
  }
}

function removeBoatPhoto() {
  if (!canManageBoats()) return;
  els.boatPhotoData.value = '';
  els.boatPhotoPreview.src = DEFAULT_PHOTO;
  els.boatPhotoInput.value = '';
}

function fileToDataUrl(file, maxSize = 1200, quality = 0.84) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        let { width, height } = image;
        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height >= width && height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        resolve(canvas.toDataURL(type, quality));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function handleBoatGridClick(event) {
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  const action = actionButton.dataset.action;
  const boatId = actionButton.dataset.id;
  const boat = getBoatById(boatId);
  if (!boat) return;

  if (action === 'open') {
    state.selectedBoatId = boat.id;
    state.selectedSlot = { zone_id: boat.zone_id, slot_number: boat.slot_number };
    renderSitePlan();
    renderZonesBoard();
    openBoatModal(boat, state.selectedSlot);
  }

  if (action === 'locate') {
    switchTab('dashboardTab');
    setPlanView('map');
    selectSlot(boat.zone_id, boat.slot_number, false);
  }

  if (action === 'delete') {
    deleteBoatFlow(boat.id);
  }

  closeAllSwipeRows();
}

function handleSwipeStart(event) {
  if (state.ui.viewMode !== 'compact') return;
  const content = event.target.closest('[data-swipe-content]');
  if (!content) return;
  const touch = event.touches[0];
  state.swipe.activeId = content.dataset.id;
  state.swipe.startX = touch.clientX;
  state.swipe.startY = touch.clientY;
  state.swipe.deltaX = 0;
  state.swipe.moved = false;
  content.classList.add('dragging');
}

function handleSwipeMove(event) {
  if (state.ui.viewMode !== 'compact' || !state.swipe.activeId) return;
  const touch = event.touches[0];
  const deltaX = touch.clientX - state.swipe.startX;
  const deltaY = touch.clientY - state.swipe.startY;
  if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) return;
  if (Math.abs(deltaX) < 8) return;
  state.swipe.moved = true;
  state.swipe.deltaX = deltaX;
  const content = document.querySelector(`[data-swipe-content][data-id="${state.swipe.activeId}"]`);
  if (!content) return;
  event.preventDefault();
  const clamped = Math.max(-164, Math.min(96, deltaX));
  content.style.transform = `translateX(${clamped}px)`;
}

function handleSwipeEnd() {
  if (state.ui.viewMode !== 'compact' || !state.swipe.activeId) return;
  const boatId = state.swipe.activeId;
  const deltaX = state.swipe.deltaX;
  const item = document.querySelector(`.swipe-item[data-boat-id="${boatId}"]`);
  const content = document.querySelector(`[data-swipe-content][data-id="${boatId}"]`);
  if (content) content.classList.remove('dragging');
  if (item) {
    item.classList.remove('open-left', 'open-right');
    if (deltaX > 70) {
      closeAllSwipeRows();
      item.classList.add('open-left');
    } else if (deltaX < -80) {
      closeAllSwipeRows();
      item.classList.add('open-right');
    } else if (content) {
      content.style.transform = '';
    }
  }
  if (content) content.style.transform = '';
  state.swipe.activeId = null;
  state.swipe.deltaX = 0;
}

function closeAllSwipeRows() {
  document.querySelectorAll('.swipe-item.open-left, .swipe-item.open-right').forEach((item) => {
    item.classList.remove('open-left', 'open-right');
  });
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
}

function closeModal(modalId) {
  if (modalId === 'passwordModal' && state.forcePasswordChange) return;
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

function openPasswordModal(force) {
  state.forcePasswordChange = force;
  els.passwordModalText.textContent = force
    ? 'Pour sécuriser le compte administrateur, le mot de passe doit être changé après la première connexion.'
    : 'Vous pouvez mettre à jour votre mot de passe à tout moment.';
  els.passwordForm.reset();
  openModal('passwordModal');
}

async function handlePasswordChange(event) {
  event.preventDefault();
  const password = els.newPassword.value;
  const confirm = els.confirmPassword.value;
  if (password.length < 8) {
    showToast('Le mot de passe doit contenir au moins 8 caractères.', 'error');
    return;
  }
  if (password !== confirm) {
    showToast('Les mots de passe ne correspondent pas.', 'error');
    return;
  }

  try {
    const updatedProfile = await api.changePassword(password);
    state.currentProfile = { ...state.currentProfile, ...updatedProfile, must_change_password: false };
    state.forcePasswordChange = false;
    closeModal('passwordModal');
    if (isAdmin()) {
      state.profiles = state.profiles.map((profile) =>
        profile.id === state.currentProfile.id ? { ...profile, must_change_password: false } : profile,
      );
      renderProfiles();
    }
    hydrateCurrentUserCard();
    showToast('Mot de passe mis à jour.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Impossible de changer le mot de passe.', 'error');
  }
}

function exportData() {
  const payload = {
    exported_at: new Date().toISOString(),
    mode: state.mode,
    boats: state.boats,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `cnh-bateaux-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function handleImport(event) {
  if (!canManageBoats()) {
    event.target.value = '';
    return;
  }
  const [file] = event.target.files || [];
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed.boats)) throw new Error('Format JSON invalide.');
    const confirmed = window.confirm(
      'Importer ce fichier et fusionner ses bateaux avec les données existantes ? Les IDs identiques seront remplacés.',
    );
    if (!confirmed) return;
    let knownBoats = [...state.boats];
    for (const boat of parsed.boats.map(normalizeBoat)) {
      const slotConflict = knownBoats.find(
        (existing) => existing.zone_id === boat.zone_id && existing.slot_number === boat.slot_number && existing.id !== boat.id,
      );
      const payload = slotConflict ? { ...boat, id: slotConflict.id } : boat;
      const saved = await api.upsertBoat(payload);
      knownBoats = knownBoats.filter((item) => item.id !== saved.id).concat(saved);
    }
    await reloadData(false);
    showToast('Import terminé.', 'success');
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Import impossible.', 'error');
  } finally {
    event.target.value = '';
  }
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  window.setTimeout(() => toast.remove(), 3200);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch((error) => {
      console.warn('Service worker non enregistré :', error);
    });
  }
}

init();
