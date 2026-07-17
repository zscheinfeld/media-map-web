import {Box, Button, Card, Flex, Stack, Switch, Text} from '@sanity/ui'
import {formatMomentYear, type Moment} from './moment'
import type {ResolvedOverride} from './pendingChanges'
import {vitalActiveAt, type EditorCompany} from './sanityMapData'

export type PlanetInspectorProps = {
  selectedCompany: EditorCompany | null
  /** All resolved overrides for the selected planet (Sanity + pending), sorted asc. */
  history: ResolvedOverride[]
  /** The override active at the current global moment (forward-propagated). */
  activeOverride: ResolvedOverride | null
  /** Whether `activeOverride` was authored exactly at the current global moment. */
  isActiveAtCurrentMoment: boolean
  /** The current global moment, used in labels + button copy. */
  currentMoment: Moment
  onTogglePin: (next: boolean) => void
  /** Remove the override at the current global moment (no-op if none exists). */
  onClearAtCurrentMoment: () => void
  onClose: () => void
}

const ESHAP_KIND_LABEL: Record<string, string> = {
  linkedin: 'LinkedIn',
  podcast: 'Podcast',
  substack: 'Substack',
}

const ORIGIN_LABEL: Record<ResolvedOverride['origin'], string> = {
  sanity: '',
  'sanity-edited': ' · edited',
  'pending-new': ' · new',
  'sanity-deleted-pending': ' · deleting',
}

/**
 * Selected-planet inspector for the Map Editor. The global year+month selector
 * picks WHICH moment is being edited; this panel acts on that moment:
 *   - shows the planet's full override history (read-only list)
 *   - pin toggle operates on the active (forward-propagated) override
 *   - "Clear override at this moment" removes the override authored *exactly*
 *     at the current moment (so the planet falls back to whatever earlier
 *     override forward-propagates into this moment)
 */
export function PlanetInspector({
  selectedCompany,
  history,
  activeOverride,
  isActiveAtCurrentMoment,
  currentMoment,
  onTogglePin,
  onClearAtCurrentMoment,
  onClose,
}: PlanetInspectorProps) {
  if (!selectedCompany) return null
  const momentLabel = formatMomentYear(currentMoment)
  // Vitals visible on the current map (inside their date window).
  const vitals = (selectedCompany.vitals ?? []).filter((v) => vitalActiveAt(v, currentMoment))
  // Related content — not time-bound; shown newest-first.
  const byDateDesc = (a: {published_date?: string}, b: {published_date?: string}) =>
    (b.published_date ?? '').localeCompare(a.published_date ?? '')
  const eshap = [...(selectedCompany.eshapContent ?? [])].sort(byDateDesc)
  const articles = [...(selectedCompany.externalArticles ?? [])].sort(byDateDesc)

  return (
    <Card
      padding={3}
      radius={2}
      shadow={2}
      style={{
        position: 'absolute',
        top: 92,
        right: 12,
        width: 280,
        background: 'rgba(7,14,32,0.94)',
        maxHeight: 'calc(100% - 110px)',
        overflow: 'auto',
      }}
    >
      <Stack space={3}>
        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold" style={{color: '#fff'}}>
            {selectedCompany.name}
          </Text>
          <Button mode="bleed" tone="default" text="✕" onClick={onClose} padding={2} fontSize={1} />
        </Flex>

        {/* Vitals — time-bound fact tags shown for the current map. */}
        {vitals.length > 0 && (
          <Stack space={2}>
            <Text size={0} muted style={{textTransform: 'uppercase', letterSpacing: 1}}>
              Vitals
            </Text>
            <Flex wrap="wrap" gap={2}>
              {vitals.map((v) => (
                <Card
                  key={v._key}
                  padding={2}
                  radius={2}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <Stack space={1}>
                    <Text size={1} weight="semibold" style={{color: '#fff'}}>
                      {v.name}
                    </Text>
                    {v.statistic && (
                      <Text size={0} style={{color: 'rgba(255,255,255,0.55)'}}>
                        {v.statistic}
                      </Text>
                    )}
                  </Stack>
                </Card>
              ))}
            </Flex>
          </Stack>
        )}

        {/* Description — Evan's context blurb (not time-bound). */}
        {selectedCompany.description && (
          <Text size={1} style={{color: 'rgba(255,255,255,0.78)', lineHeight: 1.4}}>
            {selectedCompany.description}
          </Text>
        )}

        {/* Eshap content — Evan's own posts, newest first. */}
        {eshap.length > 0 && (
          <Stack space={2}>
            <Text size={0} muted style={{textTransform: 'uppercase', letterSpacing: 1}}>
              Eshap content
            </Text>
            <Stack space={1}>
              {eshap.map((c) => (
                <a key={c._key} href={c.url} target="_blank" rel="noreferrer" style={{textDecoration: 'none'}}>
                  <Text size={1} style={{color: '#9ec5ff'}}>
                    {ESHAP_KIND_LABEL[c.kind] ?? c.kind} · {c.title}
                  </Text>
                </a>
              ))}
            </Stack>
          </Stack>
        )}

        {/* External articles — recent finance news, newest first. */}
        {articles.length > 0 && (
          <Stack space={2}>
            <Text size={0} muted style={{textTransform: 'uppercase', letterSpacing: 1}}>
              Articles
            </Text>
            <Stack space={1}>
              {articles.map((a) => (
                <a key={a._key} href={a.url} target="_blank" rel="noreferrer" style={{textDecoration: 'none'}}>
                  <Text size={1} style={{color: '#9ec5ff'}}>
                    {a.title}
                  </Text>
                </a>
              ))}
            </Stack>
          </Stack>
        )}

        {/* State at the currently-selected moment. */}
        <Stack space={2}>
          <Text size={0} muted style={{textTransform: 'uppercase', letterSpacing: 1}}>
            At {momentLabel}
          </Text>
          {activeOverride ? (
            <Text size={1} style={{color: '#fff', fontVariantNumeric: 'tabular-nums'}}>
              ({Math.round(activeOverride.x)}, {Math.round(activeOverride.y)})
              {activeOverride.pin ? ' · pinned' : ''}
            </Text>
          ) : (
            <Text size={1} muted>
              No specific coordinates yet — drifting in its sector. Drag to author a position from {momentLabel}.
            </Text>
          )}
          {activeOverride && !isActiveAtCurrentMoment && (
            <Text size={0} muted>
              Inherited from {formatMomentYear(activeOverride.moment)} (forward-propagated).
            </Text>
          )}
        </Stack>

        {/* Pin toggle — acts on the active override. */}
        {activeOverride && (
          <Flex align="center" justify="space-between">
            <Box>
              <Text size={1} style={{color: '#fff'}}>
                Pinned
              </Text>
              <Text size={0} muted>
                On: locked. Off: soft attractor.
              </Text>
            </Box>
            <Switch
              checked={activeOverride.pin}
              onChange={(e) => onTogglePin(e.currentTarget.checked)}
            />
          </Flex>
        )}

        {/* Clear override at exactly this moment (only meaningful when one exists). */}
        {isActiveAtCurrentMoment && (
          <Button
            text={`Clear override at ${momentLabel}`}
            mode="ghost"
            tone="critical"
            fontSize={1}
            padding={2}
            onClick={onClearAtCurrentMoment}
          />
        )}

        {/* Read-only history list — every override authored for this planet, sorted. */}
        <Stack space={2}>
          <Text size={0} muted style={{textTransform: 'uppercase', letterSpacing: 1}}>
            History ({history.length})
          </Text>
          {history.length === 0 ? (
            <Text size={1} muted>
              No coordinates authored yet.
            </Text>
          ) : (
            <Stack space={1}>
              {history.map((o) => {
                const isActive = activeOverride?.key === o.key
                return (
                  <Flex
                    key={o.key}
                    justify="space-between"
                    align="center"
                    style={{
                      padding: '4px 8px',
                      borderRadius: 4,
                      background: isActive ? 'rgba(255,224,102,0.12)' : 'rgba(255,255,255,0.03)',
                      border: isActive
                        ? '1px solid rgba(255,224,102,0.4)'
                        : '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <Text size={0} style={{color: isActive ? '#ffe066' : 'rgba(255,255,255,0.85)'}}>
                      {formatMomentYear(o.moment)}
                      {ORIGIN_LABEL[o.origin]}
                    </Text>
                    <Text
                      size={0}
                      style={{
                        color: 'rgba(255,255,255,0.55)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      ({Math.round(o.x)}, {Math.round(o.y)})
                      {o.pin ? ' 📌' : ''}
                    </Text>
                  </Flex>
                )
              })}
            </Stack>
          )}
        </Stack>
      </Stack>
    </Card>
  )
}
