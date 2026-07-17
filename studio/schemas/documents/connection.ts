import {defineField, defineType} from 'sanity'
import {LinkIcon} from '@sanity/icons'

// A line drawn between two map nodes (companies and/or entities). Optionally
// time-scoped (e.g. an acquisition that only appears on the timeline once it
// closes).
export const connection = defineType({
  name: 'connection',
  title: 'Connection',
  type: 'document',
  icon: LinkIcon,
  fields: [
    defineField({
      name: 'from',
      title: 'From',
      type: 'reference',
      to: [{type: 'company'}, {type: 'entity'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'to',
      title: 'To',
      type: 'reference',
      to: [{type: 'company'}, {type: 'entity'}],
      validation: (Rule) =>
        Rule.required().custom((to, context) => {
          const from = (context.document?.from as {_ref?: string} | undefined)?._ref
          const toRef = (to as {_ref?: string} | undefined)?._ref
          if (from && toRef && from === toRef) {
            return 'A connection must link two different nodes.'
          }
          return true
        }),
    }),
    defineField({
      name: 'style',
      title: 'Style',
      type: 'string',
      description: 'Solid = wholly owned / closed acquisition. Dotted = partial ownership or in-process acquisition.',
      options: {
        list: [
          {title: 'Solid (wholly owned / closed)', value: 'solid'},
          {title: 'Dotted (partial / in-process)', value: 'dotted'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      rows: 3,
      description: 'Shown in the hover tooltip on the map.',
    }),
    // Time-scoping: absent years mean the connection applies across the whole timeline.
    defineField({
      name: 'start_year',
      title: 'Effective from (year)',
      type: 'number',
      description: 'First year this connection appears (e.g. 2021). Blank = from the start.',
      validation: (Rule) => Rule.integer().min(2000).max(2100),
    }),
    defineField({
      name: 'end_year',
      title: 'Effective until (year)',
      type: 'number',
      description: 'Last year this connection appears. Blank = through the present.',
      validation: (Rule) =>
        Rule.integer()
          .min(2000)
          .max(2100)
          .custom((end, ctx) => {
            const start = (ctx.document as {start_year?: number} | undefined)?.start_year
            if (end != null && start != null && end < start) return 'End year must be ≥ start year'
            return true
          }),
    }),
  ],
  preview: {
    select: {
      fromName: 'from.name',
      toName: 'to.name',
      style: 'style',
      start: 'start_year',
      end: 'end_year',
    },
    prepare({fromName, toName, style, start, end}) {
      const range = start || end ? ` · ${start || 'start'} → ${end || 'present'}` : ''
      return {
        title: `${fromName || '?'} → ${toName || '?'}`,
        subtitle: `${style || 'no style'}${range}`,
      }
    },
  },
})
