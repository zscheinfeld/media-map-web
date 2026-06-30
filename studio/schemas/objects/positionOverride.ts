import {defineField, defineType} from 'sanity'

// One time-scoped position for a planet, in slide-unit coordinates (the same
// coordinate space the map's SVG viewBox uses). Companies hold an ARRAY of
// these so a planet can sit in different places across the timeline; each entry
// carries its own optional effective date range.
export const positionOverride = defineType({
  name: 'positionOverride',
  title: 'Position override',
  type: 'object',
  fields: [
    defineField({
      name: 'x',
      title: 'X',
      type: 'number',
      description: 'Slide-unit X coordinate.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'y',
      title: 'Y',
      type: 'number',
      description: 'Slide-unit Y coordinate.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'pin',
      title: 'Pin in place',
      type: 'boolean',
      initialValue: false,
      description:
        'On: the planet is locked at (x, y) and other planets collide around it. ' +
        'Off: the planet is only attracted to (x, y) — physics can still nudge it.',
    }),
    // Time-scoping: absent start = "from the beginning of the timeline";
    // absent end = "through the end of the timeline". Both absent = always.
    defineField({
      name: 'start_date',
      title: 'Effective from',
      type: 'date',
      description: 'When this position takes effect. Leave blank to apply from the start of the timeline.',
    }),
    defineField({
      name: 'end_date',
      title: 'Effective until',
      type: 'date',
      description: 'When this position stops applying. Leave blank to apply through the end of the timeline.',
    }),
  ],
  preview: {
    select: {x: 'x', y: 'y', pin: 'pin', start: 'start_date', end: 'end_date'},
    prepare({x, y, pin, start, end}) {
      const range =
        start || end ? `${start || 'start'} → ${end || 'end'}` : 'entire timeline'
      return {
        title: `(${x ?? '?'}, ${y ?? '?'})${pin ? ' · pinned' : ''}`,
        subtitle: range,
      }
    },
  },
})
