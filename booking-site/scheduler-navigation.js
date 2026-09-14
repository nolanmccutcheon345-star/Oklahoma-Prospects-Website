(function (global) {
  'use strict'

  const reducedMotionQuery = '(prefers-reduced-motion: reduce)'

  function create(options = {}) {
    const windowObject = options.windowObject || global
    const documentObject = options.documentObject || windowObject.document
    const navigation = options.navigation || documentObject.querySelector('[data-scheduler-navigation]')
    const tabs = Array.from(options.tabs || documentObject.querySelectorAll('[data-view]'))
    const views = Array.from(options.views || documentObject.querySelectorAll('.view'))
    const triggers = Array.from(options.triggers || documentObject.querySelectorAll('[data-activate-view]'))
    const onActivate = options.onActivate || function () {}
    let interactionsBound = false

    function prefersReducedMotion() {
      return typeof windowObject.matchMedia === 'function' && windowObject.matchMedia(reducedMotionQuery).matches
    }

    function updateNavigationOffset() {
      if (!navigation || !documentObject.documentElement) return 0
      const styles = typeof windowObject.getComputedStyle === 'function'
        ? windowObject.getComputedStyle(navigation)
        : { top: '0', marginBottom: '0' }
      const stickyTop = Number.parseFloat(styles.top) || 0
      const marginBottom = Number.parseFloat(styles.marginBottom) || 0
      const offset = Math.ceil(navigation.getBoundingClientRect().height + stickyTop + marginBottom)
      documentObject.documentElement.style.setProperty('--scheduler-navigation-offset', `${offset}px`)
      return offset
    }

    function scrollViewIntoPosition(view) {
      const offset = updateNavigationOffset()
      const behavior = prefersReducedMotion() ? 'auto' : 'smooth'
      const scrollY = windowObject.scrollY || windowObject.pageYOffset || 0
      const top = Math.max(0, Math.round(view.getBoundingClientRect().top + scrollY - offset))

      if (typeof view.scrollIntoView === 'function') {
        view.scrollIntoView({ behavior, block: 'start', inline: 'nearest' })
      } else if (typeof windowObject.scrollTo === 'function') {
        windowObject.scrollTo({
          top,
          left: 0,
          behavior
        })
      }

      if (typeof windowObject.setTimeout === 'function') {
        windowObject.setTimeout(function () {
          const currentTop = view.getBoundingClientRect().top
          if (currentTop >= offset - 2 && currentTop <= offset + 16) return

          const currentScrollY = windowObject.scrollY || windowObject.pageYOffset || 0
          const fallbackTop = Math.max(0, Math.round(currentTop + currentScrollY - offset))
          const scrollingElement = documentObject.scrollingElement || documentObject.documentElement || documentObject.body
          if (scrollingElement) scrollingElement.scrollTop = fallbackTop
          if (typeof windowObject.scrollTo === 'function') windowObject.scrollTo(0, fallbackTop)
        }, behavior === 'smooth' ? 600 : 0)
      }
    }

    function activate(viewId, activateOptions = {}) {
      const view = views.find(function (item) { return item.id === viewId })
      if (!view) return false

      const wasActive = view.classList.contains('active')
      views.forEach(function (item) {
        const active = item === view
        item.classList.toggle('active', active)
        item.hidden = !active
      })
      tabs.forEach(function (tab) {
        const active = tab.dataset.view === viewId
        tab.classList.toggle('active', active)
        tab.setAttribute('aria-selected', String(active))
        tab.setAttribute('tabindex', active ? '0' : '-1')
      })

      onActivate(viewId)
      if (activateOptions.scroll !== false && (!wasActive || activateOptions.forceScroll)) {
        scrollViewIntoPosition(view)
      }
      return true
    }

    function bindInteractions() {
      if (interactionsBound) return
      interactionsBound = true
      tabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
          activate(tab.dataset.view, { forceScroll: true })
        })
      })
      triggers.forEach(function (trigger) {
        trigger.addEventListener('click', function (event) {
          if (trigger.tagName === 'A') event.preventDefault()
          activate(trigger.dataset.activateView, { forceScroll: true })
        })
      })
    }

    tabs.forEach(function (tab) {
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-controls', tab.dataset.view)
    })

    if (navigation) navigation.setAttribute('role', 'tablist')
    views.forEach(function (view) {
      view.setAttribute('role', 'tabpanel')
    })

    const initialTab = tabs.find(function (tab) { return tab.classList.contains('active') })
    const initialView = views.find(function (view) { return view.classList.contains('active') })
    const initialViewId = initialTab ? initialTab.dataset.view : initialView && initialView.id
    if (initialViewId) activate(initialViewId, { scroll: false })
    updateNavigationOffset()

    if (typeof windowObject.addEventListener === 'function') {
      windowObject.addEventListener('resize', updateNavigationOffset)
    }
    if (options.bindInteractions !== false) bindInteractions()

    return {
      activate,
      bindInteractions,
      scrollViewIntoPosition,
      updateNavigationOffset
    }
  }

  global.ProspectsSchedulerNavigation = { create }
})(typeof window === 'undefined' ? globalThis : window)
