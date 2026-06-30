import {defineField, defineType} from 'sanity'
import {PlanetStylePreview} from '../../components/PlanetStylePreview'

// Visual style for a planet. Every field is optional so editors only fill in
// what differs from the defaults. Used in two places:
//   - Sector.default_style  → the baseline look for every planet in the sector
//   - Company.planet_style   → per-company overrides (shallow-merged over the
//                              sector default, company fields winning)
//
// The custom `input` component renders a live SVG preview next to the fields.
// On a Company it shows the MERGED appearance (sector default + this override);
// on a Sector it shows the default alone.
export const planetStyle = defineType({
  name: 'planetStyle',
  title: 'Planet style',
  type: 'object',
  components: {
    input: PlanetStylePreview,
  },
  fields: [
    defineField({
      name: 'fill',
      title: 'Fill color',
      type: 'color',
      description: 'Single flat color. Ignored if 2+ stripes are set (stripes win).',
    }),
    defineField({
      name: 'stripes',
      title: 'Stripes',
      type: 'array',
      of: [{type: 'color'}],
      description: 'Two or more colors render as equal bands across the planet (for multi-color brands). Replaces fill.',
      // Allow 0 (none) or 2+; a single stripe is meaningless.
      validation: (Rule) =>
        Rule.custom((stripes) => {
          if (!stripes || stripes.length === 0) return true
          if (stripes.length >= 2) return true
          return 'Provide at least 2 stripe colors (or none).'
        }),
    }),
    defineField({
      name: 'stripe_orientation',
      title: 'Stripe orientation',
      type: 'string',
      initialValue: 'vertical',
      options: {
        list: [
          {title: 'Vertical', value: 'vertical'},
          {title: 'Horizontal', value: 'horizontal'},
          {title: 'Diagonal (45°)', value: 'diagonal'},
        ],
        layout: 'radio',
      },
    }),
    defineField({
      name: 'stroke',
      title: 'Outline color',
      type: 'color',
    }),
    defineField({
      name: 'stroke_width_px',
      title: 'Outline width (px)',
      type: 'number',
      description: 'Outline width in screen pixels.',
      validation: (Rule) => Rule.positive(),
    }),
    defineField({
      name: 'glow',
      title: 'Glow',
      type: 'glow',
    }),
  ],
})
