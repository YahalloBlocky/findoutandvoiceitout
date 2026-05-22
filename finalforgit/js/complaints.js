// ============================================================
// complaints.js
// Handles all logic for the Complaints page:
//   - Loading complaints from Firestore
//   - Submitting new complaints
//   - Marking complaints as resolved
//   - Sorting by newest or most upvoted (removed voting feature)
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
window.setSort = function (sort) {
  currentSort = sort

  // Update active state on sort buttons
  document.getElementById('c-sort-newest').classList.toggle('active', sort === 'newest')
  document.getElementById('c-sort-oldest').classList.toggle('active', sort === 'oldest')

  // Reload with new sort applied
  loadComplaints('pending')
}

// ── SUBMIT COMPLAINT ──────────────────────────────────────────
// Validates the form, uploads image if any, then saves to Firestore
window.submitComplaint = async function () {
  const title     = document.getElementById('c-title').value.trim()
  const name      = document.getElementById('c-name').value.trim()
  const desc      = document.getElementById('c-desc').value.trim()
  const imageFile = document.getElementById('c-image').files[0]

  // Basic validation — title and description are required
  if (!title) return showMsg('c-msg', 'Title is required.', 'warn')
  if (!desc)  return showMsg('c-msg', 'Description is required.', 'warn')

  // Image size limit: 2MB
  if (imageFile && imageFile.size > 2 * 1024 * 1024)
    return showMsg('c-msg', 'Image must be under 2MB.', 'warn')

  showMsg('c-msg', 'Saving...', 'warn')

  try {
    // Convert image to base64 if provided (stored directly in Firestore)
    let imageUrl = null
    if (imageFile) imageUrl = await uploadImage(storage, imageFile, 'complaints')

    // Save complaint document to Firestore
    await addDoc(collection(db, 'complaints'), {
      type:      'complaint',
      title,
      desc,
      name:      name || 'Anonymous',
      imageUrl,
      status:    'pending',       // 'pending' = active, 'resolved' = done
      createdAt: serverTimestamp() // server-side timestamp for accurate ordering
    })

    showMsg('c-msg', 'Complaint submitted!', 'success')

    // Clear the form fields
    document.getElementById('c-title').value = ''
    document.getElementById('c-name').value  = ''
    document.getElementById('c-desc').value  = ''
    window.clearImg('c-image', 'c-preview', 'c-ph', 'c-clear')

    // Wait briefly for Firestore to finalize the write, then reload
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
// Fetches complaints from Firestore filtered by status,
// sorts them in JavaScript, then renders them as cards
async function loadComplaints(status) {
  const isResolved = status === 'resolved'
  const gridId     = isResolved ? 'c-resolved-grid' : 'complaint-grid'
  const grid       = document.getElementById(gridId)
  if (!grid) return

  grid.innerHTML = '<div class="loading">Loading...</div>'

  try {
    // Query complaints by type and status (no orderBy to avoid needing Firestore indexes)
    const q = query(
      collection(db, 'complaints'),
      where('type',   '==', 'complaint'),
      where('status', '==', status)
    )
    const snapshot = await getDocs(q)
    let items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

    // Sort in JavaScript since Firestore orderBy requires composite indexes
    // Direction depends on currentSort: newest = descending, oldest = ascending
    items.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(0)
      const bTime = b.createdAt?.toDate?.() || new Date(0)
      return currentSort === 'oldest' ? aTime - bTime : bTime - aTime
    })

    // Update the count badges in the page header
    const countEl = document.getElementById(isResolved ? 'c-resolved-count' : 'complaint-count')
    if (countEl) countEl.textContent = items.length

    // Render cards or empty state message
    grid.innerHTML = items.length === 0
      ? `<div class="empty-state">No ${isResolved ? 'resolved' : 'active'} complaints yet.</div>`
      : items.map(p => buildCard(p, isResolved)).join('')

  } catch (err) {
    console.error(err)
    grid.innerHTML = `<div class="empty-state">Could not load. Error: ${err.message}</div>`
  }
}

// ── BUILD CARD ────────────────────────────────────────────────
// Returns the HTML string for a single complaint card
function buildCard(post, resolved) {
  // Show image if one was uploaded
  const imgHtml = post.imageUrl
    ? `<img class="card-img" src="${post.imageUrl}" alt="${esc(post.title)}"
         onclick="openModal('${esc(post.imageUrl)}')" title="Click to enlarge"/>`
    : ''

  // Resolved badge vs active badge
  const badgeClass = resolved ? 'badge-resolved' : 'badge-complaint'
  const badgeText  = resolved ? 'Resolved' : 'Complaint'

  // Resolve button only shows on active complaints
  const resolveBtn = !resolved
    ? `<button class="resolve-btn" onclick="resolveC('${post.id}')">Mark Resolved</button>`
    : `<span class="resolved-label">Resolved</span>`

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
          ${resolveBtn}
        </div>
      </div>
    </div>`
}

// ── RESOLVE COMPLAINT ─────────────────────────────────────────
// Updates the complaint's status to 'resolved' in Firestore
// and moves it to the Resolved tab
window.resolveC = async function (id) {
  if (!confirm('Mark this complaint as resolved?')) return
  try {
    await updateDoc(doc(db, 'complaints', id), { status: 'resolved' })

    // Fade out the card before reloading
    const card = document.getElementById(`c-${id}`)
    if (card) {
      card.style.opacity    = '0'
      card.style.transition = 'opacity 0.3s'
    }

    setTimeout(() => {
      loadComplaints('pending')
      loadComplaints('resolved')
    }, 300)

  } catch (err) {
    alert('Could not resolve. Try again.')
  }
}

// ── INIT ──────────────────────────────────────────────────────
// Load both tabs on page load
loadComplaints('pending')
loadComplaints('resolved')
