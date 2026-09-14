import {defineField, defineType} from 'sanity'
import {InfoOutlineIcon} from '@sanity/icons'

// Content for the public app's "About" modal (the ⓘ button on the map). A
// singleton (fixed _id 'about'). The modal is a hero image plus a list of
// sections — each section is one nav tab, composed of mix-and-match blocks
// (section header / body / primary + secondary buttons / link / photo). If no
// sections are authored, the app falls back to the built-in default content in
// src/AboutModal.tsx, so the modal is never blank.
export const about = defineType({
  name: 'about',
  title: 'About Modal',
  type: 'document',
  icon: InfoOutlineIcon,
  fields: [
    defineField({
      name: 'heroImage',
      title: 'Hero image (cover photo)',
      type: 'image',
      options: {hotspot: true},
      description: 'Shown at the top of the modal, above the tabs.',
    }),
    defineField({
      name: 'sections',
      title: 'Sections (one per tab)',
      type: 'array',
      of: [{type: 'aboutSection'}],
      description:
        'Each section is a tab at the top of the modal. Compose each from blocks: section ' +
        'header, body copy, primary/secondary buttons, links, and photos.',
    }),
  ],
  preview: {
    select: {sections: 'sections'},
    prepare({sections}) {
      const n = Array.isArray(sections) ? sections.length : 0
      return {title: 'About Modal', subtitle: `${n} section${n === 1 ? '' : 's'}`}
    },
  },
})
