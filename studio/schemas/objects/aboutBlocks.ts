import {defineField, defineType} from 'sanity'
import {
  BlockquoteIcon,
  ComposeIcon,
  ImageIcon,
  LinkIcon,
  SelectIcon,
} from '@sanity/icons'

// Reusable content blocks for the About modal. Each About "section" (one modal
// tab) holds an ordered list of these, so the client can mix & match per section.
// Rendered in order by src/AboutModal.tsx.

/** Yellow uppercase section heading. */
export const aboutSectionHeader = defineType({
  name: 'aboutSectionHeader',
  title: 'Section header',
  type: 'object',
  icon: ComposeIcon,
  fields: [defineField({name: 'text', title: 'Heading text', type: 'string'})],
  preview: {
    select: {title: 'text'},
    prepare: ({title}) => ({title: title || 'Section header', subtitle: 'Section header'}),
  },
})

/** A block of body copy. Blank lines split into paragraphs. */
export const aboutBody = defineType({
  name: 'aboutBody',
  title: 'Body copy',
  type: 'object',
  icon: BlockquoteIcon,
  fields: [
    defineField({
      name: 'text',
      title: 'Text',
      type: 'text',
      rows: 6,
      description: 'Leave a blank line between paragraphs.',
    }),
  ],
  preview: {
    select: {title: 'text'},
    prepare: ({title}) => ({title: title || 'Body copy', subtitle: 'Body copy'}),
  },
})

// Buttons — a shared field set. `action` picks whether it links out or triggers
// the live map-snapshot (4K PNG) download.
const buttonFields = [
  defineField({name: 'label', title: 'Button label', type: 'string'}),
  defineField({
    name: 'action',
    title: 'On click',
    type: 'string',
    options: {
      layout: 'radio',
      list: [
        {title: 'Open a link', value: 'link'},
        {title: 'Download the map snapshot (4K PNG)', value: 'download'},
      ],
    },
    initialValue: 'link',
  }),
  defineField({
    name: 'url',
    title: 'Link URL',
    type: 'url',
    hidden: ({parent}) => parent?.action === 'download',
    validation: (Rule) => Rule.uri({scheme: ['http', 'https', 'mailto']}),
  }),
]

/** Blue (primary) CTA button. */
export const aboutPrimaryButton = defineType({
  name: 'aboutPrimaryButton',
  title: 'Primary button (blue)',
  type: 'object',
  icon: SelectIcon,
  fields: buttonFields,
  preview: {
    select: {title: 'label'},
    prepare: ({title}) => ({title: title || 'Primary button', subtitle: 'Primary button (blue)'}),
  },
})

/** Grey (secondary) button. */
export const aboutSecondaryButton = defineType({
  name: 'aboutSecondaryButton',
  title: 'Secondary button (grey)',
  type: 'object',
  icon: SelectIcon,
  fields: buttonFields,
  preview: {
    select: {title: 'label'},
    prepare: ({title}) => ({
      title: title || 'Secondary button',
      subtitle: 'Secondary button (grey)',
    }),
  },
})

/** A single link row (label + arrow). */
export const aboutLink = defineType({
  name: 'aboutLink',
  title: 'Link',
  type: 'object',
  icon: LinkIcon,
  fields: [
    defineField({name: 'label', title: 'Label', type: 'string'}),
    defineField({
      name: 'url',
      title: 'URL',
      type: 'url',
      validation: (Rule) => Rule.uri({scheme: ['http', 'https', 'mailto']}),
    }),
  ],
  preview: {
    select: {title: 'label', subtitle: 'url'},
    prepare: ({title, subtitle}) => ({title: title || 'Link', subtitle: subtitle || 'Link'}),
  },
})

/** An inline photo, with an optional caption. */
export const aboutPhoto = defineType({
  name: 'aboutPhoto',
  title: 'Photo',
  type: 'object',
  icon: ImageIcon,
  fields: [
    defineField({name: 'image', title: 'Image', type: 'image', options: {hotspot: true}}),
    defineField({name: 'caption', title: 'Caption (optional)', type: 'string'}),
  ],
  preview: {
    select: {title: 'caption', media: 'image'},
    prepare: ({title, media}) => ({title: title || 'Photo', subtitle: 'Photo', media}),
  },
})

/** One modal tab: a label + an ordered list of blocks. */
export const aboutSection = defineType({
  name: 'aboutSection',
  title: 'Section',
  type: 'object',
  fields: [
    defineField({
      name: 'tabLabel',
      title: 'Tab label',
      type: 'string',
      description: 'The nav chip at the top of the modal (e.g. "ABOUT").',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'blocks',
      title: 'Content blocks',
      type: 'array',
      of: [
        {type: 'aboutSectionHeader'},
        {type: 'aboutBody'},
        {type: 'aboutPrimaryButton'},
        {type: 'aboutSecondaryButton'},
        {type: 'aboutLink'},
        {type: 'aboutPhoto'},
      ],
    }),
  ],
  preview: {
    select: {title: 'tabLabel', blocks: 'blocks'},
    prepare: ({title, blocks}) => ({
      title: title || 'Section',
      subtitle: `${Array.isArray(blocks) ? blocks.length : 0} block(s)`,
    }),
  },
})
