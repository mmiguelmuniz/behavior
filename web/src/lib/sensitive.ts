import { normalize } from "./text";

// Lista portada da versão original. É só um alerta: não substitui treinamento.
const SENSITIVE: Array<{ key: "health" | "family" | "belief" | "id"; re: RegExp }> = [
  { key: "health", re: /\b(diagnos\w*|laudo\w*|tdah|adhd|autis\w*|asperger|dislexia|dyslexia|depress\w*|ansiedade|anxiety|medicac\w*|medicament\w*|medication\w*|remedio\w*|terapia|terapeuta|therap\w*|psicolog\w*|psycholog\w*|psiquiatr\w*|psychiatr\w*|transtorno\w*|disorders?|deficiencia|disabilit\w*|doenca\w*|illness|hospital\w*|cirurgia|surgery|cancer|hiv|epilep\w*|diabet\w*|automutila\w*|self[- ]harm|suicid\w*)\b/ },
  { key: "family", re: /\b(divorc\w*|custodia|custody|separacao dos pais|parents? (?:are |is )?separat\w*|pensao alimenticia|violencia domestica|domestic violence|abuso|abuse\w*)\b/ },
  { key: "belief", re: /\b(religi\w*|igreja|church|mosque|mesquita|sinagoga|candomble|umbanda|orientacao sexual|sexual orientation|lgbt\w*|politic\w*|partido|sindicat\w*|raca|racial|etnia|ethnic\w*)\b/ },
  { key: "id", re: /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\b\d{10,11}\b/ },
];

export function sensitiveKinds(text: string) {
  const plain = normalize(text);
  return SENSITIVE.filter((s) => s.re.test(plain)).map((s) => s.key);
}
