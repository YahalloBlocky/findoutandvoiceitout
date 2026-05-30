// ============================================================
// lostfound.js
// Handles all logic for the Lost & Found page:
//   - Loading lost items, found items, and resolved items from Firestore
//   - Submitting new lost/found posts
//   - Toggling between "I Lost Something" and "I Found Something"
//   - Marking items as resolved
// ============================================================

import { db, storage } from "./firebase-config.js"
import { initTabs, esc, formatDate, showMsg, uploadImage, showConfirm } from "./utils.js"
import {
  collection, addDoc, getDocs, doc, updateDoc,
  query, where, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js"

// Initialize tab switching behavior
initTabs()

// Tracks whether the user is posting a lost or found item
let currentType = 'lost'

// ── TYPE TOGGLE ───────────────────────────────────────────────
// Called when user clicks "I Lost Something" or "I Found Something"
// Updates button styles and submit button label
window.setLFType = function (type) {
  currentType = type

  const lostBtn = document.getElementById('lf-type-lost')
  const foundBtn = document.getElementById('lf-type-found')
  const submitBtn = document.getElementById('lf-submit-btn')

  // Reset classes on both buttons first
  lostBtn.classList.remove('active', 'lost-active', 'found-active')
  foundBtn.classList.remove('active', 'lost-active', 'found-active')

  if (type === 'lost') {
    lostBtn.classList.add('active', 'lost-active')
    submitBtn.textContent = 'Post Lost Item'
    submitBtn.style.background = '#c0392b'
    submitBtn.style.color = '#fff'
  } else {
    foundBtn.classList.add('active', 'found-active')
    submitBtn.textContent = 'Post Found Item'
    submitBtn.style.background = '#1a7a5e'
    submitBtn.style.color = '#fff'
  }
}

// ── SUBMIT LOST/FOUND POST ────────────────────────────────────
// Validates form fields, converts image to base64 if provided,
// then saves the post to Firestore
window.submitLF = async function () {
  const itemName = document.getElementById('lf-item-name').value.trim()
  const name = document.getElementById('lf-name').value.trim()
  const desc = document.getElementById('lf-desc').value.trim()
  const location = document.getElementById('lf-location').value.trim()
  const contact = document.getElementById('lf-contact').value.trim()
  const imageFile = document.getElementById('lf-image').files[0]

  // All fields except name are required
  if (!itemName) return showMsg('lf-msg', 'Item name is required.', 'warn')
  if (!desc) return showMsg('lf-msg', 'Description is required.', 'warn')
  if (!location) return showMsg('lf-msg', 'Location is required.', 'warn')
  if (!contact) return showMsg('lf-msg', 'Contact number is required.', 'warn')

  // Image size limit: 2MB
  if (imageFile && imageFile.size > 2 * 1024 * 1024)
    return showMsg('lf-msg', 'Image must be under 2MB.', 'warn')

  showMsg('lf-msg', 'Saving...', 'warn')

  try {
    // Convert image to base64 if one was uploaded
    let imageUrl = null
    if (imageFile) imageUrl = await uploadImage(storage, imageFile, 'lostfound')

    // Save the post to Firestore
    await addDoc(collection(db, 'lost_found'), {
      type: currentType,     // 'lost' or 'found'
      item_name: itemName,
      name: name || 'Anonymous',
      description: desc,
      location,
      contact,
      imageUrl,
      status: 'pending',       // 'pending' = active, 'resolved' = done
      createdAt: serverTimestamp()
    })

    showMsg('lf-msg', 'Posted successfully!', 'success')

    // Clear all form fields
    document.getElementById('lf-item-name').value = ''
    document.getElementById('lf-name').value = ''
    document.getElementById('lf-desc').value = ''
    document.getElementById('lf-location').value = ''
    document.getElementById('lf-contact').value = ''
    window.clearImg('lf-image', 'lf-preview', 'lf-ph', 'lf-clear')

    // Short delay before reloading so Firestore finishes writing
    setTimeout(() => {
      loadLF('lost')
      loadLF('found')
    }, 1500)

  } catch (err) {
    console.error(err)
    showMsg('lf-msg', 'Error: ' + err.message, 'error')
  }
}

// ── LOAD ACTIVE ITEMS ─────────────────────────────────────────
// Fetches active (pending) lost or found items from Firestore,
// sorts them newest first, and renders them as cards
async function loadLF(type) {
  const gridId = type === 'lost' ? 'lost-grid' : 'found-grid'
  const grid = document.getElementById(gridId)
  if (!grid) return

  grid.innerHTML = '<div class="loading">Loading...</div>'

  try {
    // Filter by type ('lost' or 'found') and status 'pending'
    const q = query(
      collection(db, 'lost_found'),
      where('type', '==', type),
      where('status', '==', 'pending')
    )
    const snapshot = await getDocs(q)
    let items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

    // Sort newest first in JavaScript
    items.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(0)
      const bTime = b.createdAt?.toDate?.() || new Date(0)
      return bTime - aTime
    })

    // Update the count badge in the header (e.g. "3 Lost")
    const countEl = document.getElementById(`${type}-count`)
    if (countEl) countEl.textContent = items.length

    // Render cards or empty state
    grid.innerHTML = items.length === 0
      ? `<div class="empty-state">No ${type} items posted yet.</div>`
      : items.map(item => buildLFCard(item, false)).join('')

  } catch (err) {
    console.error(err)
    grid.innerHTML = `<div class="empty-state">Could not load. Error: ${err.message}</div>`
  }
}

// ── LOAD RESOLVED ITEMS ───────────────────────────────────────
// Fetches ALL resolved items (both lost and found) in a single query
// and shows them together in the Resolved tab
async function loadResolved() {
  const grid = document.getElementById('lf-resolved-grid')
  if (!grid) return

  grid.innerHTML = '<div class="loading">Loading...</div>'

  try {
    // Single query without type filter — gets all resolved regardless of type
    const q = query(
      collection(db, 'lost_found'),
      where('status', '==', 'resolved')
    )
    const snapshot = await getDocs(q)
    let items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))

    // Sort newest first
    items.sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(0)
      const bTime = b.createdAt?.toDate?.() || new Date(0)
      return bTime - aTime
    })

    // Update the resolved count badge
    const countEl = document.getElementById('resolved-count')
    if (countEl) countEl.textContent = items.length

    grid.innerHTML = items.length === 0
      ? `<div class="empty-state">No resolved items yet.</div>`
      : items.map(item => buildLFCard(item, true)).join('')

  } catch (err) {
    console.error(err)
    grid.innerHTML = `<div class="empty-state">Could not load. Error: ${err.message}</div>`
  }
}

// ── BUILD CARD ────────────────────────────────────────────────
// Returns the HTML string for a single lost/found card
function buildLFCard(item, resolved) {
  const isLost = item.type === 'lost'

  // Border color: gray for resolved, red for lost, green for found
  const borderColor = resolved
    ? 'var(--gray-400)'
    : isLost ? 'var(--lost)' : 'var(--found)'

  // Badge styling
  const badgeClass = resolved ? 'badge-resolved' : isLost ? 'badge-lost' : 'badge-found'
  const badgeText = resolved ? 'Resolved' : isLost ? 'Lost' : 'Found'

  // Show image or a placeholder icon
  const imgHtml = item.imageUrl
    ? `<img class="card-img" src="${item.imageUrl}" alt="${esc(item.item_name)}"
         onclick="openModal('${esc(item.imageUrl)}')" title="Click to enlarge"/>`
    : `<div class="card-no-img">?</div>`

  // Resolve button only on active items
  const resolveBtn = !resolved
    ? `<button class="resolve-btn" onclick="resolveLF('${item.id}')">Mark Resolved</button>`
    : `<span class="resolved-label">Resolved</span>`

  return `
    <div class="item-card" style="border-top: 4px solid ${borderColor}" id="lf-${item.id}">
      ${imgHtml}
      <div class="card-body">
        <span class="card-badge ${badgeClass}">${badgeText}</span>
        <div class="card-title">${esc(item.item_name)}</div>
        <div class="card-desc">${esc(item.description)}</div>
        <div class="card-meta">
          <div class="meta-row">
            <span class="meta-key">Location:</span>
            <span class="meta-val">${esc(item.location)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-key">Contact:</span>
            <span class="meta-val">${esc(item.contact)}</span>
          </div>
          <div class="meta-row">
            <span class="meta-key">Posted by:</span>
            <span class="meta-val">${esc(item.name)}</span>
          </div>
        </div>
        <div class="card-footer">
          <span class="card-date">${formatDate(item.createdAt)}</span>
          ${resolveBtn}
        </div>
      </div>
    </div>`
}

// ── RESOLVE ITEM ──────────────────────────────────────────────
// Updates item status to 'resolved' in Firestore,
// fades out the card, then reloads all grids
window.resolveLF = async function (id) {
  const ok = await showConfirm({
    icon: '✅',
    title: 'Mark this item as resolved?',
    desc: 'It will move to the Resolved tab. Do this once the item has been returned to its owner.',
    okText: 'Mark Resolved',
    okColor: '#1a7a5e'
  })
  if (!ok) return
  try {
    await updateDoc(doc(db, 'lost_found', id), { status: 'resolved' })

    // Fade out the card smoothly
    const card = document.getElementById(`lf-${id}`)
    if (card) {
      card.style.opacity = '0'
      card.style.transition = 'opacity 0.3s'
    }

    setTimeout(() => {
      loadLF('lost')
      loadLF('found')
      loadResolved()
    }, 300)

  } catch (err) {
    alert('Could not resolve. Try again.')
  }
}

// ── INIT ──────────────────────────────────────────────────────
// Load all three tabs on page load
loadLF('lost')
loadLF('found')
loadResolved()
