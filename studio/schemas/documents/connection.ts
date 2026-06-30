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
    // Time-scoping: absent dates mean the connection applies across the whole timeline.
    defineField({
      name: 'start_date',
      title: 'Effective from',
      type: 'date',
      description: 'When this connection appears on the timeline. Blank = from the start.',
    }),
    defineField({
      name: 'end_date',
      title: 'Effective until',
      type: 'date',
      description: 'When this connection disappears. Blank = through the end.',
    }),
  ],
  preview: {
    select: {
      fromName: 'from.name',
      toName: 'to.name',
      style: 'style',
      start: 'start_date',
      end: 'end_date',
    },
    prepare({fromName, toName, style, start, end}) {
      const range = start || end ? ` · ${start || 'start'} → ${end || 'end'}` : ''
      return {
        title: `${fromName || '?'} → ${toName || '?'}`,
        subtitle: `${style || 'no style'}${range}`,
      }
    },
  },
})
