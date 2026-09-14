/* Privacy-friendly visit and booking-funnel measurement for the public scheduler.

   Three rules shape this file:

   1. Nothing here may affect a booking. Every entry point is wrapped, every storage read is
      guarded, and every send is fire-and-forget with its failures swallowed. A blocked request, a
      disabled storage API, a missing endpoint, or a thrown error all end the same way: measurement
      stops and the scheduler carries on untouched.
   2. Nothing personal is collected. The visitor id is a random value generated in the browser; it
      is not derived from an address, a name, or a device fingerprint. No form field is ever read.
   3. The visitor stays in control. Global Privacy Control and Do Not Track are honoured, and the
      privacy notice can switch measurement off for this browser entirely.

   The neutral file name is deliberate: content blockers match request URLs, so a script or an
   endpoint named "analytics" is frequently blocked. Some blockers refuse even this name, which is
   why nothing that has to work lives here. The Google Ads conversion for a completed reservation is
   inlined in index.html for that reason; measurement is optional, and this file is the optional part. */
(function (global) {
  'use strict'

  const ENDPOINT = '/.netlify/functions/site-signals'
  const VISITOR_KEY = 'prospects:visit-id'
  const SESSION_KEY = 'prospects:visit-session'
  const OPT_OUT_KEY = 'prospects:visit-optout'
  const SESSION_IDLE_MS = 30 * 60 * 1000
  const FLUSH_DELAY_MS = 400
  const MAX_EVENTS_PER_PAGE = 60
  const MAX_BATCH = 20

  const EVENT_NAMES = [
    'page_view', 'book_cage_click', 'rental_type_select', 'space_select', 'booking_start', 'booking_complete',
  ]

  function randomId() {
    try {
      /* The "v" prefix guarantees a letter in every id, which is what the collector's format check
         relies on to reject numeric values that were never generated here. */
      if (global.crypto && typeof global.crypto.randomUUID === 'function') return `v${global.crypto.randomUUID()}`
    } catch (error) {
      /* fall through to the arithmetic id below */
    }
    return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }

  function create(options) {
    const settings = options || {}
    const windowObject = settings.windowObject || global
    const documentObject = settings.documentObject || windowObject.document || {}
    const navigatorObject = settings.navigator || windowObject.navigator || {}
    const locationObject = settings.location || windowObject.location || { pathname: '/', search: '', host: '' }
    const endpoint = settings.endpoint || ENDPOINT
    const timeNow = settings.now || function () { return Date.now() }
    const setTimer = settings.setTimeout || windowObject.setTimeout || function () { return 0 }

    let memoryVisitorId = ''
    let memorySession = null
    let queue = []
    let flushTimer = null
    let eventsThisPage = 0

    function readStore(kind) {
      try {
        return kind === 'session' ? windowObject.sessionStorage : windowObject.localStorage
      } catch (error) {
        return null
      }
    }

    function readValue(kind, key) {
      try {
        const store = readStore(kind)
        return store ? store.getItem(key) : null
      } catch (error) {
        return null
      }
    }

    function writeValue(kind, key, value) {
      try {
        const store = readStore(kind)
        if (store) store.setItem(key, value)
      } catch (error) {
        /* Private browsing or a full quota. In-memory state below keeps this page view working. */
      }
    }

    /* Global Privacy Control and Do Not Track are treated as a request not to be measured, and the
       privacy notice writes a durable opt-out for this browser. */
    function optedOut() {
      try {
        if (navigatorObject.globalPrivacyControl === true) return true
        const dnt = navigatorObject.doNotTrack || windowObject.doNotTrack || ''
        if (String(dnt) === '1' || String(dnt).toLowerCase() === 'yes') return true
      } catch (error) {
        /* An unreadable signal is not consent to measure, but it is also not a refusal. */
      }
      return readValue('local', OPT_OUT_KEY) === '1'
    }

    function visitorId() {
      const stored = readValue('local', VISITOR_KEY)
      if (stored && /^[A-Za-z0-9_-]{8,64}$/.test(stored)) return stored
      if (!memoryVisitorId) memoryVisitorId = randomId()
      writeValue('local', VISITOR_KEY, memoryVisitorId)
      return memoryVisitorId
    }

    function firstTouch() {
      let search = ''
      try {
        search = String(locationObject.search || '')
      } catch (error) {
        search = ''
      }
      const params = new URLSearchParams(search)
      const referrer = String(documentObject.referrer || '')
      return {
        referrer,
        utmSource: params.get('utm_source') || '',
        utmMedium: params.get('utm_medium') || '',
        utmCampaign: params.get('utm_campaign') || '',
        utmTerm: params.get('utm_term') || '',
        utmContent: params.get('utm_content') || '',
        /* Only the presence of an ad click id is kept. The id itself is not stored. */
        hasAdClick: Boolean(params.get('gclid') || params.get('gbraid') || params.get('wbraid')),
      }
    }

    /* One session per 30 minutes of activity. The first referrer and campaign of the session travel
       with every later funnel event, so a completed reservation is credited to the visit that
       started it rather than to the internal page it finished on. */
    function session() {
      const stamp = timeNow()
      let current = memorySession
      if (!current) {
        try {
          const parsed = JSON.parse(readValue('session', SESSION_KEY) || 'null')
          if (parsed && typeof parsed.id === 'string' && parsed.id) current = parsed
        } catch (error) {
          current = null
        }
      }
      if (!current || !(stamp - Number(current.lastAt || 0) < SESSION_IDLE_MS)) {
        current = { id: randomId(), startedAt: stamp, lastAt: stamp, source: firstTouch(), sent: {} }
      }
      current.lastAt = stamp
      if (!current.sent || typeof current.sent !== 'object') current.sent = {}
      memorySession = current
      writeValue('session', SESSION_KEY, JSON.stringify(current))
      return current
    }

    function markSent(key) {
      const current = session()
      if (current.sent[key]) return false
      current.sent[key] = 1
      memorySession = current
      writeValue('session', SESSION_KEY, JSON.stringify(current))
      return true
    }

    function post(events) {
      const body = JSON.stringify({ events: events })
      try {
        if (typeof navigatorObject.sendBeacon === 'function') {
          const blob = typeof windowObject.Blob === 'function'
            ? new windowObject.Blob([body], { type: 'application/json' })
            : body
          if (navigatorObject.sendBeacon(endpoint, blob)) return
        }
      } catch (error) {
        /* Beacon refused. The fetch below is the second and final attempt. */
      }
      try {
        if (typeof windowObject.fetch === 'function') {
          const request = windowObject.fetch(endpoint, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: body,
            keepalive: true,
            cache: 'no-store',
          })
          if (request && typeof request.catch === 'function') request.catch(function () {})
        }
      } catch (error) {
        /* Blocked or offline. Measurement is lost on purpose; the booking flow never learns. */
      }
    }

    function flush() {
      flushTimer = null
      if (!queue.length) return
      const batch = queue.slice(0, MAX_BATCH)
      queue = queue.slice(MAX_BATCH)
      post(batch)
      if (queue.length) scheduleFlush()
    }

    function scheduleFlush() {
      if (flushTimer) return
      try {
        flushTimer = setTimer(flush, FLUSH_DELAY_MS)
      } catch (error) {
        flushTimer = null
        flush()
      }
    }

    /**
     * Records one funnel signal. Returns true only when a signal was queued, which is what the
     * tests assert against; callers in the scheduler ignore the result entirely.
     */
    function track(eventName, detail) {
      try {
        if (EVENT_NAMES.indexOf(eventName) === -1) return false
        if (optedOut()) return false
        if (eventsThisPage >= MAX_EVENTS_PER_PAGE) return false
        const info = detail || {}
        const current = session()

        /* Signals that describe reaching a stage once, rather than an action repeated on purpose. */
        if (eventName === 'booking_start' && !markSent('booking_start')) return false

        let dedupeKey = ''
        if (info.dedupeKey) dedupeKey = String(info.dedupeKey)
        else if (eventName === 'booking_start') dedupeKey = `${current.id}:start`

        const source = current.source || {}
        const payload = {
          event: eventName,
          visitorId: visitorId(),
          sessionId: current.id,
          pagePath: String(locationObject.pathname || '/'),
          referrer: source.referrer || '',
          utmSource: source.utmSource || '',
          utmMedium: source.utmMedium || '',
          utmCampaign: source.utmCampaign || '',
          utmTerm: source.utmTerm || '',
          utmContent: source.utmContent || '',
          hasAdClick: source.hasAdClick === true,
        }
        if (info.rentalType) payload.rentalType = String(info.rentalType)
        if (info.spaceLabel) payload.spaceLabel = String(info.spaceLabel)
        if (dedupeKey) payload.dedupeKey = dedupeKey

        eventsThisPage += 1
        queue.push(payload)
        /* A completed reservation is usually followed straight away by the confirmation redirect,
           so it leaves immediately instead of waiting for the batch timer. */
        if (eventName === 'booking_complete') flush()
        else scheduleFlush()
        return true
      } catch (error) {
        return false
      }
    }

    function status() {
      try {
        return { enabled: !optedOut(), endpoint: endpoint, queued: queue.length }
      } catch (error) {
        return { enabled: false, endpoint: endpoint, queued: 0 }
      }
    }

    function optOut() {
      try {
        queue = []
        memorySession = null
        writeValue('local', OPT_OUT_KEY, '1')
        const store = readStore('local')
        if (store) store.removeItem(VISITOR_KEY)
        const sessionStore = readStore('session')
        if (sessionStore) sessionStore.removeItem(SESSION_KEY)
      } catch (error) {
        /* Nothing further to do: with storage unavailable there is nothing durable to remove. */
      }
      return status()
    }

    function optIn() {
      try {
        const store = readStore('local')
        if (store) store.removeItem(OPT_OUT_KEY)
      } catch (error) {
        /* Storage unavailable: measurement stays off, which is the safer outcome. */
      }
      return status()
    }

    function bindFlushOnExit() {
      try {
        if (typeof windowObject.addEventListener !== 'function') return
        windowObject.addEventListener('pagehide', flush)
        windowObject.addEventListener('visibilitychange', function () {
          if (documentObject.visibilityState === 'hidden') flush()
        })
      } catch (error) {
        /* Without exit hooks the batch timer is the only flush. Still harmless. */
      }
    }

    return { track: track, flush: flush, status: status, optOut: optOut, optIn: optIn, bindFlushOnExit: bindFlushOnExit }
  }

  const api = { create: create, ENDPOINT: ENDPOINT, OPT_OUT_KEY: OPT_OUT_KEY, EVENT_NAMES: EVENT_NAMES }

  /* Pages that only explain measurement (the privacy notice) load this script for its opt-out
     controls and mark themselves data-page-view="false" so reading the notice is not counted as a
     scheduler visit. Anything else counts its page view. */
  function autoPageViewWanted() {
    try {
      const script = global.document && global.document.currentScript
      return !script || script.getAttribute('data-page-view') !== 'false'
    } catch (error) {
      return true
    }
  }

  /* Default tracker for the live pages. Construction is guarded too, so a browser that refuses
     every storage and timer API still leaves a namespace whose track() is a safe no-op. */
  try {
    const wantsPageView = autoPageViewWanted()
    const tracker = create({})
    api.track = tracker.track
    api.flush = tracker.flush
    api.status = tracker.status
    api.optOut = tracker.optOut
    api.optIn = tracker.optIn
    tracker.bindFlushOnExit()
    /* The page view is the funnel's entry step, so it is recorded as soon as the script runs. */
    if (wantsPageView) tracker.track('page_view')
  } catch (error) {
    api.track = function () { return false }
    api.flush = function () {}
    api.status = function () { return { enabled: false, endpoint: ENDPOINT, queued: 0 } }
    api.optOut = function () { return { enabled: false, endpoint: ENDPOINT, queued: 0 } }
    api.optIn = api.optOut
  }

  global.ProspectsVisitInsights = api
})(typeof window === 'undefined' ? globalThis : window)
