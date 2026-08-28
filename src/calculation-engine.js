const round = (value) => Math.round(value * 100) / 100;
const periodRatio = (months) => Math.max(0, Math.min(12, months)) / 12;
const bracketRows = (income, brackets) => brackets.map((bracket, index) => {
  const lower = index === 0 ? 0 : (Number.isFinite(brackets[index - 1].upTo) ? brackets[index - 1].upTo : Infinity);
  const upper = Number.isFinite(bracket.upTo) ? bracket.upTo : Infinity;
  const amount = Math.max(0, Math.min(income, upper) - lower);
  return { lower, upper, rate: bracket.rate, amount: round(amount), tax: round(amount * bracket.rate) };
});
const amountInBrackets = (income, brackets) => brackets.reduce((tax, bracket, index) => {
  const lower = index === 0 ? 0 : (Number.isFinite(brackets[index - 1].upTo) ? brackets[index - 1].upTo : Infinity);
  const upper = Number.isFinite(bracket.upTo) ? bracket.upTo : Infinity;
  return tax + Math.max(0, Math.min(income, upper) - lower) * bracket.rate;
}, 0);

export function calculateIncomeTax(taxableIncome, creditPoints, parameters, months = 12) {
  const { incomeTax } = parameters;
  const ratio = periodRatio(months);
  const bracketsForPeriod = incomeTax.brackets.map((bracket) => ({ ...bracket, upTo: Number.isFinite(bracket.upTo) ? bracket.upTo * ratio : Infinity }));
  const brackets = bracketRows(taxableIncome, bracketsForPeriod);
  const gross = brackets.reduce((total, bracket) => total + bracket.tax, 0);
  const credits = creditPoints * incomeTax.creditPointAnnualValue * ratio;
  return { gross: round(gross), credits: round(Math.min(gross, credits)), net: round(Math.max(0, gross - credits)), creditPointValueForPeriod: round(incomeTax.creditPointAnnualValue * ratio), brackets };
}

export function calculateInsurance(selfIncome, salaryAnnual, parameters, months = 12) {
  const rule = parameters.insurance;
  const ratio = periodRatio(months);
  const reducedAnnualBase = rule.reducedMonthlyBase * months;
  const selfBase = Math.max(rule.minimumAnnualBase * ratio, selfIncome);
  // As a worker and self-employed person, the reduced tranche is used first by employment income.
  const roomAtReducedRate = Math.max(0, reducedAnnualBase - Math.min(salaryAnnual, reducedAnnualBase));
  const maximumBaseForPeriod = rule.maximumAnnualBase * ratio;
  const rawBase = Math.max(0, Math.min(selfBase, maximumBaseForPeriod - Math.min(salaryAnnual, maximumBaseForPeriod)));
  // National Insurance formula: X=(Y+B*52%*(t2-t1))/(1+52%*t2). The employee income consumes B first.
  const reducedCandidate = Math.min(rawBase, roomAtReducedRate);
  const adjustedBase = Math.min(rawBase, (rawBase + reducedCandidate * .52 * (rule.nationalFullRate - rule.nationalReducedRate)) / (1 + .52 * rule.nationalFullRate));
  const reducedBase = Math.min(adjustedBase, roomAtReducedRate);
  const fullBase = Math.max(0, adjustedBase - reducedBase);
  const national = reducedBase * rule.nationalReducedRate + fullBase * rule.nationalFullRate;
  const health = reducedBase * rule.healthReducedRate + fullBase * rule.healthFullRate;
  return { periodMonths: months, reducedBaseLimit: round(reducedAnnualBase), maximumBaseForPeriod: round(maximumBaseForPeriod), selfBase:round(selfBase), rawBase:round(rawBase), adjustedBase:round(adjustedBase), reducedBase:round(reducedBase), fullBase:round(fullBase), national:round(national), health:round(health), total:round(national + health), incomeTaxDeduction:round(national * .52) };
}

export function calculateBenefits(input, parameters, months = 12) {
  const rules = parameters.benefits;
  const ratio = periodRatio(months);
  const pensionContributionForPeriod = input.pension * ratio;
  const studyContributionForPeriod = input.studyFund * ratio;
  const uninsuredIncome = Math.max(0, Math.min(input.selfIncome, rules.pensionEligibleIncomeCap * ratio - input.insuredSalary));
  const pensionDeduction = Math.min(pensionContributionForPeriod, uninsuredIncome * rules.pensionDeductionRate);
  const pensionCreditBase = Math.min(Math.max(0, pensionContributionForPeriod - pensionDeduction), uninsuredIncome * rules.pensionCreditRate);
  const pensionCredit = pensionCreditBase * rules.pensionCreditValueRate;
  const studyEligibleIncome = Math.max(0, Math.min(input.selfIncome, rules.studyFundEligibleIncomeCap * ratio - input.studyFundSalaryBase));
  const studyDeduction = Math.min(studyContributionForPeriod, studyEligibleIncome * rules.studyFundDeductionRate);
  const annualPensionRecommendation = ratio ? uninsuredIncome * (rules.pensionDeductionRate + rules.pensionCreditRate) / ratio : 0;
  const annualStudyFundRecommendation = ratio ? studyEligibleIncome * rules.studyFundDeductionRate / ratio : 0;
  return { pensionContributionForPeriod:round(pensionContributionForPeriod), studyContributionForPeriod:round(studyContributionForPeriod), uninsuredIncome:round(uninsuredIncome), pensionDeduction:round(pensionDeduction), pensionCreditBase:round(pensionCreditBase), pensionCredit:round(pensionCredit), studyEligibleIncome:round(studyEligibleIncome), studyDeduction:round(studyDeduction), annualPensionRecommendation:round(annualPensionRecommendation), annualStudyFundRecommendation:round(annualStudyFundRecommendation), totalDeduction:round(pensionDeduction + studyDeduction) };
}

export function calculateSelfEmployedTax(input, parameters) {
  const months = Math.max(0, Math.min(12, input.salaryMonths));
  const salaryAnnual = input.salaryMonthly * months;
  const benefits = calculateBenefits(input, parameters, months);
  const insurance = calculateInsurance(input.selfIncome, salaryAnnual, parameters, months);
  const combinedBeforeBenefits = salaryAnnual + input.selfIncome;
  const combinedTaxable = Math.max(0, combinedBeforeBenefits - benefits.totalDeduction - insurance.incomeTaxDeduction);
  const salaryTax = calculateIncomeTax(salaryAnnual, input.creditPoints, parameters, months);
  const combinedTax = calculateIncomeTax(combinedTaxable, input.creditPoints, parameters, months);
  // Salary occupies the lower brackets first. The business tax is only the increase
  // above the salary's gross tax, reduced by credit points that salary did not use.
  const combinedGrossTax = calculateIncomeTax(combinedTaxable, 0, parameters, months).gross;
  const selfIncomeTaxBeforeCredits = round(Math.max(0, combinedGrossTax - salaryTax.gross));
  const unusedCreditPointsValue = round(Math.max(0, input.creditPoints * parameters.incomeTax.creditPointAnnualValue * (months / 12) - salaryTax.credits));
  const creditPointsUsedForBusiness = round(Math.min(selfIncomeTaxBeforeCredits, unusedCreditPointsValue));
  const incomeTax = round(Math.max(0, selfIncomeTaxBeforeCredits - creditPointsUsedForBusiness - benefits.pensionCredit));
  const beforeBenefitsTax = calculateIncomeTax(combinedBeforeBenefits - insurance.incomeTaxDeduction, input.creditPoints, parameters, months).net;
  const pensionBenefit = round(Math.max(0, beforeBenefitsTax - calculateIncomeTax(combinedBeforeBenefits - insurance.incomeTaxDeduction - benefits.pensionDeduction, input.creditPoints, parameters, months).net + benefits.pensionCredit));
  const studyBenefit = round(Math.max(0, calculateIncomeTax(combinedBeforeBenefits - insurance.incomeTaxDeduction - benefits.pensionDeduction, input.creditPoints, parameters, months).net - combinedTax.net));
  return { salaryAnnual, combinedBeforeBenefits, combinedTaxable, benefits, salaryTax, combinedTax, selfIncomeTaxBeforeCredits, unusedCreditPointsValue, creditPointsUsedForBusiness, incomeTax, insurance, pensionBenefit, studyBenefit, total:round(incomeTax + insurance.total) };
}
