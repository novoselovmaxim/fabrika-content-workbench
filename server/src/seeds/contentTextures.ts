import { db } from "../db.js";
import { contentTextures } from "../schema.js";
import { sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";

const TEXTURES = [
  { code: "case", name: "Кейс и пример", description: "Реальная история с конкретным результатом", hantStages: [4,5,6,8,9] },
  { code: "numbers", name: "Цифры и масштаб", description: "Факты с конкретными числами, статистика", hantStages: [3,4,5,9] },
  { code: "process_fragment", name: "Фрагмент процесса", description: "Показать внутреннее устройство работы", hantStages: [5,7,8] },
  { code: "mechanism", name: "Механика 'почему так'", description: "Причинно-следственная цепочка", hantStages: [2,3,4] },
  { code: "applicability", name: "Условия применимости", description: "Работает если..., вот где ломается...", hantStages: [3,4] },
  { code: "anti_case", name: "Антикейс", description: "Пример как делать не надо, с разбором ошибок", hantStages: [2,3,4,6] },
  { code: "client_phrases", name: "Фразы клиентов", description: "Реальные слова и возражения аудитории", hantStages: [1,2,5,6] },
  { code: "market_observations", name: "Рыночные наблюдения", description: "Разбор конкурента, примеры из ниши", hantStages: [3,4,5] },
  { code: "artifact", name: "Артефакт процесса", description: "Чек-лист, шаблон, инструмент как материальное доказательство", hantStages: [5,7] },
  { code: "narrative", name: "История и нарратив", description: "Личная история с завязкой, конфликтом, развязкой", hantStages: [1,2,6,9] },
  { code: "insight", name: "Неочевидный инсайт", description: "Что знают только практики, что все думают неправильно", hantStages: [3,4,5] },
  { code: "background", name: "Контекст и бэкграунд", description: "Исторический контекст, что происходит в индустрии", hantStages: [1,3] },
  { code: "taboo", name: "Табу и ограничения", description: "Что нельзя делать и почему", hantStages: [2,3,4] },
  { code: "backstage", name: "Внутренняя кухня", description: "Backstage, закулисье процесса", hantStages: [5,7,8] },
  { code: "typology", name: "Типология и классификация", description: "3 типа X, 4 вида Y — структурирование знания", hantStages: [3,4] },
  { code: "document_breakdown", name: "Разбор по документам", description: "Как расследование: договор, КП — с разбором ошибок", hantStages: [4,5] },
  { code: "micro_experiment", name: "Микро-эксперимент", description: "Небольшой тест с измеримым результатом", hantStages: [3,5] },
  { code: "authority", name: "Авторитетный источник", description: "Ссылка на исследование, мнение эксперта", hantStages: [3,4,5] },
  { code: "metaphor", name: "Метафора и аналогия", description: "Объяснение сложного через простое и знакомое", hantStages: [1,2,3] },
  { code: "emotions", name: "Эмоции и ощущения", description: "Что чувствует человек в этой ситуации", hantStages: [1,2,6] },
  { code: "algorithm", name: "Формула и алгоритм", description: "Пошаговая инструкция, чёткая последовательность", hantStages: [3,7,8] },
  { code: "cultural_ref", name: "Культурный референс", description: "Отсылка к кино, книге, событию — как точка входа", hantStages: [1,9] },
  { code: "warning", name: "Предостережение и красный флаг", description: "Сигналы что что-то идёт не так", hantStages: [2,3,5] },
  { code: "alternative_views", name: "Альтернативные точки зрения", description: "Показать что есть разные подходы", hantStages: [3,4] },
  { code: "shadow_side", name: "Теневая сторона", description: "То, о чём обычно не говорят публично", hantStages: [4,5] },
  { code: "limitations", name: "Ограничения", description: "Честный разговор о границах метода/продукта", hantStages: [4,5,6] },
  { code: "expert_ritual", name: "Личный ритуал эксперта", description: "Привычки и практики профессионала", hantStages: [5,9] },
  { code: "micro_expertise", name: "Микро-экспертиза", description: "Инструменты профи, профессиональные байки", hantStages: [5,9] },
  { code: "incentive_mechanism", name: "Механика стимулов", description: "Почему люди делают то, что делают — через интересы", hantStages: [2,3,4] },
  { code: "consequence_ladder", name: "Лестница последствий", description: "Цепочка от маленькой ошибки к большой проблеме", hantStages: [2,3] },
  { code: "provocative_fact", name: "Провокационный факт", description: "Шокирующая правда, то что не принято говорить", hantStages: [1,2] },
  { code: "micro_detail", name: "Микродеталь меняющая всё", description: "Одна маленькая деталь с большим эффектом", hantStages: [4,5,7] },
  { code: "news_adaptation", name: "Адаптация новости", description: "Актуальные новости + применение к своей теме", hantStages: [1,9] },
];

export function seedContentTextures(): void {
  const count = db.select({ count: sql<number>`count(*)` }).from(contentTextures).get();
  if (count && count.count > 0) return;

  for (const t of TEXTURES) {
    db.insert(contentTextures).values({
      id: uuid(),
      code: t.code,
      name: t.name,
      description: t.description,
      hantStages: JSON.stringify(t.hantStages),
    }).run();
  }
  console.log(`[seed] Seeded ${TEXTURES.length} content textures`);
}
