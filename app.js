(() => {
  'use strict';

  const STORAGE_KEY = 'cnh-marina-manager-data-v5';
  const AUTH_KEY = 'cnh-marina-manager-auth-v5';
  const API_PREFIX = window.CNH_CONFIG?.API_PREFIX || (location.hostname.includes('vercel.app') ? '/api' : '/.netlify/functions');
  const SYNC_ENDPOINT = `${API_PREFIX}/data`;
  const AUTH_ENDPOINT = `${API_PREFIX}/auth`;
  const PLAN_IMAGE = 'plan-reference.png';
  const PLACEHOLDER_PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="260" viewBox="0 0 400 260">
      <defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#dfeaf3"/><stop offset="1" stop-color="#f8fbfd"/></linearGradient></defs>
      <rect width="400" height="260" rx="24" fill="url(#g)"/>
      <path d="M65 156h270l-32 34H100z" fill="#0d5f8f" opacity=".82"/>
      <path d="M178 64h22v92h-22z" fill="#0d2740" opacity=".8"/>
      <path d="M204 72l84 82h-84z" fill="#3ea0d0" opacity=".72"/>
      <path d="M172 82l-72 72h72z" fill="#1f8f83" opacity=".55"/>
      <text x="200" y="225" text-anchor="middle" font-family="Arial" font-size="20" font-weight="700" fill="#61778c">Photo bateau</text>
    </svg>`);

  const $ = (id) => document.getElementById(id);

  const zones = [
    {
      id: 'haut',
      name: 'Rangée haute',
      short: 'Haut',
      slots: Array.from({ length: 10 }, (_, i) => i + 1),
      rect: { left: 10.85, top: 0.2, width: 55.65, height: 25.8 }
    },
    {
      id: 'milieu',
      name: 'Rangée milieu',
      short: 'Milieu',
      slots: Array.from({ length: 18 }, (_, i) => i + 11),
      rect: { left: 0.2, top: 46.8, width: 99.0, height: 24.0 }
    },
    {
      id: 'bas',
      name: 'Rangée basse',
      short: 'Bas',
      slots: Array.from({ length: 18 }, (_, i) => i + 29),
      rect: { left: 0.45, top: 72.2, width: 98.7, height: 24.7 }
    }
  ];

  const state = {
    boats: [],
    profiles: [],
    authToken: null,
    selectedSlot: null,
    currentUser: null,
    planView: 'map',
    fleetView: 'cards',
    editingId: null,
    remoteMode: false,
    localStorageWarned: false
  };

  const els = {};

  function cacheElements() {
    [
      'authView', 'appView', 'loginForm', 'loginPassword', 'modeBadge', 'logoutButton', 'mobileLogoutButton', 'userDisplayName', 'userDisplayRole', 'syncPill',
      'sitePlanSection', 'sitePlanMap', 'zonesBoard', 'zoneFocusBar', 'zoneFocusTitle', 'zoneFocusMeta', 'zoneFocusAllBtn', 'zoneFocusGridBtn',
      'planMapViewBtn', 'planGridViewBtn', 'openPlanFullscreenBtn', 'planFullscreen', 'planFullscreenBody', 'closePlanFullscreenBtn',
      'statTotalSpots', 'statOccupied', 'statFree', 'statComplete', 'sidebarZoneStats', 'toastContainer',
      'refreshButton', 'exportButton', 'excelExportButton', 'googleSheetsExportButton', 'importInput', 'openCreateBoatButton', 'floatingAddButton', 'mobileExcelButton', 'boatGrid', 'searchInput', 'zoneFilter', 'statusFilter', 'cotisationFilter', 'tracteurFilter', 'sortFilter', 'fleetStatsBar',
      'boatModal', 'boatForm', 'boatId', 'boatPhotoData', 'boatPhotoPreview', 'boatPhotoInput', 'removeBoatPhotoButton', 'boatModalTitle',
      'boatName', 'licenceNumber', 'registrationNumber', 'boatType', 'boatStatus', 'ownerName', 'ownerPhone', 'ownerEmail', 'emergencyContact',
      'zoneSelect', 'slotSelect', 'lengthInput', 'widthInput', 'equipmentInput', 'notesInput', 'cotisationAJourInput', 'descenteTracteurInput', 'duplicateBoatButton', 'deleteBoatButton',
      'passwordModal', 'passwordForm', 'readonlyPasswordInput', 'managerPasswordInput', 'adminPasswordInput', 'openPasswordModalButton', 'accountCardName', 'accountCardEmail', 'accountRoleChip', 'accountPasswordChip',
      'workspaceTitle', 'workspaceSubtitle', 'fsMenuBtn', 'mobileActionMenu', 'fsRefreshBtn', 'fsExcelBtn', 'fsGoogleSheetsBtn', 'fsExportBtn', 'fsImportBtn', 'fsImportInput', 'fsNewBoatBtn', 'fsFleetBtn', 'fsPasswordsBtn', 'fsAdminBtn', 'fsLogoutBtn', 'sidebar', 'sidebarBackdrop', 'sidebarToggle', 'sidebarClose', 'cardModeButton', 'compactModeButton',
      'profilesNotice', 'profilesList'
    ].forEach((id) => { els[id] = $(id); });
  }

  const allSlots = () => zones.flatMap((z) => z.slots);
  const findZoneBySlot = (slot) => zones.find((z) => z.slots.includes(Number(slot)));
  const boatForSlot = (slot) => state.boats.find((boat) => Number(boat.slot) === Number(slot) && boat.status !== 'archive');
  const canManage = () => ['manager', 'admin', 'debug'].includes(state.currentUser?.role);
  const canAdmin = () => ['admin', 'debug'].includes(state.currentUser?.role);
  const isDebugger = () => state.currentUser?.role === 'debug';
  const safeText = (value) => String(value ?? '').trim();
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `boat-${Date.now()}-${Math.random().toString(16).slice(2)}`);


  function isLocalPreview() {
    return ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
  }

  async function fetchRemoteData() {
    // Sécurité : sans token, on ne tente même pas de charger les données distantes
    if (!state.authToken && !isLocalPreview()) return null;
    try {
      const headers = {};
      if (state.authToken) headers['authorization'] = `Bearer ${state.authToken}`;
      const res = await fetch(SYNC_ENDPOINT, { cache: 'no-store', headers });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          // Le token peut avoir expiré après changement de secret
          state.remoteMode = false;
          updateSyncPill();
          return null;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (data && data.ok === false) throw new Error(data.error || 'Non autorisé');
      state.remoteMode = true;
      return data;
    } catch (error) {
      state.remoteMode = false;
      return null;
    }
  }

  async function loadData() {
    let loaded = null;

    // Sur Netlify : priorité à la donnée partagée Netlify Blobs.
    if (!isLocalPreview()) {
      loaded = await fetchRemoteData();
    }

    // Secours local si Netlify Functions/Blobs n'est pas disponible.
    if (!loaded) {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) loaded = JSON.parse(stored);
      } catch (_) {}
    }

    // Donnée initiale du dépôt.
    if (!loaded) {
      try {
        const res = await fetch('data.json', { cache: 'no-store' });
        if (res.ok) loaded = await res.json();
      } catch (_) {
        // Live Server ou fichier local : on démarre simplement avec une base vide.
      }
    }

    state.boats = Array.isArray(loaded?.boats) ? loaded.boats : [];
    state.profiles = Array.isArray(loaded?.profiles) ? loaded.profiles : [];
    saveLocalData();
  }

  function makeLightBoat(boat) {
    if (!boat) return boat;
    const copy = { ...boat };
    if (copy.photoData && String(copy.photoData).length > 1200) {
      copy.photoData = '';
      copy.photoLocalOnly = true;
    }
    return copy;
  }

  function saveLocalData() {
    const fullData = { boats: state.boats, profiles: state.profiles };
    const lightData = { boats: state.boats.map(makeLightBoat), profiles: state.profiles };

    try {
      const fullJson = JSON.stringify(fullData);
      // Les photos restent dans l'état de l'app et sont envoyées à Vercel.
      // En local, si le paquet devient trop gros, on garde une copie légère sans photos.
      const jsonForLocal = fullJson.length > 2500000 ? JSON.stringify(lightData) : fullJson;
      localStorage.setItem(STORAGE_KEY, jsonForLocal);
      state.localStorageWarned = false;
      return true;
    } catch (error) {
      try {
        // Certains navigateurs refusent d'écraser une grosse ancienne sauvegarde.
        // On supprime l'ancienne copie locale puis on écrit une sauvegarde légère.
        localStorage.removeItem(STORAGE_KEY);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(lightData));
        state.localStorageWarned = false;
        return true;
      } catch (_) {
        if (!state.localStorageWarned) {
          toast('Mémoire locale pleine : données envoyées à Vercel, vide le cache du site si ce message revient.', 'error');
          state.localStorageWarned = true;
        }
        return false;
      }
    }
  }

  async function pushRemoteData(showToast = false) {
    if (isLocalPreview()) return false;
    if (!state.authToken) {
      state.remoteMode = false;
      updateSyncPill();
      if (showToast) toast('Non authentifié : sauvegarde locale uniquement.', 'error');
      return false;
    }
    try {
      await compactStatePhotosIfNeeded();
      const isNetlify = SYNC_ENDPOINT.includes('/.netlify/functions');
      let boatsForRemote = state.boats;
      // Sur Netlify la limite de payload Functions est ~6 Mo. Si on a 14 Mo de JSON avec photos, 500 assuré.
      // On envoie donc une version sans les grosses photos base64 pour garder Netlify fonctionnel.
      // Vercel, lui, garde les photos complètes.
      if (isNetlify) {
        const jsonFull = JSON.stringify({ boats: state.boats, profiles: state.profiles });
        if (jsonFull.length > 4000000) {
          boatsForRemote = state.boats.map(makeLightBoat);
        }
      }
      const payload = JSON.stringify({ boats: boatsForRemote, profiles: state.profiles });
      const res = await fetch(SYNC_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'authorization': `Bearer ${state.authToken}` },
        body: payload
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.message || data.error || `HTTP ${res.status}`);
      state.remoteMode = true;
      if (showToast) toast('Données synchronisées entre les appareils.', 'success');
      updateSyncPill();
      return true;
    } catch (error) {
      state.remoteMode = false;
      const hostLabel = SYNC_ENDPOINT.includes('/.netlify/functions') ? 'Netlify' : 'Vercel';
      if (showToast) toast(`Sauvegarde locale OK, mais synchro ${hostLabel} indisponible : ${error.message}`, 'error');
      updateSyncPill();
      return false;
    }
  }

  async function saveData(showToast = false) {
    saveLocalData();
    if (!isLocalPreview()) {
      return pushRemoteData(showToast);
    }
    if (showToast) toast('Données enregistrées localement.', 'success');
    return true;
  }

  async function syncFromRemote(showToast = true) {
    const data = await fetchRemoteData();
    if (!data) {
      if (showToast) toast('Synchronisation indisponible, données locales conservées.', 'error');
      updateSyncPill();
      return false;
    }
    state.boats = Array.isArray(data.boats) ? data.boats : [];
    state.profiles = Array.isArray(data.profiles) ? data.profiles : [];
    saveLocalData();
    renderAll();
    if (showToast) toast('Données récupérées depuis Vercel.', 'success');
    updateSyncPill();
    return true;
  }

  function updateSyncPill() {
    if (!els.syncPill) return;
    if (state.remoteMode) {
      els.syncPill.textContent = 'Synchronisé';
      els.syncPill.className = 'sync-pill online';
    } else {
      els.syncPill.textContent = isLocalPreview() ? 'Local' : 'Hors ligne';
      els.syncPill.className = 'sync-pill demo';
    }
  }

  function toast(message, type = '') {
    if (!els.toastContainer) return;
    const node = document.createElement('div');
    node.className = `toast ${type}`.trim();
    node.textContent = message;
    els.toastContainer.appendChild(node);
    window.setTimeout(() => node.remove(), 3200);
  }

  function showApp(user = null) {
    els.authView?.classList.add('hidden');
    els.appView?.classList.remove('hidden');
    document.body.classList.add('plan-only-mode');
    state.currentUser = user || state.currentUser || { name: 'Consultation CNH', role: 'lecture' };
    document.body.classList.toggle('debug-mode', state.currentUser.role === 'debug');
    localStorage.setItem(AUTH_KEY, JSON.stringify({ logged: true, at: Date.now(), user: state.currentUser, token: state.authToken }));
    applyRoleVisibility();
    renderAll();
    requestAnimationFrame(() => ensureAerialPlanVisible());
    // Après login, on tente de récupérer les données sécurisées du serveur
    if (state.authToken && !isLocalPreview()) {
      syncFromRemote(false).then(() => {
        // si remote a réussi, renderAll déjà fait
      });
    }
  }

  function showAuth() {
    els.authView?.classList.remove('hidden');
    els.appView?.classList.add('hidden');
    document.body.classList.remove('plan-only-mode', 'plan-fullscreen-open', 'debug-mode');
    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    state.authToken = null;
    state.currentUser = null;
  }

  function ensureAerialPlanVisible() {
    setPlanView('map');
    if (window.matchMedia('(max-width: 760px)').matches) {
      openPlanFullscreen();
    } else {
      closePlanFullscreen();
      els.sitePlanMap?.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
  }

  async function handleLogin(event) {
    event.preventDefault();
    const password = els.loginPassword?.value || '';

    try {
      const res = await fetch(AUTH_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'login', password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error || 'Mot de passe incorrect');
      state.authToken = data.token || null;
      showApp(data.user);
      if (els.loginPassword) els.loginPassword.value = '';
    } catch (error) {
      if (els.loginPassword) {
        els.loginPassword.value = '';
        els.loginPassword.focus();
      }
      toast('Mot de passe incorrect.', 'error');
    }
  }

  function logout() {
    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    showAuth();
    toast('Déconnecté, données locales effacées.', 'success');
  }

  function applyRoleVisibility() {
    const manage = canManage();
    const adminAccess = canAdmin();
    const debugAccess = isDebugger();

    document.querySelectorAll('.manage-only').forEach((el) => el.classList.toggle('hidden-by-role', !manage));
    document.querySelectorAll('.admin-only').forEach((el) => el.classList.toggle('hidden-by-role', !adminAccess));
    document.querySelectorAll('.debugger-only').forEach((el) => el.classList.toggle('hidden-by-role', !debugAccess));

    const roleLabels = {
      lecture: 'Consultation uniquement',
      manager: 'Modification sans administration',
      admin: 'Administration + modifications',
      debug: 'Debug / super administrateur'
    };

    if (els.userDisplayName) els.userDisplayName.textContent = state.currentUser?.name || 'CNH';
    if (els.userDisplayRole) els.userDisplayRole.textContent = roleLabels[state.currentUser?.role] || '—';
    updateSyncPill();

    if (els.modeBadge) els.modeBadge.textContent = '';
    if (els.accountCardName) els.accountCardName.textContent = state.currentUser?.name || 'CNH';
    if (els.accountCardEmail) els.accountCardEmail.textContent = roleLabels[state.currentUser?.role] || '—';
    if (els.accountRoleChip) els.accountRoleChip.textContent = state.currentUser?.role === 'debug' ? 'Super admin' : adminAccess ? 'Admin' : state.currentUser?.role === 'manager' ? 'Modification' : 'Lecture seule';
    if (els.accountPasswordChip) els.accountPasswordChip.textContent = manage ? 'Modifications autorisées' : 'Consultation';
  }

  function renderAll() {
    renderStats();
    renderPlan();
    renderGrid();
    renderFleet();
    renderSidebarStats();
    populateSelects();
    renderProfiles();
    setPlanView(state.planView || 'map');
  }

  function renderStats() {
    const occupied = state.boats.filter((b) => b.status !== 'archive').length;
    const complete = state.boats.length ? Math.round((state.boats.filter(isBoatComplete).length / state.boats.length) * 100) : 0;
    if (els.statTotalSpots) els.statTotalSpots.textContent = allSlots().length;
    if (els.statOccupied) els.statOccupied.textContent = occupied;
    if (els.statFree) els.statFree.textContent = allSlots().length - occupied;
    if (els.statComplete) els.statComplete.textContent = `${complete}%`;
  }

  function isBoatComplete(boat) {
    return ['name', 'ownerName', 'ownerPhone', 'zone', 'slot'].every((key) => safeText(boat[key]));
  }

  function renderPlan() {
    if (!els.sitePlanMap) return;
    const selected = Number(state.selectedSlot || 0);
    els.sitePlanMap.innerHTML = '';

    const hint = document.createElement('div');
    hint.className = 'plan-mobile-hint';
    hint.textContent = 'Pincez/zoomez avec le navigateur ou faites défiler horizontalement pour voir tous les emplacements.';

    const scroll = document.createElement('div');
    scroll.className = 'site-plan-scroll';

    const frame = document.createElement('div');
    frame.className = 'site-plan-frame';
    frame.style.aspectRatio = '1549 / 605';

    const img = document.createElement('img');
    img.className = 'site-plan-photo';
    img.src = PLAN_IMAGE;
    img.alt = 'Plan aérien des emplacements CNH';
    img.onerror = () => {
      img.src = 'plan emplacements.png';
    };

    const overlays = document.createElement('div');
    overlays.className = 'site-plan-overlays';

    zones.forEach((zone) => {
      const overlay = document.createElement('div');
      overlay.className = `zone-overlay zone-overlay-row zone-overlay-${zone.id}`;
      overlay.style.left = `${zone.rect.left}%`;
      overlay.style.top = `${zone.rect.top}%`;
      overlay.style.width = `${zone.rect.width}%`;
      overlay.style.height = `${zone.rect.height}%`;

      const occupied = zone.slots.filter((slot) => boatForSlot(slot)).length;
      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'zone-overlay-header';
      header.innerHTML = `<span class="zone-overlay-label">${zone.short}</span><span class="zone-overlay-count">${occupied}/${zone.slots.length}</span>`;
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        focusZone(zone.id);
      });

      const fill = document.createElement('div');
      fill.className = 'zone-overlay-fill';
      fill.innerHTML = `<span style="width:${Math.round((occupied / zone.slots.length) * 100)}%"></span>`;

      const miniSlots = document.createElement('div');
      miniSlots.className = 'zone-mini-slots';
      zone.slots.forEach((slot) => miniSlots.appendChild(createPlanSlot(slot, selected)));

      overlay.append(header, fill, miniSlots);
      overlay.addEventListener('click', () => focusZone(zone.id));
      overlays.appendChild(overlay);
    });

    frame.append(img, overlays);
    scroll.appendChild(frame);
    els.sitePlanMap.append(hint, scroll);
    updatePlanSize();
  }

  function updatePlanSize() {
    document.querySelectorAll('.site-plan-frame').forEach((frame) => {
      const fullscreen = frame.closest('.site-plan-map--fullscreen');
      if (fullscreen) {
        const viewportW = Math.max(window.innerWidth, 320);
        const viewportH = Math.max(window.innerHeight - 78, 320);
        const width = window.matchMedia('(max-width: 760px)').matches ? Math.max(980, viewportW * 1.9) : Math.min(1549, viewportW - 60);
        frame.style.width = `${width}px`;
        frame.style.height = `${Math.round(width * 605 / 1549)}px`;
        fullscreen.style.minHeight = `${Math.min(viewportH, Math.round(width * 605 / 1549) + 20)}px`;
      } else {
        const parentW = frame.parentElement?.clientWidth || 1000;
        const width = Math.min(1549, Math.max(760, parentW));
        frame.style.width = `${width}px`;
        frame.style.height = `${Math.round(width * 605 / 1549)}px`;
      }
    });
  }

  function createPlanSlot(slot, selected) {
    const boat = boatForSlot(slot);
    const isHiver = boat?.status === 'hivernage';
    const isMaint = boat?.status === 'maintenance';
    const isCotisNok = boat ? boat.cotisationAJour !== true : false;
    const isCotisOk = boat?.cotisationAJour === true;
    const isTracteur = !!boat?.descenteTracteur;
    const button = document.createElement('button');
    button.type = 'button';
    const ALLOWED_STATUSES_PLAN = ['actif','hivernage','maintenance','archive'];
    const safeStatus = boat?.status && ALLOWED_STATUSES_PLAN.includes(boat.status) ? boat.status : '';
    const hasValidPhoto = boat?.photoData && typeof boat.photoData==='string' && boat.photoData.startsWith('data:image/') && boat.photoData.length < 800000;
    let cls = 'plan-slot' + (boat ? ' is-occupied' : ' plan-slot-free') + (selected === Number(slot) ? ' is-selected' : '') + (hasValidPhoto ? ' has-photo' : '') + (safeStatus ? ` status-${safeStatus}` : '');
    if (isCotisNok) cls += ' cotis-nok';
    if (isHiver) cls += ' hiver-active';
    if (isMaint) cls += ' maint-active';
    if (isTracteur) cls += ' tracteur-active';
    button.className = cls;
    const cotisTxt = isCotisNok ? ' • COTISATION NON À JOUR ⚠️' : isCotisOk ? ' • Cotisation OK ✅' : '';
    const hiverTxt = isHiver ? ' • HIVERNAGE ❄️' : '';
    const maintTxt = isMaint ? ' • MAINTENANCE 🔧' : '';
    const tracTxt = isTracteur ? ' • Tracteur 🚜' : '';
    button.title = boat ? `${slot} • ${boat.name || 'Bateau'} • ${boat.ownerName || ''}${cotisTxt}${hiverTxt}${maintTxt}${tracTxt}` : `${slot} • libre`;
    button.dataset.slot = slot;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      selectSlot(slot);
    });

    if (hasValidPhoto) {
      const photo = document.createElement('img');
      photo.className = 'plan-slot-photo';
      photo.src = boat.photoData;
      photo.alt = '';
      button.appendChild(photo);
    }

    const num = document.createElement('span');
    num.className = 'plan-slot-num';
    num.textContent = slot;
    button.appendChild(num);

    // Badges visuels superposés - ultra visibles
    if (boat) {
      if (isHiver) {
        const b = document.createElement('span');
        b.className = 'plan-badge badge-hiver';
        b.textContent = '❄️';
        b.title = 'Hivernage';
        button.appendChild(b);
      }
      if (isMaint) {
        const b = document.createElement('span');
        b.className = 'plan-badge badge-maint-plan';
        b.textContent = '🔧';
        b.title = 'Maintenance';
        button.appendChild(b);
      }
      if (isCotisNok) {
        const b = document.createElement('span');
        b.className = 'plan-badge badge-cotis';
        b.textContent = '⚠️';
        b.title = 'Cotisation non à jour';
        button.appendChild(b);
      } else if (isCotisOk) {
        const b = document.createElement('span');
        b.className = 'plan-badge badge-cotis-ok';
        b.textContent = '✓';
        b.title = 'Cotisation OK';
        button.appendChild(b);
      }
      if (isTracteur) {
        const b = document.createElement('span');
        b.className = 'plan-badge badge-tracteur-plan';
        b.textContent = '🚜';
        b.title = 'Descente tracteur';
        button.appendChild(b);
      }
    }

    if (boat) {
      const name = document.createElement('span');
      name.className = 'plan-slot-name';
      name.textContent = boat.name || 'Bateau';
      const owner = document.createElement('span');
      owner.className = 'plan-slot-owner';
      owner.textContent = boat.ownerName || '';
      button.append(name, owner);
    }
    return button;
  }

  function selectSlot(slot) {
    state.selectedSlot = Number(slot);
    const boat = boatForSlot(slot);
    renderPlan();
    renderGrid();
    renderSidebarStats();
    if (boat) {
      openBoatModal(boat.id);
    } else if (canManage()) {
      openBoatModal(null, Number(slot));
    } else {
      toast(`Emplacement ${slot} libre.`);
    }
  }

  function focusZone(zoneId) {
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone) return;
    if (els.zoneFocusBar) els.zoneFocusBar.classList.remove('hidden');
    if (els.zoneFocusTitle) els.zoneFocusTitle.textContent = zone.name;
    if (els.zoneFocusMeta) {
      const occupied = zone.slots.filter((slot) => boatForSlot(slot)).length;
      els.zoneFocusMeta.textContent = `${occupied} occupés • ${zone.slots.length - occupied} libres`;
    }
    document.querySelectorAll('.zone-overlay').forEach((el) => {
      el.classList.toggle('is-focused', el.classList.contains(`zone-overlay-${zone.id}`));
      el.classList.toggle('is-dimmed', !el.classList.contains(`zone-overlay-${zone.id}`));
    });
  }

  function clearZoneFocus() {
    els.zoneFocusBar?.classList.add('hidden');
    document.querySelectorAll('.zone-overlay').forEach((el) => el.classList.remove('is-focused', 'is-dimmed'));
  }

  function setPlanView(view) {
    state.planView = view === 'grid' ? 'grid' : 'map';
    els.planMapViewBtn?.classList.toggle('active', state.planView === 'map');
    els.planGridViewBtn?.classList.toggle('active', state.planView === 'grid');
    els.sitePlanSection?.classList?.toggle('hidden', state.planView !== 'map');
    els.zonesBoard?.classList.toggle('plan-grid-hidden', state.planView !== 'grid');
    updatePlanSize();
  }

  function renderGrid() {
    if (!els.zonesBoard) return;
    els.zonesBoard.innerHTML = '';
    els.zonesBoard.classList.add('zones-board-compact');
    zones.forEach((zone) => {
      const card = document.createElement('section');
      card.className = 'zone-section';
      const occupied = zone.slots.filter((slot) => boatForSlot(slot)).length;
      card.innerHTML = `<div class="zone-header"><div><h4>${zone.name}</h4><div class="zone-meta">${occupied}/${zone.slots.length} occupés</div></div></div>`;
      const grid = document.createElement('div');
      grid.className = 'slot-grid slot-grid-compact slot-grid-cols-dense';
      zone.slots.forEach((slot) => {
        const boat = boatForSlot(slot);
        const btn = document.createElement('button');
        btn.className = `slot-card ${boat ? 'occupied' : 'free'} ${Number(state.selectedSlot) === slot ? 'selected' : ''}`;
        btn.type = 'button';
        btn.innerHTML = `<span class="slot-index">${slot}</span><strong>${boat?.name || 'Libre'}</strong><small>${boat?.ownerName || ''}</small>`;
        btn.addEventListener('click', () => selectSlot(slot));
        grid.appendChild(btn);
      });
      card.appendChild(grid);
      els.zonesBoard.appendChild(card);
    });
  }

  function renderSidebarStats() {
    if (!els.sidebarZoneStats) return;
    els.sidebarZoneStats.innerHTML = '';
    zones.forEach((zone) => {
      const occupied = zone.slots.filter((slot) => boatForSlot(slot)).length;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sidebar-zone-item';
      btn.innerHTML = `<strong>${zone.short}</strong><span class="sidebar-zone-bar"><span style="width:${Math.round((occupied / zone.slots.length) * 100)}%"></span></span><small>${occupied}/${zone.slots.length}</small>`;
      btn.addEventListener('click', () => {
        closeSidebar();
        setPlanView('map');
        focusZone(zone.id);
      });
      els.sidebarZoneStats.appendChild(btn);
    });
  }

  function renderFleet() {
    if (!els.boatGrid) return;
    const query = safeText(els.searchInput?.value).toLowerCase();
    const zoneFilter = els.zoneFilter?.value || 'all';
    const statusFilter = els.statusFilter?.value || 'all';
    const cotisFilter = els.cotisationFilter?.value || 'all';
    const tractFilter = els.tracteurFilter?.value || 'all';
    const sortFilter = els.sortFilter?.value || 'slot';

    let boats = state.boats.filter((boat) => {
      const haystack = [
        boat.name, boat.ownerName, boat.ownerPhone, boat.ownerEmail,
        boat.licenceNumber, boat.registrationNumber, boat.boatType, boat.notes,
        boat.cotisationAJour ? 'cotisation à jour' : 'cotisation impayée',
        boat.descenteTracteur ? 'tracteur' : '',
        boat.status || ''
      ].join(' ').toLowerCase();
      const matchQuery = !query || haystack.includes(query);
      const matchZone = zoneFilter === 'all' || boat.zone === zoneFilter;
      const matchStatus = statusFilter === 'all' || boat.status === statusFilter;
      const matchCotis = cotisFilter === 'all' || (cotisFilter === 'ok' ? boat.cotisationAJour === true : boat.cotisationAJour !== true);
      const matchTract = tractFilter === 'all' || (tractFilter === 'yes' ? !!boat.descenteTracteur : !boat.descenteTracteur);
      return matchQuery && matchZone && matchStatus && matchCotis && matchTract;
    });

    // Tri sophistiqué
    boats.sort((a, b) => {
      if (sortFilter === 'slot') return (Number(a.slot) || 0) - (Number(b.slot) || 0);
      if (sortFilter === 'slot_desc') return (Number(b.slot) || 0) - (Number(a.slot) || 0);
      if (sortFilter === 'name') return safeText(a.name).localeCompare(safeText(b.name), 'fr');
      if (sortFilter === 'owner') return safeText(a.ownerName).localeCompare(safeText(b.ownerName), 'fr');
      if (sortFilter === 'cotisation') {
        // NOK d'abord : tout ce qui n'est pas true (false, undefined)
        const av = a.cotisationAJour === true ? 1 : 0;
        const bv = b.cotisationAJour === true ? 1 : 0;
        return av - bv;
      }
      if (sortFilter === 'hivernage') {
        const av = a.status === 'hivernage' ? 0 : 1;
        const bv = b.status === 'hivernage' ? 0 : 1;
        return av - bv;
      }
      return 0;
    });

    // Barre de stats fleet
    if (els.fleetStatsBar) {
      const total = state.boats.length;
      const affich = boats.length;
      const nok = boats.filter(b => b.cotisationAJour !== true).length;
      const hiv = boats.filter(b => b.status === 'hivernage').length;
      const trac = boats.filter(b => !!b.descenteTracteur).length;
      const maint = boats.filter(b => b.status === 'maintenance').length;
      els.fleetStatsBar.innerHTML = `
        <div class="fleet-stat"><strong>${affich}</strong><small>affichés / ${total}</small></div>
        <div class="fleet-stat warn"><strong>${nok}</strong><small>cotis. non à jour</small></div>
        <div class="fleet-stat info"><strong>${hiv}</strong><small>hivernage ❄️</small></div>
        <div class="fleet-stat"><strong>${trac}</strong><small>tracteur 🚜</small></div>
        ${maint ? `<div class="fleet-stat danger"><strong>${maint}</strong><small>maintenance</small></div>` : ''}
      `;
    }

    els.boatGrid.innerHTML = '';
    els.boatGrid.className = state.fleetView === 'compact' ? 'boat-grid compact-grid' : 'boat-grid';
    if (els.cardModeButton) els.cardModeButton.classList.toggle('active', state.fleetView !== 'compact');
    if (els.compactModeButton) els.compactModeButton.classList.toggle('active', state.fleetView === 'compact');

    if (!boats.length) {
      els.boatGrid.innerHTML = '<div class="inline-notice">Aucun bateau ne correspond aux filtres. Réinitialise les filtres ou crée une fiche depuis le plan.</div>';
      return;
    }

    boats.forEach((boat) => {
      const card = document.createElement('article');
      const isHiver = boat.status === 'hivernage';
      const isCotisNok = boat.cotisationAJour !== true;
      const isCotisOk = boat.cotisationAJour === true;
      const isTract = !!boat.descenteTracteur;
      const isMaint = boat.status === 'maintenance';
      const isArch = boat.status === 'archive';

      const statusLabel = boat.status || 'actif';
      const statusClass = `status-${statusLabel}`;
      const zoneName = findZoneBySlot(boat.slot)?.short || boat.zone || '—';

      card.className = 'boat-card' + (isCotisNok ? ' card-cotis-nok' : '') + (isHiver ? ' card-hiver' : '') + (isMaint ? ' card-maint' : '');

      if (state.fleetView === 'compact') {
        card.className = 'compact-boat-card' + (isCotisNok ? ' compact-cotis-nok' : '') + (isHiver ? ' compact-hiver' : '');
        card.innerHTML = `
          <div class="compact-boat-leading ${boat.photoData ? 'has-photo' : ''}">
            ${(boat.photoData && boat.photoData.startsWith('data:image/')) ? `<img src="${boat.photoData}" alt="">` : '⛵'}
          </div>
          <div class="compact-boat-main">
            <div class="compact-top-row">
              <strong class="compact-boat-title">${escapeHtml(boat.name || 'Sans nom')} • ${boat.slot || '—'}</strong>
              <span class="compact-status ${statusClass}">${statusLabel}${isHiver ? ' ❄️' : ''}</span>
            </div>
            <div class="compact-boat-meta">${escapeHtml(boat.ownerName || '—')} • ${escapeHtml(boat.ownerPhone || '')} ${zoneName}</div>
            <div class="compact-badges">
              ${isCotisNok ? '<span class="mini-badge nok">⚠️ Cotis.</span>' : isCotisOk ? '<span class="mini-badge ok">Cotis. OK</span>' : ''}
              ${isTract ? '<span class="mini-badge tract">🚜</span>' : ''}
              ${isHiver ? '<span class="mini-badge hiver">❄️ Hivernage</span>' : ''}
            </div>
          </div>
          <div class="compact-boat-chevron">›</div>
        `;
        card.addEventListener('click', () => openBoatModal(boat.id));
      } else {
        // Mode cartes sophistiqué
        const cotisationBadge = isCotisOk
          ? '<span class="badge-cotisation ok">✅ Cotisation à jour</span>'
          : isCotisNok ? '<span class="badge-cotisation nok">⚠️ Cotisation non à jour</span>' : '<span class="badge-cotisation unknown">Cotisation —</span>';
        const tracteurBadge = isTract ? '<span class="badge-tracteur">🚜 Descente tracteur</span>' : '';
        const hiverBadge = isHiver ? '<span class="badge-hiver">❄️ Hivernage</span>' : '';
        const maintBadge = isMaint ? '<span class="badge-maint">🔧 Maintenance</span>' : '';
        const archBadge = isArch ? '<span class="badge-arch">📦 Archivé</span>' : '';

        const licenceLine = [boat.licenceNumber ? `Lic: ${escapeHtml(boat.licenceNumber)}` : '', boat.registrationNumber ? `Immat: ${escapeHtml(boat.registrationNumber)}` : '', boat.boatType ? escapeHtml(boat.boatType) : ''].filter(Boolean).join(' • ');
        const dimLine = [boat.length ? `${boat.length}m` : '', boat.width ? `${boat.width}m` : ''].filter(Boolean).join(' x ');
        const phoneLink = boat.ownerPhone ? `<a href="tel:${escapeHtml(boat.ownerPhone)}">${escapeHtml(boat.ownerPhone)}</a>` : '';

        card.innerHTML = `
          <div class="boat-card-media-wrap">
            <img class="boat-card-photo" src="${(boat.photoData && boat.photoData.startsWith('data:image/') ? boat.photoData : PLACEHOLDER_PHOTO)}" alt="${escapeHtml(boat.name || 'Bateau')}">
            <div class="boat-card-photo-overlay">
              <span class="slot-pill">Place ${boat.slot || '—'}</span>
              <span class="zone-pill">${escapeHtml(zoneName)}</span>
            </div>
            ${isCotisNok ? '<div class="card-corner-ribbon nok">Cotisation</div>' : ''}
            ${isHiver ? '<div class="card-corner-ribbon hiver">Hivernage</div>' : ''}
          </div>
          <div class="boat-card-body">
            <div class="boat-card-head">
              <span class="status-pill ${statusClass}">${statusLabel}${isHiver ? ' ❄️' : ''}</span>
              <div class="boat-card-actions-mini">
                <button type="button" class="mini-icon-btn" data-action="locate" title="Localiser sur plan">🗺️</button>
                <button type="button" class="mini-icon-btn" data-action="edit" title="Ouvrir fiche">✏️</button>
              </div>
            </div>
            <h4 class="boat-card-title">${escapeHtml(boat.name || 'Sans nom')}</h4>
            <p class="boat-card-meta">
              <strong>${escapeHtml(boat.ownerName || 'Propriétaire —')}</strong><br>
              ${phoneLink ? phoneLink + ' • ' : ''}${escapeHtml(boat.ownerEmail || '')}
            </p>
            ${licenceLine ? `<div class="boat-card-line">${licenceLine}</div>` : ''}
            ${dimLine ? `<div class="boat-card-line dim">📏 ${dimLine}</div>` : ''}
            <div class="boat-card-badges">${cotisationBadge}${tracteurBadge}${hiverBadge}${maintBadge}${archBadge}</div>
            ${boat.equipment ? `<div class="boat-card-note"><small>🔧 ${escapeHtml(boat.equipment)}</small></div>` : ''}
            ${boat.notes ? `<div class="boat-card-note"><small>📝 ${escapeHtml((boat.notes || '').slice(0, 120))}${(boat.notes || '').length > 120 ? '…' : ''}</small></div>` : ''}
          </div>
          <div class="card-actions">
            <button type="button" class="secondary-button" data-action="locate">📍 Localiser</button>
            <button type="button" class="primary-button" data-action="edit">Ouvrir fiche</button>
          </div>
        `;
        card.querySelector('[data-action="locate"]').addEventListener('click', (e) => {
          e.stopPropagation();
          state.selectedSlot = Number(boat.slot);
          setPlanView('map');
          renderPlan();
          switchTab('dashboardTab');
          ensureAerialPlanVisible();
        });
        card.querySelectorAll('[data-action="edit"]').forEach(btn => btn.addEventListener('click', (e) => {
          e.stopPropagation();
          openBoatModal(boat.id);
        }));
      }
      els.boatGrid.appendChild(card);
    });
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
  }

  function sanitizeForCsv(value) {
    const str = String(value ?? '');
    const trimmed = str.trim();
    if (/^[=+\-@]/.test(trimmed)) {
      return "'" + str;
    }
    return str;
  }

  function populateSelects() {
    if (els.zoneFilter && !els.zoneFilter.dataset.ready) {
      els.zoneFilter.innerHTML = '<option value="all">Toutes les zones</option>' + zones.map((z) => `<option value="${z.id}">${z.name}</option>`).join('');
      els.zoneFilter.dataset.ready = '1';
    }
    if (els.zoneSelect) {
      const current = els.zoneSelect.value;
      els.zoneSelect.innerHTML = zones.map((z) => `<option value="${z.id}">${z.name}</option>`).join('');
      if (current) els.zoneSelect.value = current;
    }
    populateSlotSelect();
  }

  function populateSlotSelect() {
    if (!els.slotSelect) return;
    const zone = zones.find((z) => z.id === (els.zoneSelect?.value || findZoneBySlot(state.selectedSlot)?.id)) || zones[0];
    const current = Number(els.slotSelect.value || state.selectedSlot || zone.slots[0]);
    els.slotSelect.innerHTML = zone.slots.map((slot) => {
      const occupiedBy = boatForSlot(slot);
      const disabled = occupiedBy && occupiedBy.id !== state.editingId ? 'disabled' : '';
      return `<option value="${slot}" ${disabled}>${slot}${occupiedBy && occupiedBy.id !== state.editingId ? ' — occupé' : ''}</option>`;
    }).join('');
    els.slotSelect.value = zone.slots.includes(current) ? String(current) : String(zone.slots[0]);
  }

  function openBoatModal(id = null, slot = null) {
    if (!els.boatModal) return;
    const existing = id ? state.boats.find((b) => b.id === id) : null;
    const chosenSlot = Number(slot || existing?.slot || state.selectedSlot || 1);
    const zone = findZoneBySlot(chosenSlot) || zones[0];
    state.editingId = existing?.id || null;
    if (els.boatModalTitle) els.boatModalTitle.textContent = existing ? `Fiche • ${existing.name || `place ${existing.slot}`}` : `Nouvelle fiche • place ${chosenSlot}`;
    setField('boatId', existing?.id || '');
    setField('boatPhotoData', existing?.photoData || '');
    if (els.boatPhotoPreview) els.boatPhotoPreview.src = existing?.photoData || PLACEHOLDER_PHOTO;
    setField('boatName', existing?.name || '');
    setField('licenceNumber', existing?.licenceNumber || '');
    setField('registrationNumber', existing?.registrationNumber || '');
    setField('boatType', existing?.boatType || '');
    setField('boatStatus', existing?.status || 'actif');
    setField('ownerName', existing?.ownerName || '');
    setField('ownerPhone', existing?.ownerPhone || '');
    setField('ownerEmail', existing?.ownerEmail || '');
    setField('emergencyContact', existing?.emergencyContact || '');
    setField('zoneSelect', existing?.zone || zone.id);
    populateSlotSelect();
    setField('slotSelect', existing?.slot || chosenSlot);
    setField('lengthInput', existing?.length || '');
    setField('widthInput', existing?.width || '');
    setField('equipmentInput', existing?.equipment || '');
    setField('notesInput', existing?.notes || '');
    if (els.cotisationAJourInput) els.cotisationAJourInput.checked = !!existing?.cotisationAJour;
    if (els.descenteTracteurInput) els.descenteTracteurInput.checked = !!existing?.descenteTracteur;
    if (els.deleteBoatButton) els.deleteBoatButton.style.display = existing ? '' : 'none';
    if (els.duplicateBoatButton) els.duplicateBoatButton.style.display = existing ? '' : 'none';
    els.boatModal.classList.remove('hidden');
    els.boatModal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    if (id === 'boatModal') state.editingId = null;
  }

  function setField(id, value) {
    if (els[id]) els[id].value = value ?? '';
  }

  function handleBoatSubmit(event) {
    event.preventDefault();
    if (!canManage()) return toast('Vous n’avez pas les droits de modification.', 'error');
    const slot = Number(els.slotSelect?.value || 0);
    const zone = findZoneBySlot(slot)?.id || els.zoneSelect?.value || 'haut';
    const data = {
      id: els.boatId?.value || uid(),
      photoData: els.boatPhotoData?.value || '',
      name: safeText(els.boatName?.value),
      licenceNumber: safeText(els.licenceNumber?.value),
      registrationNumber: safeText(els.registrationNumber?.value),
      boatType: safeText(els.boatType?.value),
      status: els.boatStatus?.value || 'actif',
      ownerName: safeText(els.ownerName?.value),
      ownerPhone: safeText(els.ownerPhone?.value),
      ownerEmail: safeText(els.ownerEmail?.value),
      emergencyContact: safeText(els.emergencyContact?.value),
      zone,
      slot,
      length: els.lengthInput?.value || '',
      width: els.widthInput?.value || '',
      equipment: safeText(els.equipmentInput?.value),
      notes: safeText(els.notesInput?.value),
      cotisationAJour: !!els.cotisationAJourInput?.checked,
      descenteTracteur: !!els.descenteTracteurInput?.checked,
      updatedAt: new Date().toISOString()
    };

    const conflict = state.boats.find((b) => b.id !== data.id && Number(b.slot) === slot && b.status !== 'archive');
    if (conflict) return toast(`La place ${slot} est déjà occupée par ${conflict.name || 'un bateau'}.`, 'error');

    const index = state.boats.findIndex((b) => b.id === data.id);
    if (index >= 0) state.boats[index] = data;
    else state.boats.push(data);
    state.selectedSlot = slot;
    saveData(true);
    closeModal('boatModal');
    renderAll();
  }

  function deleteCurrentBoat() {
    const id = els.boatId?.value;
    if (!id) return;
    if (!confirm('Supprimer cette fiche bateau ?')) return;
    state.boats = state.boats.filter((b) => b.id !== id);
    saveData(true);
    closeModal('boatModal');
    renderAll();
  }

  function duplicateCurrentBoat() {
    const id = els.boatId?.value;
    const boat = state.boats.find((b) => b.id === id);
    if (!boat) return;
    const freeSlot = allSlots().find((slot) => !boatForSlot(slot));
    if (!freeSlot) return toast('Aucune place libre pour dupliquer.', 'error');
    const copy = { ...boat, id: uid(), name: `${boat.name || 'Bateau'} copie`, slot: freeSlot, zone: findZoneBySlot(freeSlot).id, updatedAt: new Date().toISOString() };
    state.boats.push(copy);
    saveData(true);
    closeModal('boatModal');
    state.selectedSlot = freeSlot;
    renderAll();
  }

  function resizeImageDataUrl(dataUrl, maxWidth = 520, quality = 0.55) {
    return new Promise((resolve, reject) => {
      if (!dataUrl || !String(dataUrl).startsWith('data:image')) return resolve(dataUrl || '');
      const img = new Image();
      img.onerror = () => reject(new Error('Photo invalide'));
      img.onload = () => {
        const scale = Math.min(1, maxWidth / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });
  }

  function resizeImageFile(file, maxWidth = 520, quality = 0.55) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Lecture photo impossible'));
      reader.onload = async () => {
        try {
          resolve(await resizeImageDataUrl(reader.result, maxWidth, quality));
        } catch (error) {
          reject(error);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  async function compressBoatPhotos(boats, force = false) {
    let changed = false;
    const result = [];
    for (const boat of boats || []) {
      const copy = { ...boat };
      const photo = String(copy.photoData || '');
      if (photo.startsWith('data:image') && (force || photo.length > 90000)) {
        try {
          const compressed = await resizeImageDataUrl(photo, 520, 0.55);
          if (compressed && compressed.length < photo.length) {
            copy.photoData = compressed;
            changed = true;
          }
        } catch (_) {}
      }
      result.push(copy);
    }
    return { boats: result, changed };
  }

  async function compactStatePhotosIfNeeded() {
    const payloadSize = JSON.stringify({ boats: state.boats, profiles: state.profiles }).length;
    const isNetlifyApi = SYNC_ENDPOINT.includes('/.netlify/functions');
    if (!isNetlifyApi && payloadSize < 9000000) return false;
    if (payloadSize < 4500000 && !state.boats.some((b) => String(b.photoData || '').length > 250000)) return false;
    const result = await compressBoatPhotos(state.boats, isNetlifyApi || payloadSize > 4500000);
    if (result.changed) {
      state.boats = result.boats;
      saveLocalData();
      renderAll();
    }
    return result.changed;
  }

  async function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const value = await resizeImageFile(file);
      setField('boatPhotoData', value);
      if (els.boatPhotoPreview) els.boatPhotoPreview.src = value;
      toast('Photo compressée et ajoutée.', 'success');
    } catch (error) {
      toast(error.message || 'Impossible de charger la photo.', 'error');
    } finally {
      event.target.value = '';
    }
  }

  function removePhoto() {
    setField('boatPhotoData', '');
    if (els.boatPhotoPreview) els.boatPhotoPreview.src = PLACEHOLDER_PHOTO;
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ boats: state.boats, profiles: state.profiles }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cnh-emplacements-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }


  function excelEscape(value) {
    const sanitized = sanitizeForCsv(value);
    return String(sanitized ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function excelCell(value, styleId = 'Text') {
    return `<Cell ss:StyleID="${styleId}"><Data ss:Type="String">${excelEscape(value)}</Data></Cell>`;
  }

  function getExportRows() {
    return allSlots().map((slot) => {
      const boat = boatForSlot(slot);
      const zone = findZoneBySlot(slot);
      return {
        emplacement: slot,
        zone: zone?.name || '',
        statut_place: boat ? 'Occupé' : 'Libre',
        nom_bateau: boat?.name || '',
        proprietaire: boat?.ownerName || '',
        telephone: boat?.ownerPhone || '',
        email: boat?.ownerEmail || '',
        licence: boat?.licenceNumber || '',
        immatriculation: boat?.registrationNumber || '',
        type: boat?.boatType || '',
        statut_bateau: boat?.status || '',
        longueur: boat?.length || '',
        largeur: boat?.width || '',
        contact_urgence: boat?.emergencyContact || '',
        equipements: boat?.equipment || '',
        notes: boat?.notes || '',
        cotisation_a_jour: boat ? (boat.cotisationAJour ? 'Oui' : 'Non') : '',
        descente_tracteur: boat ? (boat.descenteTracteur ? 'Oui' : 'Non') : '',
        mise_a_jour: boat?.updatedAt ? new Date(boat.updatedAt).toLocaleString('fr-FR') : ''
      };
    });
  }

  function csvEscape(value) {
    const safe = sanitizeForCsv(value);
    const text = String(safe ?? '').replace(/\r?\n|\r/g, ' ').trim();
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportGoogleSheets() {
    const headers = [
      'Emplacement', 'Zone', 'Statut place', 'Nom bateau', 'Propriétaire', 'Téléphone', 'Email',
      'Licence', 'Immatriculation', 'Type', 'Statut bateau', 'Longueur', 'Largeur',
      'Contact urgence', 'Équipements', 'Notes', 'Cotisation à jour', 'Descente tracteur', 'Mise à jour'
    ];
    const keys = ['emplacement','zone','statut_place','nom_bateau','proprietaire','telephone','email','licence','immatriculation','type','statut_bateau','longueur','largeur','contact_urgence','equipements','notes','cotisation_a_jour','descente_tracteur','mise_a_jour'];
    const rows = getExportRows();
    // CSV UTF-8 avec séparateur virgule : import direct dans Google Sheets.
    const csv = [
      headers.map(csvEscape).join(','),
      ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(','))
    ].join('\n');
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cnh-google-sheets-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Fichier CSV compatible Google Sheets généré.', 'success');
  }

  function exportExcel() {
    const generatedAt = new Date().toLocaleString('fr-FR');
    const headers = [
      'Emplacement', 'Zone', 'Statut place', 'Nom bateau', 'Propriétaire', 'Téléphone', 'Email',
      'Licence', 'Immatriculation', 'Type', 'Statut bateau', 'Longueur', 'Largeur',
      'Contact urgence', 'Équipements', 'Notes', 'Cotisation à jour', 'Descente tracteur', 'Mise à jour'
    ];

    const rows = allSlots().map((slot) => {
      const boat = boatForSlot(slot);
      const zone = findZoneBySlot(slot);
      return [
        slot,
        zone?.name || '',
        boat ? 'Occupé' : 'Libre',
        boat?.name || '',
        boat?.ownerName || '',
        boat?.ownerPhone || '',
        boat?.ownerEmail || '',
        boat?.licenceNumber || '',
        boat?.registrationNumber || '',
        boat?.boatType || '',
        boat?.status || '',
        boat?.length || '',
        boat?.width || '',
        boat?.emergencyContact || '',
        boat?.equipment || '',
        boat?.notes || '',
        boat ? (boat.cotisationAJour ? 'Oui' : 'Non') : '',
        boat ? (boat.descenteTracteur ? 'Oui' : 'Non') : '',
        boat?.updatedAt ? new Date(boat.updatedAt).toLocaleString('fr-FR') : ''
      ];
    });

    const occupied = state.boats.filter((b) => b.status !== 'archive').length;
    const free = allSlots().length - occupied;

    const columnWidths = [80, 120, 95, 150, 160, 120, 190, 120, 130, 130, 110, 80, 80, 180, 220, 260, 110, 120, 150];
    const columnsXml = columnWidths.map((width) => `<Column ss:Width="${width}"/>`).join('');
    const headerXml = headers.map((header) => excelCell(header, 'Header')).join('');
    const rowsXml = rows.map((row) => {
      const style = row[2] === 'Occupé' ? 'Occupied' : 'Free';
      return `<Row ss:AutoFitHeight="1">${row.map((value, index) => excelCell(value, index === 2 ? style : 'Text')).join('')}</Row>`;
    }).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>CNH</Author>
  <Title>Export emplacements CNH</Title>
  <Created>${new Date().toISOString()}</Created>
 </DocumentProperties>
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#10283E"/>
  </Style>
  <Style ss:ID="Title">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="18" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0D2740" ss:Pattern="Solid"/>
  </Style>
  <Style ss:ID="SubTitle">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Color="#61778C"/>
  </Style>
  <Style ss:ID="Header">
   <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/>
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#0D5F8F" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#083D63"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#083D63"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#083D63"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#083D63"/>
   </Borders>
  </Style>
  <Style ss:ID="Text">
   <Alignment ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9E4EC"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9E4EC"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9E4EC"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9E4EC"/>
   </Borders>
  </Style>
  <Style ss:ID="Occupied">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#16633F"/>
   <Interior ss:Color="#E9F7EF" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9DDC8"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9DDC8"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9DDC8"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#B9DDC8"/>
   </Borders>
  </Style>
  <Style ss:ID="Free">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#9B6B1D"/>
   <Interior ss:Color="#FFF1DD" ss:Pattern="Solid"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8C98D"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8C98D"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8C98D"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E8C98D"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="Emplacements CNH">
  <Table ss:ExpandedColumnCount="19" ss:ExpandedRowCount="${rows.length + 5}" x:FullColumns="1" x:FullRows="1">
   ${columnsXml}
   <Row ss:Height="30"><Cell ss:MergeAcross="18" ss:StyleID="Title"><Data ss:Type="String">CNH - Export des emplacements</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="18" ss:StyleID="SubTitle"><Data ss:Type="String">Généré le ${excelEscape(generatedAt)} • Occupés : ${occupied} • Libres : ${free} • Total : ${allSlots().length}</Data></Cell></Row>
   <Row></Row>
   <Row ss:Height="26">${headerXml}</Row>
   ${rowsXml}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
   <FreezePanes/>
   <FrozenNoSplit/>
   <SplitHorizontal>4</SplitHorizontal>
   <TopRowBottomPane>4</TopRowBottomPane>
   <ActivePane>2</ActivePane>
   <ProtectObjects>False</ProtectObjects>
   <ProtectScenarios>False</ProtectScenarios>
  </WorksheetOptions>
  <AutoFilter x:Range="R4C1:R${rows.length + 4}C19" xmlns="urn:schemas-microsoft-com:office:excel"/>
 </Worksheet>
</Workbook>`;

    const blob = new Blob(['\ufeff', xml], { type: 'application/vnd.ms-excel;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cnh-emplacements-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Document Excel généré.', 'success');
  }


  function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const ALLOWED_STATUSES = ['actif','hivernage','maintenance','archive'];
        const ALLOWED_ZONES = ['haut','milieu','bas'];
        const rawBoats = Array.isArray(data.boats) ? data.boats : [];
        const cleanBoats = rawBoats.filter(b=>b&&typeof b==='object').map(b=>{
          const slot = parseInt(b.slot,10);
          if (isNaN(slot)||slot<1||slot>46) return null;
          const status = ALLOWED_STATUSES.includes(b.status)?b.status:'actif';
          const zone = ALLOWED_ZONES.includes(b.zone)?b.zone:'haut';
          const safeStr = (v,max=200)=>String(v??'').slice(0,max);
          const photo = typeof b.photoData==='string'&&b.photoData.startsWith('data:image/')&&b.photoData.length<800000?b.photoData:'';
          return {
            id: safeStr(b.id,100)||uid(),
            slot, zone, status,
            name: safeStr(b.name,100),
            ownerName: safeStr(b.ownerName,100),
            ownerPhone: safeStr(b.ownerPhone,30),
            ownerEmail: safeStr(b.ownerEmail,100),
            licenceNumber: safeStr(b.licenceNumber,50),
            registrationNumber: safeStr(b.registrationNumber,50),
            boatType: safeStr(b.boatType,50),
            length: b.length?String(b.length).slice(0,10):'',
            width: b.width?String(b.width).slice(0,10):'',
            equipment: safeStr(b.equipment,500),
            notes: safeStr(b.notes,2000),
            cotisationAJour: b.cotisationAJour===true,
            descenteTracteur: b.descenteTracteur===true,
            photoData: photo,
            updatedAt: new Date().toISOString()
          };
        }).filter(Boolean);
        state.boats = cleanBoats;
        state.profiles = Array.isArray(data.profiles) ? data.profiles.slice(0,100) : [];
        compactStatePhotosIfNeeded().finally(() => {
          saveData(true);
          renderAll();
          toast(`Import validé : ${cleanBoats.length} bateaux sur ${rawBoats.length}`, 'success');
        });
      } catch (err) {
        console.error(err);
        toast('Fichier JSON invalide ou non conforme.', 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function switchTab(tabId) {
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === tabId));
    document.querySelectorAll('[data-tab-target]').forEach((btn) => btn.classList.toggle('active', btn.dataset.tabTarget === tabId));
    if (els.workspaceTitle) els.workspaceTitle.textContent = tabId === 'fleetTab' ? 'Bateaux' : tabId === 'adminTab' ? 'Administration' : 'Plan aérien';

    // Depuis le menu hamburger mobile, les onglets PC doivent être réellement accessibles.
    // Donc on ferme le plein écran pour Bateaux/Admin, et on le rouvre seulement pour le Plan.
    if (tabId === 'dashboardTab') {
      requestAnimationFrame(ensureAerialPlanVisible);
    } else {
      closePlanFullscreen();
    }
    closeSidebar();
  }

  function openPlanFullscreen() {
    if (!els.planFullscreen || !els.planFullscreenBody || !els.sitePlanMap) return;
    if (els.planFullscreenBody.contains(els.sitePlanMap)) return;
    els.planFullscreenBody.innerHTML = '';
    els.planFullscreenBody.appendChild(els.sitePlanMap);
    els.sitePlanMap.classList.add('site-plan-map--fullscreen');
    els.planFullscreen.classList.remove('hidden');
    els.planFullscreen.setAttribute('aria-hidden', 'false');
    document.body.classList.add('plan-fullscreen-open');
    updatePlanSize();
    requestAnimationFrame(() => {
      els.planFullscreenBody.scrollLeft = 0;
      els.planFullscreenBody.scrollTop = 0;
    });
  }

  function closePlanFullscreen() {
    if (!els.planFullscreen || !els.sitePlanMap) return;
    const section = $('sitePlanSection');
    if (section && !section.contains(els.sitePlanMap)) section.appendChild(els.sitePlanMap);
    els.sitePlanMap.classList.remove('site-plan-map--fullscreen');
    els.planFullscreen.classList.add('hidden');
    els.planFullscreen.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('plan-fullscreen-open');
    updatePlanSize();
  }

  function openSidebar() {
    els.sidebar?.classList.add('is-open');
    els.sidebarBackdrop?.classList.remove('hidden');
    document.body.classList.add('sidebar-open');
  }

  function closeSidebar() {
    els.sidebar?.classList.remove('is-open');
    els.sidebarBackdrop?.classList.add('hidden');
    document.body.classList.remove('sidebar-open');
  }

  function openNewBoatFromCurrentSlot() {
    openBoatModal(null, state.selectedSlot || allSlots().find((slot) => !boatForSlot(slot)) || 1);
  }

  function doMobileRefresh() {
    syncFromRemote(true);
  }

  function closeMobileActionMenu() {
    els.mobileActionMenu?.classList.add('hidden');
    els.fsMenuBtn?.setAttribute('aria-expanded', 'false');
  }

  function toggleMobileActionMenu() {
    const isHidden = els.mobileActionMenu?.classList.contains('hidden');
    els.mobileActionMenu?.classList.toggle('hidden', !isHidden ? true : false);
    els.fsMenuBtn?.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
  }

  async function openPasswordManagerModal() {
    if (!canAdmin()) return toast('Accès administrateur requis.', 'error');
    if (els.readonlyPasswordInput) { els.readonlyPasswordInput.value = ''; els.readonlyPasswordInput.placeholder = 'Nouveau mot de passe (laisser vide = inchangé)'; }
    if (els.managerPasswordInput) { els.managerPasswordInput.value = ''; els.managerPasswordInput.placeholder = 'Nouveau mot de passe'; }
    if (els.adminPasswordInput) { els.adminPasswordInput.value = ''; els.adminPasswordInput.placeholder = 'Nouveau mot de passe'; }
    els.passwordModal?.classList.remove('hidden');
    els.passwordModal?.setAttribute('aria-hidden', 'false');
    toast('Les mots de passe sont hachés et non récupérables : saisis seulement ceux que tu veux réinitialiser.', '');
  }

  function handleFullscreenAction(event) {
    const target = event.target;
    if (!target || !document.body.classList.contains('plan-fullscreen-open')) return;

    const actionEl = target.closest?.('#fsMenuBtn, #fsRefreshBtn, #fsExcelBtn, #fsGoogleSheetsBtn, #fsExportBtn, #fsImportBtn, #fsNewBoatBtn, #fsFleetBtn, #fsPasswordsBtn, #fsAdminBtn, #fsLogoutBtn');
    if (!actionEl) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

    switch (actionEl.id) {
      case 'fsMenuBtn':
        toggleMobileActionMenu();
        break;
      case 'fsRefreshBtn':
        doMobileRefresh();
        break;
      case 'fsExcelBtn':
        exportExcel();
        closeMobileActionMenu();
        break;
      case 'fsGoogleSheetsBtn':
        exportGoogleSheets();
        closeMobileActionMenu();
        break;
      case 'fsExportBtn':
        exportJson();
        closeMobileActionMenu();
        break;
      case 'fsImportBtn':
        els.fsImportInput?.click();
        closeMobileActionMenu();
        break;
      case 'fsNewBoatBtn':
        openNewBoatFromCurrentSlot();
        closeMobileActionMenu();
        break;
      case 'fsFleetBtn':
        switchTab('fleetTab');
        closeMobileActionMenu();
        break;
      case 'fsPasswordsBtn':
        openPasswordManagerModal();
        closeMobileActionMenu();
        break;
      case 'fsAdminBtn':
        switchTab('adminTab');
        closeMobileActionMenu();
        break;
      case 'fsLogoutBtn':
        logout();
        closeMobileActionMenu();
        break;
    }
  }

  function renderProfiles() {
    if (els.profilesNotice) els.profilesNotice.textContent = '';
    if (els.profilesList) els.profilesList.innerHTML = '';
  }

  function bindEvents() {
    els.loginForm?.addEventListener('submit', handleLogin);
    els.logoutButton?.addEventListener('click', logout);
    els.mobileLogoutButton?.addEventListener('click', logout);
    els.planMapViewBtn?.addEventListener('click', () => setPlanView('map'));
    els.planGridViewBtn?.addEventListener('click', () => setPlanView('grid'));
    els.openPlanFullscreenBtn?.addEventListener('click', openPlanFullscreen);
    els.closePlanFullscreenBtn?.addEventListener('click', () => {
      // Sur mobile on arrive bien directement sur le plan, mais on peut le réduire
      // pour récupérer les mêmes fonctions que sur PC.
      closePlanFullscreen();
    });
    els.zoneFocusAllBtn?.addEventListener('click', clearZoneFocus);
    els.zoneFocusGridBtn?.addEventListener('click', () => setPlanView('grid'));
    els.refreshButton?.addEventListener('click', () => syncFromRemote(true));
    els.fsRefreshBtn?.addEventListener('click', doMobileRefresh);
    els.fsExcelBtn?.addEventListener('click', exportExcel);
    els.exportButton?.addEventListener('click', exportJson);
    els.excelExportButton?.addEventListener('click', exportExcel);
    els.googleSheetsExportButton?.addEventListener('click', exportGoogleSheets);
    els.mobileExcelButton?.addEventListener('click', exportExcel);
    els.fsGoogleSheetsBtn?.addEventListener('click', exportGoogleSheets);
    els.fsExportBtn?.addEventListener('click', exportJson);
    els.importInput?.addEventListener('change', importJson);
    els.fsImportInput?.addEventListener('change', importJson);
    els.fsImportBtn?.addEventListener('click', () => els.fsImportInput?.click());
    els.openCreateBoatButton?.addEventListener('click', openNewBoatFromCurrentSlot);
    els.fsNewBoatBtn?.addEventListener('click', openNewBoatFromCurrentSlot);
    els.fsMenuBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMobileActionMenu();
    });
    els.fsFleetBtn?.addEventListener('click', () => switchTab('fleetTab'));
    els.fsAdminBtn?.addEventListener('click', () => switchTab('adminTab'));
    els.fsLogoutBtn?.addEventListener('click', logout);

    // Délégation très robuste pour mobile : certains navigateurs interceptent le clic
    // pendant le scroll/pan du plan. On capte pointerup/touchend/click avant le plan.
    ['click'].forEach((eventName) => {
      document.addEventListener(eventName, handleFullscreenAction, true);
    });
    els.floatingAddButton?.addEventListener('click', () => openBoatModal(null, state.selectedSlot || allSlots().find((slot) => !boatForSlot(slot)) || 1));
    els.searchInput?.addEventListener('input', renderFleet);
    els.zoneFilter?.addEventListener('change', renderFleet);
    els.statusFilter?.addEventListener('change', renderFleet);
    els.cotisationFilter?.addEventListener('change', renderFleet);
    els.tracteurFilter?.addEventListener('change', renderFleet);
    els.sortFilter?.addEventListener('change', renderFleet);
    els.cardModeButton?.addEventListener('click', () => { state.fleetView = 'cards'; renderFleet(); });
    els.compactModeButton?.addEventListener('click', () => { state.fleetView = 'compact'; renderFleet(); });
    els.zoneSelect?.addEventListener('change', populateSlotSelect);
    els.boatForm?.addEventListener('submit', handleBoatSubmit);
    els.deleteBoatButton?.addEventListener('click', deleteCurrentBoat);
    els.duplicateBoatButton?.addEventListener('click', duplicateCurrentBoat);
    els.boatPhotoInput?.addEventListener('change', handlePhoto);
    els.removeBoatPhotoButton?.addEventListener('click', removePhoto);
    els.sidebarToggle?.addEventListener('click', openSidebar);
    els.sidebarClose?.addEventListener('click', closeSidebar);
    els.sidebarBackdrop?.addEventListener('click', closeSidebar);
    els.openPasswordModalButton?.addEventListener('click', openPasswordManagerModal);
    els.fsPasswordsBtn?.addEventListener('click', openPasswordManagerModal);
    els.passwordForm?.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!canAdmin()) return toast('Accès administrateur requis.', 'error');
      const readonlyPassword = safeText(els.readonlyPasswordInput?.value);
      const managerPassword = safeText(els.managerPasswordInput?.value);
      const adminPassword = safeText(els.adminPasswordInput?.value);
      if (readonlyPassword && readonlyPassword.length < 3) return toast('Mot de passe consultation trop court.', 'error');
      if (managerPassword && managerPassword.length < 3) return toast('Mot de passe modification trop court.', 'error');
      if (adminPassword && adminPassword.length < 4) return toast('Mot de passe administration trop court.', 'error');
      try {
        const res = await fetch(AUTH_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            action: 'update-passwords',
            token: state.authToken,
            passwords: { readonly: readonlyPassword, manager: managerPassword, admin: adminPassword }
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.ok) throw new Error(data.error || 'Erreur');
        if (data.passwords) {
          if (els.readonlyPasswordInput) els.readonlyPasswordInput.value = data.passwords.readonly || '';
          if (els.managerPasswordInput) els.managerPasswordInput.value = data.passwords.manager || '';
          if (els.adminPasswordInput) els.adminPasswordInput.value = data.passwords.admin || '';
        }
        closeModal('passwordModal');
        toast('Les mots de passe ont été mis à jour.', 'success');
      } catch (error) {
        toast(error.message || 'Impossible de modifier les mots de passe.', 'error');
      }
    });
    document.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', () => closeModal(btn.dataset.closeModal)));
    document.querySelectorAll('[data-tab-target]').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tabTarget)));
    document.addEventListener('click', (event) => {
      if (!els.mobileActionMenu || els.mobileActionMenu.classList.contains('hidden')) return;
      if (event.target.closest('#mobileActionMenu') || event.target.closest('#fsMenuBtn')) return;
      closeMobileActionMenu();
    });
    window.addEventListener('resize', () => requestAnimationFrame(updatePlanSize));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeModal('boatModal');
        closeModal('passwordModal');
        closeSidebar();
        closeMobileActionMenu();
      }
    });
  }


  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // La PWA reste utilisable même si le service worker ne s'installe pas.
      });
    });
  }

  async function init() {
    cacheElements();
    await loadData();
    bindEvents();
    applyRoleVisibility();
    renderAll();
    const savedAuth = localStorage.getItem(AUTH_KEY);
    if (savedAuth) {
      try {
        const parsed = JSON.parse(savedAuth);
        const token = parsed.token || null;
        if (!token) throw new Error('no token');
        state.authToken = token;
        // Validation serveur du token avant d'afficher l'app (F6)
        fetch(AUTH_ENDPOINT, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'validate', token })
        }).then(r=>r.json()).then(data=>{
          if (data && data.ok && data.user) {
            showApp(data.user);
          } else {
            try { localStorage.removeItem(AUTH_KEY); localStorage.removeItem(STORAGE_KEY); } catch(_){}
            showAuth();
          }
        }).catch(()=>{
          // Si offline, on tente quand même avec le cache local mais on vérifiera au prochain sync
          showApp(parsed.user || { name: 'Consultation CNH', role: 'lecture' });
        });
      } catch (_) {
        try { localStorage.removeItem(AUTH_KEY); } catch(_){}
        showAuth();
      }
    } else showAuth();
    registerServiceWorker();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
