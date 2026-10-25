import { ChoiceQuestion, type QuestionSet } from "@/engines/jev/types";

export function bindChunks(questions: QuestionSet, chunks: { text: string }[]): QuestionSet {
  const criteria: Record<string, string> = {};
  for (let index = 0; index < 8; index += 1) {
    criteria[`c${index}`] = (chunks[index]?.text ?? "Unused slot.").slice(0, 180);
  }
  const current = questions.best_chunk;
  const best = ChoiceQuestion.parse({
    type: "choice",
    instructions: current && current.type === "choice" ? current.instructions : "Which chunk best answers the query?",
    criteria,
  });
  return { ...questions, best_chunk: best };
}
