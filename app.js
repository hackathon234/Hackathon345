/* ==========================================================================
   Amani frontend — talks to the Express/PostgreSQL backend over /api.
   Auth token is kept in localStorage so a signed-in session survives reloads.
   ========================================================================== */

const API = '/api';
let state = {
  token: localStorage.getItem('amani_token') || null,
  user: null,
  authMode: 'signin',
  pendingRole: 'user',
  pendingBooking: null,   // { kind: 'session'|'listing', id, price, title }
  chatHistory: [],
  callSocket: null,
};

const ROLE_LABELS = {
  user: 'Normal user', professional: 'Professional', volunteer: 'Professional volunteer',
  mentor: 'Mentor', organizer: 'Organizer', partner: 'Partner'
};
const HOST_ROLES = ['professional', 'volunteer', 'mentor'];

/* ---------------------------------------------------------------- fetch helper */
async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ---------------------------------------------------------------- toast */
function showToast(msg, isError) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.toggle('error', !!isError);
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

/* ---------------------------------------------------------------- modals */
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ---------------------------------------------------------------- quotes */
const QUOTES = [
  '"You don\'t have to carry it all at once."',
  '"Small steps still move you forward."',
  '"Asking for help is a form of strength."',
  '"Today, just be gentle with yourself."'
];
let qi = 0;
setInterval(() => {
  qi = (qi + 1) % QUOTES.length;
  const el = document.getElementById('quoteText');
  if (el) el.textContent = QUOTES[qi];
}, 5000);

/* ---------------------------------------------------------------- landing previews */
function priceTag(price) {
  const p = Number(price) || 0;
  return p > 0 ? `<span class="pill paid">Paid · KES ${p}</span>` : `<span class="pill free">Free</span>`;
}

async function loadLandingPreviews() {
  try {
    const { listings } = await api('/listings/preview', { auth: false });
    document.getElementById('landingEvents').innerHTML = listings.length
      ? listings.map(e => `
        <div class="card locked">
          <div class="tag-row">${priceTag(e.price)}<span class="meta">${e.event_date}</span></div>
          <h3>${e.title}</h3>
          <div class="meta">${e.county}</div>
          <div class="desc">Sign in to see the full venue and reserve a spot.</div>
          <div class="lock-veil"><strong>🔒</strong><span>Sign in to see venue & reserve a spot</span></div>
        </div>`).join('')
      : `<p class="empty-note">No upcoming events yet — check back soon.</p>`;
  } catch (e) {
    document.getElementById('landingEvents').innerHTML = `<p class="empty-note">Couldn't load events right now.</p>`;
  }

  try {
    const { sessions } = await api('/sessions', { auth: false });
    document.getElementById('landingSessions').innerHTML = sessions.slice(0, 3).map(s => `
      <div class="card locked">
        <div class="tag-row">${priceTag(s.price)}</div>
        <h3>${s.title}</h3>
        <div class="meta">Hosted by ${s.host_name}</div>
        <div class="desc">${s.kind === 'professional' ? 'Licensed professional session.' : 'Community-led support session.'}</div>
        <div class="lock-veil"><strong>🔒</strong><span>Sign in to book this session</span></div>
      </div>`).join('') || `<p class="empty-note">No sessions published yet.</p>`;
  } catch (e) {
    document.getElementById('landingSessions').innerHTML = `<p class="empty-note">Couldn't load sessions right now.</p>`;
  }
}

/* ---------------------------------------------------------------- auth */
const ROLE_OPTS = [
  ['user', 'Normal user'], ['professional', 'Professional'], ['volunteer', 'Prof. volunteer'],
  ['mentor', 'Mentor'], ['organizer', 'Organizer'], ['partner', 'Partner']
];
function renderRolePicker() {
  document.getElementById('rolePicker').innerHTML = ROLE_OPTS.map(([val, label]) =>
    `<button type="button" class="role-opt ${state.pendingRole === val ? 'active' : ''}" onclick="pickRole('${val}')">${label}</button>`
  ).join('');
}
function pickRole(val) { state.pendingRole = val; renderRolePicker(); }

function openAuth(mode, role) {
  state.authMode = mode;
  if (role) state.pendingRole = role;
  renderRolePicker();
  const isSignup = mode === 'signup';
  document.getElementById('authTitle').textContent = isSignup ? 'Create your account' : 'Welcome back';
  document.getElementById('authSub').textContent = isSignup ? 'Tell us a little about you to get started.' : 'Sign in to access sessions, events and gatherings.';
  document.getElementById('signupRoleBlock').style.display = isSignup ? 'block' : 'none';
  document.getElementById('nameField').style.display = isSignup ? 'block' : 'none';
  document.getElementById('authSubmitBtn').textContent = isSignup ? 'Create account' : 'Sign in';
  document.getElementById('authSwitchPrompt').textContent = isSignup ? 'Already have an account?' : 'New to Amani?';
  document.getElementById('authSwitchLink').textContent = isSignup ? 'Sign in' : 'Create an account';
  document.getElementById('authError').style.display = 'none';
  openModal('authModal');
}
function switchAuthMode(e) { e.preventDefault(); openAuth(state.authMode === 'signup' ? 'signin' : 'signup'); }

async function submitAuth() {
  const name = document.getElementById('authName').value.trim();
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPass').value;
  const errEl = document.getElementById('authError');
  errEl.style.display = 'none';

  if (!email || !password) { errEl.textContent = 'Email and password are required.'; errEl.style.display = 'block'; return; }

  try {
    let data;
    if (state.authMode === 'signup') {
      if (!name) { errEl.textContent = 'Please enter your name.'; errEl.style.display = 'block'; return; }
      data = await api('/auth/register', { method: 'POST', auth: false, body: { name, email, password, role: state.pendingRole } });
    } else {
      data = await api('/auth/login', { method: 'POST', auth: false, body: { email, password } });
    }
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('amani_token', state.token);
    closeModal('authModal');
    await enterDashboard();
    if (state.authMode === 'signup') setTimeout(openProfileModal, 350);
    else showToast(`Welcome back, ${state.user.name.split(' ')[0]}`);
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

function signOut() {
  state.token = null; state.user = null;
  localStorage.removeItem('amani_token');
  if (state.callSocket) { state.callSocket.disconnect(); state.callSocket = null; }
  document.getElementById('view-dashboard').style.display = 'none';
  document.getElementById('view-landing').style.display = 'block';
  window.scrollTo({ top: 0 });
}

/* ---------------------------------------------------------------- profile */
function openProfileModal() {
  document.getElementById('pName').value = state.user.name || '';
  if (state.user.county) document.getElementById('pCounty').value = state.user.county;
  if (state.user.sub_county) document.getElementById('pSub').value = state.user.sub_county;
  openModal('profileModal');
}
async function saveProfile() {
  try {
    const { user } = await api('/profile/me', {
      method: 'PUT',
      body: {
        name: document.getElementById('pName').value,
        bio: document.getElementById('pBio').value,
        county: document.getElementById('pCounty').value,
        sub_county: document.getElementById('pSub').value,
        constituency: document.getElementById('pSub').value,
      }
    });
    state.user = user;
    closeModal('profileModal');
    renderDashHeader();
    showToast('Profile saved');
  } catch (e) {
    showToast(e.message, true);
  }
}

/* ---------------------------------------------------------------- dashboard shell */
const TABS_BY_ROLE = {
  user: [['overview', 'Overview'], ['sessions', 'Book sessions'], ['events', 'Events'], ['gatherings', 'Gatherings'], ['calls', 'Live calls']],
  professional: [['overview', 'Overview'], ['mysessions', 'My sessions'], ['bookings', 'Bookings'], ['earnings', 'Payouts']],
  volunteer: [['overview', 'Overview'], ['mysessions', 'My sessions'], ['bookings', 'Bookings']],
  mentor: [['overview', 'Overview'], ['mysessions', 'My sessions'], ['bookings', 'Mentees']],
  organizer: [['overview', 'Overview'], ['listings', 'My listings']],
  partner: [['overview', 'Overview'], ['listings', 'My listings']],
};

async function enterDashboard() {
  document.getElementById('view-landing').style.display = 'none';
  document.getElementById('view-dashboard').style.display = 'block';
  window.scrollTo({ top: 0 });
  renderDashHeader();
  renderDashTabs();
  connectCallSocket();
}
function renderDashHeader() {
  document.getElementById('dashAvatar').textContent = (state.user.name || '?').charAt(0).toUpperCase();
  document.getElementById('dashName').textContent = state.user.name;
  document.getElementById('dashRole').textContent = ROLE_LABELS[state.user.role] + (state.user.county ? ` · ${state.user.county}, ${state.user.sub_county || ''}` : '');
}
let activeTab = null;
function renderDashTabs() {
  const tabs = TABS_BY_ROLE[state.user.role];
  activeTab = tabs[0][0];
  document.getElementById('dashTabs').innerHTML = tabs.map(([key, label]) =>
    `<button class="dash-tab ${key === activeTab ? 'active' : ''}" onclick="switchTab('${key}')" id="tab-${key}">${label}</button>`
  ).join('');
  renderPanels();
}
function switchTab(key) {
  activeTab = key;
  document.querySelectorAll('.dash-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + key).classList.add('active');
  document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
  const p = document.getElementById('panel-' + key);
  if (p) p.classList.add('active');
}

async function renderPanels() {
  const role = state.user.role;
  const panels = document.getElementById('dashPanels');
  panels.innerHTML = `<p class="empty-note">Loading your dashboard…</p>`;

  try {
    if (role === 'user') {
      const [sessionsRes, bookingsRes] = await Promise.all([api('/sessions'), api('/bookings/mine')]);
      panels.innerHTML =
        panelOverviewUser(bookingsRes.bookings) +
        panelBookSessions(sessionsRes.sessions) +
        `<div class="dash-panel" id="panel-events"><div class="section-head"><div><h2 style="font-size:20px;">Events near you</h2><p>Filter by location, constituency, county or sub-county.</p></div></div>
          ${filterBarHTML('events')}<div id="eventsList"><p class="empty-note">Loading…</p></div></div>` +
        `<div class="dash-panel" id="panel-gatherings"><div class="section-head"><div><h2 style="font-size:20px;">Gatherings near you</h2><p>Free community gatherings, filterable by area.</p></div></div>
          ${filterBarHTML('gatherings')}<div id="gatheringsList"><p class="empty-note">Loading…</p></div></div>` +
        panelLiveCalls();
      document.getElementById('panel-overview').classList.add('active');
      loadListings('event', 'eventsList');
      loadListings('gathering', 'gatheringsList');
    } else if (HOST_ROLES.includes(role)) {
      const [mine, bookings] = await Promise.all([api('/sessions/mine'), api('/sessions/mine/bookings')]);
      let earningsHtml = '';
      if (role === 'professional') {
        const bal = await api('/payments/balance');
        earningsHtml = panelEarnings(bal);
      }
      panels.innerHTML = panelOverviewHost(role, mine.sessions, bookings.bookings) + panelMySessions(mine.sessions) + panelBookingsReceived(role, bookings.bookings) + earningsHtml;
      document.getElementById('panel-overview').classList.add('active');
    } else if (role === 'organizer' || role === 'partner') {
      const { listings } = await api('/listings/mine');
      panels.innerHTML = panelOverviewOrg(role, listings) + panelMyListings(listings);
      document.getElementById('panel-overview').classList.add('active');
    }
  } catch (e) {
    panels.innerHTML = `<p class="empty-note">Couldn't load your dashboard: ${e.message}</p>`;
  }
}

/* ---- normal user panels ---- */
function panelOverviewUser(bookings) {
  const upcoming = bookings.filter(b => b.status === 'confirmed').length;
  return `<div class="dash-panel" id="panel-overview">
    <div class="stat-row">
      <div class="stat"><div class="num">${upcoming}</div><div class="label">Confirmed bookings</div></div>
      <div class="stat"><div class="num">${bookings.length}</div><div class="label">Total sessions booked</div></div>
      <div class="stat"><div class="num">0</div><div class="label">Live calls today</div></div>
      <div class="stat"><div class="num" style="font-size:16px;">${state.user.county || '—'}</div><div class="label">Your county</div></div>
    </div>
    <h3 style="font-family:'Inter';font-size:16px;">My bookings</h3>
    ${bookings.length ? bookings.slice(0, 5).map(b => `
      <div class="list-item">
        <div><div class="li-title">${b.session_title}</div><div class="li-meta">${b.host_name} · ${b.status.replace('_', ' ')}</div></div>
        <span class="pill ${b.status === 'confirmed' ? 'free' : 'pending'}">${b.status.replace('_', ' ')}</span>
      </div>`).join('') : `<p class="empty-note">No bookings yet — try "Book sessions" above.</p>`}
  </div>`;
}
function panelBookSessions(sessions) {
  const rows = sessions.map(s => `
    <div class="list-item">
      <div><div class="li-title">${s.title}</div><div class="li-meta">${s.host_name} ${priceTag(s.price)}</div></div>
      <button class="btn btn-primary btn-sm" onclick='startSessionBooking(${JSON.stringify(s)})'>Book</button>
    </div>`).join('');
  return `<div class="dash-panel" id="panel-sessions">
    <div class="section-head"><div><h2 style="font-size:20px;">Book a session</h2><p>Professionals are paid, volunteer & mentor sessions are free.</p></div></div>
    ${rows || '<p class="empty-note">No sessions published yet.</p>'}
  </div>`;
}
function filterBarHTML(kind) {
  return `<div class="filters">
    <select onchange="applyFilter('${kind}')" id="${kind}County"><option value="">All counties</option><option>Nairobi</option><option>Kiambu</option><option>Mombasa</option><option>Kisumu</option><option>Nakuru</option></select>
    <select onchange="applyFilter('${kind}')" id="${kind}Sub"><option value="">All sub-counties</option><option>Westlands</option><option>Ruiru</option><option>Nyali</option><option>Kisumu Central</option><option>Naivasha</option></select>
  </div>`;
}
async function loadListings(type, targetId) {
  try {
    const { listings } = await api(`/listings?type=${type}`);
    renderListingRows(listings, targetId);
  } catch (e) {
    document.getElementById(targetId).innerHTML = `<p class="empty-note">Couldn't load listings.</p>`;
  }
}
function renderListingRows(listings, targetId) {
  document.getElementById(targetId).innerHTML = listings.length ? listings.map(l => `
    <div class="list-item">
      <div><div class="li-title">${l.title}</div><div class="li-meta">${l.county}${l.sub_county ? ' · ' + l.sub_county : ''} · ${l.event_date} ${priceTag(l.price)}</div></div>
      <button class="btn btn-primary btn-sm" onclick='startListingSignup(${JSON.stringify(l)})'>Sign up</button>
    </div>`).join('') : `<p class="empty-note">Nothing matches those filters yet.</p>`;
}
async function applyFilter(kind) {
  const type = kind === 'events' ? 'event' : 'gathering';
  const county = document.getElementById(kind + 'County').value;
  const sub = document.getElementById(kind + 'Sub').value;
  const params = new URLSearchParams({ type });
  if (county) params.set('county', county);
  if (sub) params.set('sub_county', sub);
  try {
    const { listings } = await api(`/listings?${params.toString()}`);
    renderListingRows(listings, kind === 'events' ? 'eventsList' : 'gatheringsList');
  } catch (e) { showToast(e.message, true); }
}
function panelLiveCalls() {
  return `<div class="dash-panel" id="panel-calls">
    <div class="section-head"><div><h2 style="font-size:20px;">Live calls</h2><p>Connect directly with other users, professionals or volunteers.</p></div></div>
    <div class="list-item"><div><div class="li-title">Community drop-in room</div><div class="li-meta" id="callPresence">Connecting…</div></div><button class="btn btn-primary btn-sm" onclick="joinCallRoom('community')">Join call</button></div>
    <div class="list-item"><div><div class="li-title">Start a private call</div><div class="li-meta">Invite a specific user by room code</div></div><button class="btn btn-ghost btn-sm" onclick="joinCallRoom('private-' + Math.random().toString(36).slice(2,7))">Start</button></div>
  </div>`;
}

/* ---- host panels ---- */
function panelOverviewHost(role, sessions, bookings) {
  const confirmed = bookings.filter(b => b.status === 'confirmed').length;
  return `<div class="dash-panel" id="panel-overview">
    <div class="stat-row">
      <div class="stat"><div class="num">${sessions.length}</div><div class="label">Sessions uploaded</div></div>
      <div class="stat"><div class="num">${confirmed}</div><div class="label">Confirmed bookings</div></div>
      <div class="stat"><div class="num" style="font-size:16px;">${role === 'professional' ? 'Paid' : 'Free'}</div><div class="label">Session type</div></div>
      <div class="stat"><div class="num">${bookings.length}</div><div class="label">Total requests</div></div>
    </div>
    <p class="empty-note">Signed in as ${ROLE_LABELS[role]}. Use the tabs above to manage sessions and bookings.</p>
  </div>`;
}
function panelMySessions(sessions) {
  const rows = sessions.length ? sessions.map(s => `
    <div class="list-item"><div><div class="li-title">${s.title}</div><div class="li-meta">${s.duration_minutes} min · ${priceTag(s.price)}</div></div><span class="pill">Published</span></div>`).join('')
    : `<p class="empty-note">You haven't uploaded any sessions yet.</p>`;
  return `<div class="dash-panel" id="panel-mysessions">
    <div class="section-head"><div><h2 style="font-size:20px;">My sessions</h2><p>Sessions you've uploaded for users to book.</p></div>
      <button class="btn btn-accent btn-sm" onclick="openModal('uploadSessionModal')">+ Upload session</button></div>
    ${rows}
  </div>`;
}
function panelBookingsReceived(role, bookings) {
  const rows = bookings.length ? bookings.map(b => `
    <div class="list-item"><div><div class="li-title">${b.booked_by}</div><div class="li-meta">${b.session_title} · ${b.status.replace('_', ' ')}</div></div><span class="pill ${b.status === 'confirmed' ? 'free' : 'pending'}">${b.status.replace('_', ' ')}</span></div>`).join('')
    : `<p class="empty-note">No bookings received yet.</p>`;
  return `<div class="dash-panel" id="panel-bookings">
    <div class="section-head"><div><h2 style="font-size:20px;">${role === 'mentor' ? 'Mentees' : 'Bookings received'}</h2></div></div>
    ${rows}
  </div>`;
}
function panelEarnings(bal) {
  return `<div class="dash-panel" id="panel-earnings">
    <div class="section-head"><div><h2 style="font-size:20px;">Payouts</h2><p>Get paid for hosted sessions.</p></div></div>
    <div class="list-item"><div><div class="li-title">Available balance</div><div class="li-meta">Earned KES ${bal.earned} · Paid out KES ${bal.paid_out}</div></div>
      <button class="btn btn-primary btn-sm" onclick="requestPayout()">Request payout (KES ${bal.available})</button></div>
  </div>`;
}
async function requestPayout() {
  try {
    await api('/payments/payout', { method: 'POST' });
    showToast('Payout requested');
    renderPanels();
  } catch (e) { showToast(e.message, true); }
}

/* ---- organizer / partner panels ---- */
function panelOverviewOrg(role, listings) {
  return `<div class="dash-panel" id="panel-overview">
    <div class="stat-row">
      <div class="stat"><div class="num">${listings.length}</div><div class="label">Listings published</div></div>
      <div class="stat"><div class="num">${listings.filter(l => l.type === 'event').length}</div><div class="label">Paid events</div></div>
      <div class="stat"><div class="num">${listings.filter(l => l.type === 'gathering').length}</div><div class="label">Free gatherings</div></div>
      <div class="stat"><div class="num" style="font-size:16px;">${role === 'partner' ? 'Partner' : 'Organizer'}</div><div class="label">Listing type</div></div>
    </div>
  </div>`;
}
function panelMyListings(listings) {
  const rows = listings.length ? listings.map(l => `
    <div class="list-item"><div><div class="li-title">${l.title}</div><div class="li-meta">${l.county} · ${l.event_date} · ${l.type === 'event' ? 'Paid event' : 'Free gathering'}</div></div><span class="pill">Live</span></div>`).join('')
    : `<p class="empty-note">No listings yet — publish your first event or gathering.</p>`;
  return `<div class="dash-panel" id="panel-listings">
    <div class="section-head"><div><h2 style="font-size:20px;">My listings</h2><p>Events and gatherings you've added to Amani.</p></div>
      <button class="btn btn-accent btn-sm" onclick="openModal('addEventModal')">+ Add listing</button></div>
    ${rows}
  </div>`;
}
async function publishListing() {
  const title = document.getElementById('neTitle').value.trim();
  const event_date = document.getElementById('neDate').value;
  if (!title || !event_date) { showToast('Title and date are required', true); return; }
  try {
    await api('/listings', {
      method: 'POST',
      body: {
        type: document.getElementById('neType').value,
        title,
        county: document.getElementById('neCounty').value,
        event_date,
        price: Number(document.getElementById('nePrice').value) || 0,
      }
    });
    closeModal('addEventModal');
    document.getElementById('neTitle').value = '';
    showToast('Listing published');
    renderPanels();
  } catch (e) { showToast(e.message, true); }
}

/* ---- upload session ---- */
async function publishSession() {
  const title = document.getElementById('usTitle').value.trim();
  if (!title) { showToast('Please add a title', true); return; }
  try {
    await api('/sessions', {
      method: 'POST',
      body: {
        title,
        duration_minutes: Number(document.getElementById('usDuration').value) || 45,
        price: Number(document.getElementById('usPrice').value) || 0,
      }
    });
    closeModal('uploadSessionModal');
    document.getElementById('usTitle').value = '';
    showToast('Session published');
    renderPanels();
  } catch (e) { showToast(e.message, true); }
}

/* ---- booking + payment ---- */
function startSessionBooking(session) {
  state.pendingBooking = { kind: 'session', id: session.id, price: Number(session.price) || 0, title: session.title };
  openBookingModal(state.pendingBooking);
}
function startListingSignup(listing) {
  state.pendingBooking = { kind: 'listing', id: listing.id, price: Number(listing.price) || 0, title: listing.title };
  openBookingModal(state.pendingBooking);
}
function openBookingModal(b) {
  document.getElementById('bookTitle').textContent = b.title;
  document.getElementById('bookSub').textContent = b.price > 0
    ? 'This is paid. Complete payment to confirm your spot.'
    : 'This is free — confirm to reserve your spot.';
  document.getElementById('paymentBlock').style.display = b.price > 0 ? 'block' : 'none';
  document.getElementById('bookAmount').value = b.price > 0 ? `KES ${b.price}` : 'Free';
  openModal('bookingModal');
}
async function confirmBooking() {
  const b = state.pendingBooking;
  try {
    let payment;
    if (b.kind === 'session') {
      const res = await api('/bookings', { method: 'POST', body: { session_id: b.id } });
      payment = res.payment;
    } else {
      const res = await api(`/listings/${b.id}/signup`, { method: 'POST' });
      payment = res.payment;
    }
    if (payment) {
      // Simulate the payment provider confirming the charge
      await api('/payments/confirm', { method: 'POST', body: { payment_id: payment.id } });
    }
    closeModal('bookingModal');
    showToast(b.price > 0 ? `Payment received — ${b.title} confirmed` : `${b.title} confirmed`);
    renderPanels();
  } catch (e) {
    showToast(e.message, true);
  }
}

/* ---------------------------------------------------------------- live calls (Socket.IO signaling) */
function connectCallSocket() {
  if (typeof io === 'undefined') return;
  state.callSocket = io();
  state.callSocket.on('call:peer-joined', () => updatePresence());
  state.callSocket.on('call:peer-left', () => updatePresence());
}
function updatePresence() {
  const el = document.getElementById('callPresence');
  if (el) el.textContent = 'Someone just joined or left the room';
}
function joinCallRoom(roomId) {
  if (!state.callSocket) { showToast('Connecting…'); return; }
  state.callSocket.emit('call:join', { roomId, name: state.user.name });
  showToast(`Joined call room "${roomId}" (signaling only — connect a WebRTC/SFU client to exchange audio & video)`);
}

/* ---------------------------------------------------------------- chatbot */
function toggleChat(force) {
  const panel = document.getElementById('chatPanel');
  const open = force === undefined ? !panel.classList.contains('open') : force;
  panel.classList.toggle('open', open);
  if (open && !panel.dataset.inited) {
    panel.dataset.inited = '1';
    appendMsg('bot', "Hi, I'm the Amani assistant. I'm here any time, on any page. What's on your mind today?");
  }
}
function appendMsg(role, text) {
  const body = document.getElementById('chatBody');
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = text;
  body.appendChild(div);
  body.scrollTop = body.scrollHeight;
  return div;
}
async function sendChat() {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;
  appendMsg('user', text);
  input.value = '';
  const typingEl = appendMsg('bot typing', 'Thinking…');

  try {
    const data = await api('/chat', { method: 'POST', body: { message: text, history: state.chatHistory }, auth: !!state.token });
    typingEl.remove();
    appendMsg('bot', data.reply);
    state.chatHistory.push({ role: 'user', content: text }, { role: 'assistant', content: data.reply });
  } catch (e) {
    typingEl.remove();
    appendMsg('bot', "I'm having trouble connecting right now — please try again in a moment.");
  }
}

/* ---------------------------------------------------------------- boot */
async function boot() {
  loadLandingPreviews();
  if (state.token) {
    try {
      const { user } = await api('/profile/me');
      state.user = user;
      await enterDashboard();
    } catch (e) {
      localStorage.removeItem('amani_token');
      state.token = null;
    }
  }
}
boot();
