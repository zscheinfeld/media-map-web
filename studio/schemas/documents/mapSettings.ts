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
  fields: [
    defineField({
      name: 'overrides',
      title: 'Time-scoped knob values',
      type: 'array',
      of: [{type: 'mapSettingsOverride'}],
      description:
        'One entry per stretch of the timeline. Edited via the Map Editor — drag the knobs at a ' +
        'given year/month and Save to stamp values effective from that moment forward.',
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
