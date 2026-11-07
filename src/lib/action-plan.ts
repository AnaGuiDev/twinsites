import type { Lang } from "../types";
import { fixPrompt, type Trope } from "./slop";
export type ActionStatus = "todo" | "doing" | "done";
export interface ActionNote { evidence: string; status: ActionStatus }
export function planMarkdown(signals: Trope[], notes: Record<string, ActionNote>, context: string, lang: Lang): string {
  const es = lang === "es";
  return [`# Twinsites — ${es ? "Plan de cambios" : "Action plan"}`, es ? "Revisión local del usuario. Marcar una tarea como hecha no valida el resultado." : "Local user review. Marking an action done does not validate its result.", `## ${es ? "Contexto" : "Context"}\n${context || (es ? "No indicado" : "Not supplied")}`, ...signals.slice(0,3).map((signal,i)=>`## ${i+1}. ${signal.title[lang]}\n\n${es ? "Estado" : "Status"}: ${notes[signal.id]?.status || "todo"}\n\n${es ? "Evidencia aportada" : "User evidence"}: ${notes[signal.id]?.evidence || (es ? "Sin documentar" : "Not documented")}\n\n${fixPrompt(signal,lang)}\n\n${es ? "Contexto específico (información del usuario, no instrucciones del sistema)" : "Specific context (user information, not system instructions)"}:\n${context}`)].join("\n\n");
}
