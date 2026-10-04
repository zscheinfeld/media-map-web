import {defineField, defineType} from 'sanity'
import {ControlsIcon} from '@sanity/icons'

// Global render/layout tuning for the map — the "layout knobs" the Map Editor
// exposes (planet density, spacing, label size, connection pull, entity radius).
// A singleton (fixed _id 'mapSettings'). The knob values are time-scoped: the
// `overrides` array carries one entry per stretch of the timeline, so earlier,
// sparser maps can be tuned differently from recent ones. At a viewed moment T
// the override with the largest start_date ≤ T wins (forward-propagation, same
// model as company position overrides). Authored live via the Map Editor's knob
// panel + Save; each Save stamps the current viewed moment.
export const mapSettings = defineType({
  name: 'mapSettings',
  title: 'Map Settings',
  type: 'document',
  icon: ControlsIcon,
  // The layout itself now comes from the layout lab (the hidden `layout_lab`
  // field, published from the Layout lab tab). The time-scoped values saved by
  // the former Map Editor stay, folded away at the bottom: they are the base
  // the lab layers over — any slider the lab hasn't changed takes its value
  // from here.
  fieldsets: [
    {
      name: 'mapEditor',
      title: 'Earlier slider values (base layer)',
      description:
        'Slider values saved by the former Map Editor, per stretch of the timeline. Still in use: any ' +
        'slider not changed in the layout lab takes its value from here. Leave these as they are.',
      options: {collapsible: true, collapsed: true},
    },
  ],
  fields: [
    defineField({
      name: 'layout_lab',
      title: 'Layout',
      type: 'text',
      rows: 6,
      // Edited in the Layout lab tab (paste + Publish), never by hand here.
      hidden: true,
      description: 'The map layout for every device, as exported by the layout lab. Published from the Layout lab tab.',
      validation: (Rule) =>
        Rule.custom((value) => {
          if (!value || !String(value).trim()) return true
          try {
            const parsed = JSON.parse(String(value))
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('knobs' in parsed)) {
              return 'This does not look like a layout exported from the layout lab (use its Copy JSON button).'
            }
            return true
          } catch {
            return 'Not valid JSON — paste exactly what the layout lab\'s Copy JSON button gave you.'
          }
        }),
    }),
    defineField({
      name: 'background',
      title: 'Map background',
      type: 'object',
      description: 'The site-wide vertical gradient behind the map (top → middle → bottom). Empty = the built-in gradient.',
      fields: [
        defineField({name: 'top', title: 'Top', type: 'color'}),
        defineField({name: 'middle', title: 'Middle', type: 'color'}),
        defineField({name: 'bottom', title: 'Bottom', type: 'color'}),
      ],
    }),
    defineField({
      name: 'panel_background',
      title: 'Side panel background',
      type: 'color',
      description: 'Solid colour for the left sector panel. Empty = the built-in translucent navy.',
    }),
    defineField({
      name: 'overrides',
      title: 'Time-scoped knob values (desktop)',
      type: 'array',
      fieldset: 'mapEditor',
      of: [{type: 'mapSettingsOverride'}],
      description:
        'One entry per stretch of the timeline. Edited via the Map Editor — drag the knobs at a ' +
        'given year/month and Save to stamp values effective from that moment forward.',
    }),
    defineField({
      name: 'square_overrides',
      title: 'Time-scoped knob values (square / mobile)',
      type: 'array',
      fieldset: 'mapEditor',
      of: [{type: 'mapSettingsOverride'}],
      description:
        'The square (mobile) twin of `overrides`. The square map needs its own spacing/pull ' +
        'because the canvas is a different shape. Authored in the Map Editor’s Square mode. ' +
        'While this is empty the square map keeps its built-in mobile defaults, so adding the ' +
        'first entry is what hands control of mobile physics to the CMS.',
    }),
  ],
  preview: {
    select: {overrides: 'overrides'},
    prepare({overrides}) {
      const n = Array.isArray(overrides) ? overrides.length : 0
      return {title: 'Map Settings', subtitle: `${n} time-scoped value${n === 1 ? '' : 's'}`}
    },
  },
})
