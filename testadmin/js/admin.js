// ============================================================
// admin.js
// Admin dashboard logic:
//   - Login / logout with preset credentials
//   - Load all active posts (lost/found, complaints, recommendations)
//   - Admin can resolve any post
//   - Admin can soft-delete (archive) any post
//   - Admin can restore archived posts or permanently delete them
// ============================================================

import { db } from "./firebase-config.js"
import { initTabs, esc, formatDate } from "./utils.js"
import {
  collection, getDocs, doc, updateDoc, deleteDoc,
  addDoc, query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"

// ── CREDENTIALS ───────────────────────────────────────────────
const ADMIN_USER = "admin"
const ADMIN_PASS = "password123"

// ── SHOW/HIDE PASSWORD ───────────────────────────────────────
window.togglePassVis = function () {
  const input = document.getElementById('admin-pass')
  const btn = document.getElementById('pass-eye')
  if (!input) return
  if (input.type === 'password') { input.type = 'text'; btn.textContent = '─' }
  else { input.type = 'password'; btn.textContent = '👁️' }
}

// ── LOGIN / LOGOUT ────────────────────────────────────────────
window.doLogin = function () {
  const user = document.getElementById('admin-user').value.trim()
  const pass = document.getElementById('admin-pass').value

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    sessionStorage.setItem('adminAuth', '1')
    showDashboard()
  } else {
    const msg = document.getElementById('login-msg')
    msg.textContent = '❌ Incorrect username or password.'
    msg.style.color = '#c0392b'
    document.getElementById('admin-pass').value = ''
    setTimeout(() => { msg.textContent = '' }, 4000)
  }
}

window.doLogout = function () {
  sessionStorage.removeItem('adminAuth')
  document.getElementById('admin-dashboard').classList.add('hidden')
  document.getElementById('login-screen').style.display = 'flex'
  document.getElementById('admin-user').value = ''
  document.getElementById('admin-pass').value = ''
}

function showDashboard() {
  document.getElementById('login-screen').style.display = 'none'
  document.getElementById('admin-dashboard').classList.remove('hidden')
  initTabs()
  loadAll()
}

// Auto-login if session is still active
if (sessionStorage.getItem('adminAuth') === '1') {
  showDashboard()
}

// ── LOAD ALL ──────────────────────────────────────────────────
async function loadAll() {
  loadLF()
  loadComplaints()
  loadRecs()
  loadResolved()
  loadArchive()
}

// ── LOAD LOST & FOUND (active) ────────────────────────────────
async function loadLF() {
  const grid = document.getElementById('a-lf-grid')
  grid.innerHTML = '<div class="loading">Loading...</div>'
  try {
    const q = query(collection(db, 'lost_found'), where('status', '==', 'pending'))
    const snap = await getDocs(q)
    let items = snap.docs.map(d => ({ id: d.id, col: 'lost_found', ...d.data() }))
    items.sort((a, b) => tsCompare(b, a))

    const lost = items.filter(i => i.type === 'lost').length
    const found = items.filter(i => i.type === 'found').length
    document.getElementById('a-lost-count').textContent = lost
    document.getElementById('a-found-count').textContent = found

    grid.innerHTML = items.length === 0
      ? '<div class="empty-state">No active lost & found posts.</div>'
      : items.map(i => buildAdminCard(i, false)).join('')
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`
  }
}

// ── LOAD COMPLAINTS (active) ──────────────────────────────────
async function loadComplaints() {
  const grid = document.getElementById('a-complaint-grid')
  grid.innerHTML = '<div class="loading">Loading...</div>'
  try {
    const q = query(
      collection(db, 'complaints'),
      where('type', '==', 'complaint'),
      where('status', '==', 'pending')
    )
    const snap = await getDocs(q)
    let items = snap.docs.map(d => ({ id: d.id, col: 'complaints', ...d.data() }))
    items.sort((a, b) => tsCompare(b, a))

    document.getElementById('a-complaint-count').textContent = items.length

    grid.innerHTML = items.length === 0
      ? '<div class="empty-state">No active complaints.</div>'
      : items.map(i => buildAdminCard(i, false)).join('')
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`
  }
}

// ── LOAD RECOMMENDATIONS (active) ─────────────────────────────
async function loadRecs() {
  const grid = document.getElementById('a-rec-grid')
  grid.innerHTML = '<div class="loading">Loading...</div>'
  try {
    const q = query(collection(db, 'recommendations'), where('status', '==', 'pending'))
    const snap = await getDocs(q)
    let items = snap.docs.map(d => ({ id: d.id, col: 'recommendations', ...d.data() }))
    items.sort((a, b) => tsCompare(b, a))

    document.getElementById('a-rec-count').textContent = items.length

    grid.innerHTML = items.length === 0
      ? '<div class="empty-state">No active recommendations.</div>'
      : items.map(i => buildAdminCard(i, false)).join('')
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`
  }
}

// ── LOAD RESOLVED (all collections) ───────────────────────────
async function loadResolved() {
  const grid = document.getElementById('a-resolved-grid')
  grid.innerHTML = '<div class="loading">Loading...</div>'
  try {
    const [lfSnap, cSnap, rSnap] = await Promise.all([
      getDocs(query(collection(db, 'lost_found'), where('status', '==', 'resolved'))),
      getDocs(query(collection(db, 'complaints'), where('status', '==', 'resolved'))),
      getDocs(query(collection(db, 'recommendations'), where('status', '==', 'resolved')))
    ])

    let items = [
      ...lfSnap.docs.map(d => ({ id: d.id, col: 'lost_found', ...d.data() })),
      ...cSnap.docs.map(d => ({ id: d.id, col: 'complaints', ...d.data() })),
      ...rSnap.docs.map(d => ({ id: d.id, col: 'recommendations', ...d.data() }))
    ]
    items.sort((a, b) => tsCompare(b, a))

    const resolvedCountEl = document.getElementById('a-resolved-count')
    if (resolvedCountEl) resolvedCountEl.textContent = items.length

    grid.innerHTML = items.length === 0
      ? '<div class="empty-state">No resolved posts yet.</div>'
      : items.map(i => buildAdminCard(i, true, false)).join('')
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`
  }
}

// ── LOAD ARCHIVE ──────────────────────────────────────────────
async function loadArchive() {
  const grid = document.getElementById('a-archive-grid')
  grid.innerHTML = '<div class="loading">Loading...</div>'
  try {
    const snap = await getDocs(collection(db, 'archive'))
    let items = snap.docs.map(d => ({ id: d.id, col: 'archive', ...d.data() }))
    items.sort((a, b) => tsCompare(b, a))

    document.getElementById('a-archive-count').textContent = items.length

    grid.innerHTML = items.length === 0
      ? '<div class="empty-state">Archive is empty.</div>'
      : items.map(i => buildArchiveCard(i)).join('')
  } catch (err) {
    grid.innerHTML = `<div class="empty-state">Error: ${err.message}</div>`
  }
}

// ── CARD BUILDER (active & resolved) ─────────────────────────
function buildAdminCard(post, isResolved, showResolve = true) {
  const title = post.title || post.item_name || '(No Title)'
  const desc = post.desc || post.description || ''
  const name = post.name || 'Anonymous'

  // Determine type label
  let typeLabel = 'Post'
  let borderColor = 'var(--gray-400)'
  let badgeClass = 'badge-resolved'
  if (post.col === 'lost_found') {
    typeLabel = post.type === 'lost' ? 'Lost' : 'Found'
    borderColor = isResolved ? 'var(--gray-400)' : post.type === 'lost' ? 'var(--lost)' : 'var(--found)'
    badgeClass = isResolved ? 'badge-resolved' : post.type === 'lost' ? 'badge-lost' : 'badge-found'
  } else if (post.col === 'complaints') {
    typeLabel = isResolved ? 'Resolved Complaint' : 'Complaint'
    borderColor = isResolved ? 'var(--gray-400)' : 'var(--complaint)'
    badgeClass = isResolved ? 'badge-resolved' : 'badge-complaint'
  } else if (post.col === 'recommendations') {
    typeLabel = isResolved ? 'Resolved Recommendation' : 'Recommendation'
    borderColor = isResolved ? 'var(--gray-400)' : 'var(--rec)'
    badgeClass = isResolved ? 'badge-resolved' : 'badge-rec'
  }

  const imgHtml = post.imageUrl
    ? `<img class="card-img" src="${esc(post.imageUrl)}" alt="${esc(title)}"
         onclick="openModal('${esc(post.imageUrl)}')" title="Click to enlarge"/>`
    : ''

  // Admin action buttons
  const resolveBtn = (!isResolved && showResolve)
    ? `<button class="admin-resolve-btn" onclick="adminResolve('${post.col}','${post.id}')">✔ Mark Resolved</button>`
    : ''
  const deleteBtn = `<button class="admin-delete-btn" onclick="adminDelete('${post.col}','${post.id}')">🗑️ Delete</button>`

  // Extra meta for lost & found
  const extraMeta = post.col === 'lost_found' ? `
    <div class="meta-row"><span class="meta-key">Location:</span><span class="meta-val">${esc(post.location || '')}</span></div>
    <div class="meta-row"><span class="meta-key">Contact:</span><span class="meta-val">${esc(post.contact || '')}</span></div>` : ''

  return `
    <div class="item-card" style="border-top:4px solid ${borderColor}" id="acard-${post.col}-${post.id}">
      ${imgHtml}
      <div class="card-body">
        <span class="card-badge ${badgeClass}">${typeLabel}</span>
        <div class="card-title">${esc(title)}</div>
        <div class="card-desc">${esc(desc)}</div>
        <div class="card-meta">
          ${extraMeta}
          <div class="meta-row"><span class="meta-key">Posted by:</span><span class="meta-val">${esc(name)}</span></div>
        </div>
        <div class="card-date" style="font-size:.74rem;color:var(--gray-400);margin-bottom:.5rem">${formatDate(post.createdAt)}</div>
        <div class="admin-actions">
          ${resolveBtn}
          ${deleteBtn}
        </div>
      </div>
    </div>`
}

// ── ARCHIVE CARD ──────────────────────────────────────────────
function buildArchiveCard(post) {
  const title = post.title || post.item_name || '(No Title)'
  const desc = post.desc || post.description || ''
  const name = post.name || 'Anonymous'
  const originalCol = post.originalCol || 'unknown'

  const imgHtml = post.imageUrl
    ? `<img class="card-img" src="${esc(post.imageUrl)}" alt="${esc(title)}"
         onclick="openModal('${esc(post.imageUrl)}')" title="Click to enlarge"/>`
    : ''

  return `
    <div class="item-card archived-card" id="acard-archive-${post.id}">
      ${imgHtml}
      <div class="card-body">
        <span class="card-badge badge-archived">🗑️ Archived · was: ${esc(originalCol)}</span>
        <div class="card-title">${esc(title)}</div>
        <div class="card-desc">${esc(desc)}</div>
        <div class="card-meta">
          <div class="meta-row"><span class="meta-key">Posted by:</span><span class="meta-val">${esc(name)}</span></div>
          <div class="meta-row"><span class="meta-key">Archived on:</span><span class="meta-val">${formatDate(post.archivedAt || post.createdAt)}</span></div>
        </div>
        <div class="admin-actions">
          <button class="admin-restore-btn" onclick="adminRestore('${post.id}')">↩ Restore</button>
          <button class="admin-perma-delete-btn" onclick="adminPermaDelete('${post.id}')">❌ Delete Permanently</button>
        </div>
      </div>
    </div>`
}

// ── ADMIN RESOLVE ─────────────────────────────────────────────
window.adminResolve = async function (col, id) {
  if (!confirm('Mark this post as resolved?')) return
  try {
    await updateDoc(doc(db, col, id), { status: 'resolved' })
    fadeAndReload(`acard-${col}-${id}`)
  } catch (err) {
    alert('Could not resolve: ' + err.message)
  }
}

// ── ADMIN SOFT-DELETE (to archive) ───────────────────────────
window.adminDelete = async function (col, id) {
  if (!confirm('Move this post to the archive? It will be hidden from the public.')) return
  try {
    // Get the document data first
    const { getDocs: _gd, ...rest } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js")
    const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js")
    const snap = await getDoc(doc(db, col, id))
    if (!snap.exists()) { alert('Post not found.'); return }

    const data = snap.data()

    // Copy to archive collection
    await addDoc(collection(db, 'archive'), {
      ...data,
      originalCol: col,
      originalId: id,
      archivedAt: serverTimestamp()
    })

    // Delete from original collection
    await deleteDoc(doc(db, col, id))

    fadeAndReload(`acard-${col}-${id}`)
  } catch (err) {
    alert('Could not archive: ' + err.message)
  }
}

// ── ADMIN RESTORE ─────────────────────────────────────────────
window.adminRestore = async function (archiveId) {
  if (!confirm('Restore this post to its original collection?')) return
  try {
    const { getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js")
    const snap = await getDoc(doc(db, 'archive', archiveId))
    if (!snap.exists()) { alert('Archived post not found.'); return }

    const data = snap.data()
    const { originalCol, originalId, archivedAt, ...originalData } = data

    // Restore to original collection
    await addDoc(collection(db, originalCol), {
      ...originalData,
      status: 'pending' // restore as active
    })

    // Remove from archive
    await deleteDoc(doc(db, 'archive', archiveId))

    fadeAndReload(`acard-archive-${archiveId}`)
  } catch (err) {
    alert('Could not restore: ' + err.message)
  }
}

// ── ADMIN PERMANENT DELETE ────────────────────────────────────
window.adminPermaDelete = async function (archiveId) {
  if (!confirm('⚠️ Permanently delete this post? This CANNOT be undone.')) return
  if (!confirm('Are you absolutely sure? The post will be gone forever.')) return
  try {
    await deleteDoc(doc(db, 'archive', archiveId))
    const card = document.getElementById(`acard-archive-${archiveId}`)
    if (card) { card.style.opacity = '0'; card.style.transition = 'opacity 0.3s' }
    setTimeout(() => loadArchive(), 400)
  } catch (err) {
    alert('Could not delete: ' + err.message)
  }
}

// ── HELPERS ───────────────────────────────────────────────────
function tsCompare(a, b) {
  const aT = a.createdAt?.toDate?.() || new Date(0)
  const bT = b.createdAt?.toDate?.() || new Date(0)
  return aT - bT
}

function fadeAndReload(cardId) {
  const card = document.getElementById(cardId)
  if (card) { card.style.opacity = '0'; card.style.transition = 'opacity 0.3s' }
  setTimeout(() => loadAll(), 400)
}

// ── MODAL (needs to be on window for HTML onclick) ────────────
window.openModal = function (src) {
  document.getElementById('modal-img').src = src
  document.getElementById('modal').classList.remove('hidden')
  document.body.style.overflow = 'hidden'
}
window.closeModal = function () {
  document.getElementById('modal').classList.add('hidden')
  document.body.style.overflow = ''
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') window.closeModal() })
