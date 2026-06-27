(() => {
  'use strict';

  const STORAGE_KEY = 'cnh-marina-manager-data-v5';
  const AUTH_KEY = 'cnh-marina-manager-auth-v5';
  const DEFAULT_PASSWORD = 'CNH2026';
  const SYNC_ENDPOINT = '/.netlify/functions/data';
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
    selectedSlot: null,
    currentUser: null,
    planView: 'map',
    editingId: null,
    remoteMode: false
  };

  const els = {};

  function cacheElements() {
    [
      'authView', 'appView', 'loginForm', 'loginPassword', 'modeBadge', 'logoutButton', 'userDisplayName', 'userDisplayRole', 'syncPill',
      'sitePlanSection', 'sitePlanMap', 'zonesBoard', 'zoneFocusBar', 'zoneFocusTitle', 'zoneFocusMeta', 'zoneFocusAllBtn', 'zoneFocusGridBtn',
      'planMapViewBtn', 'planGridViewBtn', 'openPlanFullscreenBtn', 'planFullscreen', 'planFullscreenBody', 'closePlanFullscreenBtn',
      'statTotalSpots', 'statOccupied', 'statFree', 'statComplete', 'sidebarZoneStats', 'toastContainer',
      'refreshButton', 'exportButton', 'importInput', 'openCreateBoatButton', 'floatingAddButton', 'boatGrid', 'searchInput', 'zoneFilter', 'statusFilter',
      'boatModal', 'boatForm', 'boatId', 'boatPhotoData', 'boatPhotoPreview', 'boatPhotoInput', 'removeBoatPhotoButton', 'boatModalTitle',
      'boatName', 'licenceNumber', 'registrationNumber', 'boatType', 'boatStatus', 'ownerName', 'ownerPhone', 'ownerEmail', 'emergencyContact',
      'zoneSelect', 'slotSelect', 'lengthInput', 'widthInput', 'equipmentInput', 'notesInput', 'duplicateBoatButton', 'deleteBoatButton',
      'passwordModal', 'passwordForm', 'newPassword', 'confirmPassword', 'openPasswordModalButton', 'accountCardName', 'accountCardEmail', 'accountRoleChip', 'accountPasswordChip',
      'workspaceTitle', 'workspaceSubtitle', 'fsMenuBtn', 'fsRefreshBtn', 'fsExportBtn', 'fsImportBtn', 'fsImportInput', 'fsNewBoatBtn', 'sidebar', 'sidebarBackdrop', 'sidebarToggle', 'sidebarClose', 'cardModeButton', 'compactModeButton',
      'profilesNotice', 'profilesList'
    ].forEach((id) => { els[id] = $(id); });
  }

  const allSlots = () => zones.flatMap((z) => z.slots);
  const findZoneBySlot = (slot) => zones.find((z) => z.slots.includes(Number(slot)));
  const boatForSlot = (slot) => state.boats.find((boat) => Number(boat.slot) === Number(slot) && boat.status !== 'archive');
  const canManage = () => !state.currentUser || state.currentUser.role !== 'lecture';
  const safeText = (value) => String(value ?? '').trim();
  const uid = () => (crypto?.randomUUID ? crypto.randomUUID() : `boat-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  function isLocalPreview() {
    return ['localhost', '127.0.0.1', ''].includes(window.location.hostname);
  }

  async function fetchRemoteData() {
    try {
      const res = await fetch(SYNC_ENDPOINT, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
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

  function saveLocalData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ boats: state.boats, profiles: state.profiles }, null, 2));
    } catch (error) {
      toast('Impossible d’enregistrer localement : stockage plein ou désactivé.', 'error');
    }
  }

  async function pushRemoteData(showToast = false) {
    if (isLocalPreview()) return false;
    try {
      const res = await fetch(SYNC_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ boats: state.boats, profiles: state.profiles })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      state.remoteMode = true;
      if (showToast) toast('Données synchronisées entre les appareils.', 'success');
      updateSyncPill();
      return true;
    } catch (error) {
      state.remoteMode = false;
      if (showToast) toast('Sauvegarde locale OK, mais synchronisation Netlify indisponible.', 'error');
      updateSyncPill();
      return false;
    }
  }

  function saveData(showToast = false) {
    saveLocalData();
    if (!isLocalPreview()) {
      pushRemoteData(showToast);
    } else if (showToast) {
      toast('Données enregistrées localement.', 'success');
    }
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
    if (showToast) toast('Données récupérées depuis Netlify.', 'success');
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

  function showApp() {
    els.authView?.classList.add('hidden');
    els.appView?.classList.remove('hidden');
    document.body.classList.add('plan-only-mode');
    localStorage.setItem(AUTH_KEY, JSON.stringify({ logged: true, at: Date.now() }));
    state.currentUser = state.currentUser || { name: 'CNH', role: 'admin' };
    applyRoleVisibility();
    renderAll();
    requestAnimationFrame(() => ensureAerialPlanVisible());
  }

  function showAuth() {
    els.authView?.classList.remove('hidden');
    els.appView?.classList.add('hidden');
    document.body.classList.remove('plan-only-mode', 'plan-fullscreen-open');
    localStorage.removeItem(AUTH_KEY);
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

  function handleLogin(event) {
    event.preventDefault();
    const password = els.loginPassword?.value || '';
    if (password && password !== DEFAULT_PASSWORD) {
      toast('Mot de passe incorrect. Mot de passe par défaut : CNH2026', 'error');
      return;
    }
    showApp();
  }

  function logout() {
    showAuth();
  }

  function applyRoleVisibility() {
    const manage = canManage();
    document.querySelectorAll('.manage-only').forEach((el) => el.classList.toggle('hidden-by-role', !manage));
    document.querySelectorAll('.admin-only').forEach((el) => el.classList.toggle('hidden-by-role', false));
    if (els.userDisplayName) els.userDisplayName.textContent = state.currentUser?.name || 'CNH';
    if (els.userDisplayRole) els.userDisplayRole.textContent = 'Administrateur local';
    updateSyncPill();
    if (els.modeBadge) els.modeBadge.textContent = 'Mode local compatible Live Server et Netlify.';
    if (els.accountCardName) els.accountCardName.textContent = 'CNH';
    if (els.accountCardEmail) els.accountCardEmail.textContent = 'Compte local';
    if (els.accountRoleChip) els.accountRoleChip.textContent = 'Admin';
    if (els.accountPasswordChip) els.accountPasswordChip.textContent = 'Local';
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
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'plan-slot' + (boat ? ' is-occupied' : ' plan-slot-free') + (selected === Number(slot) ? ' is-selected' : '') + (boat?.photoData ? ' has-photo' : '') + (boat?.status ? ` status-${boat.status}` : '');
    button.title = boat ? `${slot} • ${boat.name || 'Bateau'} • ${boat.ownerName || ''}` : `${slot} • libre`;
    button.dataset.slot = slot;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      selectSlot(slot);
    });

    if (boat?.photoData) {
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
    const boats = state.boats.filter((boat) => {
      const haystack = [boat.name, boat.ownerName, boat.ownerPhone, boat.ownerEmail, boat.licenceNumber, boat.registrationNumber, boat.boatType, boat.notes].join(' ').toLowerCase();
      return (!query || haystack.includes(query)) && (zoneFilter === 'all' || boat.zone === zoneFilter) && (statusFilter === 'all' || boat.status === statusFilter);
    });
    els.boatGrid.innerHTML = '';
    if (!boats.length) {
      els.boatGrid.innerHTML = '<div class="inline-notice">Aucune fiche bateau pour le moment. Cliquez sur un emplacement libre du plan pour créer une fiche.</div>';
      return;
    }
    boats.forEach((boat) => {
      const card = document.createElement('article');
      card.className = 'boat-card';
      card.innerHTML = `
        <div class="boat-card-top">
          <img class="boat-card-photo" src="${boat.photoData || PLACEHOLDER_PHOTO}" alt="${escapeHtml(boat.name || 'Bateau')}">
          <div>
            <span class="status-pill status-${boat.status || 'actif'}">${boat.status || 'actif'}</span>
            <h4>${escapeHtml(boat.name || 'Sans nom')}</h4>
            <p class="boat-card-meta">Place ${boat.slot || '—'} • ${escapeHtml(boat.ownerName || 'Propriétaire non renseigné')}</p>
          </div>
        </div>
        <div class="card-actions">
          <button type="button" class="secondary-button" data-action="locate">Localiser</button>
          <button type="button" class="primary-button" data-action="edit">Ouvrir</button>
        </div>`;
      card.querySelector('[data-action="locate"]').addEventListener('click', () => {
        state.selectedSlot = Number(boat.slot);
        setPlanView('map');
        renderPlan();
        switchTab('dashboardTab');
        ensureAerialPlanVisible();
      });
      card.querySelector('[data-action="edit"]').addEventListener('click', () => openBoatModal(boat.id));
      els.boatGrid.appendChild(card);
    });
  }

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value ?? '';
    return div.innerHTML;
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

  function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const value = reader.result;
      setField('boatPhotoData', value);
      if (els.boatPhotoPreview) els.boatPhotoPreview.src = value;
    };
    reader.readAsDataURL(file);
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

  function importJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        state.boats = Array.isArray(data.boats) ? data.boats : [];
        state.profiles = Array.isArray(data.profiles) ? data.profiles : [];
        saveData(true);
        renderAll();
      } catch (_) {
        toast('Fichier JSON invalide.', 'error');
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

  function handleFullscreenAction(event) {
    const target = event.target;
    if (!target || !document.body.classList.contains('plan-fullscreen-open')) return;

    const actionEl = target.closest?.('#fsMenuBtn, #fsRefreshBtn, #fsExportBtn, #fsImportBtn, #fsNewBoatBtn');
    if (!actionEl) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

    switch (actionEl.id) {
      case 'fsMenuBtn':
        openSidebar();
        break;
      case 'fsRefreshBtn':
        doMobileRefresh();
        break;
      case 'fsExportBtn':
        exportJson();
        break;
      case 'fsImportBtn':
        els.fsImportInput?.click();
        break;
      case 'fsNewBoatBtn':
        openNewBoatFromCurrentSlot();
        break;
    }
  }

  function renderProfiles() {
    if (els.profilesNotice) els.profilesNotice.textContent = 'Gestion locale : les fiches et exports/imports restent disponibles.';
    if (els.profilesList) els.profilesList.innerHTML = '<div class="mini-card"><strong>CNH</strong><span>Administrateur local</span></div>';
  }

  function bindEvents() {
    els.loginForm?.addEventListener('submit', handleLogin);
    els.logoutButton?.addEventListener('click', logout);
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
    els.exportButton?.addEventListener('click', exportJson);
    els.fsExportBtn?.addEventListener('click', exportJson);
    els.importInput?.addEventListener('change', importJson);
    els.fsImportInput?.addEventListener('change', importJson);
    els.fsImportBtn?.addEventListener('click', () => els.fsImportInput?.click());
    els.openCreateBoatButton?.addEventListener('click', openNewBoatFromCurrentSlot);
    els.fsNewBoatBtn?.addEventListener('click', openNewBoatFromCurrentSlot);
    els.fsMenuBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openSidebar();
    });

    // Délégation très robuste pour mobile : certains navigateurs interceptent le clic
    // pendant le scroll/pan du plan. On capte pointerup/touchend/click avant le plan.
    ['pointerup', 'touchend', 'click'].forEach((eventName) => {
      document.addEventListener(eventName, handleFullscreenAction, true);
    });
    els.floatingAddButton?.addEventListener('click', () => openBoatModal(null, state.selectedSlot || allSlots().find((slot) => !boatForSlot(slot)) || 1));
    els.searchInput?.addEventListener('input', renderFleet);
    els.zoneFilter?.addEventListener('change', renderFleet);
    els.statusFilter?.addEventListener('change', renderFleet);
    els.zoneSelect?.addEventListener('change', populateSlotSelect);
    els.boatForm?.addEventListener('submit', handleBoatSubmit);
    els.deleteBoatButton?.addEventListener('click', deleteCurrentBoat);
    els.duplicateBoatButton?.addEventListener('click', duplicateCurrentBoat);
    els.boatPhotoInput?.addEventListener('change', handlePhoto);
    els.removeBoatPhotoButton?.addEventListener('click', removePhoto);
    els.sidebarToggle?.addEventListener('click', openSidebar);
    els.sidebarClose?.addEventListener('click', closeSidebar);
    els.sidebarBackdrop?.addEventListener('click', closeSidebar);
    els.openPasswordModalButton?.addEventListener('click', () => {
      els.passwordModal?.classList.remove('hidden');
      els.passwordModal?.setAttribute('aria-hidden', 'false');
    });
    els.passwordForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      if (els.newPassword?.value !== els.confirmPassword?.value) return toast('Les mots de passe ne correspondent pas.', 'error');
      closeModal('passwordModal');
      toast('Mot de passe local validé.', 'success');
    });
    document.querySelectorAll('[data-close-modal]').forEach((btn) => btn.addEventListener('click', () => closeModal(btn.dataset.closeModal)));
    document.querySelectorAll('[data-tab-target]').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tabTarget)));
    window.addEventListener('resize', () => requestAnimationFrame(updatePlanSize));
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeModal('boatModal');
        closeModal('passwordModal');
        closeSidebar();
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
    if (localStorage.getItem(AUTH_KEY)) showApp();
    else showAuth();
    registerServiceWorker();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
