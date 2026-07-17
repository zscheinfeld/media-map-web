import {defineField, defineType} from 'sanity'

// One YEAR range during which a company or entity appears on the map (Phase 5:
// maps are yearly). Companies and entities hold an ARRAY of these, so something
// can show up across several disjoint stretches of the timeline. Absent start =
// "from the beginning of the timeline"; absent end = "through the end." An item
// with no windows at all is always visible.
export const appearanceWindow = defineType({
  name: 'appearanceWindow',
  title: 'Appearance window',
  type: 'object',
  fields: [
    defineField({
      name: 'start_year',
      title: 'Appears from (year)',
      type: 'number',
      description: 'First year it appears (e.g. 2020). Leave blank to apply from the start of the timeline.',
      validation: (Rule) => Rule.integer().min(2000).max(2100),
    }),
    defineField({
      name: 'end_year',
      title: 'Appears until (year)',
      type: 'number',
      description: 'Last year it appears (e.g. 2023). Leave blank to keep appearing through the present.',
      validation: (Rule) =>
        Rule.integer()
          .min(2000)
          .max(2100)
          .custom((end, ctx) => {
            const start = (ctx.parent as {start_year?: number})?.start_year
            if (end != null && start != null && end < start) return 'End year must be ≥ start year'
            return true
          }),
    }),
  ],
  preview: {
    select: {start: 'start_year', end: 'end_year'},
    prepare({start, end}) {
      const range =
        start || end ? `${start || 'start'} → ${end || 'present'}` : 'entire timeline'
      return {title: range}
    },
  },
})
