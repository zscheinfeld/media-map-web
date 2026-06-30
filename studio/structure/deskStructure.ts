import type {StructureBuilder} from 'sanity/structure'
import {
  BlockElementIcon,
  ControlsIcon,
  DatabaseIcon,
  EarthGlobeIcon,
  LinkIcon,
  TagIcon,
} from '@sanity/icons'

// Editorial content first (Companies → Entities → Sectors → Connections), then a
// divider and the more admin-y Map Settings / Data Sources group. (Related
// content — Evan's posts + external articles — now lives inline on each company.)
export const deskStructure = (S: StructureBuilder) =>
  S.list()
    .title('Media Map')
    .items([
      S.listItem()
        .title('Companies')
        .icon(EarthGlobeIcon)
        .schemaType('company')
        .child(S.documentTypeList('company').title('Companies')),
      S.listItem()
        .title('Entities')
        .icon(BlockElementIcon)
        .schemaType('entity')
        .child(S.documentTypeList('entity').title('Entities')),
      S.listItem()
        .title('Sectors')
        .icon(TagIcon)
        .schemaType('sector')
        .child(S.documentTypeList('sector').title('Sectors')),
      S.listItem()
        .title('Connections')
        .icon(LinkIcon)
        .schemaType('connection')
        .child(S.documentTypeList('connection').title('Connections')),
      S.divider(),
      // Singleton: one global Map Settings doc (also editable live via the Map
      // Editor's layout knobs). Opens the fixed-id document directly.
      S.listItem()
        .title('Map Settings')
        .icon(ControlsIcon)
        .child(S.document().schemaType('mapSettings').documentId('mapSettings')),
      S.listItem()
        .title('Data Sources')
        .icon(DatabaseIcon)
        .schemaType('dataSource')
        .child(S.documentTypeList('dataSource').title('Data Sources')),
    ])
