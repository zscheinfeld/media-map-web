import {defineField, defineType} from 'sanity'

// A soft colored halo rendered behind a planet (e.g. the PSM sector's red glow).
// Optional on planetStyle — but once an editor adds a glow, all three fields are
// required (a glow with no color/size is meaningless).
export const glow = defineType({
  name: 'glow',
  title: 'Glow',
  type: 'object',
  options: {collapsible: true, collapsed: false},
  fields: [
    defineField({
      name: 'color',
      title: 'Color',
      type: 'color', // from @sanity/color-input
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'blur_px',
      title: 'Blur (px)',
      type: 'number',
      description: 'Gaussian blur radius, in screen pixels (constant on screen at any zoom).',
      validation: (Rule) => Rule.required().positive(),
    }),
    defineField({
      name: 'spread_px',
      title: 'Spread (px)',
      type: 'number',
      description: 'How far the glow extends beyond the planet radius, in screen pixels.',
      validation: (Rule) => Rule.required().positive(),
    }),
  ],
})
