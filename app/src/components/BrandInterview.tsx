import { useState } from "react";

interface Answer {
  question: string;
  answer: string;
}

interface BrandInterviewProps {
  onComplete: (answers: Answer[]) => void;
  onCancel: () => void;
}

const QUESTIONS = [
  {
    id: 1,
    text: "Как называется ваш проект/блог?",
    hint: "Название, по которому вас будут узнавать",
    field: "name",
  },
  {
    id: 2,
    text: "О чём ваш проект? Какая тема?",
    hint: "Например: маркетинг, фитнес, кулинария, IT, образование",
    field: "niche",
  },
  {
    id: 3,
    text: "Кто ваша идеальная аудитория? Пол, возраст, интересы",
    hint: "Опишите одного человека, которому будет полезен ваш контент",
    field: "audience",
  },
  {
    id: 4,
    text: "С какими проблемами или страхами сталкивается ваша аудитория?",
    hint: "Что их беспокоит, от чего они хотят избавиться",
    field: "pains",
  },
  {
    id: 5,
    text: "Зачем вы ведёте блог? Что хотите дать людям?",
    hint: "Какая у вас миссия или главная цель",
    field: "goal",
  },
  {
    id: 6,
    text: "Как вы хотите звучать: бережно, экспертно, дерзко, тепло?",
    hint: "Опишите tone of voice — как бы вы говорили с другом vs с аудиторией",
    field: "tone",
  },
  {
    id: 7,
    text: "Какие цвета, образы, атмосфера ассоциируются с вашим проектом?",
    hint: "Опишите визуальный стиль: палитра, настроение, текстуры",
    field: "visual",
  },
  {
    id: 8,
    text: "На кого вы ориентируетесь? Кто ещё пишет на эту тему?",
    hint: "Названия блогов, авторов, проектов — ваши ориентиры",
    field: "competitors",
  },
  {
    id: 9,
    text: "Какой контент вам ближе: посты, карусели, видео, stories?",
    hint: "В каком формате вам комфортнее всего создавать",
    field: "format",
  },
  {
    id: 10,
    text: "Какую главную мысль вы хотите донести до аудитории?",
    hint: "Если бы люди запомнили одну вещь из вашего блога — что бы это было?",
    field: "keyMessage",
  },
];

export default function BrandInterview({ onComplete, onCancel }: BrandInterviewProps) {
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [input, setInput] = useState("");

  const question = QUESTIONS[current];
  const isLast = current === QUESTIONS.length - 1;
  const progress = ((current + 1) / QUESTIONS.length) * 100;

  const handleNext = () => {
    const trimmed = input.trim();
    if (trimmed) {
      setAnswers((prev) => ({ ...prev, [question.id]: trimmed }));
    }
    if (isLast) {
      const allAnswers = QUESTIONS.map((q) => ({
        question: q.text,
        answer: answers[q.id] || "",
      }));
      onComplete(allAnswers);
    } else {
      setCurrent(current + 1);
      setInput(answers[QUESTIONS[current + 1].id] || "");
    }
  };

  const handleBack = () => {
    if (current > 0) {
      setAnswers((prev) => ({ ...prev, [question.id]: input.trim() }));
      setCurrent(current - 1);
      setInput(answers[QUESTIONS[current - 1].id] || "");
    }
  };

  const handleSkip = () => {
    if (isLast) {
      const allAnswers = QUESTIONS.map((q) => ({
        question: q.text,
        answer: answers[q.id] || "",
      }));
      onComplete(allAnswers);
    } else {
      setCurrent(current + 1);
      setInput(answers[QUESTIONS[current + 1].id] || "");
    }
  };

  return (
    <div className="interview-container">
      <div className="interview-progress-bar">
        <div className="interview-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="interview-progress-label">
        {current + 1} / {QUESTIONS.length}
      </div>

      <div className="interview-card">
        <div className="interview-question-number">Вопрос {question.id}</div>
        <div className="interview-question-text">{question.text}</div>
        <div className="interview-question-hint">{question.hint}</div>

        <textarea
          className="input interview-input"
          rows={4}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ваш ответ..."
          autoFocus
        />

        <div className="interview-actions">
          <button className="btn btn-ghost" onClick={handleBack} disabled={current === 0}>
            ← Назад
          </button>
          <div className="flex gap-2">
            <button className="btn btn-ghost" onClick={handleSkip} style={{ fontSize: 12 }}>
              Пропустить
            </button>
            <button className="btn btn-primary" onClick={handleNext}>
              {isLast ? "✨ Завершить" : "Ответить →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
