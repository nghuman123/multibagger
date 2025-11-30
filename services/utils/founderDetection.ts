
/**
 * Heuristic founder detection
 * Returns confidence score 0-100
 */
export const detectFounderStatus = (
  ceoName: string,
  companyName: string,
  description: string,
  companyAgeYears: number
): { isFounder: boolean; confidence: number; reason: string } => {
  if (!ceoName) return { isFounder: false, confidence: 0, reason: "No CEO name available" };

  let score = 0;
  const reasons: string[] = [];
  
  const lastName = ceoName.split(' ').pop()?.toLowerCase();
  const companyNameLower = companyName.toLowerCase();
  const descriptionLower = description.toLowerCase();

  // 1. Name Match (Strongest Signal)
  // Check if CEO last name is in company name (e.g. "Dell" in "Dell Inc")
  if (lastName && companyNameLower.includes(lastName) && lastName.length > 3) {
    score += 90;
    reasons.push("CEO last name matches company name");
  }

  // 2. Keyword Search in Description
  const founderKeywords = [
    `founded by ${ceoName.toLowerCase()}`,
    `founded by ${lastName}`,
    `co-founded by ${ceoName.toLowerCase()}`,
    `founder ${ceoName.toLowerCase()}`,
    `founder and ceo`,
    `led by founder`,
    `started by`
  ];

  const foundKeyword = founderKeywords.some(keyword => descriptionLower.includes(keyword));
  if (foundKeyword) {
    score += 80;
    reasons.push("Founder keywords found in company description");
  }

  // 3. Young Company heuristic (Weak Signal)
  // If company is very young (< 8 years), CEO is likely the founder or early hire
  if (companyAgeYears < 8 && companyAgeYears > 0) {
    score += 20;
    reasons.push("Company < 8 years old");
  }

  // Cap score
  const confidence = Math.min(100, score);

  return {
    isFounder: confidence > 50,
    confidence,
    reason: reasons.join(", ") || "No founder signals detected"
  };
};
