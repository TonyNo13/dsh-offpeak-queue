// dsh-offpeak-queue -- web client half (native DSH UI, defensive).
// Hard constraints: module load and apply() never throw outward; every failure is
// reported to the console and the host /report route only. UI contract:
// window.__ModuleLoader__.load({ id, factory }); the factory CommonJS export is
// { apply(ctx), inject: ['slots', 'sessions'] }.
// Surfaces: conversation.input.right composer toggle, sidebar.footer.action entry,
// and a queue modal mounted through react-dom/client into document.body.

;(function () {
  let load = null
  try {
    if (typeof window !== 'undefined' && window && typeof window.__ModuleLoader__ === 'object') {
      load = window.__ModuleLoader__.load.bind(window.__ModuleLoader__)
    }
  } catch { load = null }
  if (!load) {
    try { if (typeof console !== 'undefined') console.warn('[offpeak-queue] client loader unavailable') } catch { /* ignore */ }
    return
  }

  try {
    load({
      id: 'dsh-offpeak-queue',
      factory: (require) => {
        const module = { exports: {} }
        const inject = ['slots', 'sessions']
        const BASE = '/dsh-offpeak-queue'
        const CLIENT_BUILD = '0.2.0-native-ui'

        const consoleError = (...a) => { try { if (typeof console !== 'undefined') console.error('[offpeak-queue]', ...a) } catch { /* ignore */ } }

        const report = (kind, error) => {
          try {
            const message = (error && error.message ? String(error.message) : String(error || kind)).slice(0, 1000)
            const stack = error && error.stack ? String(error.stack).slice(0, 600) : ''
            void fetch(BASE + '/report', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ level: 'error', kind, message, stack }),
            }).catch(() => {})
          } catch { /* ignore */ }
        }
        const reportInfo = (message) => {
          try {
            void fetch(BASE + '/report', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ level: 'info', kind: 'client', message }),
            }).catch(() => {})
          } catch { /* ignore */ }
        }

        // ---------- dependencies (each one optional, never throws outward) ----------
        let React = null
        try { React = require('react') } catch (error) { consoleError('react unavailable', error) }
        let createRoot = null
        try {
          const reactDomClient = require('react-dom/client')
          if (reactDomClient && typeof reactDomClient.createRoot === 'function') createRoot = reactDomClient.createRoot
        } catch (error) { consoleError('react-dom/client unavailable', error) }
        let primitives = null
        try { primitives = require('@deepseek-ai/dsh-client-ui-primitives') } catch (error) { primitives = null }

        if (React === null) {
          reportInfo('client boot: react unavailable, UI not mounted')
          module.exports = { apply: () => {}, inject }
          return module.exports
        }

        const el = React.createElement
        const time = (ms) => {
          try { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
        }
        const providerLabel = (snap, providerId) => {
          try {
            if (!providerId) return ''
            const list = snap && Array.isArray(snap.providers) ? snap.providers : []
            const found = list.find((p) => p.id === providerId)
            return found && found.label ? found.label : providerId
          } catch { return providerId || '' }
        }

        // ---------- icons: shipped primitives with inline-SVG fallbacks ----------
        const ICON_PATHS = {
          send: ['M2.5 13.5L13.5 2.5', 'M6.5 2.5H13.5V9.5'],
          queue: ['M3 4.75H13', 'M3 8H13', 'M3 11.25H8.5'],
          close: ['M4.6 4.6L11.4 11.4', 'M11.4 4.6L4.6 11.4'],
        }
        const inlineIcon = (key, defaultSize) => function InlineIcon(props) {
          const size = props && typeof props.size === 'number' ? props.size : defaultSize
          const paths = ICON_PATHS[key].map((d, index) => el('path', { key: index, d }))
          return el('svg', {
            width: size,
            height: size,
            viewBox: '0 0 16 16',
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.4,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': 'true',
          }, paths)
        }
        const primitive = (name) => { try { return primitives && primitives[name] ? primitives[name] : null } catch { return null } }
        const IconSend = primitive('IconSendOutline14') || inlineIcon('send', 14)
        const IconQueue = primitive('IconQueueOutline14') || inlineIcon('queue', 14)
        const IconClose = primitive('IconCloseOutline16') || inlineIcon('close', 16)
        const ShippedTooltip = primitive('Tooltip')
        function Tooltip(props) {
          if (ShippedTooltip) return el(ShippedTooltip, props)
          const child = props ? props.children : null
          const label = props && typeof props.label === 'string' ? props.label : ''
          if (!React.isValidElement(child) || label === '') return child === undefined ? null : child
          return React.cloneElement(child, { title: child.props && child.props.title ? child.props.title : label })
        }

        // ---------- stylesheet (product tokens, Skill Center geometry) ----------
        const CSS_TAG_ID = 'dsh-offpeak-queue/client.css'
        const CSS = [
          // composer toggle (matches the composer tool-row icon buttons)
          '.oqToggle{corner-shape:round;position:relative;display:grid;place-items:center;flex:none;width:28px;height:28px;padding:0;color:var(--dsw-alias-label-primary,#1c1e26);background:var(--dsw-specific-selector,rgba(0,0,0,.05));border:none;border-radius:999px;cursor:pointer}',
          '.oqToggle:hover{background:var(--dsw-alias-interactive-bg-hover-solid,rgba(0,0,0,.08))}',
          '.oqToggle[data-active]{color:var(--dsw-alias-state-business-primary,#4353a3);background:var(--dsw-alias-state-business-secondary,#e8ecff)}',
          '.oqToggle:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,#4353a3);outline-offset:1px}',
          '.oqToggleBadge{position:absolute;top:-3px;right:-3px;display:block;box-sizing:border-box;min-width:14px;height:14px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-button-info-fill,#4165d7);color:#fff;font-size:9.5px;font-weight:600;line-height:14px;text-align:center;font-variant-numeric:tabular-nums}',
          '.oqToggle[data-peak][data-active] .oqToggleBadge{background:var(--dsw-alias-state-warn-primary,#e8a23c)}',
          // sidebar footer action (matches the Cordis panel row)
          '.oqLayer{display:flex;align-items:center;justify-content:center;position:relative;flex:none;width:36px;height:36px;margin:0 0 0 6px}',
          '.oqFooterButtons{display:flex;align-items:center;width:auto}',
          '.oqBadge{corner-shape:round;display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:36px;height:36px;margin:0;padding:0;color:var(--dsw-alias-label-secondary,#61666b);background:0 0;border:none;border-radius:50%;cursor:pointer;font-family:inherit}',
          '.oqBadge:hover,.oqBadge[data-active]{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1c1e26)}',
          '.oqBadgeCount{position:absolute;top:-2px;right:-2px;display:block;box-sizing:border-box;min-width:15px;height:15px;padding:0 4px;border-radius:999px;background:var(--dsw-alias-button-info-fill,#4165d7);color:#fff;font-size:9.5px;font-weight:600;line-height:15px;text-align:center;font-variant-numeric:tabular-nums}',
          '.oqBadge[data-peak] .oqBadgeCount{background:var(--dsw-alias-state-warn-primary,#e8a23c)}',
          // Collapsed rail (56px): the shell centres the whole footer-action seat as one
          // horizontal strip (justify-content:center; width:auto), so a second 36px
          // registrant makes the strip 78px wide and it hangs 21px past each rail edge.
          // Every other rail row stacks in the 36px column, so the rail entry drops the
          // wide-mode leading seam and pins the seat to a column while it is the rail one.
          '.oqLayer[data-oq-rail="rail"]{margin:0}',
          '*:has(> [data-slot="sidebar.footer.action"] .oqLayer[data-oq-rail="rail"]){flex-direction:column;align-items:center;gap:4px}',
          // modal (Skill Center overlay + card)
          '.oqOverlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-mask-2,#080a1073);font-family:system-ui,-apple-system,Segoe UI,sans-serif}',
          '.oqCard{display:flex;flex-direction:column;width:min(780px,92vw);max-height:84vh;overflow:hidden;background:var(--dsw-alias-bg-overlay,#fdfdfd);color:var(--dsw-alias-label-primary,#1c1e26);border-radius:12px;box-shadow:0 18px 60px #00000059}',
          '.oqHead{display:flex;align-items:center;gap:10px;padding:12px 16px;background:var(--dsw-alias-bg-base,#fff)}',
          '.oqHeadTitle{flex:none;margin:0;font-size:15px;font-weight:600}',
          '.oqPill{flex:none;padding:1px 8px;border-radius:99px;background:var(--dsw-alias-bg-layer-2,#ebeef5);color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px;line-height:18px}',
          '.oqPill[data-peak]{color:var(--dsw-alias-state-warn-primary,#b26a00);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#e8a23c) 14%,transparent)}',
          '.oqHeadSpacer{flex:1}',
          '.oqHeadButton{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;padding:0;color:var(--dsw-alias-label-secondary,#3a3f4b);background:0 0;border:none;border-radius:999px;cursor:pointer}',
          '.oqHeadButton:hover{color:var(--dsw-alias-label-primary,#1c1e26);background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}',
          '.oqBody{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;padding:0 16px 16px;overflow-y:auto;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}',
          '.oqStatus{margin:0;padding:18px;color:var(--dsw-alias-label-secondary,#6b7280);text-align:center;font-size:13px}',
          '.oqSection{display:flex;flex-direction:column;gap:8px;padding:10px 12px;background:var(--dsw-alias-bg-base,#fff);border:1px solid var(--dsw-alias-border-l1,#e5e7eb);border-radius:10px}',
          '.oqSectionHead{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600}',
          '.oqSectionNote{color:var(--dsw-alias-label-secondary,#8a8f9c);font-size:11px;font-weight:400}',
          '.oqCount{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;margin-left:auto;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,#ebeef5);color:var(--dsw-alias-label-secondary,#4b5563);font-size:10.5px;font-weight:600;font-variant-numeric:tabular-nums}',
          '.oqNote{margin:0;color:var(--dsw-alias-label-secondary,#6b7280);font-size:12px;line-height:18px}',
          '.oqNote.oqError{color:var(--dsw-alias-state-error-primary,#b42318)}',
          '.oqPath{margin:0;color:var(--dsw-alias-label-tertiary,#a2a7b3);font-family:ui-monospace,Consolas,monospace;font-size:10px;word-break:break-all}',
          '.oqRow{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-primary,#1c1e26)}',
          '.oqCheck{margin:0}',
          '.oqFlash{color:var(--dsw-alias-state-success-primary,#0f9d6e);font-size:11px}',
          '.oqFlash.oqFlashError{color:var(--dsw-alias-state-error-primary,#b42318)}',
          '.oqList{display:flex;flex-direction:column;gap:4px}',
          '.oqItem{display:grid;grid-template-columns:44px minmax(0,1fr) auto;align-items:center;gap:10px;padding:8px;border-radius:8px}',
          '.oqItem:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04))}',
          '.oqItemTime{color:var(--dsw-alias-label-secondary,#8a8f9c);font-size:11px;font-variant-numeric:tabular-nums}',
          '.oqItemMain{min-width:0}',
          '.oqItemText{overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;color:var(--dsw-alias-label-primary,#1c1e26);font-size:12.5px;line-height:1.48;white-space:pre-wrap;word-break:break-word}',
          '.oqItemSub{display:flex;align-items:center;gap:7px;min-width:0;margin-top:3px;color:var(--dsw-alias-label-secondary,#6b7280);font-size:11px}',
          '.oqItemError{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-state-error-primary,#b42318)}',
          '.oqItemActions{display:flex;align-items:center;gap:6px}',
          '.oqBtn{display:inline-flex;align-items:center;justify-content:center;height:27px;padding:0 10px;color:var(--dsw-alias-label-primary,#1c1e26);background:0 0;border:1px solid var(--dsw-alias-border-l1,#d7dae0);border-radius:9px;cursor:pointer;font-family:inherit;font-size:11.5px;white-space:nowrap}',
          '.oqBtn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.05))}',
          '.oqBtnActive{color:var(--dsw-alias-state-business-primary,#4353a3);background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4353a3) 14%,transparent);border-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,#4353a3) 52%,transparent);font-weight:600}',
          '.oqBtnGhost{color:var(--dsw-alias-label-secondary,#6b7280)}',
          '.oqBtnDanger{color:var(--dsw-alias-state-error-primary,#d92d20)}',
          // dark theme parity with the Skill Center
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqCard,body[data-ds-dark-theme]:not([data-dsh-skin]) .oqHead{background:#2c2c2e}',
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqSection{background:#3a3a3c;border-color:#ffffff14}',
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqItem:hover{background:#ffffff14}',
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqHeadButton{color:#ffffffd9;background:#ffffff1a}',
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqHeadButton:hover{background:#ffffff26}',
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqPill{background:#ffffff1a;color:#ffffffb3}',
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqCount{background:#ffffff1a;color:#ffffffb3}',
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqBtn{border-color:#ffffff1a;color:#ffffffd9}',
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqRow,body[data-ds-dark-theme]:not([data-dsh-skin]) .oqSectionHead{color:#fff}',
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqToggle{background:#ffffff1a;color:#ffffffd9}',
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqToggle:hover{background:#ffffff26}',
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqBtnActive{background:#6378dc33;color:#b6c2ff;border-color:#6378dc88}',
          'body[data-ds-dark-theme]:not([data-dsh-skin]) .oqToggle[data-active]{background:#6378dc33;color:#b6c2ff}',
        ].join('')
        function injectCss() {
          try {
            if (typeof document === 'undefined') return
            if (document.querySelector('style[data-plugin-css=' + JSON.stringify(CSS_TAG_ID) + ']') !== null) return
            const tag = document.createElement('style')
            tag.dataset.plugin = 'dsh-offpeak-queue'
            tag.dataset.pluginCss = CSS_TAG_ID
            tag.textContent = CSS
            document.head.appendChild(tag)
          } catch (error) { consoleError('css inject', error) }
        }

        // ---------- shared live state ----------
        const store = {
          latest: null,
          listeners: new Set(),
          get: () => store.latest,
          set: (next) => {
            store.latest = next
            for (const listener of [...store.listeners]) {
              try { listener(next) } catch (error) { consoleError('state listener', error) }
            }
          },
          subscribe: (listener) => {
            store.listeners.add(listener)
            return () => { store.listeners.delete(listener) }
          },
        }
        function useQueue() {
          const [snap, setSnap] = React.useState(store.get())
          React.useEffect(() => store.subscribe(setSnap), [])
          return snap
        }

        function apply(ctx) {
          try { applyInner(ctx) } catch (error) { consoleError('apply crashed', error); report('client-apply-crash', error) }
        }

        function applyInner(ctx) {
          const getService = (serviceName) => {
            try {
              if (ctx && typeof ctx.get === 'function') {
                const value = ctx.get(serviceName)
                if (value !== undefined) return value
              }
            } catch { /* continue */ }
            try {
              const direct = ctx ? ctx[serviceName] : undefined
              if (direct !== undefined) return direct
            } catch { /* ignore */ }
            return undefined
          }

          const slots = getService('slots')
          if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
            reportInfo('client boot: slots service unavailable, UI not mounted')
            return
          }
          injectCss()

          // window-level safety net: report uncaught renderer errors, never rethrow.
          try {
            const onWindowError = (event) => {
              const error = event && event.error ? event.error : (event && event.message ? new Error(String(event.message)) : null)
              report('window-error', error || event)
            }
            const onUnhandled = (event) => report('unhandledrejection', event && event.reason)
            window.addEventListener('error', onWindowError)
            window.addEventListener('unhandledrejection', onUnhandled)
            ctx.effect(() => () => {
              try { window.removeEventListener('error', onWindowError) } catch { /* ignore */ }
              try { window.removeEventListener('unhandledrejection', onUnhandled) } catch { /* ignore */ }
            }, 'offpeak-queue: window listeners')
          } catch { /* ignore */ }

          let activeSessionId = ''
          let slotSetDraft = null
          let lastCaptureKey = ''
          let lastCaptureAt = 0

          // ---------- queue modal controller (own React root on document.body) ----------
          const modal = {
            host: null,
            root: null,
            open: false,
            listeners: new Set(),
            isOpen() { return modal.open },
            subscribe(listener) {
              modal.listeners.add(listener)
              return () => { modal.listeners.delete(listener) }
            },
            notify() {
              for (const listener of [...modal.listeners]) {
                try { listener(modal.open) } catch (error) { consoleError('modal listener', error) }
              }
            },
            show() {
              try {
                if (modal.root !== null) return
                if (typeof createRoot !== 'function') { reportInfo('client: react-dom/client unavailable, modal not mounted'); return }
                const host = document.createElement('div')
                host.setAttribute('data-oq-queue', 'modal-host')
                host.setAttribute('data-dsh-plugin', 'offpeak-queue')
                document.body.appendChild(host)
                const root = createRoot(host)
                modal.host = host
                modal.root = root
                modal.open = true
                root.render(el(QueueModal, { onClose: modal.close }))
                modal.notify()
                void refresh()
              } catch (error) {
                consoleError('modal open', error)
                report('modal-open', error)
                modal.host = null
                modal.root = null
              }
            },
            close() {
              try {
                const root = modal.root
                const host = modal.host
                modal.root = null
                modal.host = null
                modal.open = false
                if (root !== null) root.unmount()
                if (host && host.parentNode) host.parentNode.removeChild(host)
              } catch (error) { consoleError('modal close', error); report('modal-close', error) }
              modal.notify()
            },
            toggle() { if (modal.open) modal.close(); else modal.show() },
          }
          function useModalOpen() {
            const [open, setOpen] = React.useState(modal.isOpen())
            React.useEffect(() => modal.subscribe(setOpen), [])
            return open
          }

          // ---------- host transport ----------
          async function refresh() {
            try {
              const sessionId = currentSessionId()
              const query = sessionId === '' ? '' : '?sessionId=' + encodeURIComponent(sessionId)
              const response = await fetch(BASE + '/state' + query)
              if (!response.ok) return
              const body = await response.json()
              if (body && typeof body === 'object') store.set(body)
            } catch { /* retry on the next poll */ }
          }
          async function act(action, args) {
            try {
              const response = await fetch(BASE + '/action', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action, args }),
              })
              if (response.ok) {
                const body = await response.json()
                if (body && typeof body === 'object' && body.state) store.set(body.state)
                else void refresh()
                return Boolean(body && body.ok === true)
              }
            } catch { /* fall through to a refresh */ }
            void refresh()
            return false
          }
          const runAction = (action, args) => {
            try { return act(action, args) } catch (error) { report('client-action', error); return Promise.resolve(false) }
          }

          // ---------- session resolution ----------
          function normalizeSessionId(value) {
            try {
              const text = typeof value === 'string' ? value.trim() : ''
              return /^session-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text) ? text : ''
            } catch { return '' }
          }
          function rememberSession(props) {
            try {
              const candidates = [
                props && props.sessionId,
                props && props.session && props.session.id,
                props && props.owner && props.owner.sessionId,
                props && props.owner && props.owner.id,
              ]
              const found = candidates.map(normalizeSessionId).find((value) => value !== '')
              if (found) activeSessionId = found
              if (props && props.inputActions && typeof props.inputActions.setDraft === 'function') {
                slotSetDraft = props.inputActions.setDraft.bind(props.inputActions)
              }
            } catch { /* ignore */ }
          }
          function sessionFromService() {
            try {
              const sessions = getService('sessions')
              const list = sessions && sessions.list
              if (!list || typeof list.getSnapshot !== 'function') return { available: false, id: '' }
              const snapshot = list.getSnapshot()
              return { available: true, id: normalizeSessionId(snapshot && snapshot.current) }
            } catch { return { available: false, id: '' } }
          }
          function sessionFromEditor(editor) {
            try {
              if (!editor || typeof editor !== 'object') return ''
              const key = Object.keys(editor).find((name) => name.indexOf('__reactFiber$') === 0)
              let fiber = key ? editor[key] : null
              for (let depth = 0; fiber && depth < 30; depth += 1, fiber = fiber.return) {
                const candidates = [
                  fiber.memoizedProps && fiber.memoizedProps.sessionId,
                  fiber.pendingProps && fiber.pendingProps.sessionId,
                ]
                const found = candidates.map(normalizeSessionId).find((value) => value !== '')
                if (found) return found
              }
            } catch { /* fall through */ }
            return ''
          }
          function currentSessionId(editor) {
            const editorId = sessionFromEditor(editor)
            const service = sessionFromService()
            if (editorId !== '' && service.id !== '' && editorId !== service.id) {
              reportInfo('session mismatch blocked: editor=' + editorId + ' current=' + service.id + ' build=' + CLIENT_BUILD)
              return ''
            }
            if (editorId !== '') return editorId
            if (service.id !== '') return service.id
            // The sessions service exists but proves no current session: a switch is in
            // flight, so the cached id must not be reused.
            if (service.available) return ''
            try {
              const raw = decodeURIComponent(String(window.location && window.location.href ? window.location.href : ''))
              const match = raw.match(/(?:session-)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
              if (match) return normalizeSessionId(match[0])
            } catch { /* fall through */ }
            return activeSessionId
          }

          // ---------- composer DOM helpers ----------
          function isActuallyVisible(node) {
            try {
              if (!node || typeof node.getBoundingClientRect !== 'function') return false
              const style = window.getComputedStyle(node)
              if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false
              const rect = node.getBoundingClientRect()
              return rect.width > 0 && rect.height > 0
            } catch { return false }
          }
          function findComposerEditor(ignoreNode) {
            try {
              const candidates = [...document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')]
                .filter((candidate) => (!ignoreNode || !ignoreNode.contains(candidate)) && isActuallyVisible(candidate))
                .map((candidate) => ({ candidate, rect: candidate.getBoundingClientRect() }))
                .filter((entry) => entry.rect.width >= 220 && entry.rect.bottom <= window.innerHeight + 8)
                .sort((a, b) => b.rect.bottom - a.rect.bottom)
              return candidates.length > 0 ? candidates[0].candidate : null
            } catch { return null }
          }
          function composerEditorForEvent(event) {
            try {
              const target = event && event.target
              const host = modal.host
              if (!target) return null
              if (host && typeof host.contains === 'function' && host.contains(target)) return null
              const preferred = findComposerEditor(host)
              if (typeof target.closest === 'function') {
                const direct = target.closest('textarea,[contenteditable="true"],[role="textbox"]')
                if (direct && isActuallyVisible(direct)) {
                  return preferred && (direct === preferred || direct.contains(preferred) || preferred.contains(direct)) ? direct : null
                }
                const form = target.closest('form')
                if (form) {
                  const inForm = [...form.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')].find(isActuallyVisible)
                  if (inForm) return preferred && (inForm === preferred || inForm.contains(preferred) || preferred.contains(inForm)) ? inForm : null
                }
              }
              return preferred
            } catch { return null }
          }
          function editorText(editor) {
            try {
              if (!editor) return ''
              if ('value' in editor && typeof editor.value === 'string') return editor.value
              return typeof editor.innerText === 'string' ? editor.innerText : String(editor.textContent || '')
            } catch { return '' }
          }
          function clearComposer(editor) {
            try { if (typeof slotSetDraft === 'function') slotSetDraft('') } catch (error) { report('clear-composer-slot', error) }
            try {
              if (!editor) return
              if ('value' in editor) {
                const proto = editor.tagName === 'TEXTAREA'
                  ? window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype
                  : window.HTMLInputElement && window.HTMLInputElement.prototype
                const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null
                if (descriptor && typeof descriptor.set === 'function') descriptor.set.call(editor, '')
                else editor.value = ''
              } else {
                editor.textContent = ''
              }
              editor.dispatchEvent(new Event('input', { bubbles: true }))
              editor.dispatchEvent(new Event('change', { bubbles: true }))
            } catch (error) { report('clear-composer-dom', error) }
          }
          function stopEvent(event) {
            try { event.preventDefault() } catch { /* ignore */ }
            try { event.stopPropagation() } catch { /* ignore */ }
            try { event.stopImmediatePropagation() } catch { /* ignore */ }
          }

          // ---------- send interception ----------
          function shouldQueueNow() {
            const snap = store.get()
            return Boolean(snap && snap.enabled === true && snap.planMode === true && snap.sessionPhase === 'peak')
          }
          function queueFromEditor(editor, source, event) {
            if (!shouldQueueNow()) return false
            const text = editorText(editor).trim()
            if (text === '') return false
            stopEvent(event)
            const sessionId = currentSessionId(editor)
            if (sessionId === '') {
              reportInfo('send intercepted but session missing: source=' + source + ' build=' + CLIENT_BUILD)
              return true
            }
            const now = Date.now()
            const captureKey = sessionId + '\n' + text
            if (captureKey === lastCaptureKey && now - lastCaptureAt < 800) return true
            lastCaptureKey = captureKey
            lastCaptureAt = now
            reportInfo('send intercepted: source=' + source + ' session=yes build=' + CLIENT_BUILD)
            void runAction('enqueue', { text, sessionId }).then((ok) => {
              if (ok) {
                clearComposer(editor)
                reportInfo('enqueue from composer: ok build=' + CLIENT_BUILD)
              } else {
                reportInfo('enqueue from composer: failed build=' + CLIENT_BUILD)
              }
            }).catch((error) => report('enqueue-intercept', error))
            return true
          }
          // Submit-button labels across the locales DSH ships ("send"/"submit" plus the
          // CJK equivalents) without embedding non-ASCII UI copy in this client half.
          const SEND_LABEL = /send|submit|\u53d1\u9001|\u63d0\u4ea4|\u9001\u4fe1/i

          // ---------- render guards ----------
          class Boundary extends React.Component {
            constructor(props) {
              super(props)
              this.state = { crashed: false }
            }
            static getDerivedStateFromError() { return { crashed: true } }
            componentDidCatch(error) { report('render-crash', error) }
            render() { return this.state.crashed ? null : this.props.children }
          }
          const guard = (Component) => function Guarded(props) {
            return el(Boundary, null, el(Component, props))
          }

          // ---------- modal surfaces ----------
          function Section(props) {
            return el('section', { className: 'oqSection' },
              el('div', { className: 'oqSectionHead' },
                el('span', null, props.title),
                props.note ? el('span', { className: 'oqSectionNote' }, props.note) : null,
                typeof props.count === 'number' ? el('span', { className: 'oqCount' }, String(props.count)) : null,
                props.action || null,
              ),
              props.children,
            )
          }
          function ItemRow(props) {
            const item = props.item || {}
            const provider = providerLabel(props.providers, item.providerId)
            return el('div', { className: 'oqItem' },
              el('span', { className: 'oqItemTime' }, time(item.createdAt)),
              el('div', { className: 'oqItemMain' },
                el('div', { className: 'oqItemText', title: typeof item.text === 'string' ? item.text : '' }, item.text),
                el('div', { className: 'oqItemSub' },
                  el('span', null, props.zone === 'work' ? 'Delivering' : 'Waiting'),
                  item.attempts > 0 ? el('span', null, 'Retry ' + item.attempts) : null,
                  provider !== '' ? el('span', null, provider) : null,
                  item.error ? el('span', { className: 'oqItemError', title: String(item.error) }, String(item.error)) : null,
                ),
              ),
              el('div', { className: 'oqItemActions' },
                el('button', {
                  type: 'button',
                  className: 'oqBtn oqBtnGhost',
                  onClick: () => { void runAction('force', { id: item.id }) },
                }, 'Force'),
                el('button', {
                  type: 'button',
                  className: 'oqBtn oqBtnDanger',
                  onClick: () => { void runAction('revoke', { id: item.id }) },
                }, 'Cancel'),
              ),
            )
          }
          function HistoryRow(props) {
            const item = props.h || {}
            const provider = providerLabel(props.providers, item.providerId)
            const status = item.status === 'done'
              ? 'Done'
              : item.status === 'failed'
                ? 'Failed'
                : item.status === 'revoked'
                  ? 'Cancelled'
                  : String(item.status || '')
            return el('div', { className: 'oqItem' },
              el('span', { className: 'oqItemTime' }, time(item.doneAt || item.createdAt)),
              el('div', { className: 'oqItemMain' },
                el('div', { className: 'oqItemText', title: typeof item.text === 'string' ? item.text : '' }, item.text),
                el('div', { className: 'oqItemSub' },
                  el('span', { className: item.status === 'failed' ? 'oqItemError' : undefined }, status),
                  item.attempts > 0 ? el('span', null, 'Retry ' + item.attempts) : null,
                  provider !== '' ? el('span', null, provider) : null,
                  item.error ? el('span', { className: 'oqItemError', title: String(item.error) }, String(item.error)) : null,
                ),
              ),
            )
          }
          function QueueModal(props) {
            const snap = useQueue()
            const [flash, setFlash] = React.useState('')
            const [flashError, setFlashError] = React.useState(false)
            const flashTimer = React.useRef(null)
            const close = props.onClose
            const showFlash = (message, isError) => {
              setFlash(message)
              setFlashError(isError === true)
              if (flashTimer.current !== null) clearTimeout(flashTimer.current)
              flashTimer.current = setTimeout(() => { setFlash(''); flashTimer.current = null }, 2600)
            }
            React.useEffect(() => () => {
              if (flashTimer.current !== null) clearTimeout(flashTimer.current)
            }, [])
            React.useEffect(() => {
              const onKey = (event) => {
                if (event.key !== 'Escape') return
                try { event.stopPropagation() } catch { /* ignore */ }
                close()
              }
              document.addEventListener('keydown', onKey, true)
              return () => { document.removeEventListener('keydown', onKey, true) }
            }, [close])
            const planning = Boolean(snap && snap.enabled === true && snap.planMode === true)
            const peak = Boolean(snap && snap.sessionPhase === 'peak')
            const provider = providerLabel(snap, snap && snap.sessionProvider)
            const waiting = snap && Array.isArray(snap.waiting) ? snap.waiting : []
            const work = snap && Array.isArray(snap.work) ? snap.work : []
            const history = snap && Array.isArray(snap.history) ? snap.history : []
            const pickConcurrency = (value) => {
              if (snap && snap.concurrency === value) { showFlash('Already at concurrency ' + value, false); return }
              void runAction('setConcurrency', { concurrency: value }).then((ok) => {
                showFlash(ok ? 'Applied: concurrency ' + value : 'Could not save the setting', !ok)
              })
            }
            const phaseText = (peak ? 'Peak hours' : 'Off-peak hours') + (provider !== '' ? ' · ' + provider : '')
            return el('div', {
              className: 'oqOverlay',
              'data-oq-queue': 'modal',
              onMouseDown: (event) => { if (event.target === event.currentTarget) close() },
            },
              el('div', { className: 'oqCard', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Off-peak send queue' },
                el('header', { className: 'oqHead' },
                  el('h2', { className: 'oqHeadTitle' }, 'Off-peak send queue'),
                  el('span', { className: 'oqPill', 'data-peak': peak ? 'true' : undefined }, phaseText),
                  el('span', { className: 'oqHeadSpacer' }),
                  el('button', { type: 'button', className: 'oqHeadButton', 'aria-label': 'Close', onClick: close }, el(IconClose, { size: 16 })),
                ),
                el('div', { className: 'oqBody' },
                  snap === null
                    ? el('p', { className: 'oqStatus' }, 'Connecting to the queue…')
                    : [
                        el(Section, {
                          key: 'settings',
                          title: 'Runtime settings',
                          note: planning ? 'Off-peak sending is on' : 'Sending directly',
                        },
                          el('p', { className: snap.dshOffpeakAvailable === false ? 'oqNote oqError' : 'oqNote' },
                            snap.dshOffpeakAvailable === false ? 'dsh-offpeak is required' : 'Using dsh-offpeak provider schedules'),
                          el('label', { className: 'oqRow' },
                            el('input', {
                              className: 'oqCheck',
                              type: 'checkbox',
                              checked: snap.enabled === true,
                              onChange: (event) => { void runAction('setEnabled', { enabled: event.target.checked }) },
                            }),
                            el('span', null, 'Enabled'),
                          ),
                          el('div', { className: 'oqRow' },
                            el('span', null, 'Off-peak delivery concurrency'),
                            [1, 2, 3].map((value) => el('button', {
                              key: value,
                              type: 'button',
                              className: 'oqBtn' + (snap.concurrency === value ? ' oqBtnActive' : ''),
                              'aria-pressed': snap.concurrency === value,
                              onClick: () => { pickConcurrency(value) },
                            }, String(value))),
                            flash !== '' ? el('span', { className: flashError ? 'oqFlash oqFlashError' : 'oqFlash' }, flash) : null,
                          ),
                          typeof snap.configPath === 'string' && snap.configPath !== ''
                            ? el('p', { className: 'oqPath' }, 'Config: ' + snap.configPath)
                            : null,
                        ),
                        el(Section, { key: 'work', title: 'Delivering', count: work.length },
                          work.length === 0
                            ? el('p', { className: 'oqNote' }, 'Nothing is being delivered right now')
                            : el('div', { className: 'oqList' }, work.map((item) => el(ItemRow, {
                              key: item.id,
                              item,
                              zone: 'work',
                              providers: snap.providers,
                            }))),
                        ),
                        el(Section, {
                          key: 'waiting',
                          title: 'Waiting',
                          note: peak && planning ? 'Delivered automatically off-peak' : 'Delivered as soon as possible',
                          count: waiting.length,
                        },
                          waiting.length === 0
                            ? el('p', { className: 'oqNote' }, 'Nothing waiting')
                            : el('div', { className: 'oqList' }, waiting.map((item) => el(ItemRow, {
                              key: item.id,
                              item,
                              zone: 'waiting',
                              providers: snap.providers,
                            }))),
                        ),
                        el(Section, {
                          key: 'history',
                          title: 'Delivery log',
                          count: history.length,
                          action: history.length > 0
                            ? el('button', {
                              type: 'button',
                              className: 'oqBtn oqBtnGhost',
                              onClick: () => { void runAction('clearHistory', {}) },
                            }, 'Clear')
                            : null,
                        },
                          history.length === 0
                            ? el('p', { className: 'oqNote' }, 'No entries yet')
                            : el('div', { className: 'oqList' }, history.map((item) => el(HistoryRow, {
                              key: item.id + ':' + item.doneAt,
                              h: item,
                              providers: snap.providers,
                            }))),
                        ),
                      ],
                ),
              ),
            )
          }

          // ---------- slot surfaces ----------
          function ComposerToggle(props) {
            rememberSession(props)
            const snap = useQueue()
            const planning = Boolean(snap && snap.enabled === true && snap.planMode === true)
            const peak = Boolean(snap && snap.sessionPhase === 'peak')
            const count = snap && snap.counts
              ? Number(snap.counts.waiting || 0) + Number(snap.counts.work || 0)
              : 0
            const label = planning
              ? 'Off-peak queue is on: Enter stages the message for off-peak delivery'
              : 'Off-peak queue is off: Enter sends immediately'
            const Icon = planning ? IconQueue : IconSend
            return el(Tooltip, { label, side: 'top', delayMs: 500 },
              el('button', {
                type: 'button',
                className: 'oqToggle',
                'data-oq-plan-toggle': planning ? 'on' : 'off',
                'data-active': planning ? 'true' : undefined,
                'data-peak': peak ? 'true' : undefined,
                'aria-pressed': planning,
                'aria-label': label,
                onClick: () => {
                  try { void runAction('setPlanMode', { planMode: !planning }) } catch (error) { report('toggle-plan-mode', error) }
                },
              },
                el(Icon, { size: 16 }),
                count > 0 ? el('span', { className: 'oqToggleBadge' }, String(count)) : null,
              ),
            )
          }
          function SidebarEntry(props) {
            // The seat passes { wide }: false is the collapsed 56px rail, where the
            // entry has to match the other rail rows (36px circle, no leading seam).
            const rail = Boolean(props && props.wide === false)
            const snap = useQueue()
            const open = useModalOpen()
            const count = snap && snap.counts
              ? Number(snap.counts.waiting || 0) + Number(snap.counts.work || 0)
              : 0
            const peak = Boolean(snap && snap.sessionPhase === 'peak')
            const label = count > 0 ? 'Off-peak send queue, ' + count + ' waiting' : 'Off-peak send queue'
            return el('div', { className: 'oqLayer', 'data-oq-rail': rail ? 'rail' : undefined },
              el('div', { className: 'oqFooterButtons' },
                el(Tooltip, { label, side: 'right', delayMs: 400 },
                  el('button', {
                    type: 'button',
                    className: 'oqBadge',
                    'data-oq-queue': 'entry',
                    'data-active': open ? 'true' : undefined,
                    'data-peak': peak ? 'true' : undefined,
                    title: label,
                    'aria-label': label,
                    'aria-expanded': open,
                    onClick: () => { try { modal.toggle() } catch (error) { report('modal-toggle', error) } },
                  },
                    el(IconQueue, { size: 18 }),
                    count > 0 ? el('span', { className: 'oqBadgeCount' }, String(count)) : null,
                  ),
                ),
              ),
            )
          }

          // ---------- registrations (each isolated: one failure never blocks another) ----------
          try {
            ctx.effect(
              () => slots.inject('conversation.input.right', () => slots.register(
                { name: 'conversation.input.right', id: 'offpeak-queue', order: 25, label: 'Off-peak send queue' },
                guard(ComposerToggle),
              )),
              'offpeak-queue: composer toggle',
            )
          } catch (error) { consoleError('composer toggle register', error); report('composer-register', error) }
          try {
            ctx.effect(
              () => slots.inject('sidebar.footer.action', () => slots.register(
                { name: 'sidebar.footer.action', id: 'offpeak-queue', order: 25, label: 'Off-peak send queue' },
                guard(SidebarEntry),
              )),
              'offpeak-queue: sidebar entry',
            )
          } catch (error) { consoleError('sidebar entry register', error); report('sidebar-register', error) }
          try {
            ctx.effect(() => () => { try { modal.close() } catch { /* ignore */ } }, 'offpeak-queue: modal teardown')
          } catch { /* ignore */ }

          try {
            ctx.effect(() => {
              void refresh()
              const id = setInterval(() => { void refresh() }, 2500)
              return () => clearInterval(id)
            }, 'offpeak-queue: poll')
          } catch (error) { consoleError('poll start', error); report('poll-start', error) }

          try {
            ctx.effect(() => {
              const onCaptureKeyDown = (event) => {
                try {
                  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return
                  const editor = composerEditorForEvent(event)
                  if (editor) queueFromEditor(editor, 'keydown', event)
                } catch (error) { report('capture-keydown', error) }
              }
              const onCaptureSubmit = (event) => {
                try {
                  const editor = composerEditorForEvent(event)
                  if (editor) queueFromEditor(editor, 'submit', event)
                } catch (error) { report('capture-submit', error) }
              }
              const onCaptureClick = (event) => {
                try {
                  if (!shouldQueueNow()) return
                  const target = event.target
                  const button = target && typeof target.closest === 'function' ? target.closest('button,[role="button"]') : null
                  if (!button || (modal.host && modal.host.contains(button))) return
                  const label = [button.getAttribute('aria-label'), button.getAttribute('title'), button.textContent].filter(Boolean).join(' ')
                  const likelySend = String(button.getAttribute('type')).toLowerCase() === 'submit' || SEND_LABEL.test(label)
                  if (!likelySend) return
                  const editor = composerEditorForEvent(event)
                  if (editor) queueFromEditor(editor, 'click', event)
                } catch (error) { report('capture-click', error) }
              }
              document.addEventListener('keydown', onCaptureKeyDown, true)
              document.addEventListener('submit', onCaptureSubmit, true)
              document.addEventListener('click', onCaptureClick, true)
              reportInfo('send interceptor armed: session=' + (currentSessionId() === '' ? 'pending' : 'yes') + ' build=' + CLIENT_BUILD)
              return () => {
                try { document.removeEventListener('keydown', onCaptureKeyDown, true) } catch { /* ignore */ }
                try { document.removeEventListener('submit', onCaptureSubmit, true) } catch { /* ignore */ }
                try { document.removeEventListener('click', onCaptureClick, true) } catch { /* ignore */ }
              }
            }, 'offpeak-queue: send interception')
          } catch (error) { consoleError('interception start', error); report('interception-start', error) }

          reportInfo('client surfaces registered build=' + CLIENT_BUILD)
          try {
            void fetch(BASE + '/state').then((response) => {
              if (response.ok) reportInfo('client boot ok, state reachable, build=' + CLIENT_BUILD)
            }).catch(() => {})
          } catch { /* ignore */ }
        }

        module.exports = { apply, inject }
        return module.exports
      },
    })
  } catch (error) {
    try { if (typeof console !== 'undefined') console.error('[offpeak-queue] client module load failed', error) } catch { /* ignore */ }
  }
})()
