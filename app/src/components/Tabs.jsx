import { useState } from 'react'

/**
 * Reusable tabs component with underline-style nav.
 *
 * tabs: array of { key, label, content } where content is any JSX
 * initialTab: optional key of the tab to show first (defaults to tabs[0])
 *
 * Keeps active state locally — tab resets to default on every mount.
 * (Switch to URL-param state later if we want deep-linkable tabs.)
 */
export default function Tabs({ tabs, initialTab }) {
  const [active, setActive] = useState(initialTab ?? tabs[0]?.key)
  const current = tabs.find((t) => t.key === active)

  return (
    <div className="profile-tabs">
      <div className="profile-tabs-nav">
        {tabs.map((tab) => (
          <button
            key={tab.key}
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