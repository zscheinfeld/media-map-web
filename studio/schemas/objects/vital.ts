import {defineField, defineType} from 'sanity'

// A "vital" — a time-bound fact about a company, shown as a small tag block in
// the side panel for the maps it's assigned to (e.g. Microsoft → "Minecraft ·
// 230M MAU"). Companies hold an ARRAY of these. Same windowing as connections /
// entity appearance: it renders only when the viewed moment is inside
// [start_date, end_date]; absent start = from the beginning, absent end = ongoing.
export const vital = defineType({
  name: 'vital',
  title: 'Vital',
  type: 'object',
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Headline of the tag, e.g. "Minecraft", "Office 365", "XBOX".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'statistic',
      title: 'Statistic',
      type: 'string',
      description: 'Optional stat shown under the name, e.g. "230M MAU", "1.2B Users". Leave blank for a name-only tag.',
    }),
    defineField({
      name: 'start_date',
      title: 'Effective from',
      type: 'date',
      description: 'When this vital starts appearing. Blank = from the start of the timeline.',
    }),
    defineField({
      name: 'end_date',
      title: 'Effective until',
      type: 'date',
      description: 'When this vital stops appearing. Blank = ongoing.',
    }),
  ],
  preview: {
    select: {name: 'name', statistic: 'statistic', start: 'start_date', end: 'end_date'},
    prepare({name, statistic, start, end}) {
      const range = start || end ? ` · ${start || 'start'} → ${end || 'end'}` : ''
      return {
        title: name,
        subtitle: `${statistic || 'No statistic'}${range}`,
      }
    },
  },
})
