import {Box, Button, Card, Flex, Stack, Text} from '@sanity/ui'

export type SaveBarProps = {
  /** One line per individual staged change (drives the count + the list). */
  changes: string[]
  isSaving: boolean
  saveError: string | null
  onSave: () => void
  onReset: () => void
}

/**
 * Top-right status + actions for the staged-changes model. Edits accumulate
 * locally (PendingState); Save batch-commits them; Reset discards. Lists each
 * pending change in plain text below the buttons. Disabled when nothing's staged.
 */
export function SaveBar({changes, isSaving, saveError, onSave, onReset}: SaveBarProps) {
  const hasPending = changes.length > 0
  return (
    <Card
      padding={3}
      radius={2}
      shadow={1}
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        width: 280,
        background: 'rgba(7,14,32,0.92)',
      }}
    >
      <Stack space={3}>
        <Flex justify="space-between" align="center">
          <Text
            size={0}
            weight="semibold"
            style={{color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase'}}
          >
            Changes
          </Text>
          <Text
            size={1}
            weight="semibold"
            style={{
              color: hasPending ? '#ffe066' : 'rgba(255,255,255,0.4)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {changes.length} pending
          </Text>
        </Flex>
        <Flex gap={2}>
          <Button
            text={isSaving ? 'Saving…' : 'Save'}
            tone="primary"
            disabled={!hasPending || isSaving}
            onClick={onSave}
            style={{flex: 1}}
            fontSize={1}
          />
          <Button
            text="Reset"
            mode="ghost"
            tone="default"
            disabled={!hasPending || isSaving}
            onClick={onReset}
            style={{flex: 1}}
            fontSize={1}
          />
        </Flex>
        {hasPending && (
          <Stack space={2} style={{maxHeight: 180, overflowY: 'auto'}}>
            {changes.map((c, i) => (
              <Text key={i} size={0} style={{color: 'rgba(255,255,255,0.82)'}}>
                • {c}
              </Text>
            ))}
          </Stack>
        )}
        {saveError && (
          <Box>
            <Text size={0} style={{color: '#ff8a8a'}}>
              {saveError}
            </Text>
          </Box>
        )}
      </Stack>
    </Card>
  )
}
