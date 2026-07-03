const LOCAL_DOMAINS: { [key: string]: string } = {
  // Digital Wallets & UPI
  'google pay': 'pay.google.com',
  'gpay': 'pay.google.com',
  'phonepe': 'phonepe.com',
  'paytm': 'paytm.com',
  'amazon pay': 'amazon.in',
  'bhim': 'bhimupi.org.in',
  'cred': 'cred.club',
  'mobikwik': 'mobikwik.com',
  'freecharge': 'freecharge.in',
  'airtel payments bank': 'airtelbank.com',
  'airtel payment bank': 'airtelbank.com',
  'jio payments bank': 'jiopaymentsbank.com',

  // Banks
  'state bank of india': 'sbi.co.in',
  'sbi': 'sbi.co.in',
  'hdfc': 'hdfcbank.com',
  'icici': 'icicibank.com',
  'axis': 'axisbank.com',
  'kotak': 'kotak.com',
  'punjab national bank': 'pnbindia.in',
  'pnb': 'pnbindia.in',
  'bank of baroda': 'bankofbaroda.in',
  'bob': 'bankofbaroda.in',
  'canara': 'canarabank.com',
  'union bank': 'unionbankofindia.co.in',
  'idfc': 'idfcfirstbank.com',
  'indusind': 'indusind.com',
  'yes bank': 'yesbank.in',
  'yesbk': 'yesbank.in',
  'au small finance': 'aubank.in',
  'au bank': 'aubank.in',
  'federal bank': 'federalbank.co.in',
  'south indian bank': 'southindianbank.com',

  // Telecom
  'jio': 'jio.com',
  'airtel': 'airtel.in',
  'vi ': 'myvi.in',
  'vodafone': 'myvi.in',
  'idea': 'myvi.in',
  'bsnl': 'bsnl.co.in',

  // OTT & Streaming
  'netflix': 'netflix.com',
  'prime video': 'primevideo.com',
  'disney': 'hotstar.com',
  'hotstar': 'hotstar.com',
  'sony liv': 'sonyliv.com',
  'sonyliv': 'sonyliv.com',
  'zee5': 'zee5.com',
  'jiohotstar': 'jiohotstar.com',
  'apple tv': 'tv.apple.com',
  'youtube': 'youtube.com',
  'spotify': 'spotify.com',
  'gaana': 'gaana.com',
  'jiosaavn': 'jiosaavn.com',
  'saavn': 'jiosaavn.com',
  'wynk': 'wynk.in',

  // Shopping & E-commerce
  'amazon': 'amazon.in',
  'flipkart': 'flipkart.com',
  'myntra': 'myntra.com',
  'ajio': 'ajio.com',
  'meesho': 'meesho.com',
  'nykaa': 'nykaa.com',
  'tata cliq': 'tatacliq.com',
  'snapdeal': 'snapdeal.com',
  'firstcry': 'firstcry.com',

  // Food Delivery & Quick Commerce
  'swiggy': 'swiggy.com',
  'zomato': 'zomato.com',
  'blinkit': 'blinkit.com',
  'zepto': 'zepto.co',
  'bigbasket': 'bigbasket.com',
  'instamart': 'swiggy.com',

  // Ride & Travel
  'uber': 'uber.com',
  'ola': 'olacabs.com',
  'rapido': 'rapido.bike',
  'irctc': 'irctc.co.in',
  'redbus': 'redbus.in',
  'makemytrip': 'makemytrip.com',
  'mmt': 'makemytrip.com',
  'goibibo': 'goibibo.com',
  'easemytrip': 'easemytrip.com',
  'yatra': 'yatra.com',

  // Utility & Bill Payments
  'tata play': 'tataplay.com',
  'airtel xstream': 'airtel.in',
  'jiofiber': 'jio.com',
  'jio fiber': 'jio.com',
  'act fibernet': 'actcorp.in',
  'act fiber': 'actcorp.in',
  'hathway': 'hathway.com',
  'tata power': 'tatapower.com',
  'adani electricity': 'adanielectricity.com',
  'adani': 'adanielectricity.com',
  'bescom': 'bescom.co.in',
  'mseb': 'mahadiscom.in',
  'bses': 'bsesdelhi.com',

  // Finance & Investments
  'groww': 'groww.in',
  'zerodha': 'zerodha.com',
  'upstox': 'upstox.com',
  'angel one': 'angelone.in',
  'angelone': 'angelone.in',
  'paytm money': 'paytmmoney.com',
  'indmoney': 'indmoney.com',
  'et money': 'etmoney.com',
  'etmoney': 'etmoney.com',
  'navi': 'navi.com',
  'bajaj finserv': 'bajajfinserv.in',
  'bajaj finance': 'bajajfinserv.in',

  // Insurance
  'lic': 'licindia.in',
  'life insurance corporation': 'licindia.in',
  'icici lombard': 'icicilombard.com',
  'hdfc life': 'hdfclife.com',
  'sbi life': 'sbilife.co.in',
  'star health': 'starhealth.in',
};

export const getMerchantDomain = (merchantName: string): string | null => {
  const normalized = merchantName.toLowerCase().trim();
  
  // Match key variations (e.g. "Netflix Payment" matches "netflix")
  for (const [key, domain] of Object.entries(LOCAL_DOMAINS)) {
    if (normalized.includes(key)) {
      return domain;
    }
  }
  
  if (normalized.includes('.')) {
    return normalized;
  }
  
  return null;
};
