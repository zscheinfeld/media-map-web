import {defineField, defineType} from 'sanity'
import {BlockElementIcon} from '@sanity/icons'

// An entity — a sub-brand / property that hangs off a parent company (e.g. ABC
// or Marvel under Disney). Rendered on the map as a plain text label in the same
// typography as a company name, but with NO circle, fill, or valuation. It
// belongs to a sector (gravity well) and can be connected to a company or
// another entity via a `connection`.
//
// Unlike a company it carries no valuation/data-source/styling. Visibility is
// driven by `appearance_windows` (which maps it shows on); placement reuses the
// company `positionOverride` model (drag/pin + time-scoping in the Map Editor).
export const entity = defineType({
  name: 'entity',
  title: 'Entity',
  type: 'document',
  icon: BlockElementIcon,

  groups: [
    {name: 'basics', title: 'Basics', default: true},
    {name: 'appearance', title: 'Appearance windows'},
    {name: 'position', title: 'Position'},
  ],

  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      group: 'basics',
      description: 'Label text shown on the map (e.g. "ABC", "Marvel").',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'basics',
      description: 'Stable identifier other systems key on. Do not change once set.',
      options: {source: 'name', maxLength: 96},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'sector',
      title: 'Sector',
      type: 'reference',
      group: 'basics',
      to: [{type: 'sector'}],
      description: 'The sector (gravity well) this entity clusters within.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'appearance_windows',
      title: 'Appearance windows',
      type: 'array',
      group: 'appearance',
      of: [{type: 'appearanceWindow'}],
      description:
        'Which maps (moments in the timeline) this entity appears on. Add one window per ' +
        'stretch it should be visible. Leave empty to show on every map.',
    }),
    defineField({
      name: 'position_overrides',
      title: 'Position overrides',
      type: 'array',
      group: 'position',
      of: [{type: 'positionOverride'}],
      description:
        'Optional fixed positions for this entity (same model as a company). Modeled as a list ' +
        'so it can be placed differently across the timeline. With no entries, it floats within ' +
        'its sector. Usually authored by dragging in the Map Editor.',
    }),
  ],

  preview: {
    select: {name: 'name', sectorName: 'sector.name'},
    prepare({name, sectorName}) {
      return {
        title: name,
        subtitle: sectorName ? `Entity · ${sectorName}` : 'Entity',
      }
    },
  },
})
