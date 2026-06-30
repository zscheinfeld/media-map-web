import {defineField, defineType} from 'sanity'

// A piece of Eshap's own content (Evan's LinkedIn post, podcast, or Substack
// post) attached to a company. Not time-bound — the side panel always shows the
// latest. Authored by hand for now; intended to be pulled in dynamically later.
export const eshapContent = defineType({
  name: 'eshapContent',
  title: 'Eshap content',
  type: 'object',
  fields: [
    defineField({
      name: 'kind',
      title: 'Kind',
      type: 'string',
      options: {
        list: [
          {title: 'LinkedIn post', value: 'linkedin'},
          {title: 'Podcast', value: 'podcast'},
          {title: 'Substack post', value: 'substack'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
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
      name: 'published_date',
      title: 'Published',
      type: 'date',
      description: 'Used to order newest-first in the side panel.',
    }),
  ],
  preview: {
    select: {title: 'title', kind: 'kind', date: 'published_date'},
    prepare({title, kind, date}) {
      const labels: Record<string, string> = {
        linkedin: 'LinkedIn',
        podcast: 'Podcast',
        substack: 'Substack',
      }
      return {
        title,
        subtitle: [labels[kind] ?? kind, date].filter(Boolean).join(' · '),
      }
    },
  },
})
