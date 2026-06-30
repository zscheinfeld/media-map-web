import {useEffect, useId, useState} from 'react'
import {type ObjectInputProps, useClient, useFormValue} from 'sanity'
import {Box, Card, Flex, Stack, Text} from '@sanity/ui'

// --- Style value shapes (as stored by the schema) -------------------------
// @sanity/color-input stores colors as objects; we only need `.hex` to render.
type ColorValue = {hex?: string} | undefined

type StyleValue = {
  fill?: ColorValue
  stripes?: ColorValue[]
  stripe_orientation?: 'vertical' | 'horizontal' | 'diagonal'
  stroke?: ColorValue
  stroke_width_px?: number
  glow?: {color?: ColorValue; blur_px?: number; spread_px?: number}
}

const hex = (c: ColorValue): string | undefined => c?.hex

// Shallow merge with override winning, but skip empty values so a blank company
// field doesn't clobber the inherited sector value. Mirrors the live app's
// `{...sectorDefault, ...companyOverride}` behavior (one level deep).
function mergeStyle(base: StyleValue, override: StyleValue): StyleValue {
  const out: StyleValue = {...base}
  for (const [key, value] of Object.entries(override) as [keyof StyleValue, unknown][]) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(out as any)[key] = value
  }
  return out
}

// A single planet rendered from a resolved style. Mirrors the map's Planet
// component: stripes (2+) win over fill; otherwise flat fill; otherwise a
// neutral fallback. Glow is a blurred backing circle behind the planet.
function PlanetSvg({style}: {style: StyleValue}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const clipId = `clip-${uid}`
  const glowId = `glow-${uid}`

  const SIZE = 140
  const C = SIZE / 2
  const R = 48

  const stripes = (style.stripes ?? []).map(hex).filter(Boolean) as string[]
  const useStripes = stripes.length >= 2
  const fill = hex(style.fill)

  // Stroke: explicit > derived from fill/first stripe > faint default.
  const strokeColor =
    hex(style.stroke) ?? (useStripes ? stripes[0] : fill) ?? 'rgba(255,255,255,0.55)'
  const strokeWidth = style.stroke_width_px ?? 1.5

  // Vertical (default) = 90°, horizontal = 0°, diagonal = 45°. Same as the app.
  const angle =
    style.stripe_orientation === 'horizontal'
      ? 0
      : style.stripe_orientation === 'diagonal'
        ? 45
        : 90

  const glow = style.glow
  const glowColor = hex(glow?.color)
  const glowBlur = glow?.blur_px ?? 0
  const glowSpread = glow?.spread_px ?? 0
  const hasGlow = !!glowColor && (glowBlur > 0 || glowSpread > 0)

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{overflow: 'visible'}}>
      <defs>
        <clipPath id={clipId}>
          <circle cx={C} cy={C} r={R} />
        </clipPath>
        {hasGlow && (
          <filter id={glowId} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation={glowBlur} />
          </filter>
        )}
      </defs>

      {hasGlow && (
        <circle cx={C} cy={C} r={R + glowSpread} fill={glowColor} filter={`url(#${glowId})`} />
      )}

      {useStripes ? (
        <g transform={`translate(${C},${C}) rotate(${angle})`}>
          <g clipPath={`url(#${clipId})`} transform={`translate(${-C},${-C})`}>
            {stripes.map((c, i) => {
              const h = (2 * R) / stripes.length
              return (
                <rect
                  key={i}
                  x={C - R}
                  y={C - R + i * h}
                  width={2 * R}
                  height={h + 0.5 /* hide hairline seams */}
                  fill={c}
                />
              )
            })}
          </g>
        </g>
      ) : (
        <circle cx={C} cy={C} r={R} fill={fill ?? 'url(#__none)'} />
      )}

      {/* Neutral fallback gradient when neither fill nor stripes are set. */}
      {!useStripes && !fill && (
        <>
          <defs>
            <radialGradient id="__none" cx="38%" cy="38%" r="65%">
              <stop offset="0%" stopColor="#8a93a6" />
              <stop offset="100%" stopColor="#2b3242" />
            </radialGradient>
          </defs>
          <circle cx={C} cy={C} r={R} fill="url(#__none)" />
        </>
      )}

      <circle cx={C} cy={C} r={R} fill="none" stroke={strokeColor} strokeWidth={strokeWidth} />
    </svg>
  )
}

/**
 * Input component for the `planetStyle` object. Renders the normal form fields
 * plus a live SVG preview beside them. On a Company it fetches the referenced
 * Sector's default_style and shows the merged result; on a Sector it shows the
 * default style alone.
 */
export function PlanetStylePreview(props: ObjectInputProps) {
  const docType = useFormValue(['_type']) as string | undefined
  const sectorRef = useFormValue(['sector']) as {_ref?: string} | undefined
  const client = useClient({apiVersion: '2024-01-01'})
  const [sectorStyle, setSectorStyle] = useState<StyleValue>({})

  const ref = sectorRef?._ref
  const isCompany = docType === 'company'

  useEffect(() => {
    let cancelled = false
    if (!isCompany || !ref) {
      setSectorStyle({})
      return
    }
    client
      .fetch<StyleValue | null>('*[_id == $id][0].default_style', {id: ref})
      .then((res) => {
        if (!cancelled) setSectorStyle(res ?? {})
      })
    return () => {
      cancelled = true
    }
  }, [isCompany, ref, client])

  const own = (props.value ?? {}) as StyleValue
  const resolved = isCompany ? mergeStyle(sectorStyle, own) : own

  return (
    <Flex gap={4} align="flex-start" wrap="wrap">
      {/* Form fields */}
      <Box flex={1} style={{minWidth: 260}}>
        {props.renderDefault(props)}
      </Box>

      {/* Live preview */}
      <Card padding={3} radius={2} border tone="transparent" style={{flex: '0 0 auto'}}>
        <Stack space={3}>
          <Text size={1} weight="semibold" muted>
            LIVE PREVIEW
          </Text>
          <Box style={{display: 'grid', placeItems: 'center', minWidth: 160, minHeight: 160}}>
            <PlanetSvg style={resolved} />
          </Box>
          <Text size={0} muted style={{textAlign: 'center'}}>
            {isCompany ? 'Sector default + company overrides' : 'Sector default'}
          </Text>
        </Stack>
      </Card>
    </Flex>
  )
}
