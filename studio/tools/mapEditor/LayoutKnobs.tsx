import {Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'

export type LayoutKnobsValues = {
  packingDensity: number
  collidePadding: number
  labelSizePx: number
  connectionPull: number
  entityRadius: number
  sizeSpacing: number
  sectorPull: number
  repulsion: number
}

export const LAYOUT_KNOBS_DEFAULTS: LayoutKnobsValues = {
  packingDensity: 0.45,
  collidePadding: 20,
  labelSizePx: 10,
  connectionPull: 0.55,
  entityRadius: 20,
  sizeSpacing: 0.05,
  sectorPull: 0.035,
  repulsion: 0,
}

export type LayoutKnobsProps = LayoutKnobsValues & {
  setPackingDensity: (v: number) => void
  setCollidePadding: (v: number) => void
  setLabelSizePx: (v: number) => void
  setConnectionPull: (v: number) => void
  setEntityRadius: (v: number) => void
  setSizeSpacing: (v: number) => void
  setSectorPull: (v: number) => void
  setRepulsion: (v: number) => void
  /** Apple's current rendered diameter in slide units — shown as a hint. */
  anchorDiam: number
  /** Bare = render just the controls (no Card/title) for the connected control panel. */
  bare?: boolean
}

function SliderRow(props: {
  label: string
  value: number
  formatted: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <Stack space={2}>
      <Flex justify="space-between" align="center">
        <Text size={1} style={{color: '#e6edf7'}}>
          {props.label}
        </Text>
        <Text size={1} weight="semibold" style={{color: '#ffe066', fontVariantNumeric: 'tabular-nums'}}>
          {props.formatted}
        </Text>
      </Flex>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.currentTarget.value))}
        style={{width: '100%', accentColor: '#ffe066', cursor: 'pointer'}}
      />
    </Stack>
  )
}

/**
 * Live layout-knob panel — mirrors the four sliders the app's edit toolbar had,
 * so editors get the same tactile control while authoring positions in the Studio.
 * All values are live-tunable; Reset returns each to the same defaults the app uses.
 */
export function LayoutKnobs(props: LayoutKnobsProps) {
  const reset = () => {
    props.setPackingDensity(LAYOUT_KNOBS_DEFAULTS.packingDensity)
    props.setCollidePadding(LAYOUT_KNOBS_DEFAULTS.collidePadding)
    props.setLabelSizePx(LAYOUT_KNOBS_DEFAULTS.labelSizePx)
    props.setConnectionPull(LAYOUT_KNOBS_DEFAULTS.connectionPull)
    props.setEntityRadius(LAYOUT_KNOBS_DEFAULTS.entityRadius)
    props.setSizeSpacing(LAYOUT_KNOBS_DEFAULTS.sizeSpacing)
    props.setSectorPull(LAYOUT_KNOBS_DEFAULTS.sectorPull)
    props.setRepulsion(LAYOUT_KNOBS_DEFAULTS.repulsion)
  }

  const defaultsButton = (
    <Button
      text="Defaults"
      mode="ghost"
      tone="default"
      fontSize={0}
      padding={2}
      onClick={reset}
      title="Restore the default knob values (stages as a change until you Save)"
    />
  )

  const body = (
    <Stack space={4}>
      {props.bare && <Flex justify="flex-end">{defaultsButton}</Flex>}
      <SliderRow
          label="Planet size (density)"
          value={props.packingDensity}
          formatted={props.packingDensity.toFixed(2)}
          min={0.1}
          max={1.2}
          step={0.05}
          onChange={props.setPackingDensity}
        />
        <SliderRow
          label="Spacing (collide pad)"
          value={props.collidePadding}
          formatted={`${props.collidePadding}`}
          min={0}
          max={300}
          step={5}
          onChange={props.setCollidePadding}
        />
        <SliderRow
          label="Size spacing"
          value={props.sizeSpacing}
          formatted={`${Math.round(props.sizeSpacing * 100)}%`}
          min={0}
          max={0.6}
          step={0.05}
          onChange={props.setSizeSpacing}
        />
        <SliderRow
          label="Sector pull (looser = spread)"
          value={props.sectorPull}
          formatted={props.sectorPull.toFixed(3)}
          min={0.001}
          max={0.12}
          step={0.001}
          onChange={props.setSectorPull}
        />
        <SliderRow
          label="Spread (repulsion)"
          value={props.repulsion}
          formatted={`${Math.round(props.repulsion)}`}
          min={0}
          max={10000}
          step={100}
          onChange={props.setRepulsion}
        />
        <SliderRow
          label="Label size"
          value={props.labelSizePx}
          formatted={`${props.labelSizePx}px`}
          min={6}
          max={40}
          step={1}
          onChange={props.setLabelSizePx}
        />
        <SliderRow
          label="Connection pull"
          value={props.connectionPull}
          formatted={props.connectionPull.toFixed(2)}
          min={0}
          max={4}
          step={0.05}
          onChange={props.setConnectionPull}
        />
        <SliderRow
          label="Entity radius"
          value={props.entityRadius}
          formatted={`${props.entityRadius}`}
          min={0}
          max={500}
          step={10}
          onChange={props.setEntityRadius}
        />

        <Box>
          <Text size={0} muted style={{fontVariantNumeric: 'tabular-nums'}}>
            Apple ≈ {props.anchorDiam.toFixed(0)} slide units
          </Text>
        </Box>
    </Stack>
  )

  if (props.bare) return body

  return (
    <Card padding={3} radius={2} shadow={1} style={{width: '100%', background: 'rgba(7,14,32,0.92)'}}>
      <Stack space={4}>
        <Flex justify="space-between" align="center">
          <Text
            size={0}
            weight="semibold"
            style={{color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase'}}
          >
            Layout Knobs
          </Text>
          {defaultsButton}
        </Flex>
        {body}
      </Stack>
    </Card>
  )
}
