// ============================================================
// recommendations.js
// Handles all logic for the Recommendations page:
//   - Loading recommendations from Firestore
//   - Submitting new recommendations
//   - Marking recommendations as resolved
//   - Sorting by newest or most voted (voting removed)
// ============================================================

import { db, storage } from "./firebase-config.js"
import { initTabs, esc, formatDate, showMsg, uploadImage } from "./utils.js"
import {
  collection, addDoc, getDocs, doc, updateDoc,
  query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"

// Initialize tab switching behavior
initTabs()

// Tracks the current sort mode: 'newest' or 'top'
let currentSort = 'newest'

// ── SORT TOGGLE ───────────────────────────────────────────────
// Called when user clicks Newest or Oldest sort button
window.setRSort = function (sort) {
  currentSort = sort

  // Update active class on sort buttons
  document.getElementById('r-sort-newest').classList.toggle('active', sort === 'newest')
  document.getElementById('r-sort-oldest').classList.toggle('active', sort === 'oldest')

  // Reload with the new sort applied
  loadRecs('pending')
}

// ── SUBMIT RECOMMENDATION ─────────────────────────────────────
// Validates the form, optionally converts image to base64,
// then saves the recommendation to Firestore
window.submitRec = async function () {
  const title = document.getElementById('r-title').value.trim()
  const name = document.getElementById('r-name').value.trim()
  const desc = document.getElementById('r-desc').value.trim()
  const imageFile = document.getElementById('r-image').files[0]

  // Title and description are required
  if (!title) return showMsg('r-msg', 'Title is required.', 'warn')
  if (!desc) return showMsg('r-msg', 'Description is required.', 'warn')

  // Image size limit: 2MB
  if (imageFile && imageFile.size > 2 * 1024 * 1024)
    return showMsg('r-msg', 'Image must be under 2MB.', 'warn')

  showMsg('r-msg', 'Saving...', 'warn')

  try {
    // Convert image to base64 if one was uploaded
    let imageUrl = null
    if (imageFile) imageUrl = await uploadImage(storage, imageFile, 'recommendations')

    // Save recommendation to Firestore
    await addDoc(collection(db, 'recommendations'), {
      title,
      desc,
      name: name || 'Anonymous',
      imageUrl,
      status: 'pending',        // 'pending' = active, 'resolved' = done
      createdAt: serverTimestamp() // server-side timestamp for accurate ordering
    })

    showMsg('r-msg', 'Recommendation submitted!', 'success')

    // Clear the form
    document.getElementById('r-title').value = ''
    document.getElementById('r-name').value = ''
    document.getElementById('r-desc').value = ''
    window.clearImg('r-image', 'r-preview', 'r-ph', 'r-clear')

    // Short delay to let Firestore finish writing before reloading
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
// Fetches recommendations from Firestore by status,
// sorts them in JavaScript, and renders them as cards
async function loadRecs(status) {
  const isResolved = status === 'resolved'
  const gridId = isResolved ? 'r-resolved-grid' : 'rec-grid'
  const grid = document.getElementById(gridId)
  if (!grid) return

  grid.innerHTML = '<div class="loading">Loading...</div>'

  try {
    // Query by status only — no orderBy to avoid needing Firestore composite indexes
    const q = query(
      collection(db, 'recommendations'),
      where('status', '==', status)
    )
    const snapshot = await getDocs(q)
    let items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

    // Sort in JavaScript — direction depends on currentSort
    // newest = descending (latest first), oldest = ascending (earliest first)
    items.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(0)
      const bTime = b.createdAt?.toDate?.() || new Date(0)
      return currentSort === 'oldest' ? aTime - bTime : bTime - aTime
    })

    // Update the count badge in the page header
    const countEl = document.getElementById(isResolved ? 'r-resolved-count' : 'rec-count')
    if (countEl) countEl.textContent = items.length

    // Render cards or empty state
    grid.innerHTML = items.length === 0
      ? `<div class="empty-state">No ${isResolved ? 'resolved' : 'active'} recommendations yet.</div>`
      : items.map(p => buildCard(p, isResolved)).join('')

  } catch (err) {
    console.error(err)
    grid.innerHTML = `<div class="empty-state">Could not load. Error: ${err.message}</div>`
  }
}

// ── BUILD CARD ────────────────────────────────────────────────
// Returns the HTML string for a single recommendation card
function buildCard(post, resolved) {
  // Show image if uploaded
  const imgHtml = post.imageUrl
    ? `<img class="card-img" src="${post.imageUrl}" alt="${esc(post.title)}"
         onclick="openModal('${esc(post.imageUrl)}')" title="Click to enlarge"/>`
    : ''

  // Badge styling depends on resolved state
  const badgeClass = resolved ? 'badge-resolved' : 'badge-rec'
  const badgeText = resolved ? 'Resolved' : 'Recommendation'

  // Resolve button only on active recommendations
  const resolveBtn = !resolved
    ? `<button class="resolve-btn" onclick="resolveRec('${post.id}')">Mark Resolved</button>`
    : `<span class="resolved-label">Resolved</span>`

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
          ${resolveBtn}
        </div>
      </div>
    </div>`
}

// ── RESOLVE RECOMMENDATION ────────────────────────────────────
// Updates the recommendation's status to 'resolved' in Firestore
window.resolveRec = async function (id) {
  if (!confirm('Mark this recommendation as resolved?')) return
  try {
    await updateDoc(doc(db, 'recommendations', id), { status: 'resolved' })

    // Fade out before reloading
    const card = document.getElementById(`r-${id}`)
    if (card) {
      card.style.opacity = '0'
      card.style.transition = 'opacity 0.3s'
    }

    setTimeout(() => {
      loadRecs('pending')
      loadRecs('resolved')
    }, 300)

  } catch (err) {
    alert('Could not resolve. Try again.')
  }
}

// ── INIT ──────────────────────────────────────────────────────
// Load both tabs on page load
loadRecs('pending')
loadRecs('resolved')