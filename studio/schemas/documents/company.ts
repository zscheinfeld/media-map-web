import {defineField, defineType} from 'sanity'
import {EarthGlobeIcon, WarningOutlineIcon} from '@sanity/icons'
import {TickerInput} from '../../components/TickerInput'

// Rough "N units ago" string for the list preview (avoids a date-lib dependency).
function relativeTime(iso: string): string {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return iso
  const secs = Math.round((Date.now() - then) / 1000)
  const table: [number, string][] = [
    [60, 'second'],
    [60, 'minute'],
    [24, 'hour'],
    [7, 'day'],
    [4.345, 'week'],
    [12, 'month'],
    [Number.POSITIVE_INFINITY, 'year'],
  ]
  let value = Math.abs(secs)
  let unit = 'second'
  for (const [size, name] of table) {
    if (value < size) {
      unit = name
      break
    }
    value = Math.floor(value / size)
    unit = name
  }
  const rounded = Math.max(1, Math.floor(value))
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'} ago`
}

const STALE_MS = 48 * 60 * 60 * 1000

// A company — rendered as a "planet" on the map.
export const company = defineType({
  name: 'company',
  title: 'Company',
  type: 'document',
  icon: EarthGlobeIcon,

  // Tabbed groups so the form isn't one long scroll.
  groups: [
    {name: 'basics', title: 'Basics', default: true},
    {name: 'valuation', title: 'Valuation & Data Source'},
    {name: 'styling', title: 'Styling'},
    {name: 'position', title: 'Position'},
    {name: 'vitals', title: 'Vitals'},
    {name: 'content', title: 'Related Content'},
  ],

  fields: [
    // --- Basics ---
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      group: 'basics',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'basics',
      description:
        'Stable identifier other systems key on (especially the future Supabase time-series store). ' +
        'Do not change once set.',
      options: {source: 'name', maxLength: 96},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'sector',
      title: 'Sector',
      type: 'reference',
      group: 'basics',
      to: [{type: 'sector'}],
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
      group: 'basics',
      rows: 4,
      description: 'Free-text context about this company, written by Evan. Not time-bound.',
    }),
    defineField({
      name: 'is_public',
      title: 'Public company',
      type: 'boolean',
      group: 'basics',
      initialValue: true,
      description:
        'Whether this company has an automated API feed. The future daily refresh job only fetches public companies; ' +
        'private companies rely entirely on manual valuations.',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'hq_country',
      title: 'HQ country',
      type: 'string',
      group: 'basics',
    }),
    defineField({
      name: 'founded_year',
      title: 'Founded year',
      type: 'number',
      group: 'basics',
      validation: (Rule) =>
        Rule.integer()
          .min(1800)
          .max(new Date().getFullYear())
          .error('Enter a 4-digit year between 1800 and now.'),
    }),
    defineField({
      name: 'website',
      title: 'Website',
      type: 'url',
      group: 'basics',
    }),

    // --- Valuation & Data Source ---
    defineField({
      name: 'valuation_type',
      title: 'Primary metric',
      type: 'string',
      group: 'valuation',
      description:
        "Which number the map + side panel show as this company's primary metric, and the label it appears under. " +
        'Market cap is pulled from the data API (public companies); fundraising valuation (private) and yearly ' +
        'revenue (PSM) are entered by hand in “Manual valuations” below.',
      options: {
        list: [
          {title: 'Latest Market Cap', value: 'market_cap'},
          {title: 'Fundraising Valuation', value: 'fundraising_valuation'},
          {title: 'Yearly Revenue', value: 'yearly_revenue'},
        ],
        layout: 'radio',
      },
      initialValue: 'market_cap',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'data_source',
      title: 'Data source',
      type: 'reference',
      group: 'valuation',
      to: [{type: 'dataSource'}],
      // Only "active" sources are selectable; deprecated/paused are hidden here
      // but stay valid on existing documents.
      options: {filter: 'status == "active"'},
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'ticker',
      title: 'Ticker',
      type: 'string',
      group: 'valuation',
      description: 'Market ticker, e.g. "DIS", "BNJ.PA", "9697.T". Required for API sources; not used for manual sources.',
      // Custom input hides itself for manual data sources and shows the
      // selected source's ticker_format_hint as helper text.
      components: {input: TickerInput},
      // Required only when the referenced data source is an API feed. The check
      // is async because we must resolve the referenced DataSource's type.
      validation: (Rule) =>
        Rule.custom(async (ticker, context) => {
          const ref = (context.document?.data_source as {_ref?: string} | undefined)?._ref
          if (!ref) return true
          const client = context.getClient({apiVersion: '2024-01-01'})
          const type = await client.fetch<string | null>('*[_id == $id][0].type', {id: ref})
          if (type === 'api' && !ticker) return 'Ticker is required for API data sources.'
          return true
        }),
    }),
    defineField({
      name: 'last_synced',
      title: 'Last synced',
      type: 'datetime',
      group: 'valuation',
      // Written by the future refresh job, never edited by hand.
      readOnly: true,
      description: 'Set automatically by the refresh job. Read-only here.',
    }),
    defineField({
      name: 'manual_valuations',
      title: 'Manual valuations',
      type: 'array',
      group: 'valuation',
      description:
        'Manual entries surgically override the API feed for matching dates only — they do not blanket-replace the ' +
        'feed. For private companies, manual entries are the only source of valuation data. Available on all companies.',
      of: [
        {
          type: 'object',
          fields: [
            defineField({
              name: 'value_billions_usd',
              title: 'Value (billions USD)',
              type: 'number',
              validation: (Rule) => Rule.required().positive(),
            }),
            defineField({
              name: 'as_of_date',
              title: 'As of date',
              type: 'date',
              description: 'The day this valuation applies to.',
              validation: (Rule) => Rule.required(),
            }),
            defineField({
              name: 'source_note',
              title: 'Source note',
              type: 'string',
              description: 'E.g. "Series G, April 2026" or "Correcting bad FMP feed for March".',
            }),
          ],
          preview: {
            select: {value: 'value_billions_usd', date: 'as_of_date', note: 'source_note'},
            prepare({value, date, note}) {
              return {
                title: `$${value ?? '?'}B`,
                subtitle: [date, note].filter(Boolean).join(' · '),
              }
            },
          },
        },
      ],
    }),

    // --- Styling ---
    defineField({
      name: 'planet_style',
      title: 'Planet style',
      type: 'planetStyle',
      group: 'styling',
      description: 'Per-company overrides. Anything left blank inherits from the sector’s default style.',
    }),

    // --- Position ---
    defineField({
      name: 'position_overrides',
      title: 'Position overrides',
      type: 'array',
      group: 'position',
      description:
        'Optional fixed positions for this planet. Modeled as a list so a planet can be placed differently across ' +
        'the timeline — each entry has its own date range. With no entries, the planet floats within its sector.',
      of: [{type: 'positionOverride'}],
    }),

    // --- Appearance windows ---
    defineField({
      name: 'appearance_windows',
      title: 'Appearance windows',
      type: 'array',
      group: 'basics',
      of: [{type: 'appearanceWindow'}],
      description:
        'Which yearly maps this company appears on. Add one window per stretch of years it should be ' +
        'visible (e.g. 2018 → 2023). Leave empty to show on every map.',
    }),

    // --- Vitals ---
    defineField({
      name: 'vitals',
      title: 'Vitals',
      type: 'array',
      group: 'vitals',
      description:
        'Time-bound facts shown as tag blocks in the map side panel (e.g. "Minecraft · 230M MAU"). ' +
        'Each carries its own date window, so a vital only appears on maps within that range.',
      of: [{type: 'vital'}],
    }),

    // --- Related Content ---
    defineField({
      name: 'eshap_content',
      title: 'Eshap content',
      type: 'array',
      group: 'content',
      description:
        "Evan's own content (LinkedIn posts, podcasts, Substack posts) attached to this company. " +
        'The side panel shows the most recent. Hand-authored for now; meant to be pulled dynamically later.',
      of: [{type: 'eshapContent'}],
    }),
    defineField({
      name: 'external_articles',
      title: 'External articles',
      type: 'array',
      group: 'content',
      description:
        'Recent external news (Google / Yahoo Finance) about this company. ' +
        'Hand-authored for now; meant to be pulled dynamically from a finance feed later.',
      of: [{type: 'externalArticle'}],
    }),
  ],

  preview: {
    select: {
      name: 'name',
      sectorName: 'sector.name',
      isPublic: 'is_public',
      dataSourceName: 'data_source.name',
      lastSynced: 'last_synced',
    },
    prepare({name, sectorName, isPublic, dataSourceName, lastSynced}) {
      const stale =
        isPublic && (!lastSynced || Date.now() - Date.parse(lastSynced) > STALE_MS)
      const parts = [
        sectorName,
        isPublic ? 'Public' : 'Private',
        dataSourceName,
        lastSynced ? `Last synced: ${relativeTime(lastSynced)}` : null,
        stale ? '⚠ stale' : null,
      ].filter(Boolean)
      return {
        title: name,
        subtitle: parts.join(' · '),
        // Warning icon flags public companies whose feed is missing or >48h old.
        media: stale ? WarningOutlineIcon : EarthGlobeIcon,
      }
    },
  },
})
