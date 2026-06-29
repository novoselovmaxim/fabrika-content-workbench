import { db } from "../db.js";
import { funnels } from "../schema.js";
import { sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";

interface FunnelSeed {
  name: string;
  type: string;
  description: string;
  stages: { order: number; name: string; hantStage: number | null; goal: string; contentTypes: string[] }[];
  durationDays: number | null;
  rules: string;
  platformRecommendations: Record<string, boolean>;
  ordering: number;
}

const FUNNELS: FunnelSeed[] = [
  {
    name: "Lead Nurturing (CRM)",
    type: "crm",
    description: "Макро-воронка полного цикла. Все остальные воронки встраиваются внутрь неё на этапе 'Беседа'.",
    stages: [
      { order: 1, name: "Рукопожатие", hantStage: 1, goal: "Конвертировать посетителя в заинтересованный лид-контакт", contentTypes: ["post", "reel", "stories"] },
      { order: 2, name: "Беседа", hantStage: 3, goal: "Потребитель потребляет полезный контент на разных платформах", contentTypes: ["post", "carousel", "reel"] },
      { order: 3, name: "Контакт", hantStage: 7, goal: "Потребитель сам выходит на контакт, предоставить информацию для сделки", contentTypes: ["post", "stories"] },
      { order: 4, name: "Квалификация", hantStage: 6, goal: "Выяснить конкретные задачи и потребности клиента", contentTypes: ["post", "stories"] },
      { order: 5, name: "Закрытие сделки", hantStage: 8, goal: "Завершить сделку", contentTypes: ["post"] },
    ],
    durationDays: null,
    rules: "Всегда — это базовая структура, в которую вписываются все остальные воронки. Долгосрочная, несколько месяцев.",
    platformRecommendations: { instagram: true, telegram: true, dzen: true, vk: true },
    ordering: 1,
  },
  {
    name: "VSL (Video Sales Letter)",
    type: "micro_warmup",
    description: "Минималистичная связка для прямой продажи через видео.",
    stages: [
      { order: 1, name: "Видео-продажа", hantStage: 7, goal: "Продать через длинное экспертное видео", contentTypes: ["reel", "post"] },
    ],
    durationDays: null,
    rules: "Тёплая и горячая аудитория, уже знакомая с темой. Хорошо работает в связке с трафиком.",
    platformRecommendations: { instagram: true, telegram: true, dzen: false, vk: false },
    ordering: 2,
  },
  {
    name: "Микронишевый канал",
    type: "micro_warmup",
    description: "Закрытый Telegram-канал под узкую нишу. Работает по правилу 7-11-4.",
    stages: [
      { order: 1, name: "Вход через контент", hantStage: 1, goal: "Привлечь через клипы и видео, ссылка в TG-канал", contentTypes: ["reel", "post"] },
      { order: 2, name: "Микроанкетирование", hantStage: 5, goal: "Квалификация: бюджет, потребность, кто принимает решение", contentTypes: ["post"] },
      { order: 3, name: "Созвон", hantStage: 7, goal: "Продажа через созвон", contentTypes: ["post"] },
    ],
    durationDays: 28,
    rules: "B2B и экспертные продукты, где важна квалификация до продажи. Прогрев 2-4 недели до созвона.",
    platformRecommendations: { instagram: true, telegram: true, dzen: false, vk: false },
    ordering: 3,
  },
  {
    name: "OPT IN (лид-магнит)",
    type: "micro_warmup",
    description: "Классическая воронка захвата контакта с немедленной монетизацией.",
    stages: [
      { order: 1, name: "Лид-магнит", hantStage: 1, goal: "Захват контакта через бесплатный материал", contentTypes: ["post", "carousel", "stories"] },
      { order: 2, name: "OFFER", hantStage: 7, goal: "Недорогой продукт до 3000 р. — окупить затраты на привлечение", contentTypes: ["post", "stories"] },
      { order: 3, name: "ONE CLICK UPSELL", hantStage: 8, goal: "Продажа основного продукта x5-10 от цены оффера", contentTypes: ["post"] },
    ],
    durationDays: null,
    rules: "Холодный трафик, первый контакт с аудиторией. Цель — не заработать на оффере, а окупить привлечение.",
    platformRecommendations: { instagram: true, telegram: true, dzen: false, vk: false },
    ordering: 4,
  },
  {
    name: "Книжная воронка",
    type: "micro_warmup",
    description: "Вариант OPT IN, где лид-магнит — книга с материалами внутри.",
    stages: [
      { order: 1, name: "Лид-магнит (книга)", hantStage: 1, goal: "Захват контакта через книгу с чек-листами и шаблонами", contentTypes: ["carousel", "post"] },
      { order: 2, name: "SALE", hantStage: 7, goal: "Недорогой продукт до 3000 р.", contentTypes: ["post", "stories"] },
      { order: 3, name: "CALL", hantStage: 7, goal: "Созвон на основной продукт", contentTypes: ["post"] },
    ],
    durationDays: null,
    rules: "Экспертные ниши, где есть что дать в виде методологии или инструментов.",
    platformRecommendations: { instagram: true, telegram: true, dzen: false, vk: false },
    ordering: 5,
  },
  {
    name: "Длинное продающее письмо / Лендинг (по лестнице Ханта)",
    type: "micro_warmup",
    description: "Лендинг по принципу: чем дальше скроллит — тем больше отваливается. Это нормально.",
    stages: [
      { order: 1, name: "Микропроблема (крючок)", hantStage: 2, goal: "Зацепить решением микропроблемы", contentTypes: ["post"] },
      { order: 2, name: "Лестница решений", hantStage: 4, goal: "Последовательно решать проблемы, вести к офферу", contentTypes: ["carousel", "post"] },
      { order: 3, name: "Лид-магнит", hantStage: 7, goal: "Недорогой вход", contentTypes: ["post"] },
      { order: 4, name: "Оффер + созвон", hantStage: 8, goal: "Продажа", contentTypes: ["post"] },
    ],
    durationDays: null,
    rules: "Аудитория на стадиях 3-5 по лестнице Ханта (ищет решение, выбирает среди вариантов, выбирает поставщика).",
    platformRecommendations: { instagram: true, telegram: true, dzen: false, vk: false },
    ordering: 6,
  },
  {
    name: "Обратная воронка",
    type: "micro_warmup",
    description: "Даём первую часть бесплатно, вторую — за контакт.",
    stages: [
      { order: 1, name: "Первая часть (бесплатно)", hantStage: 3, goal: "Дать ценность, показать экспертизу", contentTypes: ["reel", "post", "carousel"] },
      { order: 2, name: "Вторая часть (подписка)", hantStage: 5, goal: "Захват контакта через необходимость получить продолжение", contentTypes: ["post", "stories"] },
      { order: 3, name: "Созвон", hantStage: 7, goal: "Продажа", contentTypes: ["post"] },
    ],
    durationDays: null,
    rules: "Когда есть сильный образовательный контент, который можно разбить на части. Работает на холодную и тёплую аудиторию.",
    platformRecommendations: { instagram: true, telegram: true, dzen: true, vk: false },
    ordering: 7,
  },
  {
    name: "Вебинарная — не имеющая значения",
    type: "micro_warmup",
    description: "Воронка, где вебинар — не главное. Продажа происходит до него или вместо него.",
    stages: [
      { order: 1, name: "Посадочная страница", hantStage: 3, goal: "Обещание научить навыку", contentTypes: ["post", "carousel"] },
      { order: 2, name: "Лид-магнит", hantStage: 5, goal: "Захват контакта", contentTypes: ["post", "stories"] },
      { order: 3, name: "Продажа до вебинара", hantStage: 7, goal: "Предложение купить недорогой продукт / выйти на созвон до вебинара", contentTypes: ["post", "stories"] },
      { order: 4, name: "Вебинар (подстраховка)", hantStage: 8, goal: "Продажа для тех, кто не купил раньше", contentTypes: ["post", "stories"] },
    ],
    durationDays: null,
    rules: "Тёплая аудитория, которую нужно дожать. Есть сильный оффер. Продажа закрывается до вебинара.",
    platformRecommendations: { instagram: true, telegram: true, dzen: false, vk: false },
    ordering: 8,
  },
  {
    name: "Вебинарная — разбор продукта",
    type: "micro_warmup",
    description: "Классическая вебинарная воронка с акцентом на разборе.",
    stages: [
      { order: 1, name: "Посадочная страница", hantStage: 3, goal: "Обещание научить навыку", contentTypes: ["post", "carousel"] },
      { order: 2, name: "Лид-магнит", hantStage: 5, goal: "Захват контакта", contentTypes: ["post", "stories"] },
      { order: 3, name: "Цепочка писем", hantStage: 6, goal: "Прогрев до вебинара", contentTypes: ["post"] },
      { order: 4, name: "Вебинар с разбором", hantStage: 8, goal: "Продажа внутри вебинара", contentTypes: ["post", "stories"] },
    ],
    durationDays: null,
    rules: "Холодная и тёплая аудитория. Подходит для сложных продуктов, которые нужно объяснять.",
    platformRecommendations: { instagram: true, telegram: true, dzen: false, vk: false },
    ordering: 9,
  },
  {
    name: "Бронирование звонков",
    type: "micro_warmup",
    description: "Цель — не продать сразу, а получить квалифицированный созвон.",
    stages: [
      { order: 1, name: "Оффер", hantStage: 4, goal: "Привлечь обещанием конкретного результата за срок", contentTypes: ["carousel", "post", "reel"] },
      { order: 2, name: "Лендинг с объяснением", hantStage: 5, goal: "Объяснить как работает метод", contentTypes: ["post", "carousel"] },
      { order: 3, name: "Квалификация", hantStage: 6, goal: "Бюджет / потребность / кто принимает решение / время", contentTypes: ["stories", "post"] },
      { order: 4, name: "Форма записи", hantStage: 7, goal: "Бронирование созвона", contentTypes: ["post", "stories"] },
    ],
    durationDays: null,
    rules: "B2B, высокий чек, длинный цикл сделки. Продукт требует объяснения перед покупкой.",
    platformRecommendations: { instagram: true, telegram: true, dzen: false, vk: false },
    ordering: 10,
  },
  {
    name: "Социальная воронка",
    type: "micro_warmup",
    description: "Самая массовая воронка для соцсетей. Короткий контент ведёт к длинному, длинный — продаёт.",
    stages: [
      { order: 1, name: "Короткие видео", hantStage: 1, goal: "Привлечение внимания, ничего не продаём", contentTypes: ["reel"] },
      { order: 2, name: "Основное видео", hantStage: 3, goal: "Раскрытие темы полностью, CTA", contentTypes: ["carousel", "post"] },
    ],
    durationDays: null,
    rules: "Instagram, YouTube, TikTok. Холодная аудитория. Работает как точка входа в любую другую воронку. Постоянная, без конечной точки.",
    platformRecommendations: { instagram: true, telegram: false, dzen: false, vk: true },
    ordering: 11,
  },
  {
    name: "Челлендж воронка",
    type: "micro_warmup",
    description: "Продажа через ограниченное по времени участие в совместном действии.",
    stages: [
      { order: 1, name: "Сбор комьюнити", hantStage: 1, goal: "Привлечь людей к совместному действию", contentTypes: ["reel", "post", "stories"] },
      { order: 2, name: "Челлендж", hantStage: 5, goal: "Участники делятся результатом, нарастает социальное доказательство", contentTypes: ["stories", "post"] },
      { order: 3, name: "Продажа на 3-5 день", hantStage: 7, goal: "Продажа внутри челленджа", contentTypes: ["post", "stories"] },
    ],
    durationDays: 5,
    rules: "Ниши с быстрым измеримым результатом (похудение, деньги, навык). Тёплая аудитория или ретаргет.",
    platformRecommendations: { instagram: true, telegram: true, dzen: false, vk: false },
    ordering: 12,
  },
  {
    name: "Воронка сообщества",
    type: "micro_warmup",
    description: "Монетизация через переход из бесплатного канала в платный.",
    stages: [
      { order: 1, name: "Бесплатный контент", hantStage: 1, goal: "Дать ценность через соцсети и YouTube", contentTypes: ["reel", "post", "carousel"] },
      { order: 2, name: "Прогрев в платный канал", hantStage: 5, goal: "Показать ценность премиум-доступа", contentTypes: ["post", "stories"] },
      { order: 3, name: "Платный канал", hantStage: 9, goal: "Основная монетизация через подписку", contentTypes: ["post", "carousel"] },
    ],
    durationDays: null,
    rules: "Эксперты с большой аудиторией, долгосрочная стратегия монетизации.",
    platformRecommendations: { instagram: true, telegram: true, dzen: true, vk: true },
    ordering: 13,
  },
  {
    name: "Разборы — вебинар",
    type: "micro_warmup",
    description: "Воронка через публичные разборы кейсов.",
    stages: [
      { order: 1, name: "Трафик", hantStage: 1, goal: "Привлечение через соцсети и рекламу", contentTypes: ["reel", "post"] },
      { order: 2, name: "Форма-анкета", hantStage: 5, goal: "Сбор заявок на разбор", contentTypes: ["post", "stories"] },
      { order: 3, name: "Напоминания", hantStage: 6, goal: "Прогрев перед вебинаром", contentTypes: ["stories", "post"] },
      { order: 4, name: "Вебинар с разборами", hantStage: 8, goal: "Продажа через реальные кейсы похожих людей", contentTypes: ["post", "stories"] },
    ],
    durationDays: null,
    rules: "Экспертные ниши. Хорошо работает когда аудитория видит реальные кейсы похожих на себя людей.",
    platformRecommendations: { instagram: true, telegram: false, dzen: false, vk: false },
    ordering: 14,
  },
  {
    name: "Воронка в Директ через кодовое слово",
    type: "micro_warmup",
    description: "Воронка через Instagram Direct с квалификацией внутри переписки.",
    stages: [
      { order: 1, name: "Точки входа", hantStage: 1, goal: "Кодовое слово в профиле, закреплённые посты, рилсы", contentTypes: ["reel", "post", "stories"] },
      { order: 2, name: "Кодовое слово в директ", hantStage: 3, goal: "Бот выдаёт материал", contentTypes: ["stories"] },
      { order: 3, name: "Анкетирование", hantStage: 5, goal: "Квалификация: как узнал / зачем / почему решил", contentTypes: ["stories"] },
      { order: 4, name: "5 минут пользы", hantStage: 6, goal: "Голосовое или текст от эксперта", contentTypes: ["stories"] },
      { order: 5, name: "Созвон", hantStage: 7, goal: "Продажа", contentTypes: ["stories"] },
    ],
    durationDays: null,
    rules: "Instagram, малый и средний бизнес, личный бренд. Работает на тёплую и частично холодную аудиторию через рилсы.",
    platformRecommendations: { instagram: true, telegram: false, dzen: false, vk: false },
    ordering: 15,
  },
  {
    name: "Самая простая воронка",
    type: "micro_warmup",
    description: "Работает только на прогретую аудиторию. Без посадочных страниц и автоматизации.",
    stages: [
      { order: 1, name: "Прямое предложение", hantStage: 6, goal: "Опубликовать пост: 'Я помогу X получить Y за Z'", contentTypes: ["post", "stories"] },
      { order: 2, name: "Кодовое слово", hantStage: 7, goal: "Заинтересованный пишет кодовое слово", contentTypes: ["stories"] },
      { order: 3, name: "КП", hantStage: 8, goal: "Получает документ: сроки, гарантии, результат, стоимость", contentTypes: ["post"] },
      { order: 4, name: "Предоплата", hantStage: 8, goal: "Ссылка на предоплату", contentTypes: ["post"] },
    ],
    durationDays: null,
    rules: "Уже есть лояльная аудитория. Новый продукт или оффер, который нужно быстро протестировать.",
    platformRecommendations: { instagram: true, telegram: true, dzen: false, vk: false },
    ordering: 16,
  },
];

export function seedFunnels(): void {
  const count = db.select({ count: sql<number>`count(*)` }).from(funnels).get();
  if (count && count.count > 0) return;

  for (const f of FUNNELS) {
    db.insert(funnels).values({
      id: uuid(),
      name: f.name,
      type: f.type,
      description: f.description,
      stages: JSON.stringify(f.stages),
      durationDays: f.durationDays,
      rules: f.rules,
      platformRecommendations: JSON.stringify(f.platformRecommendations),
      ordering: f.ordering,
      active: 1,
    }).run();
  }
  console.log(`[seed] Seeded ${FUNNELS.length} funnels`);
}
