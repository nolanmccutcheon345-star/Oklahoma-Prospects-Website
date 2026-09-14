import { formatTryoutDate, formatTryoutTime, tryoutOptionLabel } from './tryout-date.mjs'

(() => {
  const api = '/.netlify/functions/tryouts'
  const $ = (selector) => document.querySelector(selector)
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character])
  let sessions = []

  const selectedSession = () => sessions.find((session) => session.slug === $('#tryoutSession')?.value)
  const updateSessionFields = () => {
    const session = selectedSession()
    if (!session) return
    const age = $('#tryoutAgeGroup')
    const makeup = session.type === 'makeup'
    age.disabled = !makeup
    if (!makeup) age.value = session.ageGroup
    $('#tryoutMakeupField').hidden = !makeup
    $('#tryoutPreferredTime').required = makeup
    $('#tryoutSubmit').textContent = makeup ? 'REQUEST MAKEUP EVALUATION' : 'REGISTER FOR FREE TRYOUT'
  }
  const renderSessions = () => {
    const select = $('#tryoutSession')
    select.innerHTML = sessions.map((session) => `<option value="${esc(session.slug)}">${esc(tryoutOptionLabel(session))}</option>`).join('')
    updateSessionFields()
  }
  const loadSessions = async () => {
    try {
      const response = await fetch(api, { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Tryout registration is temporarily unavailable.')
      sessions = data.sessions || []
      if (!sessions.length) throw new Error('No Spring 2027 tryout sessions are currently open.')
      renderSessions()
    } catch (error) {
      $('#tryoutMessage').textContent = `⚠ ${error.message.toUpperCase()}`
      $('#tryoutSubmit').disabled = true
    }
  }
  $('#tryoutSession')?.addEventListener('change', updateSessionFields)
  $('#tryoutForm')?.addEventListener('submit', async (event) => {
    event.preventDefault()
    const session = selectedSession()
    if (!session) return
    const submit = $('#tryoutSubmit')
    const message = $('#tryoutMessage')
    submit.disabled = true
    message.textContent = 'SAVING YOUR FREE TRYOUT REGISTRATION…'
    const body = {
      sessionSlug: session.slug,
      ageGroup: $('#tryoutAgeGroup').value,
      athleteFirstName: $('#tryoutFirstName').value,
      athleteLastName: $('#tryoutLastName').value,
      dateOfBirth: $('#tryoutDob').value,
      primaryPosition: $('#tryoutPrimaryPosition').value,
      secondaryPosition: $('#tryoutSecondaryPosition').value,
      school: $('#tryoutSchool').value,
      currentGrade: $('#tryoutGrade').value,
      currentTeamOrFreeAgent: $('#tryoutTeam').value,
      playingExperience: $('#tryoutExperience').value,
      parentGuardianName: $('#tryoutParentName').value,
      parentGuardianEmail: $('#tryoutEmail').value,
      parentGuardianPhone: $('#tryoutPhone').value,
      preferredMakeupTime: $('#tryoutPreferredTime').value,
      notes: $('#tryoutNotes').value,
      waiverAccepted: $('#tryoutWaiver').checked,
      marketingConsent: $('#tryoutMarketing').checked,
    }
    try {
      const response = await fetch(api, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Registration could not be completed.')
      const isMakeup = session.type === 'makeup'
      $('#tryoutConfirmation').hidden = false
      $('#tryoutConfirmation').innerHTML = `<h3>${isMakeup ? 'MAKEUP REQUEST RECEIVED' : 'TRYOUT REGISTRATION CONFIRMED'}</h3><div><b>${esc(body.athleteFirstName)} ${esc(body.athleteLastName)}</b> — ${esc(body.ageGroup)}</div><ul><li>${esc(formatTryoutDate(session.date))}${isMakeup ? ' — pending scheduling; the owner will contact you using the information provided.' : ` — ${esc(formatTryoutTime(session.start))}–${esc(formatTryoutTime(session.end))}`}</li><li>Top Prospects Training Facility, 3804 S. Elm Pl., Suite A, Broken Arrow, OK</li><li>Arrive 15 minutes early.</li><li>Bring a glove, a bat if available, and indoor athletic shoes.</li><li>No payment is due. Spring 2027 team tryouts are free.</li></ul>`
      message.textContent = '✓ REGISTRATION SAVED'
      $('#tryoutConfirmation').scrollIntoView({ behavior: 'smooth', block: 'center' })
      event.target.reset()
      renderSessions()
    } catch (error) {
      message.textContent = `⚠ ${error.message.toUpperCase()}`
    } finally {
      submit.disabled = false
    }
  })
  loadSessions()
})()
