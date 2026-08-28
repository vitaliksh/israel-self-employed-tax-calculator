export const DEFAULT_PARAMETERS = Object.freeze({
  metadata: {
    taxYear: 2026, version: '2026.2', retrievedAt: '2026-08-28',
    sources: {
      incomeTax: 'https://www.gov.il/BlobFolder/dynamiccollectorresultitem/employers-info-300326-1/he/IncomeTax_IncomeTaxEmployersInfo_employers-info-300326-1.pdf',
      insurance: 'https://www.btl.gov.il/English%20Homepage/Insurance/National%20Insurance/Detailsoftypes/SelfEmployedPerson/Pages/Methodofcalculation.aspx',
      benefits: 'https://www.gov.il/BlobFolder/generalpage/income-tax-guide-knowyourright/he/Guides_IncomeTax_da-2025.pdf'
    }
  },
  incomeTax: {
    brackets: [{upTo:84120, rate:.10}, {upTo:120720, rate:.14}, {upTo:228000, rate:.20}, {upTo:301200, rate:.31}, {upTo:560280, rate:.35}, {upTo:721560, rate:.47}, {upTo:Infinity, rate:.50}],
    creditPointAnnualValue: 2904
  },
  insurance: {
    reducedMonthlyBase: 7703, maximumAnnualBase: 622920, minimumAnnualBase: 41304,
    nationalReducedRate: .0447, nationalFullRate: .1283, healthReducedRate: .0323, healthFullRate: .0517
  },
  benefits: {
    pensionDeductionRate: .11, pensionCreditRate: .05, pensionCreditValueRate: .35, pensionEligibleIncomeCap: 232800,
    studyFundDeductionRate: .045, studyFundEligibleIncomeCap: 293397
  }
});

export function loadParameters() {
  try { return hydrateParameters(JSON.parse(localStorage.getItem('taxParameters2026')) || structuredClone(DEFAULT_PARAMETERS)); }
  catch { return structuredClone(DEFAULT_PARAMETERS); }
}
export function saveParameters(parameters) { localStorage.setItem('taxParameters2026', JSON.stringify(parameters)); }
export function resetParameters() { localStorage.removeItem('taxParameters2026'); return structuredClone(DEFAULT_PARAMETERS); }
export function isNewerVersion(candidate, current) {
  return candidate?.metadata?.taxYear === 2026 && candidate?.metadata?.version > current.metadata.version;
}
export function hydrateParameters(candidate) {
  const oldBrackets = candidate.incomeTax?.brackets;
  const brackets = oldBrackets?.length === 6
    ? [...oldBrackets.slice(0, 5), { upTo: 721560, rate: oldBrackets[5].rate }, { upTo: Infinity, rate: .50 }]
    : oldBrackets || structuredClone(DEFAULT_PARAMETERS).incomeTax.brackets;
  return {
    ...structuredClone(DEFAULT_PARAMETERS), ...candidate,
    metadata: { ...structuredClone(DEFAULT_PARAMETERS).metadata, ...candidate.metadata, sources: { ...DEFAULT_PARAMETERS.metadata.sources, ...candidate.metadata?.sources } },
    incomeTax: { ...structuredClone(DEFAULT_PARAMETERS).incomeTax, ...candidate.incomeTax, brackets },
    insurance: { ...structuredClone(DEFAULT_PARAMETERS).insurance, ...candidate.insurance },
    benefits: { ...structuredClone(DEFAULT_PARAMETERS).benefits, ...candidate.benefits }
  };
}
