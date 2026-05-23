// ============================================================
// complaints.js
// Handles all logic for the Complaints page:
//   - Loading complaints from Firestore
//   - Submitting new complaints
//   - Sorting by newest or oldest
// Note: Resolving complaints is now admin-only (admin.js)
// ============================================================

import { db, storage } from "./firebase-config.js"
import { initTabs, esc, formatDate, showMsg, uploadImage } from "./utils.js"
import {
  collection, addDoc, getDocs,
  query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"

// Initialize tab switching behavior
initTabs()

// Tracks the current sort mode: 'newest' or 'oldest'
let currentSort = 'newest'

// ── SORT TOGGLE ───────────────────────────────────────────────
window.setSort = function (sort) {
  currentSort = sort
  document.getElementById('c-sort-newest').classList.toggle('active', sort === 'newest')
  document.getElementById('c-sort-oldest').classList.toggle('active', sort === 'oldest')
  loadComplaints('pending')
}

// ── SUBMIT COMPLAINT ──────────────────────────────────────────
window.submitComplaint = async function () {
  const title     = document.getElementById('c-title').value.trim()
  const name      = document.getElementById('c-name').value.trim()
  const desc      = document.getElementById('c-desc').value.trim()
  const imageFile = document.getElementById('c-image').files[0]

  if (!title) return showMsg('c-msg', 'Title is required.', 'warn')
  if (!desc)  return showMsg('c-msg', 'Description is required.', 'warn')

  if (imageFile && imageFile.size > 2 * 1024 * 1024)
    return showMsg('c-msg', 'Image must be under 2MB.', 'warn')

  showMsg('c-msg', 'Saving...', 'warn')

  try {
    let imageUrl = null
    if (imageFile) imageUrl = await uploadImage(storage, imageFile, 'complaints')

    await addDoc(collection(db, 'complaints'), {
      type:      'complaint',
      title,
      desc,
      name:      name || 'Anonymous',
      imageUrl,
      status:    'pending',
      createdAt: serverTimestamp()
    })

    showMsg('c-msg', 'Complaint submitted!', 'success')

    document.getElementById('c-title').value = ''
    document.getElementById('c-name').value  = ''
    document.getElementById('c-desc').value  = ''
    window.clearImg('c-image', 'c-preview', 'c-ph', 'c-clear')

    setTimeout(() => {
      loadComplaints('pending')
      loadComplaints('resolved')
    }, 1500)

  } catch (err) {
    console.error(err)
    showMsg('c-msg', 'Error: ' + err.message, 'error')
  }
}

// ── LOAD COMPLAINTS ───────────────────────────────────────────
async function loadComplaints(status) {
  const isResolved = status === 'resolved'
  const gridId     = isResolved ? 'c-resolved-grid' : 'complaint-grid'
  const grid       = document.getElementById(gridId)
  if (!grid) return

  grid.innerHTML = '<div class="loading">Loading...</div>'

  try {
    const q = query(
      collection(db, 'complaints'),
      where('type',   '==', 'complaint'),
      where('status', '==', status)
    )
    const snapshot = await getDocs(q)
    let items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

    items.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(0)
      const bTime = b.createdAt?.toDate?.() || new Date(0)
      return currentSort === 'oldest' ? aTime - bTime : bTime - aTime
    })

    const countEl = document.getElementById(isResolved ? 'c-resolved-count' : 'complaint-count')
    if (countEl) countEl.textContent = items.length

    grid.innerHTML = items.length === 0
      ? `<div class="empty-state">No ${isResolved ? 'resolved' : 'active'} complaints yet.</div>`
      : items.map(p => buildCard(p, isResolved)).join('')

  } catch (err) {
    console.error(err)
    grid.innerHTML = `<div class="empty-state">Could not load. Error: ${err.message}</div>`
  }
}

// ── BUILD CARD ────────────────────────────────────────────────
// Public view: no resolve/delete buttons — admin-only actions
function buildCard(post, resolved) {
  const imgHtml = post.imageUrl
    ? `<img class="card-img" src="${post.imageUrl}" alt="${esc(post.title)}"
         onclick="openModal('${esc(post.imageUrl)}')" title="Click to enlarge"/>`
    : ''

  const badgeClass = resolved ? 'badge-resolved' : 'badge-complaint'
  const badgeText  = resolved ? 'Resolved' : 'Complaint'

  const statusLabel = resolved
    ? `<span class="resolved-label">✔ Resolved</span>`
    : `<span class="resolved-label" style="background:var(--complaint-bg);color:var(--complaint);border-color:var(--lost-border)">📢 Active</span>`

  return `
    <div class="item-card" style="border-top: 4px solid ${resolved ? 'var(--gray-400)' : 'var(--complaint)'}" id="c-${post.id}">
      ${imgHtml}
      <div class="card-body">
        <span class="card-badge ${badgeClass}">${badgeText}</span>
        <div class="card-title">${esc(post.title)}</div>
        <div class="card-desc">${esc(post.desc)}</div>
        <div class="card-meta">
          <div class="meta-row">
            <span class="meta-key">Posted by:</span>
            <span class="meta-val">${esc(post.name)}</span>
          </div>
        </div>
        <div class="card-footer">
          <span class="card-date">${formatDate(post.createdAt)}</span>
          ${statusLabel}
        </div>
      </div>
    </div>`
}

// ── INIT ──────────────────────────────────────────────────────
loadComplaints('pending')
loadComplaints('resolved')
