import {defineField, defineType} from 'sanity'

// Ombré stripes: N stripes whose colours are sampled along a ramp of colour
// stops. Used by planetStyle.ombre (it wins over Stripes / Fill when set).
// Mirrors map-core's `OmbreStripes` type — the renderer lives in map-core's
// Planet component, so the site and the Map Editor draw it identically.
export const ombreStripes = defineType({
  name: 'ombreStripes',
  title: 'Ombré stripes',
  type: 'object',
  fields: [
    defineField({
      name: 'stops',
      title: 'Colour stops',
      type: 'array',
      of: [{type: 'color'}],
      description: 'The ramp the stripes are sampled from, first → last. One colour = a solid planet.',
      validation: (Rule) => Rule.min(1),
    }),
    defineField({
      name: 'count',
      title: 'Stripe count',
      type: 'number',
      initialValue: 12,
      validation: (Rule) => Rule.integer().min(1).max(120),
    }),
    defineField({
      name: 'angle',
      title: 'Angle (°)',
      type: 'number',
      description: '0 = horizontal bands, 90 = vertical.',
      initialValue: 120,
      validation: (Rule) => Rule.min(0).max(180),
    }),
    defineField({
      name: 'blend',
      title: 'Blend space',
      type: 'string',
      initialValue: 'oklab',
      options: {
        list: [
          {title: 'OKLab (smooth)', value: 'oklab'},
          {title: 'sRGB (raw)', value: 'srgb'},
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'reverse',
      title: 'Reverse ramp',
      type: 'boolean',
      initialValue: false,
    }),
    defineField({
      name: 'stripe_stroke_px',
      title: 'Line between stripes (px)',
      type: 'number',
      description: '0 or empty = no line.',
      validation: (Rule) => Rule.min(0).max(12),
    }),
    defineField({
      name: 'stripe_stroke_color',
      title: 'Line colour',
      type: 'color',
    }),
  ],
})
