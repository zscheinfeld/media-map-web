import {Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'
import {formatMomentShort, type Moment} from './moment'
import type {ResolvedSectorOverride} from './pendingChanges'
import type {EditorSector} from './sanityMapData'

export type SectorInspectorProps = {
  selectedSector: EditorSector | null
  /** All resolved overrides for the selected sector (Sanity + pending), sorted asc. */
  history: ResolvedSectorOverride[]
  /** The override active at the current global moment (forward-propagated); null = baseline scalar in effect. */
  activeOverride: ResolvedSectorOverride | null
  /** Whether `activeOverride` was authored exactly at the current global moment. */
  isActiveAtCurrentMoment: boolean
  currentMoment: Moment
  /** Remove the override at the current global moment. */
  onClearAtCurrentMoment: () => void
  onClose: () => void
}

const ORIGIN_LABEL: Record<ResolvedSectorOverride['origin'], string> = {
  sanity: '',
  'sanity-edited': ' · edited',
  'pending-new': ' · new',
}

/**
 * Right-side inspector shown when a sector pill is selected. Mirrors
 * PlanetInspector: shows the sector's effective center at the current
 * moment (override or baseline), lets the user clear the override authored
 * exactly at this moment, and lists every override in a read-only history.
 *
 * Sector centers are not pinned (always attractors), so there's no pin
 * toggle. Editing is done by dragging the sector pill — same drag pattern
 * as planets.
 */
export function SectorInspector({
  selectedSector,
  history,
  activeOverride,
  isActiveAtCurrentMoment,
  currentMoment,
  onClearAtCurrentMoment,
  onClose,
}: SectorInspectorProps) {
  if (!selectedSector) return null
  const momentLabel = formatMomentShort(currentMoment)
  const baseline = selectedSector.center
  const effective = activeOverride
    ? {x: activeOverride.x, y: activeOverride.y}
    : baseline

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
            {selectedSector.name}
          </Text>
          <Button mode="bleed" tone="default" text="✕" onClick={onClose} padding={2} fontSize={1} />
        </Flex>

        {/* Effective center at the currently-selected moment. */}
        <Stack space={2}>
          <Text size={0} muted style={{textTransform: 'uppercase', letterSpacing: 1}}>
            Center at {momentLabel}
          </Text>
          <Text size={1} style={{color: '#fff', fontVariantNumeric: 'tabular-nums'}}>
            ({Math.round(effective.x)}, {Math.round(effective.y)})
          </Text>
          {activeOverride && !isActiveAtCurrentMoment && (
            <Text size={0} muted>
              Inherited from {formatMomentShort(activeOverride.moment)} (forward-propagated).
            </Text>
          )}
          {!activeOverride && (
            <Text size={0} muted>
              Using baseline scalar — no override applies at this moment yet.
            </Text>
          )}
        </Stack>

        {/* Clear-at-this-moment is only meaningful if an override exists exactly at T. */}
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

        {/* Read-only history list. The baseline scalar is shown as a fixed
            row at the top so editors see the "ground truth" without leaving
            the inspector. */}
        <Stack space={2}>
          <Text size={0} muted style={{textTransform: 'uppercase', letterSpacing: 1}}>
            History ({history.length + 1})
          </Text>
          <Stack space={1}>
            <Flex
              justify="space-between"
              align="center"
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
            >
              <Text size={0} style={{color: 'rgba(255,255,255,0.85)'}}>
                Baseline · scalar
              </Text>
              <Text
                size={0}
                style={{
                  color: 'rgba(255,255,255,0.55)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                ({Math.round(baseline.x)}, {Math.round(baseline.y)})
              </Text>
            </Flex>
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
                    {formatMomentShort(o.moment)}
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
                  </Text>
                </Flex>
              )
            })}
          </Stack>
        </Stack>

        <Box>
          <Text size={0} muted>
            Drag the sector pill to author a new center at {momentLabel}.
          </Text>
        </Box>
      </Stack>
    </Card>
  )
}
