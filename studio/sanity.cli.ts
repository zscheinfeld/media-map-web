import {defineCliConfig} from 'sanity/cli'

// Project ID + dataset are read from env so the same checkout can target
// different Sanity projects/datasets without editing source. Set them in your
// shell or a `.env` file (see .env.example and README). `sanity deploy`,
// `sanity dev`, etc. all read this.
export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID,
    dataset: process.env.SANITY_STUDIO_DATASET,
  },
})
