// ============================================================
// recommendations.js
// Handles all logic for the Recommendations page:
//   - Loading recommendations from Firestore
//   - Submitting new recommendations
//   - Sorting by newest or oldest
// Note: Resolving recommendations is now admin-only (admin.js)
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
window.setRSort = function (sort) {
  currentSort = sort
  document.getElementById('r-sort-newest').classList.toggle('active', sort === 'newest')
  document.getElementById('r-sort-oldest').classList.toggle('active', sort === 'oldest')
  loadRecs('pending')
}

// ── SUBMIT RECOMMENDATION ─────────────────────────────────────
window.submitRec = async function () {
  const title = document.getElementById('r-title').value.trim()
  const name  = document.getElementById('r-name').value.trim()
  const desc  = document.getElementById('r-desc').value.trim()
  const imageFile = document.getElementById('r-image').files[0]

  if (!title) return showMsg('r-msg', 'Title is required.', 'warn')
  if (!desc)  return showMsg('r-msg', 'Description is required.', 'warn')

  if (imageFile && imageFile.size > 2 * 1024 * 1024)
    return showMsg('r-msg', 'Image must be under 2MB.', 'warn')

  showMsg('r-msg', 'Saving...', 'warn')

  try {
    let imageUrl = null
    if (imageFile) imageUrl = await uploadImage(storage, imageFile, 'recommendations')

    await addDoc(collection(db, 'recommendations'), {
      title,
      desc,
      name: name || 'Anonymous',
      imageUrl,
      status: 'pending',
      createdAt: serverTimestamp()
    })

    showMsg('r-msg', 'Recommendation submitted!', 'success')

    document.getElementById('r-title').value = ''
    document.getElementById('r-name').value  = ''
    document.getElementById('r-desc').value  = ''
    window.clearImg('r-image', 'r-preview', 'r-ph', 'r-clear')

    setTimeout(() => {
      loadRecs('pending')
      loadRecs('resolved')
    }, 1500)

  } catch (err) {
    console.error(err)
    showMsg('r-msg', 'Error: ' + err.message, 'error')
  }
}

// ── LOAD RECOMMENDATIONS ──────────────────────────────────────
async function loadRecs(status) {
  const isResolved = status === 'resolved'
  const gridId     = isResolved ? 'r-resolved-grid' : 'rec-grid'
  const grid       = document.getElementById(gridId)
  if (!grid) return

  grid.innerHTML = '<div class="loading">Loading...</div>'

  try {
    const q = query(
      collection(db, 'recommendations'),
      where('status', '==', status)
    )
    const snapshot = await getDocs(q)
    let items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

    items.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(0)
      const bTime = b.createdAt?.toDate?.() || new Date(0)
      return currentSort === 'oldest' ? aTime - bTime : bTime - aTime
    })

    const countEl = document.getElementById(isResolved ? 'r-resolved-count' : 'rec-count')
    if (countEl) countEl.textContent = items.length

    grid.innerHTML = items.length === 0
      ? `<div class="empty-state">No ${isResolved ? 'resolved' : 'active'} recommendations yet.</div>`
      : items.map(p => buildCard(p, isResolved)).join('')

  } catch (err) {
    console.error(err)
    grid.innerHTML = `<div class="empty-state">Could not load. Error: ${err.message}</div>`
  }
}

// ── BUILD CARD ────────────────────────────────────────────────
// Public view: no resolve/delete buttons — admin-only
function buildCard(post, resolved) {
  const imgHtml = post.imageUrl
    ? `<img class="card-img" src="${post.imageUrl}" alt="${esc(post.title)}"
         onclick="openModal('${esc(post.imageUrl)}')" title="Click to enlarge"/>`
    : ''

  const badgeClass = resolved ? 'badge-resolved' : 'badge-rec'
  const badgeText  = resolved ? 'Resolved' : 'Recommendation'

  const statusLabel = resolved
    ? `<span class="resolved-label">✔ Resolved</span>`
    : `<span class="resolved-label" style="background:var(--rec-bg);color:var(--rec);border-color:var(--rec-border)">💡 Active</span>`

  return `
    <div class="item-card" style="border-top: 4px solid ${resolved ? 'var(--gray-400)' : 'var(--rec)'}" id="r-${post.id}">
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
loadRecs('pending')
loadRecs('resolved')
