import {defineField, defineType} from 'sanity'
import {TagIcon} from '@sanity/icons'

// A grouping of companies and a "gravity well" on the map. Companies reference
// a sector and inherit its default_style unless they override individual fields.
export const sector = defineType({
  name: 'sector',
  title: 'Sector',
  type: 'document',
  icon: TagIcon,
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: {source: 'name', maxLength: 96},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'desktop_center',
      title: 'Desktop center',
      type: 'object',
      description:
        'Baseline slide-unit coordinates of this sector’s center in the landscape (desktop) layout. ' +
        'Acts as the always-active fallback; if `desktop_center_overrides` carries dated entries, ' +
        'they forward-propagate over this baseline from their effective date.',
      fields: [
        defineField({name: 'x', title: 'X', type: 'number', validation: (R) => R.required()}),
        defineField({name: 'y', title: 'Y', type: 'number', validation: (R) => R.required()}),
      ],
      options: {columns: 2},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'desktop_center_overrides',
      title: 'Desktop center overrides (time-scoped)',
      type: 'array',
      of: [{type: 'sectorCenterOverride'}],
      description:
        'Optional time-scoped re-anchors for this sector\'s desktop center. At any viewed moment T, ' +
        'the override with the largest start_date ≤ T wins; if none qualify, the baseline ' +
        '`desktop_center` is used. Authored via the Map Editor.',
    }),
    defineField({
      name: 'mobile_center',
      title: 'Mobile center',
      type: 'object',
      description: 'Slide-unit coordinates of this sector’s center in the portrait (mobile) layout.',
      fields: [
        defineField({name: 'x', title: 'X', type: 'number', validation: (R) => R.required()}),
        defineField({name: 'y', title: 'Y', type: 'number', validation: (R) => R.required()}),
      ],
      options: {columns: 2},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'default_style',
      title: 'Default style',
      type: 'planetStyle',
      description: 'Baseline look for every planet in this sector. Companies can override individual fields.',
    }),
    defineField({
      name: 'swatch_background',
      title: 'Sidebar swatch background',
      type: 'string',
      description:
        'CSS gradient string for the sidebar legend dot. Use when the sector’s planets are too visually varied ' +
        'for a single color to represent (e.g. a rainbow gradient for "Large Cap").',
    }),
  ],
  preview: {
    select: {title: 'name', subtitle: 'slug.current'},
  },
})
