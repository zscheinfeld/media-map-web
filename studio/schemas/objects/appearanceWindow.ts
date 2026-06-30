import {defineField, defineType} from 'sanity'

// One time window during which an entity appears on the map. Entities hold an
// ARRAY of these so a sub-brand can show up across several disjoint stretches of
// the timeline. Same date semantics as `connection`: absent start = "from the
// beginning of the timeline"; absent end = "through the end." An entity with no
// windows at all is always visible.
export const appearanceWindow = defineType({
  name: 'appearanceWindow',
  title: 'Appearance window',
  type: 'object',
  fields: [
    defineField({
      name: 'start_date',
      title: 'Appears from',
      type: 'date',
      description: 'When the entity starts appearing. Leave blank to apply from the start of the timeline.',
    }),
    defineField({
      name: 'end_date',
      title: 'Appears until',
      type: 'date',
      description: 'When the entity stops appearing. Leave blank to apply through the end of the timeline.',
    }),
  ],
  preview: {
    select: {start: 'start_date', end: 'end_date'},
    prepare({start, end}) {
      const range =
        start || end ? `${start || 'start'} → ${end || 'end'}` : 'entire timeline'
      return {title: range}
    },
  },
})
