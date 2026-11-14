const round = (value) => Math.round(value * 100) / 100;
const periodRatio = (months) => Math.max(0, Math.min(12, months)) / 12;
const bracketRows = (income, brackets) => brackets.map((bracket, index) => {
  const lower = index === 0 ? 0 : (Number.isFinite(brackets[index - 1].upTo) ? brackets[index - 1].upTo : Infinity);
  const upper = Number.isFinite(bracket.upTo) ? bracket.upTo : Infinity;
  const amount = Math.max(0, Math.min(income, upper) - lower);
  return { lower, upper, rate: bracket.rate, amount: round(amount), tax: round(amount * bracket.rate) };
});

export function calculateIncomeTax(taxableIncome, creditPoints, parameters, months = 12) {
  const { incomeTax } = parameters;
  const ratio = periodRatio(months);
  const bracketsForPeriod = incomeTax.brackets.map((bracket) => ({ ...bracket, upTo: Number.isFinite(bracket.upTo) ? bracket.upTo * ratio : Infinity }));
  const brackets = bracketRows(taxableIncome, bracketsForPeriod);
  const gross = brackets.reduce((total, bracket) => total + bracket.tax, 0);
  const credits = creditPoints * incomeTax.creditPointAnnualValue * ratio;
  return { gross: round(gross), credits: round(Math.min(gross, credits)), net: round(Math.max(0, gross - credits)), creditPointValueForPeriod: round(incomeTax.creditPointAnnualValue * ratio), brackets };
}

export function calculateInsurance(selfIncome, salaryForRateAndCap, parameters, months = 12, isOldAgePensionRecipient = false) {
  const rule = parameters.insurance;
  const ratio = periodRatio(months);
  const reducedAnnualBase = rule.reducedMonthlyBase * months;
  const maximumBaseForPeriod = rule.maximumAnnualBase * ratio;
  if (isOldAgePensionRecipient) {
    return { periodMonths: months, exempt: true, reducedBaseLimit: 0, maximumBaseForPeriod: 0, selfBase: 0, rawBase: 0, adjustedBase: 0, reducedBase: 0, fullBase: 0, national: 0, health: 0, total: 0, incomeTaxDeduction: 0 };
  }
  const selfBase = Math.max(rule.minimumAnnualBase * ratio, selfIncome);
  // Salary is used only to select the self-employed rate tranche and remaining maximum base.
  // It is never added to the insurance base or charged by this calculation.
  const roomAtReducedRate = Math.max(0, reducedAnnualBase - Math.min(salaryForRateAndCap, reducedAnnualBase));
  const rawBase = Math.max(0, Math.min(selfBase, maximumBaseForPeriod - Math.min(salaryForRateAndCap, maximumBaseForPeriod)));
  // National Insurance formula: X=(Y+B*52%*(t2-t1))/(1+52%*t2), where Y is self-employed income only.
  const reducedCandidate = Math.min(rawBase, roomAtReducedRate);
  const adjustedBase = Math.min(rawBase, (rawBase + reducedCandidate * .52 * (rule.nationalFullRate - rule.nationalReducedRate)) / (1 + .52 * rule.nationalFullRate));
  const reducedBase = Math.min(adjustedBase, roomAtReducedRate);
  const fullBase = Math.max(0, adjustedBase - reducedBase);
  const national = reducedBase * rule.nationalReducedRate + fullBase * rule.nationalFullRate;
  const health = reducedBase * rule.healthReducedRate + fullBase * rule.healthFullRate;
  return { periodMonths: months, exempt: false, reducedBaseLimit: round(reducedAnnualBase), maximumBaseForPeriod: round(maximumBaseForPeriod), selfBase:round(selfBase), rawBase:round(rawBase), adjustedBase:round(adjustedBase), reducedBase:round(reducedBase), fullBase:round(fullBase), national:round(national), health:round(health), total:round(national + health), incomeTaxDeduction:round(national * .52) };
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
  return { pensionContributionForPeriod:round(pensionContributionForPeriod), studyContributionForPeriod:round(studyContributionForPeriod), uninsuredIncome:round(uninsuredIncome), pensionDeduction:round(pensionDeduction), pensionCreditBase:round(pensionCreditBase), pensionCredit:round(pensionCredit), studyEligibleIncome:round(studyEligibleIncome), studyDeduction:round(studyDeduction), totalDeduction:round(pensionDeduction + studyDeduction) };
}

function calculateCore(input, parameters) {
  const months = Math.max(0, Math.min(12, input.salaryMonths));
  const salaryAnnual = input.salaryMonthly * months;
  const benefits = calculateBenefits(input, parameters, months);
  // Recognized pension and study-fund deductions reduce the business income base for National Insurance.
  const insuranceIncomeAfterContributionDeductions = Math.max(0, input.selfIncome - benefits.pensionDeduction - benefits.studyDeduction);
  const insurance = calculateInsurance(insuranceIncomeAfterContributionDeductions, salaryAnnual, parameters, months, input.oldAgePension);
  insurance.pensionFundDeduction = benefits.pensionDeduction;
  insurance.studyFundDeduction = benefits.studyDeduction;
  insurance.incomeAfterContributionDeductions = round(insuranceIncomeAfterContributionDeductions);
  // The actual National Insurance payment is entered per month; the period total is monthly × months.
  const hasActualInsurancePaid = Number.isFinite(input.actualInsuranceMonthly);
  insurance.deductionSource = hasActualInsurancePaid ? 'actual-paid' : 'estimated';
  if (hasActualInsurancePaid) {
    insurance.actualPaidMonthly = round(input.actualInsuranceMonthly);
    insurance.actualPaidTotal = round(input.actualInsuranceMonthly * months);
    insurance.actualPaidNational = round(insurance.actualPaidTotal * .65);
    // The entered amount includes health insurance. Until the split is known, 65% is treated as National Insurance.
    // This actual-payment deduction replaces, rather than supplements, the estimated 52% deduction.
    insurance.incomeTaxDeduction = round(insurance.actualPaidNational * .52);
  }
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
  return { months, salaryAnnual, combinedBeforeBenefits, combinedTaxable, benefits, salaryTax, combinedTax, selfIncomeTaxBeforeCredits, unusedCreditPointsValue, creditPointsUsedForBusiness, incomeTax, insurance, total:round(incomeTax + insurance.total) };
}

function annualRecommendation(input, parameters, field, cap) {
  if (!cap || !input.salaryMonths) return 0;
  const baselineInput = { ...input, pension: 0, studyFund: 0 };
  const baseline = calculateCore(baselineInput, parameters).total;
  const saving = (value) => Math.max(0, baseline - calculateCore({ ...baselineInput, [field]: value }, parameters).total);
  const maximumSaving = saving(cap);
  if (maximumSaving < .01) return 0;
  let low = 0;
  let high = cap;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (maximumSaving - saving(middle) <= .01) high = middle;
    else low = middle;
  }
  return round(high);
}

export function calculateSelfEmployedTax(input, parameters) {
  const result = calculateCore(input, parameters);
  // Attribute each benefit to its own contribution while retaining the other contribution.
  // This shows the actual reduction in both income tax and National Insurance.
  const withoutPension = calculateCore({ ...input, pension: 0 }, parameters);
  const withoutStudyFund = calculateCore({ ...input, studyFund: 0 }, parameters);
  result.pensionBenefit = {
    incomeTax: round(Math.max(0, withoutPension.incomeTax - result.incomeTax)),
    insurance: round(Math.max(0, withoutPension.insurance.total - result.insurance.total)),
    total: round(Math.max(0, withoutPension.total - result.total))
  };
  result.studyBenefit = {
    incomeTax: round(Math.max(0, withoutStudyFund.incomeTax - result.incomeTax)),
    insurance: round(Math.max(0, withoutStudyFund.insurance.total - result.insurance.total)),
    total: round(Math.max(0, withoutStudyFund.total - result.total))
  };
  const ratio = periodRatio(result.months);
  const pensionCap = ratio ? result.benefits.uninsuredIncome * (parameters.benefits.pensionDeductionRate + parameters.benefits.pensionCreditRate) / ratio : 0;
  const studyFundCap = ratio ? result.benefits.studyEligibleIncome * parameters.benefits.studyFundDeductionRate / ratio : 0;
  result.benefits.annualPensionRecommendation = annualRecommendation(input, parameters, 'pension', pensionCap);
  result.benefits.annualStudyFundRecommendation = annualRecommendation(input, parameters, 'studyFund', studyFundCap);
  result.settlement = calculateSettlement(result, input);
  return result;
}

// Balance for the period: calculated amount minus the amount already paid.
// A positive balance is still due; a negative balance is expected back.
function calculateSettlement(result, input) {
  const line = (calculated, paid) => Number.isFinite(paid)
    ? { entered: true, calculated, paid: round(paid), balance: round(calculated - paid) }
    : { entered: false, calculated, paid: 0, balance: 0 };
  const incomeTax = line(result.incomeTax, input.incomeTaxPaid);
  const insurance = line(result.insurance.total, result.insurance.deductionSource === 'actual-paid' ? result.insurance.actualPaidTotal : null);
  return { incomeTax, insurance, entered: incomeTax.entered || insurance.entered, balance: round(incomeTax.balance + insurance.balance) };
}
