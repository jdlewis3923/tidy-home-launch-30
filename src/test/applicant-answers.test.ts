import { describe, expect, it } from "vitest";
import { answerText, hasAnswer, questionHasAnswer, visibleQuestions, type ApplicationQuestion } from "../lib/applicant-answers";
const question: ApplicationQuestion = { id: "q1", key: "check", section: 2, sort: 1, service: "all", active: true, label_en: "Can you work?", label_es: "¿Puedes trabajar?", type: "choice", options: [{ value: "call_before", en: "Call before the visit", es: "Llamar antes de la visita" }] };
describe("applicant's saved answers", () => {
  it('counts an explicit equipment none answer without counting an unset answer',()=>{
    const equipment={...question,key:'v6.equipment.cleaning',type:'multi'};
    expect(questionHasAnswer(equipment,[])).toBe(true);
    expect(questionHasAnswer(equipment,undefined)).toBe(false);
    expect(answerText([],equipment,'es')).toBe('Todavía no tengo ninguno');
  });
  it("keeps No and zero as real answers, not missing answers", () => {
    expect(hasAnswer(false)).toBe(true); expect(hasAnswer(0)).toBe(true); expect(hasAnswer(" ")).toBe(false);
    expect(answerText(false, question, "en")).toBe("No");
  });
  it("shows the actual choice label in both languages", () => {
    expect(answerText("call_before", question, "en")).toBe("Call before the visit");
    expect(answerText("call_before", question, "es")).toBe("Llamar antes de la visita");
  });
  it("retains answers to removed questions without showing irrelevant unanswered ones", () => {
    const old = { ...question, id: "old", active: false };
    const lawn = { ...question, id: "lawn", service: "lawn" };
    expect(visibleQuestions([question, old, lawn], [{ question_id: "old", value: "Saved history", answered_at: "2026-10-22" }], "cleaning").map(q => q.id)).toEqual(["q1", "old"]);
  });
});