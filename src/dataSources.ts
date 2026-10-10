// Generated from the market-cap sheet's columns E, K and L (cleaned 2026-10-10) for the
// data-sources panel prototype. Keyed by company slug. To be replaced by a Sources
// column read from the valuations snapshot once the sheet carries one.

export type SourceRef = { label: string; url: string | null };
export type CompanySources = { frequency: "Live" | "Monthly"; current: SourceRef | null; historical: SourceRef[] };

export const COMPANY_SOURCES: Record<string, CompanySources> = {
 "accenture": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "Yahoo Finance",
    "url": "https://finance.yahoo.com/quote/ANGX/"
   }
  ]
 },
 "apollo": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/bending-spoons/marketcap/"
   }
  ]
 },
 "canal-convert-to-usd": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": []
 },
 "liberty-global": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/spacex/marketcap/"
   }
  ]
 },
 "sphere": {
  "frequency": "Live",
  "current": {
   "label": "Google Finance",
   "url": null
  },
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "Yahoo Finance",
    "url": "https://finance.yahoo.com/news/a24-valuation-jumps-3-5-110050443.html"
   },
   {
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
  "historical": [
   {
    "label": "ABC annual report",
    "url": "https://www.abc.net.au/about/plans-reports-and-submissions/annual-reports/abc-annual-report-2024-25/105943122"
   },
   {
    "label": "financial statements",
    "url": null
   }
  ]
 },
 "access": {
  "frequency": "Monthly",
  "current": {
   "label": "GuruFocus",
   "url": "https://www.gurufocus.com/insider/17542/access-industries-holdings-llc"
  },
  "historical": [
   {
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
  "historical": [
   {
    "label": "CNBC",
    "url": "https://www.cnbc.com/2025/07/08/cnbcs-most-valuable-sports-empires-2025-how-the-worlds-top-20-empires-rank.html"
   },
   {
    "label": "Forbes",
    "url": null
   },
   {
    "label": "Pollstar",
    "url": null
   },
   {
    "label": "Los Angeles Times",
    "url": null
   },
   {
    "label": "Bloomberg",
    "url": null
   },
   {
    "label": "Reuters",
    "url": null
   },
   {
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
  "historical": [
   {
    "label": "Reuters",
    "url": "https://www.reuters.com/business/anthropic-raises-65-billion-now-valued-965-billion-2026-05-28/"
   },
   {
    "label": "Bloomberg",
    "url": null
   },
   {
    "label": "CNBC",
    "url": null
   },
   {
    "label": "The Wall Street Journal",
    "url": null
   },
   {
    "label": "Financial Times",
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "Deadline",
    "url": "https://deadline.com/2023/10/caa-tpg-majority-stake-iacquired-francois-henri-pinault-artemis-bryan-lourd-ceo-1235539266/"
   },
   {
    "label": "Forbes",
    "url": null
   },
   {
    "label": "Bloomberg",
    "url": null
   },
   {
    "label": "Groupe Artémis (official)",
    "url": null
   },
   {
    "label": "Financial Times",
    "url": null
   },
   {
    "label": "Variety",
    "url": null
   },
   {
    "label": "The Wall Street Journal",
    "url": null
   },
   {
    "label": "CNBC",
    "url": null
   },
   {
    "label": "Reuters",
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "companiesmarketcap.com",
    "url": "https://companiesmarketcap.com/bertelsmann-se-co-kgaa/marketcap/"
   },
   {
    "label": "Not in Google Finance",
    "url": null
   }
  ]
 },
 "bloomberg": {
  "frequency": "Monthly",
  "current": null,
  "historical": []
 },
 "bytedance": {
  "frequency": "Monthly",
  "current": {
   "label": "Reuters",
   "url": "https://www.reuters.com/world/china/bytedance-valued-550-billion-proposed-share-sale-by-general-atlantic-sources-say-2026-02-25/"
  },
  "historical": [
   {
    "label": "Reuters",
    "url": "https://www.reuters.com/world/china/bytedance-valued-550-billion-proposed-share-sale-by-general-atlantic-sources-say-2026-02-25/"
   },
   {
    "label": "TechFundingNews",
    "url": null
   },
   {
    "label": "Advisor Perspectives",
    "url": null
   },
   {
    "label": "Bloomberg",
    "url": null
   },
   {
    "label": "The Business Standard",
    "url": null
   },
   {
    "label": "TechNode",
    "url": null
   },
   {
    "label": "Straits Times",
    "url": null
   },
   {
    "label": "The National",
    "url": null
   },
   {
    "label": "Tech in Asia",
    "url": null
   },
   {
    "label": "Angel One Unlisted Analysis",
    "url": null
   },
   {
    "label": "China Daily Financing Report",
    "url": null
   },
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "Yahoo Finance",
    "url": "https://finance.yahoo.com/quote/DISO.PVT/"
   },
   {
    "label": "Forge Global",
    "url": null
   },
   {
    "label": "Resourcera",
    "url": null
   },
   {
    "label": "Caplight",
    "url": null
   },
   {
    "label": "Sacra",
    "url": null
   },
   {
    "label": "Backlinko",
    "url": null
   },
   {
    "label": "TechCrunch",
    "url": null
   },
   {
    "label": "Untaylored Ownership Profile",
    "url": null
   },
   {
    "label": "Public.com Funding Archives",
    "url": null
   },
   {
    "label": "Untaylored Profile",
    "url": null
   },
   {
    "label": "Forbes",
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "Wikipedia",
    "url": "https://en.wikipedia.org/wiki/Holtzbrinck_Publishing_Group"
   },
   {
    "label": "Holtzbrinck (official)",
    "url": null
   },
   {
    "label": "ConnectSafely",
    "url": null
   },
   {
    "label": "M&A Insights",
    "url": null
   },
   {
    "label": "Sullivan & Cromwell",
    "url": null
   },
   {
    "label": "Private Equity Wire",
    "url": null
   },
   {
    "label": "Finanzwire",
    "url": null
   },
   {
    "label": "InfluenceWatch Profile",
    "url": null
   },
   {
    "label": "InfluenceWatch",
    "url": null
   },
   {
    "label": "SPARC Industry Analysis",
    "url": null
   },
   {
    "label": "SPARC Analysis",
    "url": null
   },
   {
    "label": "Reuters",
    "url": null
   },
   {
    "label": "Startup Intros",
    "url": null
   },
   {
    "label": "Springer Nature Corporate History",
    "url": null
   },
   {
    "label": "Springer Nature Joint Press Announcement",
    "url": null
   },
   {
    "label": "SPARC Research",
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
  "historical": [
   {
    "label": "Variety",
    "url": "https://variety.com/2026/sports/news/ipl-valuation-rcb-rajasthan-royals-sales-1236822733/"
   },
   {
    "label": "gemini generated",
    "url": null
   }
  ]
 },
 "ispot": {
  "frequency": "Monthly",
  "current": {
   "label": "GeekWire",
   "url": "https://www.geekwire.com/2022/goldman-sachs-will-invest-325m-in-ispot-helping-to-break-nielsens-lock-on-tv-ad-measurement/"
  },
  "historical": [
   {
    "label": "GeekWire",
    "url": "https://www.geekwire.com/2022/goldman-sachs-will-invest-325m-in-ispot-helping-to-break-nielsens-lock-on-tv-ad-measurement/"
   },
   {
    "label": "Forge Global",
    "url": null
   },
   {
    "label": "Tracxn",
    "url": null
   },
   {
    "label": "GetLatka",
    "url": null
   },
   {
    "label": "TexAu",
    "url": null
   },
   {
    "label": "Broadcasting & Cable",
    "url": null
   },
   {
    "label": "TechCrunch",
    "url": null
   },
   {
    "label": "PR Newswire",
    "url": null
   },
   {
    "label": "Business Wire",
    "url": null
   },
   {
    "label": "Madrona Venture Group Portfolio Data",
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
  "historical": [
   {
    "label": "Reuters",
    "url": "https://www.reuters.com/technology/exclusive-kajabi-e-commerce-startup-knowledge-businesses-raises-550-million-2021-05-04/"
   },
   {
    "label": "gemini generated",
    "url": null
   }
  ]
 },
 "kantar-media": {
  "frequency": "Monthly",
  "current": {
   "label": "eMarketer",
   "url": "https://www.emarketer.com/content/kantar-media-gets-bought-1-billion-ad-measurement"
  },
  "historical": [
   {
    "label": "eMarketer",
    "url": "https://www.emarketer.com/content/kantar-media-gets-bought-1-billion-ad-measurement"
   },
   {
    "label": "S&P Global",
    "url": null
   },
   {
    "label": "PitchBook",
    "url": null
   },
   {
    "label": "Marketing Dive",
    "url": null
   },
   {
    "label": "Financial Times",
    "url": null
   },
   {
    "label": "AJ Bell",
    "url": null
   },
   {
    "label": "Social Samosa",
    "url": null
   },
   {
    "label": "Wikipedia",
    "url": null
   },
   {
    "label": "Cerner Investor Relations",
    "url": null
   },
   {
    "label": "Bain Capital Press Release",
    "url": null
   },
   {
    "label": "WPP Regulatory Filings",
    "url": null
   },
   {
    "label": "WPP Financial Disclosures",
    "url": null
   },
   {
    "label": "WPP Annual Report 2017",
    "url": null
   },
   {
    "label": "WPP Corporate Filings",
    "url": null
   },
   {
    "label": "WPP Annual Report 2015",
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
  "historical": [
   {
    "label": "Variety",
    "url": "https://variety.com/2026/music/news/primary-wave-to-acquire-kobalt-7-billion-company-1236696584/"
   },
   {
    "label": "Music Business Worldwide",
    "url": null
   },
   {
    "label": "Primary Wave (official)",
    "url": null
   },
   {
    "label": "M&A Insights",
    "url": null
   },
   {
    "label": "Music Business Research",
    "url": null
   },
   {
    "label": "Private Equity Wire",
    "url": null
   },
   {
    "label": "Rap Industry",
    "url": null
   },
   {
    "label": "The Wall Street Journal",
    "url": null
   },
   {
    "label": "PitchBook",
    "url": null
   },
   {
    "label": "TechCrunch",
    "url": null
   },
   {
    "label": "Hiive Kobalt Valuation History",
    "url": null
   },
   {
    "label": "Hearst Official Series D Announcement",
    "url": null
   },
   {
    "label": "Hiive Market Tracker",
    "url": null
   },
   {
    "label": "Harvard Law Journal Profile",
    "url": null
   }
  ]
 },
 "Mediawan": {
  "frequency": "Monthly",
  "current": {
   "label": "U.S. News",
   "url": "https://money.usnews.com/investing/news/articles/2023-11-28/exclusive-frances-mediawan-weighs-takeover-of-kkr-backed-leonine-sources"
  },
  "historical": [
   {
    "label": "U.S. News",
    "url": "https://money.usnews.com/investing/news/articles/2023-11-28/exclusive-frances-mediawan-weighs-takeover-of-kkr-backed-leonine-sources"
   },
   {
    "label": "S&P Global",
    "url": null
   },
   {
    "label": "Fitch Ratings",
    "url": null
   },
   {
    "label": "Variety",
    "url": null
   },
   {
    "label": "Private Equity Insights",
    "url": null
   },
   {
    "label": "Reuters",
    "url": null
   },
   {
    "label": "The Hollywood Reporter",
    "url": null
   },
   {
    "label": "Deadline",
    "url": null
   },
   {
    "label": "Business Wire",
    "url": null
   },
   {
    "label": "AMF France Regulatory Filings",
    "url": null
   },
   {
    "label": "Euronext Paris Disclosures",
    "url": null
   },
   {
    "label": "Financial Times",
    "url": null
   },
   {
    "label": "Euronext",
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
  "historical": [
   {
    "label": "GetLatka",
    "url": "https://getlatka.com/companies/midjourney"
   },
   {
    "label": "RevenueMemo",
    "url": null
   },
   {
    "label": "Value Add VC",
    "url": null
   },
   {
    "label": "Morphed",
    "url": null
   },
   {
    "label": "DemandSage",
    "url": null
   },
   {
    "label": "Sacra",
    "url": null
   },
   {
    "label": "AIPRM",
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "Variety",
    "url": "https://variety.com/2026/film/news/neon-anora-longlegs-sells-stake-department-m-1236806707/"
   },
   {
    "label": "TheWrap",
    "url": null
   },
   {
    "label": "Deadline",
    "url": null
   },
   {
    "label": "Screen Daily",
    "url": null
   },
   {
    "label": "The Hollywood Reporter",
    "url": null
   },
   {
    "label": "Paul Hastings LLP",
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "ITmedia",
    "url": "https://www.itmedia.co.jp/news/article/2606/24/1260624129/"
   },
   {
    "label": "Mainichi Shimbun",
    "url": null
   },
   {
    "label": "NHK (disclosures)",
    "url": null
   },
   {
    "label": "Nikkei",
    "url": null
   },
   {
    "label": "One Career",
    "url": null
   },
   {
    "label": "State Media Monitor",
    "url": null
   },
   {
    "label": "Minpo Online",
    "url": null
   },
   {
    "label": "Media Innovation",
    "url": null
   },
   {
    "label": "The Japan Times",
    "url": null
   },
   {
    "label": "ZAITEN Magazine",
    "url": null
   },
   {
    "label": "The Asahi Shimbun",
    "url": null
   },
   {
    "label": "Livedoor News",
    "url": null
   },
   {
    "label": "Sankei Shimbun",
    "url": null
   },
   {
    "label": "Kigyolog Financial Reports",
    "url": null
   },
   {
    "label": "House of Representatives Japan",
    "url": null
   },
   {
    "label": "Shugiin Records",
    "url": null
   },
   {
    "label": "Mynavi News",
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "Variety",
    "url": "https://variety.com/2022/tv/news/nielsen-sold-private-equity-measurement-media-1235217649/"
   },
   {
    "label": "Brookfield (filings)",
    "url": null
   },
   {
    "label": "Reuters",
    "url": null
   },
   {
    "label": "Bloomberg",
    "url": null
   },
   {
    "label": "PR Newswire",
    "url": null
   },
   {
    "label": "The Wall Street Journal",
    "url": null
   },
   {
    "label": "Private Equity Insights",
    "url": null
   },
   {
    "label": "MediaPost",
    "url": null
   },
   {
    "label": "SEC EDGAR Form 10-K Filing",
    "url": null
   },
   {
    "label": "CompaniesMarketCap Nielsen Historical Data",
    "url": null
   },
   {
    "label": "SEC EDGAR Form 10-K (2020 Report",
    "url": null
   },
   {
    "label": "SEC EDGAR Form 10-K (2018",
    "url": null
   },
   {
    "label": "2019 Data",
    "url": null
   },
   {
    "label": "SEC EDGAR Form 10-K (2018 Filing",
    "url": null
   },
   {
    "label": "Nielsen Holdings Proxy & Annual Filings",
    "url": null
   },
   {
    "label": "CompaniesMarketCap Data",
    "url": null
   },
   {
    "label": "Nielsen Holdings Annual Report",
    "url": null
   },
   {
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "Variety",
    "url": "https://variety.com/2026/digital/news/onlyfans-valuation-3-15-billion-sale-stake-architect-capital-1236741700/"
   },
   {
    "label": "QuantumRun",
    "url": null
   },
   {
    "label": "Forge Global",
    "url": null
   },
   {
    "label": "European Business Magazine",
    "url": null
   },
   {
    "label": "B9 Agency",
    "url": null
   },
   {
    "label": "Fenix International (filings)",
    "url": null
   },
   {
    "label": "Business Insider",
    "url": null
   },
   {
    "label": "TechCrunch",
    "url": null
   },
   {
    "label": "BBC",
    "url": null
   },
   {
    "label": "Wikipedia",
    "url": null
   },
   {
    "label": "UK Companies House",
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
  "historical": [
   {
    "label": "CNBC",
    "url": "https://www.cnbc.com/2026/03/31/openai-funding-round-ipo.html"
   },
   {
    "label": "OpenAI (announcement)",
    "url": null
   },
   {
    "label": "Tracxn",
    "url": null
   },
   {
    "label": "Pinggy",
    "url": null
   },
   {
    "label": "PitchBook",
    "url": null
   },
   {
    "label": "Visual Capitalist",
    "url": null
   },
   {
    "label": "Reuters",
    "url": null
   },
   {
    "label": "Economic Times",
    "url": null
   },
   {
    "label": "Bloomberg",
    "url": null
   },
   {
    "label": "TechCrunch",
    "url": null
   },
   {
    "label": "Sacra",
    "url": null
   },
   {
    "label": "Fortune",
    "url": null
   },
   {
    "label": "Forbes",
    "url": null
   },
   {
    "label": "MIT Technology Review",
    "url": null
   },
   {
    "label": "Microsoft Official Announcement",
    "url": null
   },
   {
    "label": "Wired",
    "url": null
   },
   {
    "label": "Wired Financial Report",
    "url": null
   },
   {
    "label": "The Verge",
    "url": null
   },
   {
    "label": "OpenAI Research Archives",
    "url": null
   },
   {
    "label": "Y Combinator Blog Archives",
    "url": null
   },
   {
    "label": "OpenAI Founding Announcement",
    "url": null
   },
   {
    "label": "The New York Times",
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
  "historical": [
   {
    "label": "Fueler",
    "url": "https://fueler.io/blog/patreon-usage-revenue-valuation-growth-statistics"
   },
   {
    "label": "Caplight",
    "url": null
   },
   {
    "label": "Tracxn",
    "url": null
   },
   {
    "label": "Sacra",
    "url": null
   },
   {
    "label": "Access IPOs",
    "url": null
   },
   {
    "label": "The Information",
    "url": null
   },
   {
    "label": "TechCrunch",
    "url": null
   },
   {
    "label": "Built In",
    "url": null
   },
   {
    "label": "Tubefilter",
    "url": null
   },
   {
    "label": "Wikipedia",
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
  "historical": [
   {
    "label": "PBS financials",
    "url": "https://www.pbs.org/about/about-pbs/financials/"
   }
  ]
 },
 "penske": {
  "frequency": "Monthly",
  "current": null,
  "historical": [
   {
    "label": "TheWrap",
    "url": null
   },
   {
    "label": "Awful Announcing",
    "url": null
   },
   {
    "label": "Forbes",
    "url": null
   },
   {
    "label": "Penske Media (official)",
    "url": null
   },
   {
    "label": "Variety",
    "url": null
   },
   {
    "label": "Deadline",
    "url": null
   },
   {
    "label": "The Rebooting",
    "url": null
   },
   {
    "label": "The Hollywood Reporter",
    "url": null
   },
   {
    "label": "Artforum Announcement",
    "url": null
   },
   {
    "label": "The Wall Street Journal",
    "url": null
   },
   {
    "label": "Eldridge Press Releases",
    "url": null
   },
   {
    "label": "Media Play News",
    "url": null
   },
   {
    "label": "TechCrunch",
    "url": null
   },
   {
    "label": "Billboard",
    "url": null
   },
   {
    "label": "WWD Corporate Disclosures",
    "url": null
   },
   {
    "label": "Zippia Financing Index",
    "url": null
   },
   {
    "label": "The New York Times",
    "url": null
   },
   {
    "label": "Wikipedia",
    "url": null
   },
   {
    "label": "PMC Overview",
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
  "historical": [
   {
    "label": "Transfermarkt",
    "url": "https://www.transfermarkt.com/premier-league/startseite/wettbewerb/GB1"
   },
   {
    "label": "Deloitte",
    "url": null
   },
   {
    "label": "SportsPro",
    "url": null
   },
   {
    "label": "FC Business",
    "url": null
   },
   {
    "label": "Forbes",
    "url": null
   },
   {
    "label": "BBC Sport",
    "url": null
   },
   {
    "label": "The Guardian",
    "url": null
   },
   {
    "label": "Bloomberg",
    "url": null
   },
   {
    "label": "Financial Times",
    "url": null
   },
   {
    "label": "Reuters",
    "url": null
   },
   {
    "label": "BBC",
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "RedBird (official)",
    "url": "https://redbirdcap.com/about/"
   },
   {
    "label": "Altss",
    "url": null
   },
   {
    "label": "Reuters",
    "url": null
   },
   {
    "label": "Wikipedia",
    "url": null
   },
   {
    "label": "GlobeNewswire",
    "url": null
   },
   {
    "label": "ZoomInvestors",
    "url": null
   },
   {
    "label": "Deadline",
    "url": null
   },
   {
    "label": "The New York Times",
    "url": null
   },
   {
    "label": "AC Milan (official)",
    "url": null
   },
   {
    "label": "Calcio e Finanza",
    "url": null
   },
   {
    "label": "The Guardian",
    "url": null
   },
   {
    "label": "Le Parisien",
    "url": null
   },
   {
    "label": "Bloomberg",
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "LoLTheory",
    "url": null
   },
   {
    "label": "Tencent (filings)",
    "url": null
   },
   {
    "label": "GamesIndustry.biz",
    "url": null
   },
   {
    "label": "Companies Registration Office (Ireland)",
    "url": null
   },
   {
    "label": "HeadphonesAddict",
    "url": null
   },
   {
    "label": "Newzoo",
    "url": null
   },
   {
    "label": "Sensor Tower",
    "url": null
   },
   {
    "label": "Bloomberg",
    "url": null
   },
   {
    "label": "Forbes",
    "url": null
   },
   {
    "label": "TechCrunch",
    "url": null
   },
   {
    "label": "SuperData Research",
    "url": null
   },
   {
    "label": "Nielsen",
    "url": null
   },
   {
    "label": "The Verge",
    "url": null
   },
   {
    "label": "SuperData Industry Report",
    "url": null
   },
   {
    "label": "Statista",
    "url": null
   },
   {
    "label": "SuperData Year-In-Review 2018",
    "url": null
   },
   {
    "label": "The Information",
    "url": null
   },
   {
    "label": "SuperData Research 2017",
    "url": null
   },
   {
    "label": "Reuters",
    "url": null
   },
   {
    "label": "SuperData Games Report 2016",
    "url": null
   },
   {
    "label": "SEC",
    "url": null
   },
   {
    "label": "Wikipedia",
    "url": null
   },
   {
    "label": "Acquisition History",
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "TechCrunch",
    "url": "https://techcrunch.com/2026/02/10/ai-video-startup-runway-raises-315m-at-5-3b-valuation-eyes-more-capable-world-models/"
   },
   {
    "label": "Bloomberg",
    "url": null
   },
   {
    "label": "The Verge",
    "url": null
   },
   {
    "label": "Sacra",
    "url": null
   },
   {
    "label": "GetLatka",
    "url": null
   },
   {
    "label": "Forbes",
    "url": null
   },
   {
    "label": "VentureBeat",
    "url": null
   },
   {
    "label": "Dealroom Profile",
    "url": null
   },
   {
    "label": "Crunchbase Data",
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
  "historical": [
   {
    "label": "TechCrunch",
    "url": "https://techcrunch.com/2024/09/10/creator-startup-spotter-raises-another-7-4m/"
   },
   {
    "label": "Variety",
    "url": null
   },
   {
    "label": "Tracxn",
    "url": null
   },
   {
    "label": "Forge Global",
    "url": null
   },
   {
    "label": "The Wall Street Journal",
    "url": null
   },
   {
    "label": "Business Insider",
    "url": null
   },
   {
    "label": "Growjo",
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
  "historical": [
   {
    "label": "TechCrunch",
    "url": "https://techcrunch.com/2025/07/17/substack-raises-100m-from-chernin-group-andreessen-horowitz-skims-ceo-and-more/"
   },
   {
    "label": "Tracxn",
    "url": null
   },
   {
    "label": "Sacra",
    "url": null
   },
   {
    "label": "PM Insights",
    "url": null
   },
   {
    "label": "Wefunder",
    "url": null
   },
   {
    "label": "The New York Times",
    "url": null
   },
   {
    "label": "The Wall Street Journal",
    "url": null
   },
   {
    "label": "Forbes",
    "url": null
   },
   {
    "label": "Business Insider",
    "url": null
   },
   {
    "label": "Y Combinator Company Index",
    "url": null
   },
   {
    "label": "RevenueMemo",
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
  "historical": [
   {
    "label": "CNBC",
    "url": "https://www.cnbc.com/2026/01/26/nvidia-alphabet-vc-arms-back-synthesia.html"
   },
   {
    "label": "Seedcamp",
    "url": null
   },
   {
    "label": "The Guardian",
    "url": null
   },
   {
    "label": "The Times",
    "url": null
   },
   {
    "label": "VentureBeat",
    "url": null
   },
   {
    "label": "Financial Times",
    "url": null
   },
   {
    "label": "Yahoo Finance",
    "url": null
   },
   {
    "label": "Business Wire",
    "url": null
   },
   {
    "label": "TechCrunch",
    "url": null
   },
   {
    "label": "Vox Media Analysis",
    "url": null
   },
   {
    "label": "Dealroom Profile",
    "url": null
   },
   {
    "label": "UK Companies House",
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
  "historical": [
   {
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
  "historical": [
   {
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
  "historical": [
   {
    "label": "Forbes",
    "url": "https://www.forbes.com/sites/mattcraig/2025/10/30/why-videoamp-thinks-it-can-bust-nielsens-tv-ratings-monopoly/"
   },
   {
    "label": "Forge Global",
    "url": null
   },
   {
    "label": "Startup Intros",
    "url": null
   },
   {
    "label": "Growjo",
    "url": null
   },
   {
    "label": "GetLatka",
    "url": null
   },
   {
    "label": "AdExchanger",
    "url": null
   },
   {
    "label": "FinSMEs",
    "url": null
   },
   {
    "label": "CNBC",
    "url": null
   },
   {
    "label": "Daily Research News",
    "url": null
   },
   {
    "label": "TechCrunch",
    "url": null
   },
   {
    "label": "Tracxn",
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
  "historical": [
   {
    "label": "Axios",
    "url": "https://www.axios.com/2026/05/20/vox-media-lupa-systems-james-murdoch"
   }
  ]
 },
 "weigel": {
  "frequency": "Monthly",
  "current": null,
  "historical": []
 },
 "whalar": {
  "frequency": "Monthly",
  "current": null,
  "historical": [
   {
    "label": "Tubefilter",
    "url": null
   },
   {
    "label": "Digiday",
    "url": null
   },
   {
    "label": "NetInfluencer",
    "url": null
   },
   {
    "label": "The Daily Upside",
    "url": null
   },
   {
    "label": "RockWater",
    "url": null
   },
   {
    "label": "Adweek",
    "url": null
   },
   {
    "label": "UK Companies House",
    "url": null
   },
   {
    "label": "Growjo",
    "url": null
   },
   {
    "label": "Inven Financial Profiles",
    "url": null
   },
   {
    "label": "dot.LA",
    "url": null
   },
   {
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
  "historical": [
   {
    "label": "ZDF finances",
    "url": "https://www.zdf.de/unternehmen/organisation/finanzen-110.html"
   },
   {
    "label": "gemini generated",
    "url": null
   }
  ]
 },
 "Vend": {
  "frequency": "Monthly",
  "current": null,
  "historical": []
 },
 "mount-bros-sept-26": {
  "frequency": "Monthly",
  "current": null,
  "historical": []
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
