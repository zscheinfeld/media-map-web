import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {colorInput} from '@sanity/color-input'
import {EarthGlobeIcon} from '@sanity/icons'
import {schemaTypes} from './schemas'
import {deskStructure} from './structure/deskStructure'
import {MapEditorTool} from './tools/mapEditor/MapEditorTool'

// Project ID / dataset come from env (SANITY_STUDIO_* are the Studio-side
// convention — they're inlined at build time). Fill them in your shell or a
// `.env` file; see .env.example and the README.
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'missing-project-id'
const dataset = process.env.SANITY_STUDIO_DATASET || 'production'

export default defineConfig({
  name: 'default',
  title: 'Media Map CMS',

  projectId,
  dataset,

  plugins: [
    // Custom desk layout (Companies, Sectors, Connections, Articles, Podcasts,
    // then a separate Data Sources group).
    structureTool({structure: deskStructure}),
    // Color picker fields used by planetStyle/glow (fill, stripes, stroke, glow color).
    colorInput(),
  ],

  schema: {
    types: schemaTypes,
  },

  // Custom "Map Editor" tool — the visual map editor built on @media-map/map-core.
  // Appended after the tools contributed by plugins (Structure, etc.).
  tools: (prev) => [
    ...prev,
    {
      name: 'map-editor',
      title: 'Map Editor',
      icon: EarthGlobeIcon,
      component: MapEditorTool,
    },
  ],
})
