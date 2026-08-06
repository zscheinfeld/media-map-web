import {Card, Flex, Select, Stack, Switch, Text} from '@sanity/ui'
import {EDITOR_CURRENT_YEAR, EDITOR_YEAR_RANGE, momentForYear, yearOfMoment, type Moment} from './moment'

export type TimeSelectorProps = {
  moment: Moment
  onChange: (next: Moment) => void
  yearRange?: [number, number]
  /** Whether the sector marker pills are shown on the canvas. */
  showSectorLabels: boolean
  onToggleSectorLabels: (next: boolean) => void
  /** Bare = render just the controls (no Card/title) for the connected control panel. */
  bare?: boolean
}

/**
 * Global YEAR picker (Phase 5). Choosing a year scopes the canvas to that year's
 * snapshot — past years to their Oct-1 (Q4-start) moment, the current year to
 * "now" — mirroring the public app's yearly maps. Positions forward-propagate
 * (largest start_date ≤ the snapshot moment wins); connections render only if
 * their [start, end] window covers it. Drags and pin toggles stamp
 * `start_date = the selected year's snapshot moment` on the resulting override.
 */
export function TimeSelector({
  moment,
  onChange,
  yearRange = EDITOR_YEAR_RANGE,
  showSectorLabels,
  onToggleSectorLabels,
  bare = false,
}: TimeSelectorProps) {
  const year = yearOfMoment(moment)
  const [yMin, yMax] = yearRange
  const years: number[] = []
  for (let y = yMax; y >= yMin; y--) years.push(y) // newest-first

  const body = (
    <Stack space={3}>
      <Select
          fontSize={1}
          value={String(year)}
          onChange={(e) => onChange(momentForYear(parseInt(e.currentTarget.value, 10)))}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y === EDITOR_CURRENT_YEAR ? `${y} (now)` : y}
            </option>
          ))}
        </Select>
        {/* Toggle the yellow sector marker pills on/off — handy when they're
            distracting (also hides their drag handles while off). Outlined so the
            row reads as its own control rather than blending into the card. */}
        <Flex
          justify="space-between"
          align="center"
          style={{
            padding: '8px 10px',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 4,
          }}
        >
          <Text size={1} style={{color: '#e6edf7'}}>
            Sector labels
          </Text>
          {/* The switch's off-state track is near-black and vanishes on the navy
              card, so wrap it in a light ring to make the pill legible. */}
          <span
            style={{
              display: 'inline-flex',
              borderRadius: 999,
              boxShadow: '0 0 0 1.5px rgba(255,255,255,0.6)',
            }}
          >
            <Switch
              checked={showSectorLabels}
              onChange={(e) => onToggleSectorLabels(e.currentTarget.checked)}
            />
          </span>
        </Flex>
    </Stack>
  )

  if (bare) return body

  return (
    <Card padding={3} radius={2} shadow={1} style={{width: '100%', background: 'rgba(7,14,32,0.92)'}}>
      <Stack space={3}>
        <Flex justify="space-between" align="center">
          <Text
            size={0}
            weight="semibold"
            style={{color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase'}}
          >
            Map at
          </Text>
        </Flex>
        {body}
      </Stack>
    </Card>
  )
}
