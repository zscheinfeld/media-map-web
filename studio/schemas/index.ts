import type {SchemaTypeDefinition} from 'sanity'

// Documents
import {company} from './documents/company'
import {entity} from './documents/entity'
import {sector} from './documents/sector'
import {connection} from './documents/connection'
import {dataSource} from './documents/dataSource'
import {mapSettings} from './documents/mapSettings'

// Shared objects
import {planetStyle} from './objects/planetStyle'
import {glow} from './objects/glow'
import {positionOverride} from './objects/positionOverride'
import {sectorCenterOverride} from './objects/sectorCenterOverride'
import {appearanceWindow} from './objects/appearanceWindow'
import {mapSettingsOverride} from './objects/mapSettingsOverride'
import {vital} from './objects/vital'
import {eshapContent} from './objects/eshapContent'
import {externalArticle} from './objects/externalArticle'

export const schemaTypes: SchemaTypeDefinition[] = [
  // Documents
  company,
  entity,
  sector,
  connection,
  dataSource,
  mapSettings,
  // Objects
  planetStyle,
  glow,
  positionOverride,
  sectorCenterOverride,
  appearanceWindow,
  mapSettingsOverride,
  vital,
  eshapContent,
  externalArticle,
]
