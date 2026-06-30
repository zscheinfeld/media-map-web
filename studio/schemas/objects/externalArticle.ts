import {defineField, defineType} from 'sanity'

// An external news article about a company (e.g. Google Finance / Yahoo
// Finance). Not time-bound — the side panel shows the most recent. Authored by
// hand for now; intended to be pulled in dynamically from a finance feed later.
export const externalArticle = defineType({
  name: 'externalArticle',
  title: 'External article',
  type: 'object',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'url',
      title: 'URL',
      type: 'url',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      options: {
        list: [
          {title: 'Google Finance', value: 'google'},
          {title: 'Yahoo Finance', value: 'yahoo'},
        ],
      },
      description: 'Where the article came from.',
    }),
    defineField({
      name: 'published_date',
      title: 'Published',
      type: 'date',
      description: 'Used to order newest-first in the side panel.',
    }),
  ],
  preview: {
    select: {title: 'title', source: 'source', date: 'published_date'},
    prepare({title, source, date}) {
      const labels: Record<string, string> = {google: 'Google Finance', yahoo: 'Yahoo Finance'}
      return {
        title,
        subtitle: [source ? (labels[source] ?? source) : null, date].filter(Boolean).join(' · '),
      }
    },
  },
})
