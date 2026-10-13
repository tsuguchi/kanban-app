import { useState } from 'react'
import { Avatar } from '../../components/Avatar'
import {
  DUE_FILTER_LABELS,
  EMPTY_FILTER,
  isFilterActive,
  UNASSIGNED,
  type CardFilter,
  type DueFilter,
} from '../../lib/filter'
import type { BoardMember, Label } from '../../types'

interface FilterBarProps {
  filter: CardFilter
  onChange: (filter: CardFilter) => void
  members: BoardMember[]
  labels: Label[]
  shownCount: number
  totalCount: number
}

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((v) => v !== value) : [...values, value]
}

// キーワード検索と、担当者・ラベル・期限での絞り込み（F-80〜F-83）
export function FilterBar({ filter, onChange, members, labels, shownCount, totalCount }: FilterBarProps) {
  const [panelOpen, setPanelOpen] = useState(false)
  const conditionCount = filter.assigneeIds.length + filter.labelIds.length + filter.due.length

  return (
    <div className="filter-bar">
      <input
        type="search"
        aria-label="カードを検索"
        placeholder="カードを検索"
        value={filter.keyword}
        onChange={(event) => onChange({ ...filter, keyword: event.target.value })}
      />
      <div className="filter-menu">
        <button
          type="button"
          className="button-secondary"
          aria-expanded={panelOpen}
          aria-controls="filter-panel"
          onClick={() => setPanelOpen(!panelOpen)}
        >
          絞り込み{conditionCount > 0 && `（${conditionCount}）`}
        </button>
        {panelOpen && (
          <div
            id="filter-panel"
            className="filter-panel"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setPanelOpen(false)
            }}
          >
            <fieldset>
              <legend>担当者</legend>
              {members.map((member) => (
                <label key={member.uid}>
                  <input
                    type="checkbox"
                    checked={filter.assigneeIds.includes(member.uid)}
                    onChange={() => onChange({ ...filter, assigneeIds: toggle(filter.assigneeIds, member.uid) })}
                  />
                  <Avatar name={member.displayName} photoURL={member.photoURL} />
                  {member.displayName}
                </label>
              ))}
              <label>
                <input
                  type="checkbox"
                  checked={filter.assigneeIds.includes(UNASSIGNED)}
                  onChange={() => onChange({ ...filter, assigneeIds: toggle(filter.assigneeIds, UNASSIGNED) })}
                />
                担当者なし
              </label>
            </fieldset>

            <fieldset>
              <legend>ラベル</legend>
              {labels.length === 0 && <p className="hint">ラベルはありません</p>}
              {labels.map((label) => (
                <label key={label.id}>
                  <input
                    type="checkbox"
                    checked={filter.labelIds.includes(label.id)}
                    onChange={() => onChange({ ...filter, labelIds: toggle(filter.labelIds, label.id) })}
                  />
                  <span className="card-label" style={{ background: label.color }}>{label.name}</span>
                </label>
              ))}
            </fieldset>

            <fieldset>
              <legend>期限</legend>
              {(Object.keys(DUE_FILTER_LABELS) as DueFilter[]).map((due) => (
                <label key={due}>
                  <input
                    type="checkbox"
                    checked={filter.due.includes(due)}
                    onChange={() => onChange({ ...filter, due: toggle(filter.due, due) })}
                  />
                  {DUE_FILTER_LABELS[due]}
                </label>
              ))}
            </fieldset>

            <div className="filter-panel-footer">
              <button type="button" className="button-secondary" onClick={() => setPanelOpen(false)}>閉じる</button>
            </div>
          </div>
        )}
      </div>

      {/* 絞り込み中であることを示し、ワンクリックで解除できるようにする（F-82） */}
      {isFilterActive(filter) && (
        <p className="filter-status" role="status">
          絞り込み中：{totalCount} 枚中 {shownCount} 枚を表示
          <button
            type="button"
            className="button-icon"
            onClick={() => {
              onChange(EMPTY_FILTER)
              setPanelOpen(false)
            }}
          >
            解除
          </button>
        </p>
      )}
    </div>
  )
}
