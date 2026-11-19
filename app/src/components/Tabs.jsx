import { useState, useRef, useEffect } from 'react'

/**
 * Reusable tabs component with underline-style nav.
 *
 * tabs: array of { key, label, content } where content is any JSX
 * initialTab: optional key of the tab to show first (defaults to tabs[0])
 *
 * Keeps active state locally — tab resets to default on every mount.
 * (Switch to URL-param state later if we want deep-linkable tabs.)
 *
 * Nov 19: when the nav overflows horizontally on narrow viewports (e.g.
 * 6 tabs on the player profile), the active tab is auto-scrolled into
 * view on mount and whenever the active key changes. Without this, a
 * user landing on a deep-linked tab like `tracking` could find the row
 * scrolled to the start and the actual active tab out of sight.
 */
export default function Tabs({ tabs, initialTab }) {
  const [active, setActive] = useState(initialTab ?? tabs[0]?.key)
  const current = tabs.find((t) => t.key === active)

  // Keep a ref per tab button keyed by tab.key, so when `active` changes
  // we can scroll that button into view horizontally without touching the
  // page's vertical scroll position.
  const buttonRefs = useRef({})

  useEffect(() => {
    const el = buttonRefs.current[active]
    if (!el || typeof el.scrollIntoView !== 'function') return
    // inline: 'nearest' centers if needed but doesn't scroll when the
    // tab is already visible. block: 'nearest' never touches vertical
    // scroll — important, otherwise the page would jump on tab switch.
    el.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [active])

  return (
    <div className="profile-tabs">
      <div className="profile-tabs-nav">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            ref={(el) => { buttonRefs.current[tab.key] = el }}
            type="button"
            className={`profile-tab ${tab.key === active ? 'active' : ''}`}
            onClick={() => setActive(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="profile-tabs-content">{current?.content}</div>
    </div>
  )
}
