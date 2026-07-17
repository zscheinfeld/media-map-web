import {Box, Button, Card, Flex, Select, Stack, Text, TextArea} from '@sanity/ui'
import {yearOfMoment, type Moment} from './moment'
import type {ConnectionStyle, ResolvedConnection} from './pendingChanges'

export type ConnectionInspectorProps = {
  connection: ResolvedConnection | null
  /** The currently-selected global moment, used to label the "end now" button. */
  currentMoment: Moment
  onStyleChange: (next: ConnectionStyle) => void
  onDescriptionChange: (next: string) => void
  /** Set the connection's end_year to the current year. It stops appearing after that year. */
  onEndAtCurrentMoment: () => void
  /** Clear end_year (reopen). */
  onReopen: () => void
  onDelete: () => void
  onClose: () => void
}

/**
 * Right-side inspector shown when a connection line is selected. Mirrors the
 * app's connection editor (style toggle + description + delete) and adds the
 * time-scoping action: "End at {year}" sets end_year so the connection stops
 * appearing on maps after that year; "Reopen" clears end_year.
 *
 * Replaces the PlanetInspector while a connection is selected (only one
 * inspector visible at a time).
 */
export function ConnectionInspector({
  connection,
  currentMoment,
  onStyleChange,
  onDescriptionChange,
  onEndAtCurrentMoment,
  onReopen,
  onDelete,
  onClose,
}: ConnectionInspectorProps) {
  if (!connection) return null
  const currentYear = yearOfMoment(currentMoment)
  const startLabel = connection.startYear != null ? String(connection.startYear) : 'Always'
  const endLabel = connection.endYear != null ? String(connection.endYear) : 'Still active'

  return (
    <Card
      padding={3}
      radius={2}
      shadow={2}
      style={{
        position: 'absolute',
        top: 92,
        right: 12,
        width: 280,
        background: 'rgba(7,14,32,0.94)',
        maxHeight: 'calc(100% - 110px)',
        overflow: 'auto',
      }}
    >
      <Stack space={3}>
        <Flex align="center" justify="space-between">
          <Text size={1} weight="semibold" style={{color: '#fff'}}>
            {connection.from} → {connection.to}
          </Text>
          <Button mode="bleed" tone="default" text="✕" onClick={onClose} padding={2} fontSize={1} />
        </Flex>
        {connection.isPendingNew && (
          <Text size={0} style={{color: '#ffe066'}}>
            New (unsaved)
          </Text>
        )}

        <Stack space={2}>
          <Text size={0} muted style={{textTransform: 'uppercase', letterSpacing: 1}}>
            Style
          </Text>
          <Select
            value={connection.style}
            onChange={(e) => onStyleChange(e.currentTarget.value as ConnectionStyle)}
            fontSize={1}
          >
            <option value="solid">Solid (wholly owned / closed)</option>
            <option value="dotted">Dotted (partial / in-process)</option>
          </Select>
        </Stack>

        <Stack space={2}>
          <Text size={0} muted style={{textTransform: 'uppercase', letterSpacing: 1}}>
            Description
          </Text>
          <TextArea
            rows={3}
            value={connection.description}
            onChange={(e) => onDescriptionChange(e.currentTarget.value)}
            fontSize={1}
            placeholder="Hover tooltip text"
          />
        </Stack>

        {/* Time window: read-only summary + end/reopen action. */}
        <Stack space={2}>
          <Text size={0} muted style={{textTransform: 'uppercase', letterSpacing: 1}}>
            Time window
          </Text>
          <Box>
            <Text size={0} style={{color: 'rgba(255,255,255,0.85)', fontVariantNumeric: 'tabular-nums'}}>
              {startLabel} → {endLabel}
            </Text>
          </Box>
          {connection.endYear != null ? (
            <Button
              text={`Reopen (clear end ${connection.endYear})`}
              mode="ghost"
              tone="primary"
              fontSize={1}
              padding={2}
              onClick={onReopen}
            />
          ) : (
            <Button
              text={`End at ${currentYear}`}
              mode="ghost"
              tone="caution"
              fontSize={1}
              padding={2}
              onClick={onEndAtCurrentMoment}
              disabled={
                // Can't end before the start.
                connection.startYear != null && currentYear < connection.startYear
              }
            />
          )}
        </Stack>

        <Button
          text="Delete connection"
          mode="ghost"
          tone="critical"
          fontSize={1}
          padding={2}
          onClick={onDelete}
        />
        <Text size={0} muted>
          Edits stage in the Save bar — nothing commits until you press Save.
        </Text>
      </Stack>
    </Card>
  )
}
