// ============================================================
// utils.js
// Shared helper functions used across all pages.
// Exported functions are imported by complaints.js,
// lostfound.js, and recommendations.js.
// Some are also attached to window so HTML onclick handlers work.
// ============================================================

// ── TAB SWITCHING ─────────────────────────────────────────────
// Attaches click listeners to all .tab-btn elements.
// When a tab is clicked, it activates that tab panel
// and deactivates all others.
export function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab
      if (!target) return

      // Remove active from all buttons and panels
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))

      // Activate the clicked button and its matching panel
      btn.classList.add('active')
      const panel = document.getElementById(`tab-${target}`)
      if (panel) panel.classList.add('active')
    })
  })
}

// ── HTML ESCAPE ───────────────────────────────────────────────
// Converts special characters to HTML entities to prevent
// cross-site scripting (XSS) attacks when rendering user input
export function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── FORMAT DATE ───────────────────────────────────────────────
// Converts a Firestore Timestamp or a Date object into a
// readable date string in Philippine format (e.g. "May 21, 2026")
export function formatDate(ts) {
  if (!ts) return ''
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  return d.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

// ── SHOW MESSAGE ──────────────────────────────────────────────
// Displays a status message below a form (success, warning, error).
// Automatically clears after 5 seconds.
export function showMsg(elId, text, type) {
  const el = document.getElementById(elId)
  if (!el) return

  const colors = {
    success: '#1a7a5e',
    warn: '#b45309',
    error: '#c0392b'
  }

  el.textContent = text
  el.style.color = colors[type] || '#333'

  // Auto-clear after 5 seconds
  setTimeout(() => { el.textContent = '' }, 5000)
}

// ── IMAGE PREVIEW ─────────────────────────────────────────────
// Called when a user selects an image file.
// Reads the file with FileReader and shows a preview image
// while hiding the upload placeholder.
export function previewImg(inputId, previewId, placeholderId, clearId) {
  const file = document.getElementById(inputId).files[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = e => {
    document.getElementById(previewId).src = e.target.result
    document.getElementById(previewId).classList.remove('hidden')
    document.getElementById(placeholderId).classList.add('hidden')
    document.getElementById(clearId).classList.remove('hidden')
  }
  reader.readAsDataURL(file)
}

// ── CLEAR IMAGE ───────────────────────────────────────────────
// Resets the image input and hides the preview,
// showing the upload placeholder again
export function clearImg(inputId, previewId, placeholderId, clearId) {
  document.getElementById(inputId).value = ''

  const preview = document.getElementById(previewId)
  preview.src = ''
  preview.classList.add('hidden')

  document.getElementById(placeholderId).classList.remove('hidden')
  document.getElementById(clearId).classList.add('hidden')
}

// ── IMAGE MODAL ───────────────────────────────────────────────
// Opens a fullscreen modal to display a larger version of a card image
export function openModal(src) {
  document.getElementById('modal-img').src = src
  document.getElementById('modal').classList.remove('hidden')
  document.body.style.overflow = 'hidden' // prevent background scrolling
}

// Closes the image modal and restores scrolling
export function closeModal() {
  document.getElementById('modal').classList.add('hidden')
  document.body.style.overflow = ''
}

// ── IMAGE TO BASE64 ───────────────────────────────────────────
// Converts an uploaded image file to a compressed base64 string.
// Images are resized to max 800px and compressed to JPEG at 70% quality.
// This allows images to be stored directly in Firestore
// instead of needing Firebase Storage.
export function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = e => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')

        // Resize image to max 800px on either side while keeping aspect ratio
        let w = img.width
        let h = img.height
        const MAX = 800
        if (w > MAX || h > MAX) {
          if (w > h) { h = Math.round(h * MAX / w); w = MAX }
          else { w = Math.round(w * MAX / h); h = MAX }
        }

        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)

        // Compress to JPEG at 70% quality and return as base64 string
        resolve(canvas.toDataURL('image/jpeg', 0.7))
      }

      img.onerror = reject
      img.src = e.target.result
    }

    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── UPLOAD IMAGE ──────────────────────────────────────────────
// Wrapper used by all three pages to "upload" an image.
// Instead of uploading to Firebase Storage, we convert to base64
// and store it directly in the Firestore document.
// The storage and folder params are kept for compatibility but unused.
export async function uploadImage(storage, file, folder) {
  return await imageToBase64(file)
}

// ── GLOBAL EXPOSURE ───────────────────────────────────────────
// These functions are called directly from HTML onclick attributes,
// so they need to be on the window object (not just exported)
window.previewImg = previewImg
window.clearImg = clearImg
window.openModal = openModal
window.closeModal = closeModal
window.esc = esc

// Close modal when user presses the Escape key
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal()
})

// Custom confirm dialog — replaces browser confirm()
export function showConfirm({ icon = '❓', title, desc = '', okText = 'Confirm', okColor = '#1a2e5a', danger = false } = {}) {
  return new Promise(resolve => {
    const overlay = document.createElement('div')
    overlay.className = 'confirm-overlay'
    overlay.innerHTML = `
      <div class="confirm-box${danger ? ' danger' : ''}">
        <div class="confirm-icon">${icon}</div>
        <div class="confirm-title">${title}</div>
        ${desc ? `<div class="confirm-desc">${desc}</div>` : ''}
        <div class="confirm-btns">
          <button class="confirm-cancel">Cancel</button>
          <button class="confirm-ok" style="background:${okColor}">${okText}</button>
        </div>
      </div>`

    document.body.appendChild(overlay)

    const close = result => {
      overlay.remove()
      resolve(result)
    }

    overlay.querySelector('.confirm-ok').addEventListener('click', () => close(true))
    overlay.querySelector('.confirm-cancel').addEventListener('click', () => close(false))
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false) })

    document.addEventListener('keydown', function onKey(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', onKey); close(false) }
    })
  })
}

window.showConfirm = showConfirm
