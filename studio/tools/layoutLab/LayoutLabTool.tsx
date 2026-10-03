import {Box, Button, Card, Flex, Heading, Stack, Text} from '@sanity/ui'
import {LaunchIcon} from '@sanity/icons'

// The layout lab lives on the public site itself (so the map is tuned exactly as
// visitors see it, with no Studio chrome around it). This tab is just the way in:
// it opens the lab in a new browser tab and explains how a layout gets published.
const SITE_URL = (process.env.SANITY_STUDIO_SITE_URL || 'https://map.eshap.tv').replace(/\/$/, '')
const LAB_URL = `${SITE_URL}/?layout=1`

export function LayoutLabTool() {
  return (
    <Flex align="center" justify="center" height="fill" padding={5}>
      <Card padding={5} radius={3} shadow={1} style={{maxWidth: 560}}>
        <Stack space={5}>
          <Heading size={2}>Layout lab</Heading>
          <Text size={2} muted>
            Adjust how the map is laid out — spacing, type sizes, which names show, pinned planets and
            sector wells — on desktop, tablet and phone. It opens the live site in a new tab with an
            editing panel.
          </Text>
          <Box>
            <Button
              as="a"
              href={LAB_URL}
              target="_blank"
              rel="noopener noreferrer"
              icon={LaunchIcon}
              text="Open the layout lab"
              tone="primary"
              fontSize={2}
              padding={4}
            />
          </Box>
          <Stack space={3}>
            <Text size={1} weight="semibold">To publish a layout</Text>
            <Text size={1} muted>1. In the lab, press Copy JSON.</Text>
            <Text size={1} muted>2. Back here, open Map Settings and paste it into the Layout field, replacing what is there.</Text>
            <Text size={1} muted>3. Publish. The site uses it on the next page load.</Text>
          </Stack>
        </Stack>
      </Card>
    </Flex>
  )
}
