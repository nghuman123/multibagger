export interface FounderCheckResult {
  isFounder: boolean;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

// Known founder-led companies (manual override for accuracy)
const KNOWN_FOUNDER_LED: Record<string, string> = {
  'TSLA': 'Elon Musk',
  'NVDA': 'Jensen Huang',
  'META': 'Mark Zuckerberg',
  'AMZN': 'Andy Jassy (Bezos successor)', // Not founder but culture carrier, though technically "Founder Led" flag usually implies Founder. Andy Jassy is not founder. 
  // Wait, the user provided this list. I should stick to it. "Andy Jassy (Bezos successor)" might be intentional to flag as "Alignment" high?
  // But Jassy is NOT a founder. However, if the user provided this strict list, I will use it.
  // Actually, line says "Andy Jassy (Bezos successor)".
  'NFLX': 'Reed Hastings',
  'CRM': 'Marc Benioff',
  'SHOP': 'Tobi Lutke',
  'SQ': 'Jack Dorsey',
  'PLTR': 'Alex Karp',
  'ZM': 'Eric Yuan',
  'DDOG': 'Olivier Pomel',
  'CRWD': 'George Kurtz',
  'ZS': 'Jay Chaudhry',
  'SNOW': 'Frank Slootman (Operator CEO)', // Slootman is famous operator, generally considered high alignment.
  'RKLB': 'Peter Beck',
  'TEAM': 'Mike Cannon-Brookes / Scott Farquhar',
  'U': 'John Riccitiello (No, actually updated list)', // sticking to user provided snippet
  'MNDY': 'Roy Mann / Eran Zinman',
  'GTLB': 'Sid Sijbrandij'
};

// Supplement with user provided list in prompt:
// 'TSLA': 'Elon Musk', ... 'RKLB': 'Peter Beck'
// I will use exactly what was in the prompt to be safe.

const KNOWN_FOUNDER_LED_STRICT: Record<string, string> = {
  'TSLA': 'Elon Musk',
  'NVDA': 'Jensen Huang',
  'META': 'Mark Zuckerberg',
  'AMZN': 'Andy Jassy (Bezos successor)',
  'NFLX': 'Reed Hastings',
  'CRM': 'Marc Benioff',
  'SHOP': 'Tobi Lutke',
  'SQ': 'Jack Dorsey',
  'PLTR': 'Alex Karp',
  'ZM': 'Eric Yuan',
  'DDOG': 'Olivier Pomel',
  'CRWD': 'George Kurtz',
  'ZS': 'Jay Chaudhry',
  'SNOW': 'Frank Slootman (Operator CEO)',
  'RKLB': 'Peter Beck',
};

export function detectFounderStatus(
  ceoName: string | null,
  companyName: string,
  description: string,
  companyAgeYears: number,
  ticker?: string
): FounderCheckResult {

  // 1. Check manual override list first
  if (ticker && KNOWN_FOUNDER_LED_STRICT[ticker]) {
    return {
      isFounder: true,
      reason: `Known founder-led: ${KNOWN_FOUNDER_LED_STRICT[ticker]}`,
      confidence: 'high'
    };
  }

  // 2. Check description for founder signals
  const descLower = (description || '').toLowerCase();
  const ceoLower = (ceoName || '').toLowerCase();

  const founderPatterns = [
    /founded by/i,
    /co-founded by/i,
    /founder and ceo/i,
    /founder,? ceo/i,
    /founding team/i,
    // Dynamic regexes below
  ];

  // Add dynamic patterns if ceoName is present
  if (ceoName) {
    // Escape regex special chars in name just in case
    const safeCeo = ceoLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // We can't put regex objects in the array easily if we want to construct them dynamically inside the loop?
    // No, we can just check them separately.
  }

  for (const pattern of founderPatterns) {
    if (pattern.test(descLower)) {
      return {
        isFounder: true,
        reason: `Description mentions founder pattern`, // Simplified
        confidence: 'medium'
      };
    }
  }

  // Dynamic checks
  if (ceoName) {
    const safeCeo = ceoLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const p1 = new RegExp(`${safeCeo}.*founded`, 'i');
    const p2 = new RegExp(`founded.*${safeCeo}`, 'i');

    if (p1.test(descLower) || p2.test(descLower)) {
      return {
        isFounder: true,
        reason: `Description mentions founder: "${ceoName}"`,
        confidence: 'medium'
      };
    }
  }

  // 3. Heuristic: Young company + CEO name in company name
  if (companyAgeYears <= 15 && ceoName) {
    const nameParts = ceoName.toLowerCase().split(' ');
    const companyLower = companyName.toLowerCase();

    // Check if last name or significant part is in company name
    // Iterate parts > 3 chars
    const hasNameMatch = nameParts.some(part => part.length > 3 && companyLower.includes(part));

    if (hasNameMatch) {
      return {
        isFounder: true,
        reason: `CEO name "${ceoName}" appears in company name`,
        confidence: 'medium'
      };
    }
  }

  // 4. Age heuristic: Very young company likely still founder-led
  if (companyAgeYears <= 5) {
    return {
      isFounder: true,
      reason: `Company age ${companyAgeYears} years (likely founder-led)`,
      confidence: 'low'
    };
  }

  return {
    isFounder: false,
    reason: 'No founder signals detected',
    confidence: 'medium'
  };
}
