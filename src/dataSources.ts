// Generated from the market-cap sheet's columns E, K and L (cleaned 2026-10-10) for the
// data-sources panel prototype. Keyed by company slug. To be replaced by a Sources
// column read from the valuations snapshot once the sheet carries one.

export type SourceRef = { label: string; url: string | null };
/** One source for a run of years (newest first in the list). */
export type YearSource = SourceRef & { from: number; to: number };
export type CompanySources = { frequency: "Live" | "Monthly"; current: SourceRef | null; years: YearSource[] };

export const COMPANY_SOURCES: Record<string, CompanySources> = {
 "accenture": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/accenture/marketcap/"
   }
  ]
 },
 "alibaba": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/alibaba/marketcap/"
   }
  ]
 },
 "alphabet": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/alphabet-google/marketcap/"
   }
  ]
 },
 "amazon": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/amazon/marketcap/"
   }
  ]
 },
 "amc": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/amc-entertainment/marketcap/"
   }
  ]
 },
 "amcn": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/amc-networks/marketcap/"
   }
  ]
 },
 "angel": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": []
 },
 "apollo": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/apollo-global-management/marketcap/"
   }
  ]
 },
 "apple": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/apple/marketcap/"
   }
  ]
 },
 "asmodee": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/asmodee-group-ab/marketcap/"
   }
  ]
 },
 "at-t": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/att/marketcap/"
   }
  ]
 },
 "bandai": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/bandai-namco/marketcap/"
   }
  ]
 },
 "banijay-convert-to-usd": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Yahoo Finance",
    "url": "https://finance.yahoo.com/quote/BNJ.AS/"
   }
  ]
 },
 "bell-canada": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/bce/marketcap/"
   }
  ]
 },
 "Bending Spoons": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": []
 },
 "canal-convert-to-usd": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2024,
    "to": 2025,
    "label": "Yahoo Finance",
    "url": "https://finance.yahoo.com/quote/CAN.L/"
   }
  ]
 },
 "charter": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/charter-communications/marketcap/"
   }
  ]
 },
 "cinemark": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/cinemark-theatres/marketcap/"
   }
  ]
 },
 "cineplex": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/cineplex/marketcap/"
   }
  ]
 },
 "comcast": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/comcast/marketcap/"
   }
  ]
 },
 "comscore": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/comscore/marketcap/"
   }
  ]
 },
 "dentsu": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/dentsu/marketcap/"
   }
  ]
 },
 "Deutsche Telekom": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/deutsche-telekom/marketcap/"
   }
  ]
 },
 "disney": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/walt-disney/marketcap/"
   }
  ]
 },
 "djt": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2024,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/trump-media-technology-group/marketcap/"
   }
  ]
 },
 "ea": {
  "frequency": "Monthly",
  "current": {
   "label": "BBC",
   "url": "https://www.bbc.com/news/articles/cjejyl34345o"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/electronic-arts/marketcap/"
   }
  ]
 },
 "echostar-dish": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/echostar/marketcap/"
   }
  ]
 },
 "ews-ion": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/ew-scripps-company/marketcap/"
   }
  ]
 },
 "f1": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/formula-one-group/marketcap/"
   }
  ]
 },
 "fox": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2019,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/fox-corporation/marketcap/"
   }
  ]
 },
 "fubo": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/fubotv/marketcap/"
   }
  ]
 },
 "fuji-tv": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/fuji-media-holdings/marketcap/"
   }
  ]
 },
 "gamestop": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/gamestop/marketcap/"
   }
  ]
 },
 "gray-tv": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/gray-television/marketcap/"
   }
  ]
 },
 "group-m6": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/metropole-television-groupe-m6/marketcap/"
   }
  ]
 },
 "grupo-televisa": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/televisa/marketcap/"
   }
  ]
 },
 "hasbro": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/hasbro/marketcap/"
   }
  ]
 },
 "hisense": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2020,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/hisense-visual-technology/marketcap/"
   }
  ]
 },
 "hybe": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2020,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/hybe/marketcap/"
   }
  ]
 },
 "iac": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2020,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/iac/marketcap/"
   }
  ]
 },
 "iheart": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2019,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/iheartmedia/marketcap/"
   }
  ]
 },
 "ipg": {
  "frequency": "Monthly",
  "current": {
   "label": "companiesmarketcap.com",
   "url": "https://companiesmarketcap.com/ipg/marketcap/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/ipg/marketcap/"
   }
  ]
 },
 "ipsos": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/ispos/marketcap/"
   }
  ]
 },
 "itv": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/itv/marketcap/"
   }
  ]
 },
 "lagardere": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/groupe-lagardere/marketcap/"
   }
  ]
 },
 "lg": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": []
 },
 "liberty-global": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/liberty-global/marketcap/"
   }
  ]
 },
 "lionsgate": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2024,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/lionsgate-studios/marketcap/"
   }
  ]
 },
 "live-nation": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/live-nation/marketcap/"
   }
  ]
 },
 "meta": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/meta-platforms/marketcap/"
   }
  ]
 },
 "mfe": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2019,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/mfe-mediaforeurope/marketcap/"
   },
   {
    "from": 2015,
    "to": 2016,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/mfe-mediaforeurope/marketcap/"
   }
  ]
 },
 "microsoft": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/microsoft/marketcap/"
   }
  ]
 },
 "msge": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2020,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/madison-square-garden/marketcap/"
   }
  ]
 },
 "multichoice-group": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2019,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/multichoice-group/marketcap/"
   }
  ]
 },
 "ncmi": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2023,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/national-cinemedia/marketcap/"
   }
  ]
 },
 "netflix": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/netflix/marketcap/"
   }
  ]
 },
 "newscorp": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/news-corp/marketcap/"
   }
  ]
 },
 "newsmax": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/newsmax/marketcap/"
   }
  ]
 },
 "nexstar": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/nexstar-media/marketcap/"
   }
  ]
 },
 "nine": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/nine-entertainment-co-holdings/marketcap/"
   }
  ]
 },
 "nintendo": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/nintendo/marketcap/"
   }
  ]
 },
 "nippon-tv": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/nippon-television-holdings/marketcap/"
   }
  ]
 },
 "nvidia": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/nvidia/marketcap/"
   }
  ]
 },
 "nyt": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/new-york-times/marketcap/"
   }
  ]
 },
 "omnicom": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/omnicom/marketcap/"
   }
  ]
 },
 "altice-us-now-optimum": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2017,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/altice-usa/marketcap/"
   }
  ]
 },
 "oracle": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/oracle/marketcap/"
   }
  ]
 },
 "paramount-skydance": {
  "frequency": "Monthly",
  "current": {
   "label": "companiesmarketcap.com",
   "url": "https://companiesmarketcap.com/paramount-skydance/marketcap/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/paramount-skydance/marketcap/"
   }
  ]
 },
 "pinterest": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2019,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/pinterest/marketcap/"
   }
  ]
 },
 "prosieben": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/prosiebensat1-media/marketcap/"
   }
  ]
 },
 "publicis": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/publicis-groupe/marketcap/"
   }
  ]
 },
 "quebecor": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/quebecor/marketcap/"
   }
  ]
 },
 "reddit": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2024,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/reddit/marketcap/"
   }
  ]
 },
 "reliance": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/reliance-industries/marketcap/"
   }
  ]
 },
 "roblox": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2021,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/roblox/marketcap/"
   }
  ]
 },
 "rogers": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/rogers-communication/marketcap/"
   }
  ]
 },
 "roku": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2017,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/roku/marketcap/"
   }
  ]
 },
 "samsung": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/samsung/marketcap/"
   }
  ]
 },
 "schibsted": {
  "frequency": "Monthly",
  "current": {
   "label": "companiesmarketcap.com",
   "url": "https://companiesmarketcap.com/schibsted/marketcap/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/schibsted/marketcap/"
   }
  ]
 },
 "sega-sammy": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/sega-sammy-holdings/marketcap/"
   }
  ]
 },
 "sinclair": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/sinclair-broadcast/marketcap/"
   }
  ]
 },
 "sirius": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/sirius-xm/marketcap/"
   }
  ]
 },
 "snap": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2017,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/snap/marketcap/"
   }
  ]
 },
 "sony": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/sony/marketcap/"
   }
  ]
 },
 "space-x": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": []
 },
 "sphere": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2020,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/sphere-entertainment/marketcap/"
   }
  ]
 },
 "spotify": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2018,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/spotify/marketcap/"
   }
  ]
 },
 "square-enix": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/square-enix/marketcap/"
   }
  ]
 },
 "stagwell": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2021,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/stagwell/marketcap/"
   }
  ]
 },
 "starz": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "Yahoo Finance",
    "url": "https://finance.yahoo.com/quote/STRZ/"
   },
   {
    "from": 2015,
    "to": 2015,
    "label": "Yahoo Finance",
    "url": "https://finance.yahoo.com/quote/STRZ/"
   }
  ]
 },
 "sun-tv": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/sun-tv-network/marketcap/"
   }
  ]
 },
 "t-mobile": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/t-mobile-us/marketcap/"
   }
  ]
 },
 "take-two": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/take-2-interactive/marketcap/"
   }
  ]
 },
 "tcl": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/tcl-technology-group-corporation/marketcap/"
   }
  ]
 },
 "tegna": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/tegna/marketcap/"
   }
  ]
 },
 "telus": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/telus/marketcap/"
   }
  ]
 },
 "tencent": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/tencent/marketcap/"
   }
  ]
 },
 "tf1": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/tf1/marketcap/"
   }
  ]
 },
 "the-trade-desk": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2016,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/the-trade-desk/marketcap/"
   }
  ]
 },
 "thomson-reuters": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/thomson-reuters/marketcap/"
   }
  ]
 },
 "tko-ufc-wwe": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2023,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/tko-group/marketcap/"
   }
  ]
 },
 "tpg": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2022,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/tpg/marketcap/"
   }
  ]
 },
 "ubisoft": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/ubisoft/marketcap/"
   }
  ]
 },
 "umg": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2021,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/universal-music-group/marketcap/"
   }
  ]
 },
 "unity": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2020,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/unity-software/marketcap/"
   }
  ]
 },
 "USA Today": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/usa-today-co/marketcap/"
   }
  ]
 },
 "verizon": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/verizon/marketcap/"
   }
  ]
 },
 "versant": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/versant-media-group/marketcap/"
   }
  ]
 },
 "viaplay": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2019,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/viaplay/marketcap/"
   }
  ]
 },
 "vivendi": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/vivendi/marketcap/"
   }
  ]
 },
 "walmart": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/walmart/marketcap/"
   }
  ]
 },
 "wbd": {
  "frequency": "Monthly",
  "current": {
   "label": "companiesmarketcap.com",
   "url": "https://companiesmarketcap.com/warner-bros-discovery/marketcap/"
  },
  "years": [
   {
    "from": 2022,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/warner-bros-discovery/marketcap/"
   }
  ]
 },
 "wmg": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2020,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/warner-music-group/marketcap/"
   }
  ]
 },
 "wpp": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/wpp/marketcap/"
   }
  ]
 },
 "XIACF": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2018,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/xiaomi/marketcap/"
   }
  ]
 },
 "zee": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/zee-entertainment/marketcap/"
   }
  ]
 },
 "ziff-davis": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/ziff-davis/marketcap/"
   }
  ]
 },
 "zoom": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "years": [
   {
    "from": 2019,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/zoom/marketcap/"
   }
  ]
 },
 "a24": {
  "frequency": "Monthly",
  "current": {
   "label": "Yahoo Finance",
   "url": "https://finance.yahoo.com/news/a24-valuation-jumps-3-5-110050443.html"
  },
  "years": [
   {
    "from": 2023,
    "to": 2025,
    "label": "Yahoo Finance",
    "url": "https://finance.yahoo.com/news/a24-valuation-jumps-3-5-110050443.html"
   },
   {
    "from": 2021,
    "to": 2022,
    "label": "Variety",
    "url": null
   }
  ]
 },
 "abc-australia": {
  "frequency": "Monthly",
  "current": {
   "label": "ABC annual report",
   "url": "https://www.abc.net.au/about/plans-reports-and-submissions/annual-reports/abc-annual-report-2024-25/105943122"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "ABC annual report",
    "url": "https://www.abc.net.au/about/plans-reports-and-submissions/annual-reports/abc-annual-report-2024-25/105943122"
   }
  ]
 },
 "access": {
  "frequency": "Monthly",
  "current": {
   "label": "GuruFocus",
   "url": "https://www.gurufocus.com/insider/17542/access-industries-holdings-llc"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "GuruFocus",
    "url": "https://www.gurufocus.com/insider/17542/access-industries-holdings-llc"
   }
  ]
 },
 "AEG": {
  "frequency": "Monthly",
  "current": {
   "label": "CNBC",
   "url": "https://www.cnbc.com/2025/07/08/cnbcs-most-valuable-sports-empires-2025-how-the-worlds-top-20-empires-rank.html"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "CNBC",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Forbes",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Pollstar",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "Forbes",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "Los Angeles Times",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "Bloomberg",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Forbes",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "Reuters",
    "url": null
   },
   {
    "from": 2017,
    "to": 2017,
    "label": "The Wall Street Journal",
    "url": null
   },
   {
    "from": 2016,
    "to": 2016,
    "label": "Forbes",
    "url": null
   },
   {
    "from": 2015,
    "to": 2015,
    "label": "The Wall Street Journal",
    "url": null
   }
  ]
 },
 "antrhopic": {
  "frequency": "Monthly",
  "current": {
   "label": "Reuters",
   "url": "https://www.reuters.com/business/anthropic-raises-65-billion-now-valued-965-billion-2026-05-28/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "Bloomberg",
    "url": null
   },
   {
    "from": 2023,
    "to": 2024,
    "label": "Reuters",
    "url": null
   },
   {
    "from": 2021,
    "to": 2022,
    "label": "Bloomberg",
    "url": null
   }
  ]
 },
 "ard": {
  "frequency": "Monthly",
  "current": {
   "label": "Public Media Alliance",
   "url": "https://www.publicmediaalliance.org/whats-the-worlds-biggest-public-broadcaster-the-pma-briefing/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Public Media Alliance",
    "url": "https://www.publicmediaalliance.org/whats-the-worlds-biggest-public-broadcaster-the-pma-briefing/"
   }
  ]
 },
 "art-mis": {
  "frequency": "Monthly",
  "current": {
   "label": "Deadline",
   "url": "https://deadline.com/2023/10/caa-tpg-majority-stake-iacquired-francois-henri-pinault-artemis-bryan-lourd-ceo-1235539266/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "Groupe Artémis (official)",
    "url": null
   },
   {
    "from": 2015,
    "to": 2024,
    "label": "Forbes",
    "url": null
   }
  ]
 },
 "audacy": {
  "frequency": "Monthly",
  "current": {
   "label": "companiesmarketcap.com",
   "url": "https://companiesmarketcap.com/audacy/marketcap/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2024,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/audacy/marketcap/"
   }
  ]
 },
 "bbc": {
  "frequency": "Monthly",
  "current": {
   "label": "BBC annual report",
   "url": "https://www.bbc.co.uk/aboutthebbc/annualreport2025-2026/our-finances"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "BBC annual report",
    "url": "https://www.bbc.co.uk/aboutthebbc/annualreport2025-2026/our-finances"
   }
  ]
 },
 "bertelsmann": {
  "frequency": "Monthly",
  "current": {
   "label": "companiesmarketcap.com",
   "url": "https://companiesmarketcap.com/bertelsmann-se-co-kgaa/marketcap/"
  },
  "years": [
   {
    "from": 2024,
    "to": 2025,
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/bertelsmann-se-co-kgaa/marketcap/"
   }
  ]
 },
 "bloomberg": {
  "frequency": "Monthly",
  "current": null,
  "years": []
 },
 "bytedance": {
  "frequency": "Monthly",
  "current": {
   "label": "Reuters",
   "url": "https://www.reuters.com/world/china/bytedance-valued-550-billion-proposed-share-sale-by-general-atlantic-sources-say-2026-02-25/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "Reuters",
    "url": "https://www.reuters.com/world/china/bytedance-valued-550-billion-proposed-share-sale-by-general-atlantic-sources-say-2026-02-25/"
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "The Business Standard",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "TechNode",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "Straits Times",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "Reuters",
    "url": "https://www.reuters.com/world/china/bytedance-valued-550-billion-proposed-share-sale-by-general-atlantic-sources-say-2026-02-25/"
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "The National",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Tech in Asia",
    "url": null
   },
   {
    "from": 2017,
    "to": 2018,
    "label": "Reuters",
    "url": "https://www.reuters.com/world/china/bytedance-valued-550-billion-proposed-share-sale-by-general-atlantic-sources-say-2026-02-25/"
   },
   {
    "from": 2016,
    "to": 2016,
    "label": "China Daily Financing Report",
    "url": null
   },
   {
    "from": 2015,
    "to": 2015,
    "label": "36Kr Global Venture History",
    "url": null
   }
  ]
 },
 "cbc": {
  "frequency": "Monthly",
  "current": {
   "label": "CBC annual reports",
   "url": "https://cbc.radio-canada.ca/en/impact-and-accountability/finance/annual-reports"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "CBC annual reports",
    "url": "https://cbc.radio-canada.ca/en/impact-and-accountability/finance/annual-reports"
   }
  ]
 },
 "channel-4": {
  "frequency": "Monthly",
  "current": {
   "label": "Channel 4 reports",
   "url": "https://www.channel4.com/corporate/performance/reporting/reporting-library"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Channel 4 reports",
    "url": "https://www.channel4.com/corporate/performance/reporting/reporting-library"
   }
  ]
 },
 "concord": {
  "frequency": "Monthly",
  "current": {
   "label": "Hits Daily Double",
   "url": "https://www.hitsdailydouble.com/news/business/bmg-concord-merger-2026-04-28?year=2026"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Hits Daily Double",
    "url": "https://www.hitsdailydouble.com/news/business/bmg-concord-merger-2026-04-28?year=2026"
   }
  ]
 },
 "cox": {
  "frequency": "Monthly",
  "current": {
   "label": "Forbes",
   "url": "https://www.forbes.com/companies/cox-enterprises/?sh=503fa2075ef4"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Forbes",
    "url": "https://www.forbes.com/companies/cox-enterprises/?sh=503fa2075ef4"
   }
  ]
 },
 "daily-mail": {
  "frequency": "Monthly",
  "current": {
   "label": "DMGT annual reports",
   "url": "https://www.dmgt.com/investors/annual-reports/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "DMGT annual reports",
    "url": "https://www.dmgt.com/investors/annual-reports/"
   }
  ]
 },
 "discord": {
  "frequency": "Monthly",
  "current": {
   "label": "Yahoo Finance",
   "url": "https://finance.yahoo.com/quote/DISO.PVT/"
  },
  "years": [
   {
    "from": 2024,
    "to": 2025,
    "label": "Resourcera",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Sacra",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "Forge Global",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "Untaylored Ownership Profile",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "Public.com Funding Archives",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Resourcera",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "Untaylored Profile",
    "url": null
   },
   {
    "from": 2017,
    "to": 2017,
    "label": "Forge Global",
    "url": null
   },
   {
    "from": 2016,
    "to": 2016,
    "label": "Untaylored Ownership Profile",
    "url": null
   },
   {
    "from": 2015,
    "to": 2015,
    "label": "Untaylored Profile",
    "url": null
   }
  ]
 },
 "epic": {
  "frequency": "Monthly",
  "current": {
   "label": "RevenueMemo",
   "url": "https://www.revenuememo.com/p/who-owns-epic-games"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "RevenueMemo",
    "url": "https://www.revenuememo.com/p/who-owns-epic-games"
   }
  ]
 },
 "FIFA": {
  "frequency": "Monthly",
  "current": {
   "label": "FIFA financial statements",
   "url": "https://inside.fifa.com/official-documents/annual-report/2025/financials/2025-financial-statements/consolidated-balance-sheet"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "FIFA financial statements",
    "url": "https://inside.fifa.com/official-documents/annual-report/2025/financials/2025-financial-statements/consolidated-balance-sheet"
   }
  ]
 },
 "france-tv": {
  "frequency": "Monthly",
  "current": {
   "label": "France Télévisions annual report",
   "url": "https://issuu.com/francetelevisions/docs/rapport_annuel_2024_volet_financier"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "France Télévisions annual report",
    "url": "https://issuu.com/francetelevisions/docs/rapport_annuel_2024_volet_financier"
   }
  ]
 },
 "hallmark": {
  "frequency": "Monthly",
  "current": {
   "label": "Forbes",
   "url": "https://www.forbes.com/companies/hallmark/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Forbes",
    "url": "https://www.forbes.com/companies/hallmark/"
   }
  ]
 },
 "hearst": {
  "frequency": "Monthly",
  "current": {
   "label": "Forbes",
   "url": "https://www.forbes.com/profile/hearst/?sh=30d8f915533d"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Forbes",
    "url": "https://www.forbes.com/profile/hearst/?sh=30d8f915533d"
   }
  ]
 },
 "holtzbrinck": {
  "frequency": "Monthly",
  "current": {
   "label": "Wikipedia",
   "url": "https://en.wikipedia.org/wiki/Holtzbrinck_Publishing_Group"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "M&A Insights",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Sullivan & Cromwell",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Finanzwire",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "InfluenceWatch Profile",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "M&A Insights",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "InfluenceWatch",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "SPARC Industry Analysis",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "SPARC Analysis",
    "url": null
   },
   {
    "from": 2017,
    "to": 2017,
    "label": "Startup Intros",
    "url": null
   },
   {
    "from": 2016,
    "to": 2016,
    "label": "Springer Nature Corporate History",
    "url": null
   },
   {
    "from": 2015,
    "to": 2015,
    "label": "Springer Nature Joint Press Announcement",
    "url": null
   }
  ]
 },
 "indian-premiere-league": {
  "frequency": "Monthly",
  "current": {
   "label": "Variety",
   "url": "https://variety.com/2026/sports/news/ipl-valuation-rcb-rajasthan-royals-sales-1236822733/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Variety",
    "url": "https://variety.com/2026/sports/news/ipl-valuation-rcb-rajasthan-royals-sales-1236822733/"
   }
  ]
 },
 "ispot": {
  "frequency": "Monthly",
  "current": {
   "label": "GeekWire",
   "url": "https://www.geekwire.com/2022/goldman-sachs-will-invest-325m-in-ispot-helping-to-break-nielsens-lock-on-tv-ad-measurement/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "GetLatka",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Tracxn",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Broadcasting & Cable",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "TechCrunch",
    "url": null
   }
  ]
 },
 "kajabi": {
  "frequency": "Monthly",
  "current": {
   "label": "Reuters",
   "url": "https://www.reuters.com/technology/exclusive-kajabi-e-commerce-startup-knowledge-businesses-raises-550-million-2021-05-04/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Reuters",
    "url": "https://www.reuters.com/technology/exclusive-kajabi-e-commerce-startup-knowledge-businesses-raises-550-million-2021-05-04/"
   }
  ]
 },
 "kantar-media": {
  "frequency": "Monthly",
  "current": {
   "label": "eMarketer",
   "url": "https://www.emarketer.com/content/kantar-media-gets-bought-1-billion-ad-measurement"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "Marketing Dive",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Financial Times",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "S&P Global",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "PitchBook",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "Cerner Investor Relations",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "S&P Global",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Bain Capital Press Release",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "WPP Financial Disclosures",
    "url": null
   }
  ]
 },
 "kobalt": {
  "frequency": "Monthly",
  "current": {
   "label": "Variety",
   "url": "https://variety.com/2026/music/news/primary-wave-to-acquire-kobalt-7-billion-company-1236696584/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "M&A Insights",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Variety",
    "url": "https://variety.com/2026/music/news/primary-wave-to-acquire-kobalt-7-billion-company-1236696584/"
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Music Business Research",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "Variety",
    "url": "https://variety.com/2026/music/news/primary-wave-to-acquire-kobalt-7-billion-company-1236696584/"
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "The Wall Street Journal",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "Music Business Worldwide",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Music Business Research",
    "url": null
   },
   {
    "from": 2017,
    "to": 2018,
    "label": "Variety",
    "url": "https://variety.com/2026/music/news/primary-wave-to-acquire-kobalt-7-billion-company-1236696584/"
   },
   {
    "from": 2016,
    "to": 2016,
    "label": "Music Business Research",
    "url": null
   },
   {
    "from": 2015,
    "to": 2015,
    "label": "Variety",
    "url": "https://variety.com/2026/music/news/primary-wave-to-acquire-kobalt-7-billion-company-1236696584/"
   }
  ]
 },
 "Mediawan": {
  "frequency": "Monthly",
  "current": {
   "label": "U.S. News",
   "url": "https://money.usnews.com/investing/news/articles/2023-11-28/exclusive-frances-mediawan-weighs-takeover-of-kkr-backed-leonine-sources"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "S&P Global",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Private Equity Insights",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "S&P Global",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "The Hollywood Reporter",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "Business Wire",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "AMF France Regulatory Filings",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Euronext Paris Disclosures",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "Variety",
    "url": null
   },
   {
    "from": 2017,
    "to": 2017,
    "label": "Reuters",
    "url": null
   },
   {
    "from": 2016,
    "to": 2016,
    "label": "Financial Times",
    "url": null
   }
  ]
 },
 "midj": {
  "frequency": "Monthly",
  "current": {
   "label": "GetLatka",
   "url": "https://getlatka.com/companies/midjourney"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "GetLatka",
    "url": "https://getlatka.com/companies/midjourney"
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Morphed",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Sacra",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "Morphed",
    "url": null
   }
  ]
 },
 "mlb": {
  "frequency": "Monthly",
  "current": {
   "label": "Sportico",
   "url": "https://www.sportico.com/valuations/teams/2026/mlb-team-values-2026-yankees-dodgers-1234887564/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Sportico",
    "url": "https://www.sportico.com/valuations/teams/2026/mlb-team-values-2026-yankees-dodgers-1234887564/"
   }
  ]
 },
 "mls": {
  "frequency": "Monthly",
  "current": {
   "label": "Sportico",
   "url": "https://www.sportico.com/feature/mls-soccer-team-value-ranking-1234689586/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Sportico",
    "url": "https://www.sportico.com/feature/mls-soccer-team-value-ranking-1234689586/"
   }
  ]
 },
 "nba": {
  "frequency": "Monthly",
  "current": {
   "label": "Sportico",
   "url": "https://www.sportico.com/feature/nba-team-values-ranking-list-1234697991/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Sportico",
    "url": "https://www.sportico.com/feature/nba-team-values-ranking-list-1234697991/"
   }
  ]
 },
 "neon": {
  "frequency": "Monthly",
  "current": {
   "label": "Variety",
   "url": "https://variety.com/2026/film/news/neon-anora-longlegs-sells-stake-department-m-1236806707/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "TheWrap",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "The Hollywood Reporter",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Screen Daily",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "Variety",
    "url": null
   },
   {
    "from": 2020,
    "to": 2021,
    "label": "Variety",
    "url": "https://variety.com/2026/film/news/neon-anora-longlegs-sells-stake-department-m-1236806707/"
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Variety",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "Deadline",
    "url": null
   },
   {
    "from": 2017,
    "to": 2017,
    "label": "TheWrap",
    "url": null
   }
  ]
 },
 "nfl": {
  "frequency": "Monthly",
  "current": {
   "label": "CNBC",
   "url": "https://www.cnbc.com/2025/09/04/cnbcs-official-nfl-team-valuations-2025.html"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "CNBC",
    "url": "https://www.cnbc.com/2025/09/04/cnbcs-official-nfl-team-valuations-2025.html"
   }
  ]
 },
 "nhk": {
  "frequency": "Monthly",
  "current": {
   "label": "ITmedia",
   "url": "https://www.itmedia.co.jp/news/article/2606/24/1260624129/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "Nikkei",
    "url": null
   },
   {
    "from": 2023,
    "to": 2024,
    "label": "State Media Monitor",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "Minpo Online",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "Media Innovation",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "ZAITEN Magazine",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Livedoor News",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "Kigyolog Financial Reports",
    "url": null
   },
   {
    "from": 2017,
    "to": 2017,
    "label": "Livedoor News",
    "url": null
   },
   {
    "from": 2015,
    "to": 2016,
    "label": "House of Representatives Japan",
    "url": null
   }
  ]
 },
 "nhl": {
  "frequency": "Monthly",
  "current": {
   "label": "Sportico",
   "url": "https://www.sportico.com/feature/nhl-team-values-ranking-list-1234693065/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Sportico",
    "url": "https://www.sportico.com/feature/nhl-team-values-ranking-list-1234693065/"
   }
  ]
 },
 "nielsen": {
  "frequency": "Monthly",
  "current": {
   "label": "Variety",
   "url": "https://variety.com/2022/tv/news/nielsen-sold-private-equity-measurement-media-1235217649/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "Brookfield (filings)",
    "url": null
   },
   {
    "from": 2022,
    "to": 2024,
    "label": "PR Newswire",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "SEC EDGAR Form 10-K Filing",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "SEC EDGAR Form 10-K (2020 Report",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "SEC EDGAR Form 10-K (2018",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "SEC EDGAR Form 10-K (2018 Filing",
    "url": null
   },
   {
    "from": 2017,
    "to": 2017,
    "label": "Nielsen Holdings Proxy & Annual Filings",
    "url": null
   },
   {
    "from": 2016,
    "to": 2016,
    "label": "Nielsen Holdings Annual Report",
    "url": null
   },
   {
    "from": 2015,
    "to": 2015,
    "label": "SEC EDGAR Nielsen Holdings Archives",
    "url": null
   }
  ]
 },
 "npr": {
  "frequency": "Monthly",
  "current": {
   "label": "NPR annual report",
   "url": "https://www.npr.org/2024/10/18/g-s1-27265/annual-report"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "NPR annual report",
    "url": "https://www.npr.org/2024/10/18/g-s1-27265/annual-report"
   }
  ]
 },
 "onlyfans": {
  "frequency": "Monthly",
  "current": {
   "label": "Variety",
   "url": "https://variety.com/2026/digital/news/onlyfans-valuation-3-15-billion-sale-stake-architect-capital-1236741700/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "European Business Magazine",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Fenix International (filings)",
    "url": null
   },
   {
    "from": 2022,
    "to": 2023,
    "label": "Forge Global",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "B9 Agency",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "Forge Global",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Fenix International (filings)",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "BBC",
    "url": null
   }
  ]
 },
 "open-ai": {
  "frequency": "Monthly",
  "current": {
   "label": "CNBC",
   "url": "https://www.cnbc.com/2026/03/31/openai-funding-round-ipo.html"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "PitchBook",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Reuters",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Bloomberg",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "Fortune",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "TechCrunch",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "MIT Technology Review",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Microsoft Official Announcement",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "Wired Financial Report",
    "url": null
   },
   {
    "from": 2017,
    "to": 2017,
    "label": "OpenAI Research Archives",
    "url": null
   },
   {
    "from": 2016,
    "to": 2016,
    "label": "Y Combinator Blog Archives",
    "url": null
   },
   {
    "from": 2015,
    "to": 2015,
    "label": "OpenAI Founding Announcement",
    "url": null
   }
  ]
 },
 "patreon": {
  "frequency": "Monthly",
  "current": {
   "label": "Fueler",
   "url": "https://fueler.io/blog/patreon-usage-revenue-valuation-growth-statistics"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "Sacra",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Caplight",
    "url": null
   },
   {
    "from": 2022,
    "to": 2023,
    "label": "Sacra",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "TechCrunch",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "Built In",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Tracxn",
    "url": null
   },
   {
    "from": 2017,
    "to": 2018,
    "label": "Tubefilter",
    "url": null
   },
   {
    "from": 2016,
    "to": 2016,
    "label": "Wikipedia",
    "url": null
   },
   {
    "from": 2015,
    "to": 2015,
    "label": "Tracxn",
    "url": null
   }
  ]
 },
 "pbs": {
  "frequency": "Monthly",
  "current": {
   "label": "PBS financials",
   "url": "https://www.pbs.org/about/about-pbs/financials/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "PBS financials",
    "url": "https://www.pbs.org/about/about-pbs/financials/"
   }
  ]
 },
 "penske": {
  "frequency": "Monthly",
  "current": null,
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "Forbes",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Variety",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "The Rebooting",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "Artforum Announcement",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "Variety",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "Media Play News",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "TechCrunch",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "WWD Corporate Disclosures",
    "url": null
   },
   {
    "from": 2017,
    "to": 2017,
    "label": "The Wall Street Journal",
    "url": null
   },
   {
    "from": 2016,
    "to": 2016,
    "label": "Variety",
    "url": null
   },
   {
    "from": 2015,
    "to": 2015,
    "label": "The New York Times",
    "url": null
   }
  ]
 },
 "premiere-league": {
  "frequency": "Monthly",
  "current": {
   "label": "Transfermarkt",
   "url": "https://www.transfermarkt.com/premier-league/startseite/wettbewerb/GB1"
  },
  "years": [
   {
    "from": 2024,
    "to": 2025,
    "label": "Deloitte",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "BBC Sport",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "The Guardian",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "Financial Times",
    "url": null
   },
   {
    "from": 2019,
    "to": 2020,
    "label": "Deloitte",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "Forbes",
    "url": null
   },
   {
    "from": 2017,
    "to": 2017,
    "label": "Deloitte",
    "url": null
   },
   {
    "from": 2016,
    "to": 2016,
    "label": "BBC",
    "url": null
   },
   {
    "from": 2015,
    "to": 2015,
    "label": "Deloitte",
    "url": null
   }
  ]
 },
 "rai": {
  "frequency": "Monthly",
  "current": {
   "label": "RAI Way investor reports",
   "url": "https://www.raiway.it/en/investors/reports-and-results"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "RAI Way investor reports",
    "url": "https://www.raiway.it/en/investors/reports-and-results"
   }
  ]
 },
 "red-bird": {
  "frequency": "Monthly",
  "current": {
   "label": "RedBird (official)",
   "url": "https://redbirdcap.com/about/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "RedBird (official)",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "GlobeNewswire",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Deadline",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "AC Milan (official)",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "The Guardian",
    "url": null
   },
   {
    "from": 2019,
    "to": 2020,
    "label": "Deadline",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "Bloomberg",
    "url": null
   },
   {
    "from": 2015,
    "to": 2017,
    "label": "RedBird (official)",
    "url": null
   }
  ]
 },
 "reelshort": {
  "frequency": "Monthly",
  "current": {
   "label": "Variety",
   "url": "https://variety.com/2026/tv/news/reelshort-1-billion-revenue-profit-2026-mpa-1236828885/"
  },
  "years": [
   {
    "from": 2017,
    "to": 2025,
    "label": "Variety",
    "url": "https://variety.com/2026/tv/news/reelshort-1-billion-revenue-profit-2026-mpa-1236828885/"
   }
  ]
 },
 "riot": {
  "frequency": "Monthly",
  "current": {
   "label": "Dealroom",
   "url": "https://app.dealroom.co/companies/riot_games"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "Tencent (filings)",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Companies Registration Office (Ireland)",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "HeadphonesAddict",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "Sensor Tower",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "Forbes",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "SuperData Research",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "SuperData Industry Report",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "SuperData Year-In-Review 2018",
    "url": null
   },
   {
    "from": 2017,
    "to": 2017,
    "label": "SuperData Research 2017",
    "url": null
   },
   {
    "from": 2016,
    "to": 2016,
    "label": "SuperData Games Report 2016",
    "url": null
   },
   {
    "from": 2015,
    "to": 2015,
    "label": "SEC",
    "url": null
   }
  ]
 },
 "rtve": {
  "frequency": "Monthly",
  "current": {
   "label": "RTVE transparency",
   "url": "https://www.rtve.es/rtve/20231016/transparencia-cuentas/943360.shtml"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "RTVE transparency",
    "url": "https://www.rtve.es/rtve/20231016/transparencia-cuentas/943360.shtml"
   }
  ]
 },
 "runway": {
  "frequency": "Monthly",
  "current": {
   "label": "TechCrunch",
   "url": "https://techcrunch.com/2026/02/10/ai-video-startup-runway-raises-315m-at-5-3b-valuation-eyes-more-capable-world-models/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "The Verge",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Sacra",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Bloomberg",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "Forbes",
    "url": null
   },
   {
    "from": 2020,
    "to": 2021,
    "label": "VentureBeat",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Dealroom Profile",
    "url": null
   }
  ]
 },
 "spotter": {
  "frequency": "Monthly",
  "current": {
   "label": "TechCrunch",
   "url": "https://techcrunch.com/2024/09/10/creator-startup-spotter-raises-another-7-4m/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "TechCrunch",
    "url": "https://techcrunch.com/2024/09/10/creator-startup-spotter-raises-another-7-4m/"
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Variety",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Forge Global",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "TechCrunch",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "Business Insider",
    "url": null
   },
   {
    "from": 2019,
    "to": 2020,
    "label": "Tracxn",
    "url": null
   }
  ]
 },
 "substack": {
  "frequency": "Monthly",
  "current": {
   "label": "TechCrunch",
   "url": "https://techcrunch.com/2025/07/17/substack-raises-100m-from-chernin-group-andreessen-horowitz-skims-ceo-and-more/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "Tracxn",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "Sacra",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Wefunder",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "The New York Times",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "TechCrunch",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "Business Insider",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "TechCrunch",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "Y Combinator Company Index",
    "url": null
   }
  ]
 },
 "synthesia": {
  "frequency": "Monthly",
  "current": {
   "label": "CNBC",
   "url": "https://www.cnbc.com/2026/01/26/nvidia-alphabet-vc-arms-back-synthesia.html"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "CNBC",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "VentureBeat",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "Yahoo Finance",
    "url": null
   },
   {
    "from": 2021,
    "to": 2022,
    "label": "TechCrunch",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "Vox Media Analysis",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "TechCrunch",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "Dealroom Profile",
    "url": null
   }
  ]
 },
 "twitter": {
  "frequency": "Monthly",
  "current": {
   "label": "TechCrunch",
   "url": "https://techcrunch.com/2024/09/29/fidelity-has-cut-xs-value-by-79-since-musk-purchase/"
  },
  "years": [
   {
    "from": 2015,
    "to": 2022,
    "label": "TechCrunch",
    "url": "https://techcrunch.com/2024/09/29/fidelity-has-cut-xs-value-by-79-since-musk-purchase/"
   }
  ]
 },
 "valve": {
  "frequency": "Monthly",
  "current": {
   "label": "RevenueMemo",
   "url": "https://www.revenuememo.com/p/who-owns-valve"
  },
  "years": [
   {
    "from": 2017,
    "to": 2025,
    "label": "RevenueMemo",
    "url": "https://www.revenuememo.com/p/who-owns-valve"
   }
  ]
 },
 "videoamp": {
  "frequency": "Monthly",
  "current": {
   "label": "Forbes",
   "url": "https://www.forbes.com/sites/mattcraig/2025/10/30/why-videoamp-thinks-it-can-bust-nielsens-tv-ratings-monopoly/"
  },
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "Growjo",
    "url": null
   },
   {
    "from": 2024,
    "to": 2024,
    "label": "GetLatka",
    "url": null
   },
   {
    "from": 2023,
    "to": 2023,
    "label": "FinSMEs",
    "url": null
   },
   {
    "from": 2022,
    "to": 2022,
    "label": "CNBC",
    "url": null
   },
   {
    "from": 2021,
    "to": 2021,
    "label": "TechCrunch",
    "url": null
   },
   {
    "from": 2015,
    "to": 2020,
    "label": "Forge Global",
    "url": null
   }
  ]
 },
 "vox": {
  "frequency": "Monthly",
  "current": {
   "label": "Axios",
   "url": "https://www.axios.com/2026/05/20/vox-media-lupa-systems-james-murdoch"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "Axios",
    "url": "https://www.axios.com/2026/05/20/vox-media-lupa-systems-james-murdoch"
   }
  ]
 },
 "weigel": {
  "frequency": "Monthly",
  "current": null,
  "years": []
 },
 "whalar": {
  "frequency": "Monthly",
  "current": null,
  "years": [
   {
    "from": 2025,
    "to": 2025,
    "label": "The Daily Upside",
    "url": null
   },
   {
    "from": 2023,
    "to": 2024,
    "label": "RockWater",
    "url": null
   },
   {
    "from": 2021,
    "to": 2022,
    "label": "UK Companies House",
    "url": null
   },
   {
    "from": 2020,
    "to": 2020,
    "label": "Tubefilter",
    "url": null
   },
   {
    "from": 2019,
    "to": 2019,
    "label": "Growjo",
    "url": null
   },
   {
    "from": 2018,
    "to": 2018,
    "label": "Inven Financial Profiles",
    "url": null
   },
   {
    "from": 2016,
    "to": 2017,
    "label": "Dealroom Profile",
    "url": null
   }
  ]
 },
 "zdf": {
  "frequency": "Monthly",
  "current": {
   "label": "ZDF finances",
   "url": "https://www.zdf.de/unternehmen/organisation/finanzen-110.html"
  },
  "years": [
   {
    "from": 2015,
    "to": 2025,
    "label": "ZDF finances",
    "url": "https://www.zdf.de/unternehmen/organisation/finanzen-110.html"
   }
  ]
 },
 "Vend": {
  "frequency": "Monthly",
  "current": null,
  "years": []
 },
 "mount-bros-sept-26": {
  "frequency": "Monthly",
  "current": null,
  "years": []
 }
};

/** Sheet name → slug, for the no-Sanity fallback company list (which carries no slugs). */
export const SLUG_BY_NAME: Record<string, string> = {
 "Accenture": "accenture",
 "Alibaba": "alibaba",
 "Alphabet": "alphabet",
 "Amazon": "amazon",
 "AMC Entertainment": "amc",
 "AMC Networks": "amcn",
 "Angel Studios Inc": "angel",
 "Apollo": "apollo",
 "Apple": "apple",
 "Asmodee": "asmodee",
 "AT&T": "at-t",
 "Bandai Namco": "bandai",
 "Banijay": "banijay-convert-to-usd",
 "Bell Canada": "bell-canada",
 "Bending Spoons": "Bending Spoons",
 "Canal+": "canal-convert-to-usd",
 "Charter": "charter",
 "Cinemark": "cinemark",
 "Cineplex": "cineplex",
 "Comcast": "comcast",
 "Comscore": "comscore",
 "Dentsu": "dentsu",
 "Deutsche Telekom": "Deutsche Telekom",
 "Disney": "disney",
 "DJT": "djt",
 "EA": "ea",
 "Echostar/Dish": "echostar-dish",
 "EWS/ION": "ews-ion",
 "F1": "f1",
 "Fox": "fox",
 "Fubo": "fubo",
 "Fuji TV": "fuji-tv",
 "Gamestop": "gamestop",
 "Gray Media": "gray-tv",
 "Group M6": "group-m6",
 "Grupo Televisa": "grupo-televisa",
 "Hasbro": "hasbro",
 "Hisense": "hisense",
 "HYBE": "hybe",
 "IAC": "iac",
 "iHeart": "iheart",
 "IPG": "ipg",
 "IPSOS": "ipsos",
 "ITV": "itv",
 "Lagardere": "lagardere",
 "LG": "lg",
 "Liberty Global": "liberty-global",
 "Lionsgate": "lionsgate",
 "Live Nation": "live-nation",
 "META": "meta",
 "MFE": "mfe",
 "Microsoft": "microsoft",
 "MSGE": "msge",
 "Multichoice Group": "multichoice-group",
 "NCMI": "ncmi",
 "Netflix": "netflix",
 "NewsCorp": "newscorp",
 "NewsMax": "newsmax",
 "Nexstar": "nexstar",
 "NINE": "nine",
 "Nintendo": "nintendo",
 "Nippon TV": "nippon-tv",
 "Nvidia": "nvidia",
 "NYT": "nyt",
 "Omnicom": "omnicom",
 "Optimum": "altice-us-now-optimum",
 "Oracle": "oracle",
 "Paramount Global": "paramount-skydance",
 "Pinterest": "pinterest",
 "ProSieben": "prosieben",
 "Publicis": "publicis",
 "Quebecor": "quebecor",
 "Reddit": "reddit",
 "Reliance": "reliance",
 "Roblox": "roblox",
 "Rogers": "rogers",
 "Roku": "roku",
 "Samsung": "samsung",
 "Schibsted": "schibsted",
 "Sega Sammy": "sega-sammy",
 "Sinclair": "sinclair",
 "Sirius": "sirius",
 "Snap": "snap",
 "Sony": "sony",
 "Space X": "space-x",
 "Sphere": "sphere",
 "Spotify": "spotify",
 "Square Enix": "square-enix",
 "Stagwell": "stagwell",
 "STARZ": "starz",
 "Sun TV": "sun-tv",
 "T-mobile": "t-mobile",
 "Take Two": "take-two",
 "TCL": "tcl",
 "TEGNA": "tegna",
 "Telus": "telus",
 "Tencent": "tencent",
 "TF1": "tf1",
 "The Trade Desk": "the-trade-desk",
 "Thomson Reuters": "thomson-reuters",
 "TKO (UFC+WWE)": "tko-ufc-wwe",
 "TPG": "tpg",
 "Ubisoft": "ubisoft",
 "UMG": "umg",
 "Unity": "unity",
 "USA Today": "USA Today",
 "Verizon": "verizon",
 "Versant": "versant",
 "Viaplay": "viaplay",
 "Vivendi": "vivendi",
 "Walmart": "walmart",
 "WBD": "wbd",
 "WMG": "wmg",
 "WPP": "wpp",
 "Xiaomi": "XIACF",
 "Zee": "zee",
 "Ziff Davis": "ziff-davis",
 "Zoom": "zoom",
 "A24": "a24",
 "ABC AUSTRALIA": "abc-australia",
 "Access": "access",
 "AEG": "AEG",
 "Anthropic": "antrhopic",
 "ARD": "ard",
 "Artémis": "art-mis",
 "Audacy": "audacy",
 "BBC": "bbc",
 "Bertelsmann": "bertelsmann",
 "Bloomberg": "bloomberg",
 "ByteDance": "bytedance",
 "CBC": "cbc",
 "Channel 4": "channel-4",
 "Concord": "concord",
 "COX": "cox",
 "Daily Mail": "daily-mail",
 "Discord": "discord",
 "Epic": "epic",
 "FIFA": "FIFA",
 "FRANCE TV": "france-tv",
 "Hallmark": "hallmark",
 "Hearst": "hearst",
 "Holtzbrinck": "holtzbrinck",
 "Indian Premiere League": "indian-premiere-league",
 "ispot": "ispot",
 "Kajabi": "kajabi",
 "Kantar Media": "kantar-media",
 "Kobalt, now Primary Wave": "kobalt",
 "Mediawan": "Mediawan",
 "Midjourney": "midj",
 "MLB": "mlb",
 "MLS": "mls",
 "NBA": "nba",
 "NEON": "neon",
 "NFL": "nfl",
 "NHK": "nhk",
 "NHL": "nhl",
 "Nielsen": "nielsen",
 "NPR": "npr",
 "OnlyFans": "onlyfans",
 "Open AI": "open-ai",
 "Patreon": "patreon",
 "PBS": "pbs",
 "Penske Media Corporation": "penske",
 "Premiere League": "premiere-league",
 "RAI": "rai",
 "Red Bird": "red-bird",
 "ReelShort": "reelshort",
 "Riot": "riot",
 "RTVE": "rtve",
 "Runway": "runway",
 "Spotter": "spotter",
 "Substack": "substack",
 "Synthesia": "synthesia",
 "Twitter": "twitter",
 "Valve": "valve",
 "VideoAmp": "videoamp",
 "VOX": "vox",
 "Weigel": "weigel",
 "Whalar Group": "whalar",
 "ZDF": "zdf",
 "Vend Marketplaces": "Vend",
 "Skydance": "mount-bros-sept-26"
};
