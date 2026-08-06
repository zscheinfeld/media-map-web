import {Button, Card, Stack, Text} from '@sanity/ui'

export type ConnectModePanelProps = {
  /** Connect-mode currently active? (Click planet A → planet B to create a line.) */
  connectMode: boolean
  /** Set when the user has clicked the first planet but not the second yet. */
  connectFrom: string | null
  onToggle: () => void
  onCancel: () => void
  /** Bare = render just the controls (no Card/title) for the connected control panel. */
  bare?: boolean
}

/**
 * Left-side companion panel for connection authoring. Toggling "Connect" puts
 * the editor in a sub-mode where planet drag is disabled — instead, clicking
 * planet A then planet B creates a new connection at the currently-selected
 * moment. Stays on until toggled off, so editors can author many in a row.
 */
export function ConnectModePanel({
  connectMode,
  connectFrom,
  onToggle,
  onCancel,
  bare = false,
}: ConnectModePanelProps) {
  const body = (
    <Stack space={3}>
      <Button
          text={connectMode ? 'Exit connect mode' : 'Connect planets'}
          tone={connectMode ? 'primary' : 'default'}
          mode={connectMode ? 'default' : 'ghost'}
          fontSize={1}
          padding={3}
          onClick={onToggle}
        />
        {connectMode && (
          <Stack space={2}>
            <Text size={0} muted>
              {connectFrom
                ? `Click another planet to connect from "${connectFrom}". Escape to cancel.`
                : 'Click the first planet.'}
            </Text>
            {connectFrom && (
              <Button
                text="Cancel selection"
                mode="bleed"
                tone="default"
                fontSize={0}
                padding={2}
                onClick={onCancel}
              />
            )}
          </Stack>
        )}
    </Stack>
  )

  if (bare) return body

  return (
    <Card padding={3} radius={2} shadow={1} style={{width: '100%', background: 'rgba(7,14,32,0.92)'}}>
      <Stack space={3}>
        <Text
          size={0}
          weight="semibold"
          style={{color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase'}}
        >
          Connections
        </Text>
        {body}
      </Stack>
    </Card>
  )
}
