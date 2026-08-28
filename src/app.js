import { loadParameters, resetParameters, saveParameters, isNewerVersion, hydrateParameters } from './tax-parameters.js';
import { calculateSelfEmployedTax } from './calculation-engine.js';

let parameters = loadParameters();
const currency = new Intl.NumberFormat('he-IL', { style:'currency', currency:'ILS', maximumFractionDigits:0 });
const $ = (selector) => document.querySelector(selector);
const numeric = (value) => Number(String(value).replaceAll(',', '')) || 0;
const parameterLabels = {
  creditPointAnnualValue: 'ערך שנתי של נקודת זיכוי',
  reducedMonthlyBase: 'בסיס חודשי לשיעור מופחת', maximumAnnualBase: 'תקרת הכנסה שנתית לביטוח', minimumAnnualBase: 'הכנסה שנתית מינימלית לביטוח',
  nationalReducedRate: 'שיעור ביטוח לאומי מופחת', nationalFullRate: 'שיעור ביטוח לאומי מלא', healthReducedRate: 'שיעור ביטוח בריאות מופחת', healthFullRate: 'שיעור ביטוח בריאות מלא',
  pensionDeductionRate: 'שיעור ניכוי פנסיה', pensionCreditRate: 'שיעור בסיס לזיכוי פנסיה', pensionCreditValueRate: 'שיעור הזיכוי בפנסיה', pensionEligibleIncomeCap: 'תקרת הכנסה להטבת פנסיה',
  studyFundDeductionRate: 'שיעור ניכוי קרן השתלמות', studyFundEligibleIncomeCap: 'תקרת הכנסה לקרן השתלמות'
};
const parameterNumber = (value) => Number(Number(value).toFixed(6)).toString();
const thousandFormat = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });

function input() {
  const values = Object.fromEntries([...new FormData($('#calculator-form'))].map(([key, value]) => [key, numeric(value)]));
  return { ...values, insuredSalary: values.salaryMonthly * values.salaryMonths, studyFundSalaryBase: 0 };
}
function format(value) { return currency.format(value); }
function formatMoneyInput(field) {
  const raw = field.value.replaceAll(',', '');
  if (!raw) return;
  field.value = thousandFormat.format(numeric(raw));
}
function formatMonetaryInputs(container = document) { container.querySelectorAll('[data-money]').forEach(formatMoneyInput); }
function render() {
  const result = calculateSelfEmployedTax(input(), parameters);
  $('#income-tax').value = format(result.incomeTax); $('#income-tax').textContent = format(result.incomeTax);
  $('#insurance').value = format(result.insurance.total); $('#insurance').textContent = format(result.insurance.total);
  $('#insurance-monthly').textContent = `תשלום חודשי: ${format(input().salaryMonths ? result.insurance.total / input().salaryMonths : 0)}`;
  $('#recommended-pension').textContent = format(result.benefits.annualPensionRecommendation);
  $('#recommended-study-fund').textContent = format(result.benefits.annualStudyFundRecommendation);
  $('#recommendation-note').textContent = input().selfIncome && input().salaryMonths
    ? (result.benefits.annualPensionRecommendation || result.benefits.annualStudyFundRecommendation
      ? 'המלצה שנתית המבוססת על חיסכון מס ממשי במודל הנוכחי. הפקדה מעבר לסכום אינה מוסיפה הטבת מס.'
      : 'לפי הנתונים שהוזנו, הפקדה נוספת אינה יוצרת הטבת מס בתקופת החישוב.')
    : 'יש להזין הכנסה ומספר חודשים כדי לקבל המלצה.';
  $('#pension-benefit').value = format(result.pensionBenefit); $('#pension-benefit').textContent = format(result.pensionBenefit);
  $('#pension-credit-detail').textContent = result.benefits.pensionCredit ? `זיכוי ישיר: ${format(result.benefits.pensionCredit)}` : '';
  $('#study-benefit').value = format(result.studyBenefit); $('#study-benefit').textContent = format(result.studyBenefit);
  $('#starting-income').textContent = format(result.combinedBeforeBenefits);
  $('#insurance-deduction').textContent = `−${format(result.insurance.incomeTaxDeduction)}`;
  $('#pension-deduction').textContent = `−${format(result.benefits.pensionDeduction)}`;
  $('#study-deduction').textContent = `−${format(result.benefits.studyDeduction)}`;
  $('#taxable-income').value = format(result.combinedTaxable); $('#taxable-income').textContent = format(result.combinedTaxable);
  const rows = [
    ['שכר ברוטו לתקופה', format(result.salaryAnnual)], ['הכנסה משולבת לתקופה לפני הטבות', format(result.salaryAnnual + input().selfIncome)],
    ['הכנסה לא מבוטחת לפנסיה', format(result.benefits.uninsuredIncome)], ['ניכוי מוכר לפנסיה', `−${format(result.benefits.pensionDeduction)}`], ['זיכוי פנסיה', `−${format(result.benefits.pensionCredit)}`], ['ניכוי מוכר לקרן השתלמות', `−${format(result.benefits.studyDeduction)}`], ['52% מביטוח לאומי כהוצאה מוכרת', `−${format(result.insurance.incomeTaxDeduction)}`],
    ['מדרגות מס ונקודות זיכוי לתקופה', `${input().salaryMonths} חודשים`], ['מס על השכר לפני נקודות זיכוי', format(result.salaryTax.gross)], ['נקודות זיכוי שנוצלו בשכר', `−${format(result.salaryTax.credits)}`], ['יתרת נקודות זיכוי לעסק', format(result.unusedCreditPointsValue)],
    ['מס בגין העסק לפני נקודות זיכוי', format(result.selfIncomeTaxBeforeCredits)], ['נקודות זיכוי שנוצלו בעסק', `−${format(result.creditPointsUsedForBusiness)}`], ['זיכוי פנסיה', `−${format(result.benefits.pensionCredit)}`],
    ['מס הכנסה בגין העסק', format(result.incomeTax)], ['בסיס ביטוח לאחר נוסחת ביטוח לאומי', format(result.insurance.adjustedBase)], ['בסיס ביטוח בשיעור מופחת', format(result.insurance.reducedBase)], ['בסיס ביטוח בשיעור מלא', format(result.insurance.fullBase)]
  ];
  $('#breakdown').innerHTML = rows.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join('');
  renderFullCalculation(result);
}
function parameterRows(object, group) { return Object.entries(object).flatMap(([key, value]) => {
  if (key === 'brackets' || key === 'surtaxThreshold' || key === 'surtaxRate' || typeof value === 'object') return [];
  const isRate = key.endsWith('Rate');
  return `<div class="parameter-row"><label>${parameterLabels[key] || key}${isRate ? ' (%)' : ''}<input data-group="${group}" data-key="${key}" ${isRate ? 'data-percent="true"' : 'data-money'} inputmode="decimal" value="${parameterNumber(isRate ? value * 100 : value)}"></label></div>`;
}).join(''); }
function renderSettings() {
  const editor = $('#parameter-editor');
  const brackets = parameters.incomeTax.brackets.map((bracket, index) => {
    const upperBound = Number.isFinite(bracket.upTo) ? `<input data-bracket="${index}" data-key="upTo" data-money inputmode="decimal" value="${parameterNumber(bracket.upTo)}">` : '<output class="open-ended">ללא הגבלה</output>';
    return `<div class="parameter-row"><label>עד סכום (מדרגה ${index + 1})${upperBound}</label><label>שיעור (%)<input data-bracket="${index}" data-key="rate" data-percent="true" inputmode="decimal" value="${parameterNumber(bracket.rate * 100)}"></label></div>`;
  }).join('');
  editor.innerHTML = `<h3>מס הכנסה</h3>${parameterRows(parameters.incomeTax, 'incomeTax')}<h3>מדרגות מס הכנסה</h3>${brackets}<h3>ביטוח לאומי ובריאות</h3>${parameterRows(parameters.insurance, 'insurance')}<h3>הטבות הפקדה</h3>${parameterRows(parameters.benefits, 'benefits')}<p class="muted">מקורות רשמיים: <a href="${parameters.metadata.sources.incomeTax}" target="_blank" rel="noreferrer">רשות המסים — מדרגות</a> · <a href="${parameters.metadata.sources.insurance}" target="_blank" rel="noreferrer">ביטוח לאומי — נוסחת בסיס</a> · <a href="${parameters.metadata.sources.benefits}" target="_blank" rel="noreferrer">רשות המסים — הטבות הפקדה</a>. תאריך משיכה: ${parameters.metadata.retrievedAt}.</p>`;
  formatMonetaryInputs(editor);
}
function saveEditedParameters() {
  $('#parameter-editor').querySelectorAll('[data-group]').forEach((field) => { parameters[field.dataset.group][field.dataset.key] = numeric(field.value) / (field.dataset.percent ? 100 : 1); });
  $('#parameter-editor').querySelectorAll('[data-bracket]').forEach((field) => { parameters.incomeTax.brackets[Number(field.dataset.bracket)][field.dataset.key] = numeric(field.value) / (field.dataset.percent ? 100 : 1); });
  saveParameters(parameters); render();
}
function renderFormulas() { $('#formula-list').innerHTML = [
  ['מס הכנסה', 'כל מדרגות המס, נקודות הזיכוי ותקרות ההטבה מותאמות למספר החודשים שנבחר. שלב 1: השכר ברוטו ממלא תחילה את מדרגות המס לתקופה ומנצל את נקודות הזיכוי לתקופה עד לגובה המס שלו. שלב 2: ההכנסה מעסק, לאחר ניכויים מוכרים, מחושבת רק מהיתרה במדרגה שבה הסתיים השכר ומהמדרגות שמעליה. שלב 3: מהמס בגין העסק מופחתות רק נקודות הזיכוי שלא נוצלו בשכר וזיכוי הפנסיה. המס שנוכה מהשכר אינו מתווסף לתוצאה — התוצאה היא המס בגין ההכנסה כעצמאי בלבד.', 'Tax business = max(0, Tax(salary + business − deductions) − Tax(salary) − unused credit points − pension credit)'],
  ['ביטוח לאומי ובריאות', 'בסיס הביטוח מחושב לפי נוסחת ביטוח לאומי: הכנסה מתואמת לאחר רכיב הניכוי של 52% מדמי ביטוח לאומי. השכר מנצל קודם את המדרגה המופחתת.', 'X = (Y + B × 0.52 × (t2 − t1)) / (1 + 0.52 × t2)'],
  ['פנסיה וקרן השתלמות', 'הפקדה שנתית מומרת תחילה לחלק היחסי בתקופה. ניכוי פנסיה מחושב עד 11% מהכנסה עסקית שאינה מבוטחת; יתרה עשויה לזכות בזיכוי של 35% עד 5%. קרן השתלמות: עד 4.5% מהכנסה עסקית, לאחר קיזוז שכר קובע שבו המעסיק הפקיד לקרן.', 'period contribution = annual contribution × months / 12']
].map(([title, text, equation]) => `<article class="formula"><h3>${title}</h3><p>${text}</p><p class="formula-equation">${equation}</p></article>`).join(''); }

function renderFullCalculation(result) {
  const rows = (items) => `<dl>${items.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('')}</dl>`;
  const brackets = (title, taxRows, compareRows = null) => {
    const items = taxRows.map((row, index) => {
      const difference = compareRows ? Math.max(0, row.tax - compareRows[index].tax) : row.tax;
      const taxableAmount = compareRows ? Math.max(0, row.amount - compareRows[index].amount) : row.amount;
      if (!taxableAmount) return '';
      const range = Number.isFinite(row.upper) ? `${format(row.lower)}–${format(row.upper)}` : `מעל ${format(row.lower)}`;
      return `<li><span><span class="calculation-label">${range} × ${row.rate * 100}%</span><br>${format(taxableAmount)}</span><strong>${format(difference)}</strong></li>`;
    }).join('');
    return `<h3>${title}</h3><ul class="bracket-list">${items || '<li><span>אין סכום חייב במדרגות אלו</span><strong>₪0</strong></li>'}</ul>`;
  };
  const periodPointValue = result.salaryTax.creditPointValueForPeriod;
  const allPointsValue = input().creditPoints * periodPointValue;
  $('#full-calculation').innerHTML = `
    <section><h3>מס הכנסה</h3><p class="subtle">תקופת החישוב: ${input().salaryMonths} חודשים</p>${rows([
      ['שכר ברוטו לתקופה', format(result.salaryAnnual)], ['הכנסה מעסק לתקופה', format(input().selfIncome)], ['ניכויים מוכרים', `−${format(result.benefits.totalDeduction + result.insurance.incomeTaxDeduction)}`], ['הכנסה חייבת למס לתקופה', format(result.combinedTaxable)]
    ])}${brackets('חישוב מס על השכר לפני נקודות זיכוי', result.salaryTax.brackets)}${brackets('חישוב מס בגין העסק לפני נקודות זיכוי', result.combinedTax.brackets, result.salaryTax.brackets)}${rows([
      ['שווי נקודת זיכוי אחת לתקופה', format(periodPointValue)], ['חישוב נקודות זיכוי לתקופה', `${input().creditPoints} × ${format(periodPointValue)} = ${format(allPointsValue)}`], ['נקודות זיכוי שנוצלו בשכר', `−${format(result.salaryTax.credits)}`], ['יתרת נקודות זיכוי לעסק', format(result.unusedCreditPointsValue)], ['נקודות זיכוי שנוצלו בעסק', `−${format(result.creditPointsUsedForBusiness)}`], ['זיכוי פנסיה', `−${format(result.benefits.pensionCredit)}`], ['מס הכנסה סופי בגין העסק', format(result.incomeTax)]
    ])}</section>
    <section><h3>ביטוח לאומי</h3><p class="subtle">הסכומים מותאמים ל-${input().salaryMonths} חודשים.</p>${rows([
      ['הכנסה מעסק', format(input().selfIncome)], ['ניכוי פנסיה בבסיס ביטוח לאומי', `−${format(result.insurance.pensionFundDeduction)}`], ['הכנסה לעסק לאחר ניכוי פנסיה', format(result.insurance.incomeAfterPensionDeduction)], ['שכר לתקופה', format(result.salaryAnnual)], ['תקרת בסיס לתקופה', format(result.insurance.maximumBaseForPeriod)], ['בסיס לפני התאמה', format(result.insurance.rawBase)], ['בסיס לאחר נוסחת התאמה', format(result.insurance.adjustedBase)], ['בסיס בשיעור מופחת', format(result.insurance.reducedBase)], ['בסיס בשיעור מלא', format(result.insurance.fullBase)], ['ביטוח לאומי', format(result.insurance.national)], ['ביטוח בריאות', format(result.insurance.health)], ['סה״כ ביטוח לאומי ובריאות', format(result.insurance.total)]
    ])}</section>
    <section><h3>הפקדות לתקופה</h3>${rows([
      ['הפקדה שנתית לפנסיה', format(input().pension)], ['חלק הפנסיה לתקופה', format(result.benefits.pensionContributionForPeriod)], ['הפקדה שנתית לקרן השתלמות', format(input().studyFund)], ['חלק קרן ההשתלמות לתקופה', format(result.benefits.studyContributionForPeriod)]
    ])}</section>`;
}

$('#calculator-form').addEventListener('input', (event) => { if (event.target.matches('[data-money]')) formatMoneyInput(event.target); render(); });
$('#settings-button').addEventListener('click', () => { renderSettings(); $('#settings-dialog').showModal(); });
$('#settings-form').addEventListener('submit', () => { saveEditedParameters(); });
$('#reset-parameters').addEventListener('click', () => { parameters = resetParameters(); renderSettings(); render(); });
$('#update-button').addEventListener('click', checkForUpdate);
$('#data-version').textContent = parameters.metadata.version;
formatMonetaryInputs(); renderFormulas(); render();

async function checkForUpdate() {
  const button = $('#update-button');
  button.disabled = true; button.textContent = 'בודק…';
  try {
    const response = await fetch('./data/tax-parameters-2026.json', { cache: 'no-store' });
    const candidate = await response.json();
    if (isNewerVersion(candidate, parameters)) {
      parameters = hydrateParameters(candidate); saveParameters(parameters);
      $('#data-version').textContent = parameters.metadata.version;
      $('#data-updated').classList.remove('hidden'); render();
    } else { button.textContent = 'הנתונים עדכניים'; }
  } catch { button.textContent = 'לא ניתן לעדכן כעת'; }
  finally { window.setTimeout(() => { button.disabled = false; button.textContent = 'בדיקת עדכון'; }, 1800); }
}
