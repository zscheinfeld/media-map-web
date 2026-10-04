import {useCallback, useEffect, useState} from 'react'
import {Box, Button, Card, Flex, Heading, Stack, Text, TextArea, useToast} from '@sanity/ui'
import {LaunchIcon, PublishIcon} from '@sanity/icons'
import {useClient} from 'sanity'

// The layout lab lives on the public site itself (so the map is tuned exactly as
// visitors see it, with no Studio chrome around it). This tab is the way in and
// the way out: it opens the lab in a new browser tab, and it is where the layout
// the lab exports gets published.
//
// The layout is stored as a JSON string on the Map Settings singleton
// (`layout_lab`); the site reads it on load. That field is hidden in the Map
// Settings form — this tab is the only place it is edited.
const SITE_URL = (process.env.SANITY_STUDIO_SITE_URL || 'https://map.eshap.tv').replace(/\/$/, '')
const LAB_URL = `${SITE_URL}/?layout=1`
const MAP_SETTINGS_ID = 'mapSettings'

type Current = {layout_lab?: string | null; _updatedAt?: string} | null

/** Why a pasted value can't be published, or null when it is fine. */
function problemWith(text: string): string | null {
  if (!text.trim()) return null
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !('knobs' in parsed)) {
      return 'This does not look like a layout from the layout lab. Use its Copy JSON button.'
    }
    return null
  } catch {
    return 'Not valid JSON. Paste exactly what the lab\'s Copy JSON button gave you.'
  }
}

export function LayoutLabTool() {
  const client = useClient({apiVersion: '2024-01-01'})
  const toast = useToast()
  const [current, setCurrent] = useState<Current>(null)
  const [loaded, setLoaded] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const doc = await client.fetch<Current>(`*[_id == $id][0]{layout_lab, _updatedAt}`, {id: MAP_SETTINGS_ID})
    setCurrent(doc)
    setLoaded(true)
  }, [client])
  useEffect(() => {
    refresh().catch(() => setLoaded(true))
  }, [refresh])

  const problem = problemWith(text)
  const hasPublished = !!current?.layout_lab?.trim()
  const same = hasPublished && text.trim() !== '' && text.trim() === current?.layout_lab?.trim()

  // Write the published document (the site reads the published perspective).
  // If a draft of Map Settings is lying around, keep it in step so publishing
  // that draft later can't bring an older layout back.
  const write = async (value: string | null) => {
    setBusy(true)
    try {
      const draftId = `drafts.${MAP_SETTINGS_ID}`
      const hasDraft = await client.fetch<boolean>(`defined(*[_id == $id][0]._id)`, {id: draftId})
      const apply = (id: string) =>
        value === null ? client.patch(id).unset(['layout_lab']) : client.patch(id).set({layout_lab: value})
      let tx = client
        .transaction()
        .createIfNotExists({_id: MAP_SETTINGS_ID, _type: 'mapSettings'})
        .patch(apply(MAP_SETTINGS_ID))
      if (hasDraft) tx = tx.patch(apply(draftId))
      await tx.commit()
      await refresh()
      setText('')
      toast.push({
        status: 'success',
        title: value === null ? 'Back to the built-in layout' : 'Layout published',
        description: 'The site uses it on the next page load.',
      })
    } catch (e) {
      toast.push({status: 'error', title: 'Could not publish', description: e instanceof Error ? e.message : String(e)})
    } finally {
      setBusy(false)
    }
  }

  return (
    <Flex justify="center" padding={5} style={{overflowY: 'auto', height: '100%'}}>
      <Box style={{width: '100%', maxWidth: 640}}>
        <Stack space={5}>
          <Stack space={3}>
            <Heading size={2}>Layout lab</Heading>
            <Text size={2} muted>
              Adjust how the map is laid out — spacing, type sizes, which names show, pinned planets and
              sector wells — on desktop, tablet and phone.
            </Text>
          </Stack>

          <Card padding={4} radius={3} shadow={1}>
            <Stack space={4}>
              <Text size={1} weight="semibold">1. Edit</Text>
              <Text size={1} muted>
                Opens the live site in a new tab with the editing panel. When you are happy, press Copy JSON
                in the panel.
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
            </Stack>
          </Card>

          <Card padding={4} radius={3} shadow={1}>
            <Stack space={4}>
              <Text size={1} weight="semibold">2. Publish</Text>
              <Text size={1} muted>
                Paste the copied layout here and publish. It replaces the current layout for every device, and
                the site uses it on the next page load.
              </Text>
              <TextArea
                value={text}
                onChange={(e) => setText(e.currentTarget.value)}
                placeholder="Paste the layout JSON from the lab here"
                rows={8}
                spellCheck={false}
                style={{fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12}}
              />
              {problem && (
                <Card padding={3} radius={2} tone="critical">
                  <Text size={1}>{problem}</Text>
                </Card>
              )}
              {same && (
                <Card padding={3} radius={2} tone="transparent">
                  <Text size={1} muted>This is the layout that is already published.</Text>
                </Card>
              )}
              <Flex gap={3} align="center" wrap="wrap">
                <Button
                  icon={PublishIcon}
                  text={busy ? 'Publishing…' : 'Publish layout'}
                  tone="positive"
                  disabled={busy || !text.trim() || !!problem || same}
                  onClick={() => write(text.trim())}
                />
                <Text size={1} muted>
                  {!loaded
                    ? 'Checking what is published…'
                    : hasPublished
                      ? `A layout is published${current?._updatedAt ? ` · Map Settings last changed ${new Date(current._updatedAt).toLocaleString()}` : ''}`
                      : 'Nothing published yet — the site is using the layout built into it.'}
                </Text>
              </Flex>
            </Stack>
          </Card>

          {hasPublished && (
            <Card padding={4} radius={3} tone="transparent" border>
              <Stack space={3}>
                <Text size={1} weight="semibold">Go back to the built-in layout</Text>
                <Text size={1} muted>
                  Removes the published layout, so the site falls back to the layout that ships with it. Past
                  versions stay in the Map Settings document history.
                </Text>
                <Box>
                  <Button
                    text="Remove published layout"
                    mode="ghost"
                    tone="critical"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Remove the published layout? The site will use its built-in layout.')) write(null)
                    }}
                  />
                </Box>
              </Stack>
            </Card>
          )}
        </Stack>
      </Box>
    </Flex>
  )
}
