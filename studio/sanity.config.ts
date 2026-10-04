import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {colorInput} from '@sanity/color-input'
import {ControlsIcon} from '@sanity/icons'
import {schemaTypes} from './schemas'
import {deskStructure} from './structure/deskStructure'
import {LayoutLabTool} from './tools/layoutLab/LayoutLabTool'

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

  // "Layout lab" — the way in to the site's own layout editor (opens in a new
  // tab) and where the layout it exports is published. It replaced the former
  // in-Studio Map Editor (code kept in tools/mapEditor, no longer registered).
  tools: (prev) => [
    ...prev,
    {
      name: 'layout-lab',
      title: 'Layout lab',
      icon: ControlsIcon,
      component: LayoutLabTool,
    },
  ],
})
