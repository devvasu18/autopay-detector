import React, { useState } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { getMerchantDomain } from '../utils/logoResolver';

interface MerchantLogoProps {
  name: string;
  size?: number;
}

const LOCAL_LOGOS: { [key: string]: any } = {
  'google': require('../assets/logos/google.png'),
  'phonepe': require('../assets/logos/phonepe.png'),
  'paytm': require('../assets/logos/paytm.png'),
  'bhim': require('../assets/logos/bhim.png'),
  'cred': require('../assets/logos/cred.png'),
  'mobikwik': require('../assets/logos/mobikwik.png'),
  'freecharge': require('../assets/logos/freecharge.png'),
  'airtelbank': require('../assets/logos/airtelbank.png'),
  'jiopaymentsbank': require('../assets/logos/jiopaymentsbank.png'),
  'hdfc': require('../assets/logos/hdfc.png'),
  'icici': require('../assets/logos/icici.png'),
  'axis': require('../assets/logos/axis.png'),
  'kotak': require('../assets/logos/kotak.png'),
  'pnb': require('../assets/logos/pnb.png'),
  'bankofbaroda': require('../assets/logos/bankofbaroda.png'),
  'canara': require('../assets/logos/canara.png'),
  'unionbank': require('../assets/logos/unionbank.png'),
  'idfc': require('../assets/logos/idfc.png'),
  'indusind': require('../assets/logos/indusind.png'),
  'yesbank': require('../assets/logos/yesbank.png'),
  'aubank': require('../assets/logos/aubank.png'),
  'federalbank': require('../assets/logos/federalbank.png'),
  'southindianbank': require('../assets/logos/southindianbank.png'),
  'jio': require('../assets/logos/jio.png'),
  'airtel': require('../assets/logos/airtel.png'),
  'vodafone': require('../assets/logos/vodafone.png'),
  'bsnl': require('../assets/logos/bsnl.png'),
  'netflix': require('../assets/logos/netflix.png'),
  'primevideo': require('../assets/logos/primevideo.png'),
  'hotstar': require('../assets/logos/hotstar.png'),
  'sonyliv': require('../assets/logos/sonyliv.png'),
  'zee5': require('../assets/logos/zee5.png'),
  'jiohotstar': require('../assets/logos/jiohotstar.png'),
  'appletv': require('../assets/logos/appletv.png'),
  'youtube': require('../assets/logos/youtube.png'),
  'spotify': require('../assets/logos/spotify.png'),
  'gaana': require('../assets/logos/gaana.png'),
  'jiosaavn': require('../assets/logos/jiosaavn.png'),
  'wynk': require('../assets/logos/wynk.png'),
  'amazon': require('../assets/logos/amazon.png'),
  'flipkart': require('../assets/logos/flipkart.png'),
  'myntra': require('../assets/logos/myntra.png'),
  'ajio': require('../assets/logos/ajio.png'),
  'meesho': require('../assets/logos/meesho.png'),
  'nykaa': require('../assets/logos/nykaa.png'),
  'tatacliq': require('../assets/logos/tatacliq.png'),
  'snapdeal': require('../assets/logos/snapdeal.png'),
  'firstcry': require('../assets/logos/firstcry.png'),
  'swiggy': require('../assets/logos/swiggy.png'),
  'zomato': require('../assets/logos/zomato.png'),
  'blinkit': require('../assets/logos/blinkit.png'),
  'zepto': require('../assets/logos/zepto.png'),
  'bigbasket': require('../assets/logos/bigbasket.png'),
  'uber': require('../assets/logos/uber.png'),
  'ola': require('../assets/logos/ola.png'),
  'rapido': require('../assets/logos/rapido.png'),
  'irctc': require('../assets/logos/irctc.png'),
  'redbus': require('../assets/logos/redbus.png'),
  'makemytrip': require('../assets/logos/makemytrip.png'),
  'goibibo': require('../assets/logos/goibibo.png'),
  'easemytrip': require('../assets/logos/easemytrip.png'),
  'yatra': require('../assets/logos/yatra.png'),
  'tataplay': require('../assets/logos/tataplay.png'),
  'airtelxstream': require('../assets/logos/airtelxstream.png'),
  'jiofiber': require('../assets/logos/jiofiber.png'),
  'actcorp': require('../assets/logos/actcorp.png'),
  'hathway': require('../assets/logos/hathway.png'),
  'tatapower': require('../assets/logos/tatapower.png'),
  'adanielectricity': require('../assets/logos/adanielectricity.png'),
  'bescom': require('../assets/logos/bescom.png'),
  'mahadiscom': require('../assets/logos/mahadiscom.png'),
  'bsesdelhi': require('../assets/logos/bsesdelhi.png'),
  'groww': require('../assets/logos/groww.png'),
  'zerodha': require('../assets/logos/zerodha.png'),
  'upstox': require('../assets/logos/upstox.png'),
  'angelone': require('../assets/logos/angelone.png'),
  'paytmmoney': require('../assets/logos/paytmmoney.png'),
  'indmoney': require('../assets/logos/indmoney.png'),
  'etmoney': require('../assets/logos/etmoney.png'),
  'navi': require('../assets/logos/navi.png'),
  'bajajfinserv': require('../assets/logos/bajajfinserv.png'),
  'licindia': require('../assets/logos/licindia.png'),
  'icicilombard': require('../assets/logos/icicilombard.png'),
  'hdfclife': require('../assets/logos/hdfclife.png'),
  'sbilife': require('../assets/logos/sbilife.png'),
  'starhealth': require('../assets/logos/starhealth.png'),
};

export const MerchantLogo: React.FC<MerchantLogoProps> = ({ name, size = 40 }) => {
  const [loadError, setLoadError] = useState(false);
  const normalized = name.toLowerCase().trim();

  // 1. Layer 1: Check if there is a local asset bundled in the app
  let localKey = '';
  for (const key of Object.keys(LOCAL_LOGOS)) {
    if (normalized.includes(key)) {
      localKey = key;
      break;
    }
  }

  if (localKey && LOCAL_LOGOS[localKey]) {
    return (
      <Image
        source={LOCAL_LOGOS[localKey]}
        style={[styles.logo, { width: size, height: size, borderRadius: size / 2 }]}
        resizeMode="cover"
      />
    );
  }

  // 2. Layer 2: Fetch dynamically from Logo API
  const domain = getMerchantDomain(name);
  const logoUrl = domain && !loadError
    ? `https://logo.hunter.io/${domain}`
    : null;

  if (logoUrl) {
    return (
      <Image
        source={{
          uri: logoUrl,
        }}
        onError={() => setLoadError(true)}
        style={[styles.logo, { width: size, height: size, borderRadius: size / 2 }]}
        resizeMode="cover"
      />
    );
  }

  // 3. Layer 3: Fallback initials badge
  const cleanName = name
    .replace(/^yours+payments+ofs+rs.d+s+fors+thes+subscriptions+tos+/i, '')
    .trim();
  const firstLetter = cleanName.charAt(0).toUpperCase() || '?';
  const backgroundColor = getPaletteColor(cleanName);

  return (
    <View style={[styles.fallbackContainer, { width: size, height: size, borderRadius: size / 2, backgroundColor }]}>
      <Text style={[styles.fallbackText, { fontSize: size * 0.45 }]}>{firstLetter}</Text>
    </View>
  );
};

const getPaletteColor = (name: string): string => {
  const premiumColors = ['#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % premiumColors.length;
  return premiumColors[index];
};

const styles = StyleSheet.create({
  logo: {
    backgroundColor: '#F1F5F9',
  },
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  fallbackText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
