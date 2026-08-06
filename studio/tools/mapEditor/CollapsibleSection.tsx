import {useState, type ReactNode} from 'react'
import {Box, Flex, Text} from '@sanity/ui'
import {ChevronDownIcon} from '@sanity/icons'

export type CollapsibleSectionProps = {
  title: string
  /** Optional right-aligned control in the header (clicks don't toggle the section). */
  action?: ReactNode
  /** First section skips the top divider so the group reads as one connected card. */
  first?: boolean
  defaultOpen?: boolean
  children: ReactNode
}

/**
 * One accordion section inside the connected left-hand control card. The header
 * row (title + chevron) toggles the body; a thin top divider (all but the first)
 * makes the stacked sections read as a single widget rather than separate cards.
 */
export function CollapsibleSection({
  title,
  action,
  first = false,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <Box style={{borderTop: first ? undefined : '1px solid rgba(255,255,255,0.09)'}}>
      <Flex
        align="center"
        justify="space-between"
        onClick={() => setOpen((o) => !o)}
        style={{cursor: 'pointer', userSelect: 'none', padding: '10px 12px'}}
      >
        <Flex align="center" gap={1}>
          <Text
            size={1}
            style={{
              color: 'rgba(255,255,255,0.55)',
              display: 'inline-flex',
              transition: 'transform 140ms ease',
              transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            }}
          >
            <ChevronDownIcon />
          </Text>
          <Text
            size={0}
            weight="semibold"
            style={{color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase'}}
          >
            {title}
          </Text>
        </Flex>
        {action ? <span onClick={(e) => e.stopPropagation()}>{action}</span> : null}
      </Flex>
      {open ? <Box style={{padding: '0 12px 12px'}}>{children}</Box> : null}
    </Box>
  )
}
