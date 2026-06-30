import {Card, Flex, Select, Stack, Switch, Text} from '@sanity/ui'
import {makeMoment, MONTHS_BY_NUMBER, parseMoment, type Moment} from './moment'

export type TimeSelectorProps = {
  moment: Moment
  onChange: (next: Moment) => void
  yearRange?: [number, number]
  /** Whether the sector marker pills are shown on the canvas. */
  showSectorLabels: boolean
  onToggleSectorLabels: (next: boolean) => void
}

/**
 * Global year+month picker. Choosing a moment T scopes the canvas to "the map
 * as of T" — positions forward-propagate (largest start_date ≤ T wins);
 * connections render only if their [start, end] window covers T. Drags and
 * pin toggles at moment T stamp `start_date = T` on the resulting override.
 */
export function TimeSelector({
  moment,
  onChange,
  yearRange = [2010, 2035],
  showSectorLabels,
  onToggleSectorLabels,
}: TimeSelectorProps) {
  const {year, month} = parseMoment(moment)
  const [yMin, yMax] = yearRange
  const years: number[] = []
  for (let y = yMin; y <= yMax; y++) years.push(y)

  return (
    <Card
      padding={3}
      radius={2}
      shadow={1}
      style={{
        width: '100%',
        background: 'rgba(7,14,32,0.92)',
      }}
    >
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
        <Flex gap={2}>
          <Select
            fontSize={1}
            value={String(month)}
            onChange={(e) => onChange(makeMoment(year, parseInt(e.currentTarget.value, 10)))}
            style={{flex: 1}}
          >
            {MONTHS_BY_NUMBER.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
          <Select
            fontSize={1}
            value={String(year)}
            onChange={(e) => onChange(makeMoment(parseInt(e.currentTarget.value, 10), month))}
            style={{flex: 1}}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </Flex>
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
    </Card>
  )
}
