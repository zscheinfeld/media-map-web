import {defineField, defineType} from 'sanity'
import {DatabaseIcon} from '@sanity/icons'

// Where a company's valuation comes from. Referenced by Company.data_source.
// The future daily-refresh job keys off `code` + `type` to decide how (and
// whether) to fetch each company.
export const dataSource = defineType({
  name: 'dataSource',
  title: 'Data Source',
  type: 'document',
  icon: DatabaseIcon,
  fields: [
    defineField({
      name: 'name',
      title: 'Name',
      type: 'string',
      description: 'Display name shown in the Company data-source dropdown, e.g. "Financial Modeling Prep".',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'code',
      title: 'Code',
      type: 'string',
      description: 'Short machine-readable id used by the future refresh job, e.g. "fmp", "yahoo", "manual". Must be unique.',
      validation: (Rule) =>
        Rule.required().custom(async (code, context) => {
          if (!code) return true
          // Enforce uniqueness across all DataSource docs (ignoring this doc and
          // its draft counterpart).
          const id = context.document?._id?.replace(/^drafts\./, '') ?? ''
          const client = context.getClient({apiVersion: '2024-01-01'})
          const count = await client.fetch<number>(
            'count(*[_type == "dataSource" && code == $code && !(_id in [$id, $draftId])])',
            {code, id, draftId: `drafts.${id}`},
          )
          return count > 0 ? 'Another data source already uses this code.' : true
        }),
    }),
    defineField({
      name: 'type',
      title: 'Type',
      type: 'string',
      description: 'Whether this source is an automated API feed or human-entered.',
      options: {
        list: [
          {title: 'API (automated feed)', value: 'api'},
          {title: 'Manual (human-entered)', value: 'manual'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'status',
      title: 'Status',
      type: 'string',
      initialValue: 'active',
      description: 'Only "active" sources appear in the Company data-source dropdown. Deprecated sources are kept so historical references don’t break.',
      options: {
        list: [
          {title: 'Active', value: 'active'},
          {title: 'Deprecated', value: 'deprecated'},
          {title: 'Paused', value: 'paused'},
        ],
        layout: 'radio',
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'coverage_notes',
      title: 'Coverage notes',
      type: 'text',
      rows: 2,
      description: 'What this source covers well, e.g. "US public equities including NASDAQ and NYSE; weak on European exchanges".',
    }),
    defineField({
      name: 'ticker_format_hint',
      title: 'Ticker format hint',
      type: 'string',
      description:
        'Surfaced as helper text on Company.ticker when this source is selected, so editors enter tickers correctly. ' +
        'E.g. "Paris: .PA, London: .L, Tokyo: .T".',
    }),
    defineField({
      name: 'notes',
      title: 'Internal notes',
      type: 'text',
      rows: 2,
      description: 'Admin-only notes, e.g. "Paid plan, renews annually; API key in env vars".',
    }),
  ],
  preview: {
    select: {name: 'name', code: 'code', type: 'type', status: 'status'},
    prepare({name, code, type, status}) {
      return {
        title: name,
        subtitle: [code, type, status].filter(Boolean).join(' · '),
      }
    },
  },
})
