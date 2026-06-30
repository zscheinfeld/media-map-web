import {useEffect, useState} from 'react'
import {type StringInputProps, useClient, useFormValue} from 'sanity'
import {Card, Stack, Text} from '@sanity/ui'

type DataSourceInfo = {type?: 'api' | 'manual'; ticker_format_hint?: string}

/**
 * Custom input for Company.ticker that adapts to the selected data source:
 *  - Manual sources: tickers don't apply, so we replace the input with a note.
 *  - API sources: render the normal input plus that source's ticker_format_hint
 *    as helper text, so editors enter exchange suffixes correctly.
 *
 * (The "required when API" rule lives in the field's async validation, not here.)
 */
export function TickerInput(props: StringInputProps) {
  const dataSourceRef = useFormValue(['data_source']) as {_ref?: string} | undefined
  const client = useClient({apiVersion: '2024-01-01'})
  const [info, setInfo] = useState<DataSourceInfo | null>(null)

  const ref = dataSourceRef?._ref
  useEffect(() => {
    let cancelled = false
    if (!ref) {
      setInfo(null)
      return
    }
    client
      .fetch<DataSourceInfo | null>('*[_id == $id][0]{type, ticker_format_hint}', {id: ref})
      .then((res) => {
        if (!cancelled) setInfo(res)
      })
    return () => {
      cancelled = true
    }
  }, [ref, client])

  if (info?.type === 'manual') {
    return (
      <Card padding={3} radius={2} tone="transparent" border>
        <Text size={1} muted>
          Ticker is not used for manual data sources.
        </Text>
      </Card>
    )
  }

  return (
    <Stack space={2}>
      {props.renderDefault(props)}
      {info?.ticker_format_hint && (
        <Text size={1} muted>
          Format hint: {info.ticker_format_hint}
        </Text>
      )}
    </Stack>
  )
}
