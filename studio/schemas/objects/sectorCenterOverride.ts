import {defineField, defineType} from 'sanity'

// One time-scoped center for a sector, in slide-unit coordinates. Sectors hold
// an ARRAY of these so the gravity well can move across the timeline — e.g. as
// large pinned planets within the sector change in size/position, the cluster
// can re-anchor to keep composition coherent.
//
// Forward propagation: at viewed moment T, the active override is the one with
// the largest `start_date ≤ T`. No `end_date` — the next-later override
// implicitly ends the prior. No `pin` — sector centers are always attractors.
export const sectorCenterOverride = defineType({
  name: 'sectorCenterOverride',
  title: 'Sector center override',
  type: 'object',
  fields: [
    defineField({
      name: 'x',
      title: 'X',
      type: 'number',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'y',
      title: 'Y',
      type: 'number',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'start_date',
      title: 'Effective from',
      type: 'date',
      description:
        'When this center takes effect. Leave blank for "always" (acts as the baseline; ' +
        'any dated override forward-propagates over it from its date onward).',
    }),
  ],
  preview: {
    select: {x: 'x', y: 'y', start: 'start_date'},
    prepare({x, y, start}) {
      return {
        title: `(${x ?? '?'}, ${y ?? '?'})`,
        subtitle: start ? `from ${start}` : 'always',
      }
    },
  },
})
