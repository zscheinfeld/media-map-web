import {defineField, defineType} from 'sanity'

// One time-scoped set of layout-knob values. The mapSettings singleton holds an
// ARRAY of these so the map can be tuned differently across the timeline (e.g.
// earlier years with fewer planets want looser packing). Forward-propagation:
// at viewed moment T, the override with the largest start_date ≤ T wins; if none
// qualify, the editor falls back to LAYOUT_KNOBS_DEFAULTS. Authored via the Map
// Editor's knob panel (each Save stamps start_date = the viewed moment).
export const mapSettingsOverride = defineType({
  name: 'mapSettingsOverride',
  title: 'Settings override',
  type: 'object',
  fields: [
    defineField({
      name: 'start_date',
      title: 'Effective from',
      type: 'date',
      description: 'When these knob values take effect. Blank = from the start of the timeline.',
    }),
    defineField({name: 'packing_density', title: 'Planet size (density)', type: 'number'}),
    defineField({name: 'collide_padding', title: 'Spacing (collide padding)', type: 'number'}),
    defineField({name: 'label_size_px', title: 'Label size (px)', type: 'number'}),
    defineField({name: 'connection_pull', title: 'Connection pull', type: 'number'}),
    defineField({name: 'entity_radius', title: 'Entity radius', type: 'number'}),
    defineField({name: 'size_spacing', title: 'Size spacing', type: 'number'}),
    defineField({name: 'sector_pull', title: 'Sector pull', type: 'number'}),
    defineField({name: 'repulsion', title: 'Spread (repulsion)', type: 'number'}),
  ],
  preview: {
    select: {start: 'start_date', density: 'packing_density', label: 'label_size_px'},
    prepare({start, density, label}) {
      return {
        title: start ? `From ${start}` : 'Entire timeline',
        subtitle: `density ${density ?? '?'} · label ${label ?? '?'}px`,
      }
    },
  },
})
