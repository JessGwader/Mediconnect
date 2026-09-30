/**
 * Prescription safety checks: drug-interaction and allergy-conflict
 * detection. This is a plain rule-based lookup — not part of any AI feature
 * — kept deliberately deterministic since it gates whether a prescription
 * can be saved without an explicit clinician override.
 */

const INTERACTIONS = [
  ["Warfarin", "Aspirin", "Increased bleeding risk"],
  ["Sumatriptan", "Sertraline", "Risk of serotonin syndrome"],
  ["Lisinopril", "Ibuprofen", "Reduced antihypertensive effect / renal risk"],
  ["Atorvastatin", "Clarithromycin", "Increased statin toxicity risk"],
];

const ALLERGY_CLASS = {
  "Penicillin": ["Amoxicillin", "Ampicillin", "Penicillin"],
  "Sulfa drugs": ["Sulfamethoxazole", "Sulfasalazine"],
  "Latex": [],
};

function firstWord(s) {
  return (s || "").split(" ")[0];
}

/**
 * @param {string} medName - the medication about to be prescribed
 * @param {string[]} allergies - patient's documented allergies
 * @param {object[]} activePrescriptions - [{ medication, status }]
 * @returns {{level:'critical'|'warning', text:string}[]}
 */
function checkPrescriptionSafety(medName, allergies, activePrescriptions) {
  const warnings = [];
  const newFirst = firstWord(medName).toLowerCase();

  allergies.forEach((allergy) => {
    const cls = ALLERGY_CLASS[allergy] || [];
    if (cls.some((c) => newFirst.includes(c.toLowerCase())) || newFirst.includes(allergy.toLowerCase())) {
      warnings.push({ level: "critical", text: `Allergy conflict: patient has a documented allergy to "${allergy}".` });
    }
  });

  activePrescriptions.forEach((p) => {
    const otherFirst = firstWord(p.medication).toLowerCase();
    if (otherFirst === newFirst) {
      warnings.push({ level: "warning", text: `Duplicate medication: patient already has an active prescription for ${p.medication}.` });
    }
    INTERACTIONS.forEach(([a, b, risk]) => {
      const pair = [newFirst, otherFirst];
      if (pair.includes(a.toLowerCase()) && pair.includes(b.toLowerCase())) {
        warnings.push({ level: "critical", text: `Interaction risk with ${p.medication}: ${risk}.` });
      }
    });
  });

  return warnings;
}

module.exports = { checkPrescriptionSafety };
